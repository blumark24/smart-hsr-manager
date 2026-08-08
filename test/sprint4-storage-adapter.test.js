'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateStorageAdapter } = require('../platform/storage/storage-adapter-contract');
const { EVIDENCE_TYPES, MAX_IMAGE_BYTES, evaluateEvidenceUpload } = require('../platform/storage/evidence-policy');
const { buildCanonicalObjectKey, normalizeFilename } = require('../platform/storage/object-key-policy');
const { COMPATIBILITY, classifyEvidenceReference } = require('../platform/storage/legacy-storage-compatibility');
const { createInMemoryStorageAdapter } = require('../platform/storage/in-memory-storage-adapter');

const adapter = () => createInMemoryStorageAdapter();
const input = (overrides = {}) => ({ organizationId: 'Org-A', observationId: 'Obs-1', evidenceType: EVIDENCE_TYPES.BEFORE,
  file: new Uint8Array([0xff, 0xd8, 0xff, 1]), actorId: 'inspector-a', contentType: 'image/jpeg', correlationId: 'corr-1', ...overrides });

test('adapter implements the complete provider-neutral contract', () => assert.equal(validateStorageAdapter(adapter()).allowed, true));
test('canonical object key is deterministic and normalized', async () => {
  const store = adapter(); const first = await store.uploadEvidence(input()); const second = await store.uploadEvidence(input());
  assert.equal(first.objectKey, second.objectKey); assert.match(first.objectKey, /^organizations\/Org-A\/observations\/Obs-1\/before\/[a-f0-9]{64}$/);
});
test('object key rejects traversal', () => assert.equal(buildCanonicalObjectKey({ organizationId: '../org', observationId: 'obs', evidenceType: 'BEFORE', objectId: 'id' }).allowed, false));
test('filename is normalized as metadata and cannot affect the key', () => assert.equal(normalizeFilename('../../Secret Name.exe', 'image/jpeg'), 'secret-name.jpg'));
test('unsupported MIME is denied', async () => assert.equal((await adapter().uploadEvidence(input({ contentType: 'text/html' }))).errorCode, 'EVIDENCE_MIME_DENIED'));
test('oversized evidence is denied', async () => assert.equal((await adapter().uploadEvidence(input({ file: new Uint8Array(MAX_IMAGE_BYTES + 1) }))).errorCode, 'EVIDENCE_TOO_LARGE'));
test('reserved AI report type has no invented upload behavior', () => assert.equal(evaluateEvidenceUpload({ ...input({ evidenceType: 'AI_REPORT' }), size: 4 }).code, 'EVIDENCE_TYPE_NOT_ACTIVE'));
test('upload, metadata, and private resolve preserve checksum without a URL', async () => {
  const store = adapter(); const uploaded = await store.uploadEvidence(input()); const metadata = await store.getMetadata({ organizationId: 'Org-A', observationId: 'Obs-1', objectKey: uploaded.objectKey });
  const resolved = await store.resolveEvidence({ organizationId: 'Org-A', observationId: 'Obs-1', objectKey: uploaded.objectKey });
  assert.equal(uploaded.ok, true); assert.equal(metadata.checksum, uploaded.checksum); assert.deepEqual([...resolved.file], [255, 216, 255, 1]); assert.equal('url' in resolved, false);
});
test('cross-tenant resolve is denied', async () => {
  const store = adapter(); const uploaded = await store.uploadEvidence(input());
  assert.equal((await store.resolveEvidence({ organizationId: 'Org-B', observationId: 'Obs-1', objectKey: uploaded.objectKey })).errorCode, 'TENANT_SCOPE_DENIED');
});
test('cross-observation resolve is denied', async () => {
  const store = adapter(); const uploaded = await store.uploadEvidence(input());
  assert.equal((await store.resolveEvidence({ organizationId: 'Org-A', observationId: 'Obs-2', objectKey: uploaded.objectKey })).errorCode, 'TENANT_SCOPE_DENIED');
});
test('public URL resolution is denied', async () => assert.equal((await adapter().resolveEvidence({ organizationId: 'org-a', observationId: 'obs-1', objectKey: 'https://public.example/evidence.jpg' })).errorCode, 'PUBLIC_REFERENCE_DENIED'));
test('tenant-scoped deletion removes evidence', async () => {
  const store = adapter(); const uploaded = await store.uploadEvidence(input());
  assert.equal((await store.deleteEvidence({ organizationId: 'Org-A', observationId: 'Obs-1', objectKey: uploaded.objectKey })).ok, true);
  assert.equal((await store.resolveEvidence({ organizationId: 'Org-A', observationId: 'Obs-1', objectKey: uploaded.objectKey })).errorCode, 'EVIDENCE_NOT_FOUND');
});
test('cross-tenant deletion is denied without deleting the record', async () => {
  const store = adapter(); const uploaded = await store.uploadEvidence(input());
  assert.equal((await store.deleteEvidence({ organizationId: 'Org-B', observationId: 'Obs-1', objectKey: uploaded.objectKey })).errorCode, 'TENANT_SCOPE_DENIED');
  assert.equal((await store.resolveEvidence({ organizationId: 'Org-A', observationId: 'Obs-1', objectKey: uploaded.objectKey })).ok, true);
});
test('legacy compatibility classifier covers verified current shapes', () => {
  assert.equal(classifyEvidenceReference('organizations/org-a/observations/obs-1/before/a1').classification, COMPATIBILITY.CANONICAL);
  assert.equal(classifyEvidenceReference('local-demo://org-a/asset-1').classification, COMPATIBILITY.LEGACY_COMPATIBLE);
  assert.equal(classifyEvidenceReference('observations/org-a/before/2026/08/a.jpg').classification, COMPATIBILITY.LEGACY_COMPATIBLE);
  assert.equal(classifyEvidenceReference('data:image/png;base64,iVBORw0KGgo=').classification, COMPATIBILITY.LEGACY_COMPATIBLE);
  assert.equal(classifyEvidenceReference('https://example.com/a.jpg').classification, COMPATIBILITY.AMBIGUOUS);
  assert.equal(classifyEvidenceReference('../bad').classification, COMPATIBILITY.INVALID);
});
test('Firebase Storage references fail closed as ambiguous', () => assert.equal(classifyEvidenceReference('gs://some-project/evidence/a.jpg').classification, COMPATIBILITY.AMBIGUOUS));
test('thumbnail creation explicitly reports unavailable processing', async () => assert.equal((await adapter().createThumbnail(input())).errorCode, 'THUMBNAIL_PROCESSOR_UNAVAILABLE'));
test('health check proves memory-only and network-free mode', async () => assert.deepEqual((await adapter().healthCheck()).metadata, { mode: 'memory-test-only', network: false }));
