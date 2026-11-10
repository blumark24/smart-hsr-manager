'use strict';
const crypto = require('crypto');

function pendingUploadId(objectKey) {
  return crypto.createHash('sha256').update(objectKey, 'utf8').digest('hex');
}

function canonicalBeforeEvidenceKey(objectKey, organizationId, observationId) {
  const key = typeof objectKey === 'string' ? objectKey.trim() : '';
  const prefix = `observations/${organizationId}/${observationId}/before/`;
  if (!key.startsWith(prefix) || key.length <= prefix.length || key.length > 512) return '';
  const filename = key.slice(prefix.length);
  if (filename.includes('/') || filename.includes('..') || filename.includes('\\')) return '';
  return /^[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(filename) ? key : '';
}

module.exports = { pendingUploadId, canonicalBeforeEvidenceKey };
