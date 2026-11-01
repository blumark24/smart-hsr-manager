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
function documentMutationMethod(name, context) {
  const start = client.indexOf('    async ' + name + '(');
  const end = name === 'replaceDocument'
    ? client.indexOf('\n    async deleteDocument(', start)
    : client.indexOf('\n    computeGrantCompleteness,', start);
  assert.ok(start >= 0 && end > start, 'real Lands ' + name + ' method found');
  const source = client.slice(start, end).trim().replace(/,\s*$/, '');
  return vm.runInNewContext('({' + source + '}).' + name, context, { timeout: 2000 });
}

test('Preview rejects replacement and deletion before any session or trusted mutation', async () => {
  for (const operation of ['replaceDocument', 'deleteDocument']) {
    const calls = { session: 0, metadataRead: 0, trustedMutation: 0 };
    const context = {
      isolatedPreviewSession: true,
      async session() { calls.session++; throw new Error('UNEXPECTED_SESSION_READ'); },
      async getDoc() { calls.metadataRead++; throw new Error('UNEXPECTED_METADATA_READ'); },
      async callTrustedMutation() { calls.trustedMutation++; throw new Error('UNEXPECTED_TRUSTED_MUTATION'); }
    };
    const method = documentMutationMethod(operation, context);
    const args = operation === 'replaceDocument'
      ? ['synthetic-municipality', 'synthetic-document', { size: 1, type: 'application/pdf' }]
      : ['synthetic-municipality', 'synthetic-document'];
    await assert.rejects(method(...args), /LANDS_PREVIEW_DOCUMENT_MUTATION_GATEWAY_REQUIRED/);
    assert.deepEqual(calls, { session: 0, metadataRead: 0, trustedMutation: 0 }, operation);
  }
});

test('Production/emulator deletion contract is unchanged by the Preview-only guard', async () => {
  const calls = { session: 0, trustedMutation: 0 };
  const context = {
    isolatedPreviewSession: false,
    async session() { calls.session++; return { role: 'lands_department_manager' }; },
    canDeleteLandsDocument() { return true; },
    async callTrustedMutation(municipalityId, mutation) {
      assert.equal(municipalityId, 'synthetic-municipality');
      assert.equal(mutation.operation, 'document.delete');
      assert.equal(mutation.record_id, 'synthetic-document');
      calls.trustedMutation++;
    }
  };
  const method = documentMutationMethod('deleteDocument', context);
  await method('synthetic-municipality', 'synthetic-document');
  assert.deepEqual(calls, { session: 1, trustedMutation: 1 });
});

test('Production/emulator replacement contract remains on existing trusted mutation path', async () => {
  const calls = { session: 0, metadataRead: 0, trustedMutation: 0 };
  const context = {
    isolatedPreviewSession: false,
    db: {},
    async session() { calls.session++; return { role: 'lands_department_manager' }; },
    canReplaceLandsDocument() { return true; },
    assertLandsDocumentUpload() {},
    doc() { return { id: 'synthetic-document' }; },
    root() { return {}; },
    async getDoc() {
      calls.metadataRead++;
      return {
        exists() { return true; },
        data() {
          return {
            file_id: 'synthetic-document', record_domain: 'landGrants',
            record_id: 'synthetic-grant', storage_path: 'synthetic-path',
            filename: 'document-synthetic'
          };
        }
      };
    },
    buildLandsStoragePath() { return 'synthetic-path'; },
    btoa(value) { return Buffer.from(value, 'binary').toString('base64'); },
    Uint8Array,
    async callTrustedMutation(municipalityId, mutation) {
      assert.equal(municipalityId, 'synthetic-municipality');
      assert.equal(mutation.operation, 'document.replace');
      assert.equal(mutation.record_id, 'synthetic-document');
      assert.equal(mutation.record_changes.file_base64, 'QQ==');
      calls.trustedMutation++;
    }
  };
  const method = documentMutationMethod('replaceDocument', context);
  const file = { type: 'application/pdf', size: 1, arrayBuffer: async () => Uint8Array.of(65).buffer };
  await method('synthetic-municipality', 'synthetic-document', file);
  assert.deepEqual(calls, { session: 1, metadataRead: 1, trustedMutation: 1 });
});

test('Preview replacement/deletion error is truthful and excludes backend data', () => {
  for (const operation of ['استبدال', 'حذف']) {
    const message = failureMessage(
      new Error('LANDS_PREVIEW_DOCUMENT_MUTATION_GATEWAY_REQUIRED'), operation);
    assert.match(message, /بيئة الاختبار/);
    assert.match(message, /لم يتم إجراء أي تغيير/);
    assert.doesNotMatch(message, /تم الحذف|تم الاستبدال|تم رفع/);
  }
  assert.match(failureMessage({ code: 'storage/unauthorized' }, 'حذف'), /صلاحية حذف/);
  assert.ok(page.includes('showToast(landsDocumentFailureMessage(error, "حذف"), true);'),
    'delete UI must map errors without displaying raw backend exception text');
});
