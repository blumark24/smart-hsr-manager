'use strict';

const { classifyEvidenceReference, COMPATIBILITY } = require('../storage/legacy-storage-compatibility');
const { parseCanonicalObjectKey } = require('../storage/object-key-policy');
const { MAX_IMAGE_PAYLOAD_BYTES } = require('./ai-security-policy');

function decision(allowed, code, reason, classification = null) { return Object.freeze({ allowed, code, reason, classification }); }

function evaluateAIStorageInput({ organizationId, observationId, imageReference, controlledImagePayload } = {}) {
  if (controlledImagePayload instanceof Uint8Array) {
    if (!controlledImagePayload.byteLength || controlledImagePayload.byteLength > MAX_IMAGE_PAYLOAD_BYTES) return decision(false, 'AI_STORAGE_TEST_PAYLOAD_INVALID', 'Controlled test payload is empty or oversized.');
    return decision(true, 'AI_STORAGE_CONTROLLED_PAYLOAD', 'Controlled in-memory test payload accepted.', 'CONTROLLED_TEST_PAYLOAD');
  }
  const classification = classifyEvidenceReference(imageReference);
  if (classification.classification === COMPATIBILITY.CANONICAL) {
    const parsed = parseCanonicalObjectKey(imageReference);
    if (!parsed || parsed.organizationId !== organizationId || parsed.observationId !== observationId) return decision(false, 'AI_STORAGE_SCOPE_DENIED', 'Canonical image reference does not match request scope.', classification.classification);
    return decision(true, 'AI_STORAGE_CANONICAL_PRIVATE', 'Canonical private reference accepted.', classification.classification);
  }
  if (classification.classification === COMPATIBILITY.LEGACY_COMPATIBLE && classification.provider === 'LEGACY_PRIVATE_B2') {
    const match = /(?:^|\/)observations\/([^/]+)\/(?:before|after)\//i.exec(String(imageReference));
    if (!match || match[1] !== organizationId) return decision(false, 'AI_STORAGE_SCOPE_DENIED', 'Legacy private reference does not match organization scope.', classification.classification);
    return decision(true, 'AI_STORAGE_LEGACY_PRIVATE', 'Verified private legacy key may be resolved by a future server boundary.', classification.classification);
  }
  if (classification.classification === COMPATIBILITY.LEGACY_COMPATIBLE && classification.provider === 'INDEXEDDB_LOCAL_DEMO') {
    const match = /^local-demo:\/\/([^/]+)\//.exec(String(imageReference));
    if (!match || match[1] !== organizationId) return decision(false, 'AI_STORAGE_SCOPE_DENIED', 'Local demo reference does not match organization scope.', classification.classification);
    return decision(true, 'AI_STORAGE_LOCAL_DEMO', 'Tenant-scoped local demo reference accepted for local tests only.', classification.classification);
  }
  if (classification.provider === 'EMBEDDED_DATA_IMAGE') return decision(false, 'AI_STORAGE_EMBEDDED_DATA_DENIED', 'Embedded data images are not a controlled gateway payload.', classification.classification);
  if (classification.classification === COMPATIBILITY.AMBIGUOUS) return decision(false, 'AI_STORAGE_REFERENCE_AMBIGUOUS', 'Ambiguous or public reference is denied.', classification.classification);
  return decision(false, 'AI_STORAGE_REFERENCE_INVALID', 'Invalid evidence reference is denied.', classification.classification);
}

module.exports = Object.freeze({ evaluateAIStorageInput });
