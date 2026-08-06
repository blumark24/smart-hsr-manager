'use strict';

const { parseCanonicalObjectKey } = require('./object-key-policy');
const COMPATIBILITY = Object.freeze({ CANONICAL: 'CANONICAL', LEGACY_COMPATIBLE: 'LEGACY_COMPATIBLE', AMBIGUOUS: 'AMBIGUOUS', INVALID: 'INVALID' });
function result(classification, provider, reason) { return Object.freeze({ classification, provider, reason }); }

function classifyEvidenceReference(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return result(COMPATIBILITY.INVALID, null, 'Reference is empty.');
  if (parseCanonicalObjectKey(raw)) return result(COMPATIBILITY.CANONICAL, 'PORTABLE_STORAGE_ADAPTER', 'Canonical tenant-scoped key.');
  if (/^local-demo:\/\/[^/]+\/.+/.test(raw)) return result(COMPATIBILITY.LEGACY_COMPATIBLE, 'INDEXEDDB_LOCAL_DEMO', 'Existing device-local demo reference.');
  if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(raw)) return result(COMPATIBILITY.LEGACY_COMPATIBLE, 'EMBEDDED_DATA_IMAGE', 'Existing embedded image reference; migration must externalize it.');
  if (/^(?:[A-Za-z0-9_-]+\/)*observations\/[A-Za-z0-9_-]+\/(?:before|after)\/[A-Za-z0-9_\-/.]+\.(?:jpe?g|png|webp)$/i.test(raw)) return result(COMPATIBILITY.LEGACY_COMPATIBLE, 'LEGACY_PRIVATE_B2', 'Existing private object key resolved through the authenticated API.');
  if (/^(?:gs:\/\/|https:\/\/[^/]*(?:firebasestorage|storage\.googleapis))/i.test(raw)) return result(COMPATIBILITY.AMBIGUOUS, 'FIREBASE_STORAGE_REFERENCE', 'No active Firebase Storage evidence flow was verified; fail closed pending migration evidence.');
  if (/^https:\/\//i.test(raw)) return result(COMPATIBILITY.AMBIGUOUS, 'EXTERNAL_HTTPS', 'Legacy external URL has unknown privacy and tenant scope.');
  return result(COMPATIBILITY.INVALID, null, 'Unsupported or malformed evidence reference.');
}

module.exports = Object.freeze({ COMPATIBILITY, classifyEvidenceReference });
