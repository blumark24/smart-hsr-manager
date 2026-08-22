'use strict';
// Regression coverage for the direct Lands SSO handoff (Manager side) and
// the P1 users-search autofill hardening.
//
// Architecture: /login.html authenticates the employee once, then calls
// POST /api/organization/context (self-service: the caller only ever acts
// on their OWN uid) which forwards the employee's own already-verified ID
// token to Lands' /api/lands-sso-register (api/_lib/landsBridge.js). Only an
// opaque, single-use, short-lived handoff code returns to the browser and
// crosses the redirect URL to Lands — never a password, ID token, or custom
// token. See test/lands-sso.test.js (Lands repo) for the receiving side.
//
// The handoff handler lives inside api/organization/context.js (dispatched
// on POST, alongside that file's existing GET org-context lookup) rather
// than its own top-level api/*.js file, solely to stay within the Vercel
// Hobby plan's 12-Serverless-Function limit — see the comment above
// handleLandsSsoHandoff() in that file for the full reasoning.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// ---- 1. Field login unchanged ----
test('1. login.html: the Field branch (contractor/supervisor/other) is untouched by the SSO handoff work', () => {
  const source = read('login.html');
  const fieldBranch = source.slice(source.indexOf("showMsg('✅ تم التحقق بنجاح... جارٍ التوجيه', 'success');"));
  assert.match(fieldBranch, /signInWithEmailAndPassword\(managerAuth, email, password\)/);
  assert.match(fieldBranch, /signInWithEmailAndPassword\(auth, email, password\)/);
  assert.match(fieldBranch, /window\.location\.href = 'mobile-map\.html'/);
  assert.match(fieldBranch, /window\.location\.href = 'manager\.html'/);
  assert.match(fieldBranch, /window\.location\.href = 'dashboard\.html'/);
});

// ---- eligibility (pure) ----
test('isSsoEligible: a lands_employee and a lands_department_manager with a synced, enabled entitlement are eligible', () => {
  const { isSsoEligible } = require(path.join(root, 'api/organization/context.js'))._test;
  assert.equal(isSsoEligible({ active: true, organizationId: 'org-a', landsAccess: { enabled: true, syncStatus: 'synced', role: 'lands_employee' } }), true);
  assert.equal(isSsoEligible({ active: true, organizationId: 'org-a', landsAccess: { enabled: true, syncStatus: 'synced', role: 'lands_department_manager' } }), true);
});

test('isSsoEligible: denies a disabled account, a pending (not yet synced) entitlement, a Field role, and a missing organization', () => {
  const { isSsoEligible } = require(path.join(root, 'api/organization/context.js'))._test;
  const base = { active: true, organizationId: 'org-a', landsAccess: { enabled: true, syncStatus: 'synced', role: 'lands_employee' } };
  assert.equal(isSsoEligible({ ...base, active: false }), false, 'disabled account');
  assert.equal(isSsoEligible({ ...base, landsAccess: { ...base.landsAccess, syncStatus: 'pending_trusted_sync' } }), false, 'not yet synced');
  assert.equal(isSsoEligible({ ...base, landsAccess: { ...base.landsAccess, role: 'lands_municipal_manager' } }), false, 'institution-level role never eligible here');
  assert.equal(isSsoEligible({ ...base, organizationId: '' }), false, 'missing organization');
  assert.equal(isSsoEligible({ ...base, role: 'inspector', landsAccess: undefined }), false, 'Field-only account has no landsAccess to be eligible through');
  assert.equal(isSsoEligible(null), false);
});

// ---- 2/3. Lands employee / Lands department manager direct login wiring ----
test('2/3. login.html calls POST /api/organization/context with the employee\'s own bearer token before redirecting to Lands', () => {
  const source = read('login.html');
  const landsBranch = source.slice(source.indexOf('if (hasLandsRole && !hasFieldRole)'), source.indexOf('showMsg(\'✅ تم التحقق بنجاح... جارٍ التوجيه\', \'success\');'));
  assert.match(landsBranch, /fetch\('\/api\/organization\/context'/);
  assert.match(landsBranch, /method: 'POST'/);
  assert.match(landsBranch, /'Authorization': 'Bearer ' \+ idToken/);
  assert.match(landsBranch, /await user\.getIdToken\(\)/);
});

test('landsBridge.js: callLandsSsoRegister forwards the employee token to Lands, never a manager or service credential', () => {
  const source = read('api/_lib/landsBridge.js');
  const fn = source.slice(source.indexOf('async function callLandsSsoRegister'), source.indexOf('module.exports'));
  assert.match(fn, /\/api\/lands-sso-register/);
  assert.match(fn, /authorization: `Bearer \$\{idToken\}`/);
  assert.match(fn, /'x-municipality-id': municipalityId/);
});

test('api/organization/context.js: the SSO handoff branch is self-service only — it never accepts a target uid, never calls assertCanManage', () => {
  const source = read('api/organization/context.js');
  const fn = source.slice(source.indexOf('async function handleLandsSsoHandoff'), source.indexOf('async function handleLandsSsoHandoff') + 1200);
  assert.doesNotMatch(fn, /assertCanManage/);
  assert.doesNotMatch(fn, /body\.uid/);
  assert.match(fn, /decoded\.uid/, 'must act on the verified caller\'s own uid');
});

// ---- 12. no auth secrets in the redirect URL ----
test('12. only the opaque handoff code is ever placed on the Lands redirect URL — never a password, ID token, or custom token', () => {
  const source = read('login.html');
  const redirectBlock = source.slice(source.indexOf('const landsUrl = new URL'), source.indexOf('window.location.href = landsUrl.toString();') + 40);
  assert.match(redirectBlock, /landsUrl\.searchParams\.set\('code', handoffCode\)/);
  const setCalls = [...redirectBlock.matchAll(/searchParams\.set\('([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(setCalls, ['code'], 'exactly one query parameter, and it must be "code"');
  assert.doesNotMatch(redirectBlock, /password/i);
  assert.doesNotMatch(redirectBlock, /idToken/i);
  assert.doesNotMatch(redirectBlock, /customToken/i);
  assert.doesNotMatch(redirectBlock, /municipality/i, 'municipality is no longer even a hint — it is derived authoritatively server-side from the handoff record');
});

test('login.html never logs the handoff code, the employee password, or any token', () => {
  const source = read('login.html');
  assert.doesNotMatch(source, /console\.log\([^)]*password/i);
  assert.doesNotMatch(source, /console\.log\([^)]*handoffCode/i);
  assert.doesNotMatch(source, /console\.log\([^)]*idToken/i);
});

// ---- P1: users-search autofill hardening ----
test('13/14. #userSearch is hardened against browser autofill with readonly-until-focus, type=search, and autocomplete=off (not merely cleared after the fact)', () => {
  const source = read('manager.html');
  const inputTag = source.slice(source.indexOf('<input id="userSearch"'), source.indexOf('/>', source.indexOf('<input id="userSearch"')) + 2);
  assert.match(inputTag, /type="search"/);
  assert.match(inputTag, /autocomplete="off"/);
  assert.match(inputTag, /readonly/);
  assert.match(inputTag, /onfocus="this\.removeAttribute\('readonly'\)"/);
});

test('15. users list stability is unaffected by the search hardening: users-list-view.js and the render pipeline are unchanged', () => {
  const viewSource = read('users-list-view.js');
  assert.match(viewSource, /export function belongsOnUsersList/);
  assert.match(viewSource, /export function deriveVisibleUsers/);
  const managerSource = read('manager.html');
  assert.match(managerSource, /usersViewState\.search = document\.getElementById\('userSearch'\)\.value/);
  assert.match(managerSource, /deriveVisibleUsers\(users, usersViewState\)/);
});
