'use strict';
// Regression coverage for the manager-login.html failure-classification
// bug: every error after signInWithEmailAndPassword() used to collapse
// into one "check your email or password" message, whether it was a real
// credentials problem, a Firestore permission/network failure reading
// managers/{uid}, or a misconfigured/wrong Firebase project. That's
// actively misleading for anything but a real credentials problem — this
// file locks in the classification (real unit coverage, via the same
// dynamic-import-of-a-plain-.js-file pattern already used for
// storage-adapter.js in global-evidence-auth-delivery.test.js) and the
// source-level wiring that keeps the three outcomes from being merged
// back together.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const classificationPromise = import(pathToFileURL(path.join(root, 'manager-login-error-classification.js')).href);

test('a real Firebase Auth credentials failure classifies as credential-failed', async () => {
  const { classifyManagerLoginError } = await classificationPromise;
  for (const code of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email', 'auth/user-disabled', 'auth/too-many-requests']) {
    assert.equal(classifyManagerLoginError({ code }), 'credential-failed', code);
  }
});

test('a non-credential Firebase Auth error (wrong project, invalid API key, network) classifies as system-error, never credential-failed', async () => {
  const { classifyManagerLoginError } = await classificationPromise;
  for (const code of ['auth/api-key-not-valid.-please-pass-a-valid-api-key.', 'auth/network-request-failed', 'auth/project-not-found', 'auth/internal-error']) {
    assert.equal(classifyManagerLoginError({ code }), 'system-error', code);
  }
});

test('a Firestore permission-denied/unavailable error (manager lookup failure) classifies as system-error', async () => {
  const { classifyManagerLoginError } = await classificationPromise;
  assert.equal(classifyManagerLoginError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }), 'system-error');
  assert.equal(classifyManagerLoginError({ code: 'unavailable' }), 'system-error');
});

test('the explicit unauthorized-manager sentinel is never confused with a credentials or system failure', async () => {
  const { classifyManagerLoginError } = await classificationPromise;
  assert.equal(classifyManagerLoginError(new Error('unauthorized-manager')), 'unauthorized');
});

test('CREDENTIAL_ERROR_CODES is exactly the credentials-shaped Auth codes, not a catch-all', async () => {
  const { CREDENTIAL_ERROR_CODES } = await classificationPromise;
  assert.deepEqual([...CREDENTIAL_ERROR_CODES].sort(), [
    'auth/invalid-credential', 'auth/invalid-email', 'auth/missing-password',
    'auth/too-many-requests', 'auth/user-disabled', 'auth/user-not-found', 'auth/wrong-password',
  ].sort());
});

test('manager-login.html: sign-in and the manager-authorization lookup are in separate try/catch blocks', () => {
  const source = read('manager-login.html');
  const submitHandler = source.slice(source.indexOf('form.addEventListener("submit"'), source.indexOf('});\n</script>'));
  const signInTry = submitHandler.indexOf('try {');
  const lookupTry = submitHandler.indexOf('try {', signInTry + 1);
  assert.ok(signInTry >= 0 && lookupTry > signInTry, 'expected two separate try blocks (auth, then lookup)');
  // The sign-in try/catch must not contain the Firestore lookup, and vice versa.
  const signInBlock = submitHandler.slice(signInTry, lookupTry);
  assert.doesNotMatch(signInBlock, /doc\(db, ["']managers["']/);
  const lookupBlock = submitHandler.slice(lookupTry);
  assert.match(lookupBlock, /doc\(db, ["']managers["']/);
});

test('manager-login.html: a real credentials failure and a system/lookup failure show different messages', () => {
  const source = read('manager-login.html');
  assert.match(source, /فشل تسجيل الدخول — تحقق من البريد أو كلمة المرور/);
  assert.match(source, /تعذر الاتصال بخدمة المصادقة حاليًا/);
  assert.match(source, /تعذر التحقق من صلاحياتك حاليًا/);
  // The three messages must be distinct strings, not the same text reused.
  const messages = [
    'فشل تسجيل الدخول — تحقق من البريد أو كلمة المرور',
    'تعذر الاتصال بخدمة المصادقة حاليًا',
    'تعذر التحقق من صلاحياتك حاليًا',
  ];
  assert.equal(new Set(messages).size, messages.length);
});

test('manager-login.html: a manager-authorization lookup failure signs the user out rather than leaving an unverified session', () => {
  const source = read('manager-login.html');
  const lookupCatch = source.slice(source.indexOf('} catch (lookupErr)'));
  assert.match(lookupCatch, /await signOut\(auth\)/);
});

test('manager-login.html: Firebase configuration resolution failure disables the form instead of leaving it silently broken', () => {
  const source = read('manager-login.html');
  const configBlock = source.slice(source.indexOf('let firebaseConfig;'), source.indexOf('const app = initializeApp'));
  assert.match(configBlock, /catch \(configErr\)/);
  assert.match(configBlock, /submitBtn\.disabled = true/);
});
