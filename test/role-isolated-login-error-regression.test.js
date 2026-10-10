'use strict';
// Safe Preview-only regression: a login error or cross-portal navigation
// must never invalidate another Firebase Auth namespace.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('workforce errors distinguish credentials from authorization/network outages', async () => {
  const source = read('login.html');
  const { classifyManagerLoginError } = await import(pathToFileURL(path.join(root, 'manager-login-error-classification.js')).href);
  assert.equal(classifyManagerLoginError({ code: 'auth/invalid-credential' }), 'credential-failed');
  assert.equal(classifyManagerLoginError({ code: 'permission-denied' }), 'system-error');
  assert.equal(classifyManagerLoginError({ code: 'auth/network-request-failed' }), 'system-error');
  assert.match(source, /classifyManagerLoginError as classifyFirebaseLoginError/);
  assert.match(source, /let credentialsValidated = false/);
  assert.match(source, /credentialsValidated = true/);
  assert.match(source, /!credentialsValidated && classifyFirebaseLoginError\(e\) === 'credential-failed'/);
  assert.match(source, /تعذر التحقق من الصلاحيات أو الاتصال بخدمة المصادقة/);
});

test('failed workforce login signs out only the in-memory credential probe', () => {
  const source = read('login.html');
  const submit = source.slice(source.indexOf("document.getElementById('loginForm').addEventListener('submit'"));
  assert.match(submit, /await signOut\(probeAuth\)\.catch\(\(\) => \{\}\)/);
  assert.doesNotMatch(submit, /signOut\(managerAuth\)/);
  assert.doesNotMatch(submit, /signOut\(auth\)/);
  assert.match(source, /initializeApp\(firebaseConfig, 'smart-hsr-role-probe'\)/);
  assert.match(source, /setPersistence\(probeAuth, inMemoryPersistence\)/);
});

test('manager navigation marker mismatch does not revoke a still-authorized manager session', () => {
  const source = read('manager-dashboard-adapter.js');
  assert.match(source, /const identityAuthorizedHere = Boolean\(context && context\.role === expectedRole\)/);
  assert.match(source, /if \(!identityAuthorizedHere\) await authApi\.signOut\(auth\)/);
  assert.match(source, /if \(!portalContextMatches\)/);
  assert.match(source, /location\.replace\(portalLoginTarget\(requestedPortal\)\)/);
  assert.match(source, /smart-hsr-manager-session/);
  assert.match(source, /item\.name === '\[DEFAULT\]'/);
});

test('temporary manager authorization lookup failure preserves authentication', () => {
  const source = read('manager-dashboard-adapter.js');
  const start = source.indexOf('stopAuth = authApi.onAuthStateChanged');
  const end = source.indexOf('const expectedRole =', start);
  const lookup = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(lookup, /try \{/);
  assert.match(lookup, /verifyManagerAccess\(firestoreApi, db, user\)/);
  assert.match(lookup, /catch \(error\)/);
  assert.match(lookup, /location\.replace\(portalLoginTarget\(requestedPortal\)\)/);
  assert.doesNotMatch(lookup, /signOut\(/);
});

test('owner, leadership, and workforce keep independent Firebase application namespaces', () => {
  assert.match(read('owner-firebase-client.js'), /initializeApp\(firebaseConfig, 'smart-hsr-owner-session'\)/);
  assert.match(read('manager-login.html'), /initializeApp\(firebaseConfig, 'smart-hsr-manager-session'\)/);
  assert.match(read('login.html'), /const app = initializeApp\(firebaseConfig\);/);
  const ownerLogin = read('owner-login.html');
  assert.match(ownerLogin, /import \{ auth, db \} from '.\/owner-firebase-client.js'/);
});
