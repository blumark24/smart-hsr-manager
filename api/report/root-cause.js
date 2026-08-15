'use strict';
// ============================================================================
// POST /api/report/root-cause — deterministic Root Cause Advisory over an
// already-persisted Vision result. NEVER calls an AI provider. NEVER writes
// to Firestore -- pure read + compute + respond.
//
// Auth/authz mirrors api/ai/analyze.js's non-draft-mode path exactly (the
// proven Inspector contract already used across this system): verified
// Firebase ID token, caller resolved from the caller's OWN users/{uid}
// document only (role must be 'inspector', active, non-empty
// organizationId), and the target observation must match the caller's
// organizationId AND createdByUid -- the same org+ownership boundary Vision
// itself enforces. Cross-org and non-owner requests are denied identically.
// ============================================================================
const { getDb } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, activeIsNotFalse } = require('../_lib/authz');
const { createRootCauseAdvisory } = require('../../platform/intelligence/root-cause-advisory');

const MAX_ID_LENGTH = 128;
const MAX_BODY_BYTES = 2048;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(payload));
}
function fail(res, statusCode, errorCode, reason) {
  return sendJson(res, statusCode, { ok: false, advisoryOnly: true, requiresExplicitHumanAction: true, errorCode, reason });
}
function cleanId(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw.length && raw.length <= MAX_ID_LENGTH && /^[A-Za-z0-9_-]+$/.test(raw) ? raw : '';
}

// Mirrors api/ai/analyze.js's resolveInspectorContext exactly.
async function resolveInspectorContext(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const organizationId = typeof data.organizationId === 'string' ? data.organizationId.trim() : '';
  if (data.role !== 'inspector' || !activeIsNotFalse(data) || !organizationId) return null;
  return { uid, role: 'inspector', organizationId };
}

// Mirrors api/ai/analyze.js's evaluateObservationAccess exactly.
function evaluateObservationAccess(observation, caller) {
  if ((observation && observation.organizationId) !== (caller && caller.organizationId)) {
    return { allowed: false, code: 'AI_CROSS_ORGANIZATION_DENIED', reason: 'cross_organization_denied' };
  }
  if ((observation && observation.createdByUid) !== (caller && caller.uid)) {
    return { allowed: false, code: 'AI_REPORT_OWNER_DENIED', reason: 'not_report_owner' };
  }
  return { allowed: true, code: 'AI_REPORT_ACCESS_ALLOWED', reason: 'report_owner' };
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = '';
  if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else if (typeof req.body === 'string') raw = req.body;
  else {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw Object.assign(new Error('payload_too_large'), { statusCode: 413 });
      chunks.push(chunk);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed', 'Only POST is supported.');

  let decoded;
  try {
    decoded = await verifyRequestToken(req);
  } catch (error) {
    return fail(res, error.statusCode || 401, 'unauthenticated', 'Authentication is required.');
  }

  const db = getDb();
  const caller = await resolveInspectorContext(db, decoded.uid);
  if (!caller) return fail(res, 403, 'AI_INSPECTOR_ROLE_REQUIRED', 'inspector_role_required');

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return fail(res, error.statusCode || 400, 'invalid_request', 'Malformed request body.');
  }

  const observationId = cleanId(body.observationId);
  if (!observationId) return fail(res, 400, 'ROOT_CAUSE_OBSERVATION_REQUIRED', 'observationId is required.');

  let observationSnap;
  try {
    observationSnap = await db.collection('observations').doc(observationId).get();
  } catch (error) {
    return fail(res, 500, 'ROOT_CAUSE_LOOKUP_FAILED', 'Could not read the observation record.');
  }
  if (!observationSnap.exists) return fail(res, 404, 'ROOT_CAUSE_OBSERVATION_NOT_FOUND', 'Observation was not found.');
  const observation = observationSnap.data() || {};

  const access = evaluateObservationAccess(observation, caller);
  if (!access.allowed) return fail(res, 403, access.code, access.reason);

  const result = createRootCauseAdvisory({ aiAnalysis: observation.aiAnalysis, observation });
  if (!result.ok) return fail(res, 409, result.errorCode, result.reason);

  return sendJson(res, 200, { ok: true, advisoryOnly: true, requiresExplicitHumanAction: true, rootCause: result.rootCause });
}

module.exports = handler;
module.exports._test = { cleanId, resolveInspectorContext, evaluateObservationAccess, readJsonBody, handler };
