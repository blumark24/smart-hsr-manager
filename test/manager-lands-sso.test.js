'use strict';
// Regression coverage for the direct Lands SSO handoff (Manager side) and
// the P1 users-search autofill hardening.
//
// Architecture: /login.html authenticates the employee once through an
// in-memory probe, resolves the authoritative role, then either establishes
// the isolated workforce session or performs the trusted Lands SSO handoff.
// POST /api/organization/context is self-service: the caller only ever acts
// on their OWN uid and forwards the employee's own already-verified ID token
// to Lands' /api/lands-sso-register (api/_lib/landsBridge.js). Only an opaque,
// single-use, short-lived handoff code crosses the redirect URL to Lands —
// never a password, ID token, or custom token.
//
// The handoff handler lives inside api/organization/context.js (dispatched
// on POST, alongside that file's existing GET org-context lookup) rather
// than its own top-level api/*.js file, solely to stay within the Vercel
// Hobby plan's 12-Serverless-Function limit.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function resolveLandsRedirectBaseFor(hostname) {
  const source = read('login.html');
  const start = source.indexOf('const LANDS_PRODUCTION_HOSTNAMES');
  const end = source.indexOf('const app = initializeApp(firebaseConfig);');
  const snippet = source.slice(start, end) + 'module.exports = { resolveLandsRedirectBase };';
  const sandbox = { module: { exports: {} }, location: { hostname, origin: `https://${hostname}` }, Object };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox, { filename: 'login.html (extracted)' });
  return sandbox.module.exports.resolveLandsRedirectBase();
}

// ---- 1. Workforce login isolation ----
test('1. login.html keeps role probing memory-only and persists the workforce session only through the isolated workforce auth', () => {
  const source = read('login.html');
  assert.match(source, /setPersistence\(probeAuth, inMemoryPersistence\)/);
  assert.match(source, /signInWithEmailAndPassword\(probeAuth, email, password\)/);

  const persistStart = source.indexOf('async function persistWorkforceSession');
  const persistEnd = source.indexOf('\n}\n', persistStart) + 2;
  const persistFn = source.slice(persistStart, persistEnd);
  assert.match(persistFn, /signInWithEmailAndPassword\(auth, email, password\)/);
  assert.match(persistFn, /setWorkforcePortalContext\(user, organizationId, role\)/);
  assert.doesNotMatch(persistFn, /probeAuth/);

  const routed = source.slice(source.indexOf('// Internal navigation target only'));
  assert.match(routed, /persistWorkforceSession\(email, password, user, organizationId, sessionRole\)/);
  assert.match(routed, /signOut\(probeAuth\)/);
  assert.match(routed, /window\.location\.href = target/);
  const resolver = read('workspace-access.js');
  assert.match(resolver, /return 'mobile-map\.html'/);
  assert.match(resolver, /return 'manager\.html'/);
  assert.match(resolver, /return 'dashboard\.html'/);
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
  const landsBranch = source.slice(source.indexOf("if (primary.id === 'lands')"), source.indexOf('// Internal navigation target only'));
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

// ---- final routing bug: the Lands redirect target must match the real
// environment, never a hardcoded stale Preview URL ----
test('resolveLandsRedirectBase: on Manager Production hostnames, redirects to real Lands Production, not a Preview URL', () => {
  assert.equal(resolveLandsRedirectBaseFor('smart-hsr-manager.vercel.app'), 'https://lands-smart.vercel.app/');
  assert.equal(resolveLandsRedirectBaseFor('smart-hsr-manager-blumark24-os.vercel.app'), 'https://lands-smart.vercel.app/');
});

test('resolveLandsRedirectBase: a real custom/non-vercel.app domain defaults to Lands Production, same rule as this app\'s own firebase-runtime-config.js', () => {
  assert.equal(resolveLandsRedirectBaseFor('smart-hsr.gov.sa'), 'https://lands-smart.vercel.app/');
  assert.equal(resolveLandsRedirectBaseFor('localhost'), 'https://lands-smart.vercel.app/');
});

test('resolveLandsRedirectBase: an unrecognized *.vercel.app Preview hostname stays same-origin on the embedded Lands workspace, never Production', () => {
  assert.equal(resolveLandsRedirectBaseFor('smart-hsr-manager-git-some-branch-blumark24-os.vercel.app'), 'https://smart-hsr-manager-git-some-branch-blumark24-os.vercel.app/lands/');
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

// User Center search/autofill regressions are intentionally covered by
// test/manager-users-list-state.test.js and the Phase11 User Center suites.
// They no longer belong in the Lands SSO contract because the User Center
// UI was modularized out of manager.html. Keeping those assertions here
// would couple Lands authentication to unrelated presentation structure.
