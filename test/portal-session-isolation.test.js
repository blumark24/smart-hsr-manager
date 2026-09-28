'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('public portal exposes no hidden owner gesture', () => {
  const home = read('Home.html');
  const workforce = read('login.html');
  const leadership = read('manager-login.html');

  for (const source of [home, workforce, leadership]) {
    assert.doesNotMatch(source, /data-owner-gesture/);
    assert.doesNotMatch(source, /taps\s*>=\s*5/);
  }
  assert.doesNotMatch(home, /owner-login\.html/);
});

test('workforce login cannot overwrite or sign out leadership auth', () => {
  const source = read('login.html');

  assert.match(source, /PORTAL_CONTEXT_KEY\s*=\s*['"]smartHSRPortalContext['"]/);
  assert.match(source, /portal:\s*['"]workforce['"]/);
  assert.match(source, /persistWorkforceSession/);
  assert.doesNotMatch(source, /smart-hsr-manager-session/);
  assert.doesNotMatch(source, /managerAuth/);
  assert.match(source, /هذا حساب مدير بلدية معتمد\. استخدم بوابة القيادات البلدية/);
});

test('leadership login uses only the dedicated manager namespace', () => {
  const source = read('manager-login.html');

  assert.match(source, /initializeApp\(firebaseConfig, ['"]smart-hsr-manager-session['"]\)/);
  assert.match(source, /portal:\s*['"]leadership['"]/);
  assert.doesNotMatch(source, /fieldAuth/);
  assert.doesNotMatch(source, /clearOldPortalSessions/);
});

test('manager shell binds auth namespace, role and organization to selected portal', () => {
  const source = read('manager-dashboard-adapter.js');

  assert.match(source, /requestedPortal === ['"]workforce['"]/);
  assert.match(source, /item\.name === ['"]\[DEFAULT\]['"]/);
  assert.match(source, /item\.name === ['"]smart-hsr-manager-session['"]/);
  assert.match(source, /expectedRole = requestedPortal === ['"]workforce['"] \? ['"]supervisor['"] : ['"]manager['"]/);
  assert.match(source, /markerOrg === context\.organizationId/);
  assert.match(source, /where\(['"]organizationId['"], ['"]==['"], context\.organizationId\)/);
});
