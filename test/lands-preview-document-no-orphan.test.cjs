'use strict';
// Execute the exact browser method from source with inert in-memory stubs.
// Neither credentials, Firebase, B2 nor other network access are available.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const client = fs.readFileSync(path.join(__dirname, '../lands/client/lands-client.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '../lands/index.html'), 'utf8');
const start = client.indexOf('    async uploadDocument(municipalityId, { recordDomain, recordId, file }) {');
const end = client.indexOf('\n    async readDocument(', start);
assert.ok(start >= 0 && end > start, 'real Lands upload method found');
const method = client.slice(start, end).trim().replace(/,\s*$/, '');
const uiStart = page.indexOf('function landsDocumentFailureMessage(');
const uiEnd = page.indexOf('\nasync function refreshDocumentViewAfterMutation(', uiStart);
assert.ok(uiStart >= 0 && uiEnd > uiStart, 'real UI failure mapper found');
const failureMessage = vm.runInNewContext(page.slice(uiStart, uiEnd) + '\nlandsDocumentFailureMessage');

function makeUpload({ isolatedPreviewSession }) {
  const calls = { session:0, metadata:0, upload:0 };
  const context = {
    isolatedPreviewSession,
    assertLandsDocumentUpload(file) {
      if (!file || file.size <= 0) throw new Error('INVALID_DOCUMENT_SIZE');
    },
    async session() { calls.session++; return { firebaseUid:'synthetic-user' }; },
    doc() { return { id:'synthetic-document' }; },
    collection() { return {}; },
    root() { return {}; },
    createLandsDocumentMetadata() {
      return {storage_path:'synthetic-only', file_id:'synthetic-document'};
    },
    serverTimestamp() { return 'local-time'; },
    async setDoc() { calls.metadata++; },
    ref() { return 'synthetic-only'; },
    storage: {},
    db: {},
    async uploadBytes() { calls.upload++; },
    documentStorageMetadata() { return {}; },
    Object
  };
  const fn = vm.runInNewContext('({' + method + '}).uploadDocument', context);
  return { upload:(file={size:100,type:'application/pdf'}) => fn('synthetic-municipality',
    {recordDomain:'landGrants',recordId:'synthetic-grant',file}), calls };
}

test('Preview rejects document submission before membership read, metadata write or Storage bytes', async () => {
  const {upload,calls} = makeUpload({isolatedPreviewSession:true});
  await assert.rejects(upload(), /LANDS_PREVIEW_DOCUMENT_GATEWAY_REQUIRED/);
  assert.deepEqual(calls, {session:0,metadata:0,upload:0});
});
test('Preview validation errors still reject with zero DB or Storage calls', async () => {
  const {upload,calls} = makeUpload({isolatedPreviewSession:true});
  await assert.rejects(upload({size:0,type:'application/pdf'}), /INVALID_DOCUMENT_SIZE/);
  assert.deepEqual(calls, {session:0,metadata:0,upload:0});
});
test('Production/emulator fallback preserves old behavior; no hidden Production change', async () => {
  const {upload,calls} = makeUpload({isolatedPreviewSession:false});
  const result = await upload();
  assert.equal(result.documentId, 'synthetic-document');
  assert.deepEqual(calls, {session:1,metadata:1,upload:1});
});
test('UI explains Preview upload is blocked and no metadata was created', () => {
  const message = failureMessage(new Error('LANDS_PREVIEW_DOCUMENT_GATEWAY_REQUIRED'), 'رفع');
  assert.match(message, /بيئة الاختبار/);
  assert.match(message, /لم يتم إنشاء سجل مستند/);
  assert.doesNotMatch(message, /تم رفع|اكتمل الرفع/);
});
test('unrelated Storage failures retain existing UX mapping', () => {
  assert.match(failureMessage({code:'storage/unauthorized'}), /صلاحية/);
  assert.match(failureMessage(new Error('INVALID_DOCUMENT_SIZE')), /10 ميجابايت/);
});
