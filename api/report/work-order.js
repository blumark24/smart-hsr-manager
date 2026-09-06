'use strict';
// ============================================================================
// POST /api/report/work-order — deterministic Work Order Draft over an
// already-persisted Vision result. NEVER calls an AI provider. NEVER writes
// to Firestore -- pure read + compute + respond. Independent of Root Cause.
//
// Auth/authz mirrors api/ai/analyze.js's non-draft-mode path exactly -- see
// api/report/root-cause.js for the identical rationale.
// ============================================================================
const { getDb } = require('../_lib/firebaseAdmin');
const { verifyRequestToken } = require('../_lib/authz');
const { resolveInspectorContext, evaluateObservationAccess } = require('../_lib/inspectorAccess');
const { createWorkOrderDraft } = require('../../platform/intelligence/work-order-draft');

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
  if (!observationId) return fail(res, 400, 'WORK_ORDER_OBSERVATION_REQUIRED', 'observationId is required.');

  let observationSnap;
  try {
    observationSnap = await db.collection('observations').doc(observationId).get();
  } catch (error) {
    return fail(res, 500, 'WORK_ORDER_LOOKUP_FAILED', 'Could not read the observation record.');
  }
  if (!observationSnap.exists) return fail(res, 404, 'WORK_ORDER_OBSERVATION_NOT_FOUND', 'Observation was not found.');
  const observation = observationSnap.data() || {};

  const access = evaluateObservationAccess(observation, caller);
  if (!access.allowed) return fail(res, 403, access.code, access.reason);

  const result = createWorkOrderDraft({ aiAnalysis: observation.aiAnalysis, observation });
  if (!result.ok) return fail(res, 409, result.errorCode, result.reason);

  return sendJson(res, 200, { ok: true, advisoryOnly: true, requiresExplicitHumanAction: true, workOrder: result.workOrder });
}

module.exports = handler;
module.exports._test = { cleanId, resolveInspectorContext, evaluateObservationAccess, readJsonBody, handler };
