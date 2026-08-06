'use strict';

const { storageResult, STORAGE_PROVIDERS } = require('./storage-adapter-contract');
const { evaluateEvidenceUpload } = require('./evidence-policy');
const { buildCanonicalObjectKey, normalizeFilename, parseCanonicalObjectKey, normalizeSegment } = require('./object-key-policy');

const PROVIDER = STORAGE_PROVIDERS.MEMORY_TEST_ONLY;

async function bytesFrom(file) {
  if (file instanceof Uint8Array) return new Uint8Array(file);
  if (file instanceof ArrayBuffer) return new Uint8Array(file.slice(0));
  if (file && typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  return null;
}

async function sha256(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function denied(code, reason) { return storageResult({ ok: false, provider: PROVIDER, errorCode: code, reason }); }

function scopedKey(input) {
  if (typeof input?.objectKey !== 'string' || /^https?:\/\//i.test(input.objectKey)) return { error: denied('PUBLIC_REFERENCE_DENIED', 'Public URLs are not accepted by the private adapter.') };
  const parsed = parseCanonicalObjectKey(input.objectKey);
  const org = normalizeSegment(input.organizationId);
  const obs = normalizeSegment(input.observationId);
  if (!parsed || !org || !obs) return { error: denied('OBJECT_KEY_INVALID', 'A canonical object key and tenant context are required.') };
  if (parsed.organizationId !== org || parsed.observationId !== obs) return { error: denied('TENANT_SCOPE_DENIED', 'Object organization or observation scope does not match.') };
  return { parsed };
}

function createInMemoryStorageAdapter() {
  const records = new Map();
  return Object.freeze({
    async uploadEvidence(input = {}) {
      const bytes = await bytesFrom(input.file);
      if (!bytes) return denied('EVIDENCE_FILE_REQUIRED', 'Evidence bytes are required.');
      const policy = evaluateEvidenceUpload({ ...input, size: bytes.byteLength });
      if (!policy.allowed) return denied(policy.code, policy.reason);
      const checksum = await sha256(bytes);
      const key = buildCanonicalObjectKey({ ...input, objectId: checksum });
      if (!key.allowed) return denied(key.code, key.reason);
      const metadata = Object.freeze({
        organizationId: normalizeSegment(input.organizationId), observationId: normalizeSegment(input.observationId),
        evidenceType: input.evidenceType, actorId: String(input.actorId).trim(), correlationId: String(input.correlationId || '').trim() || null,
        filename: normalizeFilename(input.file?.name, input.contentType), access: 'private', retentionPolicy: 'not-configured',
      });
      records.set(key.objectKey, Object.freeze({ bytes: new Uint8Array(bytes), contentType: input.contentType, checksum, metadata }));
      return storageResult({ ok: true, provider: PROVIDER, objectKey: key.objectKey, contentType: input.contentType, size: bytes.byteLength, checksum, metadata });
    },

    async resolveEvidence(input = {}) {
      const scope = scopedKey(input); if (scope.error) return scope.error;
      const record = records.get(input.objectKey); if (!record) return denied('EVIDENCE_NOT_FOUND', 'Evidence was not found.');
      return storageResult({ ok: true, provider: PROVIDER, objectKey: input.objectKey, contentType: record.contentType, size: record.bytes.byteLength, checksum: record.checksum, metadata: record.metadata, file: new Uint8Array(record.bytes) });
    },

    async deleteEvidence(input = {}) {
      const scope = scopedKey(input); if (scope.error) return scope.error;
      if (!records.has(input.objectKey)) return denied('EVIDENCE_NOT_FOUND', 'Evidence was not found.');
      records.delete(input.objectKey);
      return storageResult({ ok: true, provider: PROVIDER, objectKey: input.objectKey, metadata: { deleted: true } });
    },

    async createThumbnail() { return denied('THUMBNAIL_PROCESSOR_UNAVAILABLE', 'Image processing is intentionally outside this foundation.'); },

    async getMetadata(input = {}) {
      const scope = scopedKey(input); if (scope.error) return scope.error;
      const record = records.get(input.objectKey); if (!record) return denied('EVIDENCE_NOT_FOUND', 'Evidence was not found.');
      return storageResult({ ok: true, provider: PROVIDER, objectKey: input.objectKey, contentType: record.contentType, size: record.bytes.byteLength, checksum: record.checksum, metadata: record.metadata });
    },

    async healthCheck() { return storageResult({ ok: true, provider: PROVIDER, metadata: { mode: 'memory-test-only', network: false } }); },
  });
}

module.exports = Object.freeze({ createInMemoryStorageAdapter });
