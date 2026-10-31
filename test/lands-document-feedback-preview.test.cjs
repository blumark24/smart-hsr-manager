'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.resolve(__dirname, '../lands/index.html'), 'utf8');
const begin = src.indexOf('function landsDocumentFailureMessage(');
const finish = src.indexOf('\nasync function deleteDocumentFor(', begin);
assert.ok(begin > 0 && finish > begin, 'exact Lands document feedback block must exist');
const code = src.slice(begin, finish);

function setup({ uploadReject, replaceReject, refreshReject } = {}) {
  const messages = [];
  const calls = { upload: 0, replace: 0, refresh: 0, open: 0 };
  const file = { type: 'application/pdf', size: 1234 };
  const input = { files: [file], onchange: null, click() {} };
  const env = {
    document: { getElementById: () => input, createElement: () => input },
    client: {
      async uploadDocument() { calls.upload++; if (uploadReject) throw uploadReject; return { documentId: 'synthetic-doc' }; },
      async replaceDocument() { calls.replace++; if (replaceReject) throw replaceReject; }
    },
    session: { municipalityId: 'synthetic-tenant' },
    showToast(message, error = false) { messages.push({ message, error }); },
    async refreshWorkspace() { calls.refresh++; if (refreshReject) throw new Error('internal refresh secret-file-path'); },
    openFile() { calls.open++; },
    async withBusyButton(_label, fn) { return fn(); }
  };
  const api = vm.runInNewContext(code + '\n;({landsDocumentFailureMessage,uploadDocumentFor,replaceDocumentFor,refreshDocumentViewAfterMutation})', env);
  return { ...api, calls, messages, input };
}

test('upload error messages are mapped, minimal and sanitized', () => {
  const { landsDocumentFailureMessage: f } = setup();
  assert.match(f(new Error('INVALID_DOCUMENT_SIZE')), /10 ميجابايت/);
  assert.match(f(new Error('INVALID_DOCUMENT_MIME_TYPE')), /PDF/);
  assert.match(f({ code: 'storage/unauthorized', message: 'private-tenant-UID-should-not-leak' }), /ليس لديك صلاحية/);
  assert.match(f({ code: 'storage/retry-limit-exceeded' }), /الاتصال/);
  assert.match(f({ code: 'LANDS_AUTH_REQUIRED' }), /سجّل الدخول/);
  assert.match(f({ code: 'storage/canceled' }), /إلغاء/);
  const secret = 'secret-Firebase-token-DO-NOT-DISPLAY';
  const unknown = f(new Error(secret));
  assert.doesNotMatch(unknown, /secret|Firebase|token|DO-NOT-DISPLAY/i);
  assert.match(f({ code: 'permission-denied' }, 'استبدال'), /استبدال/);
});

test('upload denied leaves UI truthful and never refreshes a failed mutation', async () => {
  const x = setup({ uploadReject: { code: 'storage/unauthorized', message: 'private-storage-path' } });
  await x.uploadDocumentFor('synthetic-grant');
  assert.equal(x.calls.upload, 1);
  assert.equal(x.calls.refresh, 0);
  assert.equal(x.calls.open, 0);
  assert.equal(x.messages.length, 1);
  assert.equal(x.messages[0].error, true);
  assert.match(x.messages[0].message, /ليس لديك صلاحية/);
  assert.doesNotMatch(x.messages[0].message, /private-storage-path/);
});

test('upload success followed by refresh failure is NOT misreported as upload failure', async () => {
  const x = setup({ refreshReject: true });
  await x.uploadDocumentFor('synthetic-grant');
  assert.deepEqual(x.calls, { upload: 1, replace: 0, refresh: 1, open: 0 });
  assert.equal(x.messages.length, 1);
  assert.equal(x.messages[0].error, true);
  assert.match(x.messages[0].message, /اكتمل رفع المستند لكن تعذر تحديث العرض/);
  assert.doesNotMatch(x.messages[0].message, /secret-file-path|غير مهيأ/);
});

test('document replacement has the same safe success/refresh separation', async () => {
  const x = setup({ refreshReject: true });
  await x.replaceDocumentFor('synthetic-grant', 'synthetic-doc');
  await x.input.onchange();
  assert.deepEqual(x.calls, { upload: 0, replace: 1, refresh: 1, open: 0 });
  assert.match(x.messages[0].message, /اكتمل استبدال المستند لكن تعذر تحديث العرض/);
});

test('document replacement backend denial never claims storage configuration failure', async () => {
  const x = setup({ replaceReject: { code: 'DOCUMENT_REPLACE_DENIED', message: 'authorization stack secret' } });
  await x.replaceDocumentFor('synthetic-grant', 'synthetic-doc');
  await x.input.onchange();
  assert.equal(x.calls.refresh, 0);
  assert.match(x.messages[0].message, /ليس لديك صلاحية استبدال/);
  assert.doesNotMatch(x.messages[0].message, /secret|غير مهيأ/);
});
