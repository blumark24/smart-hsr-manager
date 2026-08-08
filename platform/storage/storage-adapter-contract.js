'use strict';

const STORAGE_ADAPTER_METHODS = Object.freeze([
  'uploadEvidence',
  'resolveEvidence',
  'deleteEvidence',
  'createThumbnail',
  'getMetadata',
  'healthCheck',
]);

const STORAGE_PROVIDERS = Object.freeze({
  MEMORY_TEST_ONLY: 'MEMORY_TEST_ONLY',
  LEGACY_PRIVATE_B2: 'LEGACY_PRIVATE_B2',
  CLOUDFLARE_R2: 'CLOUDFLARE_R2',
  S3_COMPATIBLE: 'S3_COMPATIBLE',
  SCCC: 'SCCC',
  INSTITUTION_MINIO: 'INSTITUTION_MINIO',
});

function storageResult(value = {}) {
  const result = {
    ok: value.ok === true,
    provider: String(value.provider || ''),
    objectKey: value.objectKey || null,
    contentType: value.contentType || null,
    size: Number.isFinite(value.size) ? value.size : null,
    checksum: value.checksum || null,
    metadata: Object.freeze({ ...(value.metadata || {}) }),
  };
  if (!result.ok) {
    result.errorCode = String(value.errorCode || 'STORAGE_OPERATION_DENIED');
    result.reason = String(value.reason || 'The storage operation was denied.');
  }
  if (value.file !== undefined) result.file = value.file;
  return Object.freeze(result);
}

function validateStorageAdapter(adapter) {
  const missing = STORAGE_ADAPTER_METHODS.filter(method => typeof adapter?.[method] !== 'function');
  return Object.freeze({
    allowed: missing.length === 0,
    code: missing.length ? 'STORAGE_ADAPTER_INCOMPLETE' : 'STORAGE_ADAPTER_VALID',
    reason: missing.length ? `Missing methods: ${missing.join(', ')}` : 'Storage adapter contract is complete.',
    missing: Object.freeze(missing),
  });
}

module.exports = Object.freeze({ STORAGE_ADAPTER_METHODS, STORAGE_PROVIDERS, storageResult, validateStorageAdapter });
