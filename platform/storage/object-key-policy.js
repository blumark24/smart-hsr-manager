'use strict';

const TYPE_SEGMENTS = Object.freeze({ BEFORE: 'before', AFTER: 'after', THUMBNAIL: 'thumbnail', AI_REPORT: 'ai-report', GENERATED_REPORT: 'generated-report' });

function normalizeSegment(value) {
  const raw = typeof value === 'string' ? value.trim().normalize('NFKC') : '';
  if (!raw || raw.includes('..') || /[\\/\0]/.test(raw) || /%2f|%5c/i.test(raw)) return '';
  return /^[A-Za-z0-9_-]{1,128}$/.test(raw) ? raw : '';
}

function buildCanonicalObjectKey({ organizationId, observationId, evidenceType, objectId } = {}) {
  const org = normalizeSegment(organizationId);
  const obs = normalizeSegment(observationId);
  const type = TYPE_SEGMENTS[evidenceType];
  const object = normalizeSegment(objectId);
  if (!org || !obs || !type || !object) return Object.freeze({ allowed: false, code: 'OBJECT_KEY_INPUT_INVALID', reason: 'Canonical key inputs must be safe path segments.', objectKey: null });
  return Object.freeze({ allowed: true, code: 'OBJECT_KEY_VALID', reason: 'Canonical object key created.', objectKey: `organizations/${org}/observations/${obs}/${type}/${object}` });
}

function parseCanonicalObjectKey(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const match = /^organizations\/([A-Za-z0-9_-]+)\/observations\/([A-Za-z0-9_-]+)\/(before|after|thumbnail|ai-report|generated-report)\/([A-Za-z0-9_.-]+)$/.exec(raw)
    || /^observations\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/(before|after)\/([A-Za-z0-9_.-]+\.(?:jpe?g|png|webp))$/i.exec(raw);
  return match && !match[4].includes('..')
    ? Object.freeze({ organizationId: match[1], observationId: match[2], evidenceType: match[3], objectId: match[4] })
    : null;
}

function normalizeFilename(filename, contentType) {
  const extension = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[contentType];
  if (!extension) return null;
  const leaf = String(filename || 'evidence').split(/[\\/]/).pop().replace(/\.[^.]*$/, '');
  return `${normalizeSegment(leaf.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''))?.toLowerCase() || 'evidence'}.${extension}`;
}

module.exports = Object.freeze({ TYPE_SEGMENTS, normalizeSegment, normalizeFilename, buildCanonicalObjectKey, parseCanonicalObjectKey });
