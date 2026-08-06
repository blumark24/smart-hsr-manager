'use strict';

const MAX_IMAGE_BYTES = 700 * 1024;
const EVIDENCE_TYPES = Object.freeze({
  BEFORE: 'BEFORE', AFTER: 'AFTER', THUMBNAIL: 'THUMBNAIL',
  AI_REPORT: 'AI_REPORT', GENERATED_REPORT: 'GENERATED_REPORT',
});
const IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
const ACTIVE_UPLOAD_TYPES = Object.freeze([EVIDENCE_TYPES.BEFORE, EVIDENCE_TYPES.AFTER, EVIDENCE_TYPES.THUMBNAIL]);

function decision(allowed, code, reason, details = {}) {
  return Object.freeze({ allowed, code, reason, ...details });
}

function evaluateEvidenceUpload({ evidenceType, contentType, size, organizationId, observationId, actorId } = {}) {
  if (![organizationId, observationId, actorId].every(value => typeof value === 'string' && value.trim())) {
    return decision(false, 'EVIDENCE_CONTEXT_REQUIRED', 'Organization, observation, and actor context are required.');
  }
  if (!Object.values(EVIDENCE_TYPES).includes(evidenceType)) {
    return decision(false, 'EVIDENCE_TYPE_UNSUPPORTED', 'The evidence type is not part of the contract.');
  }
  if (!ACTIVE_UPLOAD_TYPES.includes(evidenceType)) {
    return decision(false, 'EVIDENCE_TYPE_NOT_ACTIVE', 'This evidence type is reserved but has no current upload behavior.');
  }
  if (!IMAGE_TYPES.includes(contentType)) {
    return decision(false, 'EVIDENCE_MIME_DENIED', 'Only JPEG, PNG, and WebP evidence is accepted.');
  }
  if (!Number.isInteger(size) || size < 1) return decision(false, 'EVIDENCE_EMPTY', 'Evidence must contain bytes.');
  if (size > MAX_IMAGE_BYTES) return decision(false, 'EVIDENCE_TOO_LARGE', `Evidence exceeds ${MAX_IMAGE_BYTES} bytes.`);
  return decision(true, 'EVIDENCE_UPLOAD_ALLOWED', 'Evidence satisfies the isolated upload policy.', {
    requirements: Object.freeze(['sha256-checksum', 'private-access', 'tenant-scope', 'audit-event', 'retention-policy']),
  });
}

const SECURITY_POLICY = Object.freeze({
  access: 'PRIVATE_ONLY', publicUrls: 'DENY', checksum: 'SHA-256', maxImageBytes: MAX_IMAGE_BYTES,
  filename: 'normalized-metadata-only; never used as object key', tenantScope: 'exact organization and observation match',
  exif: 'strip GPS/device metadata before a future production upload; not performed by this foundation',
  audit: 'actorId, organizationId, observationId, evidenceType, correlationId; never bytes or credentials',
  retention: 'provider policy required before production deletion or lifecycle activation',
});

module.exports = Object.freeze({ EVIDENCE_TYPES, IMAGE_TYPES, ACTIVE_UPLOAD_TYPES, MAX_IMAGE_BYTES, SECURITY_POLICY, evaluateEvidenceUpload });
