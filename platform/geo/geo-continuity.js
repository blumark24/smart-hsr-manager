'use strict';
// ============================================================================
// SMART HSR GEO CORE — Operational <-> Twin continuity contract.
//
// "The user must feel this is ONE geographic system, not two disconnected
// pages" (Phase 08 brief). This module builds and parses the small,
// explicit context object carried across the "عرض في التوأم الرقمي" /
// "فتح في الخريطة التشغيلية" handoff: entity id, organizationId, layerId,
// and camera target. It is pure (no DOM, no URL API assumptions beyond
// URLSearchParams-compatible string encoding) so both operational-map.html
// and twin.html can require it identically.
// ============================================================================

const { createDecision, deepFreeze } = require('../contracts/decision');
const { validateCameraState } = require('./geo-camera-state');

const CONTINUITY_PARAM = 'geoContext';

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateContinuityContext(value) {
  if (!value || typeof value !== 'object') {
    return createDecision(false, 'GEO_CONTINUITY_CONTEXT_REQUIRED', 'A continuity context is required.');
  }
  if (!normalizeId(value.organizationId)) {
    return createDecision(false, 'GEO_CONTINUITY_ORGANIZATION_REQUIRED', 'A continuity context must carry an organizationId.');
  }
  if (value.camera) {
    const cameraDecision = validateCameraState(value.camera);
    if (!cameraDecision.allowed) return cameraDecision;
  }
  return createDecision(true, 'GEO_CONTINUITY_CONTEXT_VALID', 'The continuity context is structurally valid.');
}

function createContinuityContext(value) {
  const candidate = {
    organizationId: normalizeId(value.organizationId),
    entityId: normalizeId(value.entityId) || null,
    layerId: normalizeId(value.layerId) || null,
    camera: value.camera || null,
  };
  const validation = validateContinuityContext(candidate);
  if (!validation.allowed) return { decision: validation, context: null };
  return deepFreeze({ decision: validation, context: deepFreeze(candidate) });
}

// Encodes to a single URL-safe query parameter value so a target page's URL
// stays a normal, bookmarkable link rather than a pile of loose params.
function encodeContinuityContext(context) {
  return encodeURIComponent(JSON.stringify(context));
}

function decodeContinuityContext(encoded) {
  if (!encoded) return { decision: createDecision(false, 'GEO_CONTINUITY_ENCODED_REQUIRED', 'An encoded continuity context is required.'), context: null };
  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(encoded));
  } catch (_) {
    return { decision: createDecision(false, 'GEO_CONTINUITY_DECODE_FAILED', 'The continuity context could not be decoded.'), context: null };
  }
  return createContinuityContext(parsed || {});
}

// Builds the target URL for a continuity handoff link, preserving any
// existing query params the destination page already needs (e.g.
// ?useEmulators=1 in non-production testing) rather than clobbering them.
function buildContinuityUrl(baseUrl, context) {
  const validation = validateContinuityContext(context);
  if (!validation.allowed) return { decision: validation, url: null };
  const url = new URL(baseUrl, 'http://localhost');
  url.searchParams.set(CONTINUITY_PARAM, encodeContinuityContext(context));
  return { decision: validation, url: url.pathname + url.search };
}

module.exports = Object.freeze({
  CONTINUITY_PARAM,
  validateContinuityContext,
  createContinuityContext,
  encodeContinuityContext,
  decodeContinuityContext,
  buildContinuityUrl,
});
