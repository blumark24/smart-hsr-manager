'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('manager login resolves the environment Firebase configuration', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'manager-login.html'), 'utf8');

  assert.match(source, /import \{ resolveFirebaseConfig \} from ['"]\.\/firebase-runtime-config\.js['"]/);
  assert.match(source, /const firebaseConfig = await resolveFirebaseConfig\(\)/);
  assert.doesNotMatch(source, /projectId:\s*['"]smart-hsr-manager['"]/);
});

test('manager dashboard resolves the same environment Firebase configuration', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'manager.html'), 'utf8');

  assert.match(source, /import \{ resolveFirebaseConfig \} from ['"]\.\/firebase-runtime-config\.js['"]/);
  assert.match(source, /const firebaseConfig = await resolveFirebaseConfig\(\)/);
  assert.doesNotMatch(source, /projectId:\s*['"]smart-hsr-manager['"]/);
});
