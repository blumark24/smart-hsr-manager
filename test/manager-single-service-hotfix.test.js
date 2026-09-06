'use strict';
// Source-level coverage for the "one operational employee = one operational
// service" manager UI hotfix (manager.html + login.html). The backend rule
// itself (assertSingleService/resolveEffectiveServiceState) is covered by
// manager-service-entitlements.test.js and manager-lands-bridge-integration.
// test.js; this file checks the front-end wiring that those backend
// guarantees depend on: a true single-select service control (never two
// independent checkboxes), a temporary-password field reaching the create
// call, the manager identity display priority, and that the manager's Lands
// sidebar item opens the in-dashboard executive view instead of redirecting
// to the Lands login page.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Add User: service selection is a true single-select radio group, not independent checkboxes', () => {
  const source = read('manager.html');
  assert.match(source, /<input type="radio" name="addService" id="addServiceField" value="field"/);
  assert.match(source, /<input type="radio" name="addService" id="addServiceLands" value="lands"/);
  assert.doesNotMatch(source, /id="addFieldEnabled"/);
  assert.doesNotMatch(source, /id="addLandsEnabled"/);
});

test('Edit user services: service selection is a true single-select radio group, not independent checkboxes', () => {
  const source = read('manager.html');
  assert.match(source, /<input type="radio" name="svcService" id="svcServiceField" value="field"/);
  assert.match(source, /<input type="radio" name="svcService" id="svcServiceLands" value="lands"/);
  assert.doesNotMatch(source, /id="svcFieldEnabled"/);
  assert.doesNotMatch(source, /id="svcLandsEnabled"/);
});

test('Add User: a temporary password field exists and is sent to the create API call', () => {
  const source = read('manager.html');
  assert.match(source, /id="addPassword"/);
  assert.match(source, /const password=\$\('#addPassword'\)\.value/);
  assert.match(source, /callAdminApi\(\{ action:'create'[^}]*password, active \}\)/);
});

test('saveServices always sends both field and lands together, so a selection change is an explicit transfer', () => {
  const source = read('manager.html');
  const fn = source.slice(source.indexOf('async function saveServices'), source.indexOf('window.saveServices'));
  assert.match(fn, /const field = \{ enabled: !isLands/);
  assert.match(fn, /const lands = \{ enabled: isLands/);
  assert.match(fn, /callAdminApi\(\{ action:'setServices', uid: servicesTargetId, field, lands \}\)/);
});

test('manager Lands sidebar item opens the in-dashboard executive view, never the Lands login page', () => {
  const source = read('manager.html');
  assert.match(source, /<button class="sidebar-link" data-tab="landsView"[^>]*>[\s\S]{0,80}حصر منح الأراضي الذكي/);
  assert.doesNotMatch(source, /<a[^>]*href="https:\/\/lands-smart[^"]*"[^>]*>\s*<i data-lucide="landmark">/);
});

test('Manager Lands view renders real employee/department-manager counts, not fabricated grant statistics', () => {
  const source = read('manager.html');
  assert.match(source, /function renderLandsView\(\)/);
  assert.match(source, /landsAccess\.syncStatus === 'synced'/);
  assert.match(source, /landsViewGrantsUnavailable/);
});

test('manager identity display prioritizes the approved name over the email', () => {
  const source = read('manager.html');
  const fn = source.slice(source.indexOf('const displayName = managerContext.name'), source.indexOf('const displayName = managerContext.name') + 300);
  assert.match(fn, /managerContext\.name\s*\n?\s*\|\|\s*\(typeof user\.displayName/);
  assert.match(fn, /\|\|\s*user\.email/);
  // The old bug this replaces: email as the PRIMARY identity source.
  assert.doesNotMatch(source, /userBadge\.textContent\s*=\s*user\.email\s*\|\|\s*'حساب مصادق عليه'/);
});

test('managers/{uid} and users/{uid} name fields are both read into managerContext', () => {
  const source = read('manager.html');
  assert.match(source, /const name = typeof manager\.name === 'string' \? manager\.name\.trim\(\) : ''/);
  assert.match(source, /const name = typeof supervisor\.name === 'string' \? supervisor\.name\.trim\(\) : ''/);
  assert.match(source, /managerContext\.name = orgContext\.name \|\| ''/);
});

test('login.html routes an active Lands-only account to the Lands trusted runtime, never denies it', () => {
  const source = read('login.html');
  assert.match(source, /hasLandsRole = Boolean\(landsAccess && landsAccess\.enabled/);
  assert.match(source, /hasLandsRole && !hasFieldRole/);
  assert.match(source, /lands-smart-git-staging-lands-trusted-audit-blumark24-os\.vercel\.app/);
});

test('login.html never places a token, password, or credential in the Lands redirect URL', () => {
  // Superseded by the one-time SSO handoff (see test/manager-lands-sso.test.js
  // for the full architecture): the employee's ID token IS now used in this
  // branch — to call the same-origin POST /api/organization/context over HTTPS,
  // never placed in a URL — so this test checks the actual invariant (no
  // token/password/credential in the URL-building code) rather than banning
  // getIdToken() outright, which is no longer the real security property.
  const source = read('login.html');
  const start = source.indexOf('const landsUrl = new URL');
  const end = source.indexOf('window.location.href = landsUrl.toString();') + 40;
  const urlBlock = source.slice(start, end);
  assert.doesNotMatch(urlBlock, /getIdToken/);
  assert.doesNotMatch(urlBlock, /password/i);
  assert.doesNotMatch(urlBlock, /idToken/i);
  assert.match(urlBlock, /landsUrl\.searchParams\.set\('code', handoffCode\)/);
});
