'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('manager login resolves the environment Firebase configuration', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'manager-login.html'), 'utf8');

  assert.match(source, /import \{ resolveFirebaseConfig \} from ['"]\.\/firebase-runtime-config\.js['"]/);
  // Wrapped in try/catch (not a bare top-level await) so a config-resolution
  // failure shows a distinct system-error message and disables the form,
  // instead of leaving the page silently non-functional or letting the
  // failure fall through to the generic "check your password" message.
  assert.match(source, /firebaseConfig = await resolveFirebaseConfig\(\)/);
  assert.match(source, /catch \(configErr\)/);
  assert.doesNotMatch(source, /projectId:\s*['"]smart-hsr-manager['"]/);
});

test('manager dashboard resolves the same environment Firebase configuration', () => {
  const managerSource = fs.readFileSync(path.join(__dirname, '..', 'manager.html'), 'utf8');
  const adapterSource = fs.readFileSync(path.join(__dirname, '..', 'manager-dashboard-adapter.js'), 'utf8');

  assert.match(managerSource, /<script type="module" src="\.\/manager-dashboard-adapter\.js"><\/script>/);
  assert.match(adapterSource, /import \{ resolveFirebaseConfig \} from ['"]\.\/firebase-runtime-config\.js['"]/);
  assert.match(adapterSource, /resolveFirebaseConfig\(\)/);
  assert.doesNotMatch(adapterSource, /projectId:\s*['"]smart-hsr-manager['"]/);
});
