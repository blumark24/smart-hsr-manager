'use strict';
// ============================================================================
// POST /api/report/ai-review — Sprint 6.9: manager Approve/Reject decision on
// a persisted AI Vision suggestion (api/ai/analyze.js writes the suggestion;
// this endpoint is the ONLY way it can be marked reviewed).
//
// Auth:   Authorization: Bearer <Firebase ID token>  (verified, revoke-checked)
// Authz:  caller must be managers/{uid} with role 'manager', active != false,
//         non-empty organizationId — read from the caller's OWN Firestore
//         record only (reuses api/_lib/authz.js's getCallerContext, the same
//         resolver the rest of the Admin API uses). Supervisors and owners
//         are both denied: this mirrors firestore.rules, where observations
//         are manager/org-user scoped and owner has no access to them at
//         all, and matches this sprint's "manager actions only" requirement.
// Body:   { observationId, decision }  decision must be 'APPROVED' or
//         'REJECTED' — nothing else is accepted.
//
// What this endpoint writes, and ONLY this: aiAnalysis.reviewed,
// aiAnalysis.reviewStatus, aiAnalysis.reviewedByUid, aiAnalysis.reviewedAt.
// It is structurally incapable of touching status, assignedContractorUid,
// closedAt, or any other observation field — the update payload below is a
// fixed object literal of only those four dot-path keys, not a merge of
// caller-supplied data. It never assigns a contractor, never closes a
// report, and never triggers any other workflow.
// ============================================================================
const { getDb, FieldValue } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, getCallerContext } = require('../_lib/authz');

const MAX_ID_LENGTH = 128;
const MAX_BODY_BYTES = 2048;
const DECISIONS = Object.freeze(['APPROVED', 'REJECTED']);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(payload));
}

function fail(res, statusCode, errorCode, reason) {
  return sendJson(res, statusCode, { ok: false, errorCode, reason });
}

function cleanId(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw.length && raw.length <= MAX_ID_LENGTH && /^[A-Za-z0-9_-]+$/.test(raw) ? raw : '';
}

function cleanDecision(value) {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return DECISIONS.includes(raw) ? raw : '';
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

// The fixed shape of every write this endpoint can ever make. Keeping it as
// a standalone, argument-driven function (rather than inline in the handler)
// makes the "only these four fields, always" guarantee independently
// testable without needing a live Firestore connection.
function buildReviewUpdate(decision, reviewedByUid) {
  return {
    'aiAnalysis.reviewed': true,
    'aiAnalysis.reviewStatus': decision,
    'aiAnalysis.reviewedByUid': reviewedByUid,
    'aiAnalysis.reviewedAt': FieldValue.serverTimestamp(),
  };
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
  const caller = await getCallerContext(decoded.uid);
  if (!caller.isManager) return fail(res, 403, 'forbidden', 'manager_role_required');

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return fail(res, error.statusCode || 400, 'invalid_request', 'Malformed request body.');
  }

  const observationId = cleanId(body.observationId);
  if (!observationId) return fail(res, 400, 'AI_REVIEW_OBSERVATION_REQUIRED', 'observationId is required.');
  const decision = cleanDecision(body.decision);
  if (!decision) return fail(res, 400, 'AI_REVIEW_DECISION_INVALID', 'decision must be APPROVED or REJECTED.');

  let observationSnap;
  try {
    observationSnap = await db.collection('observations').doc(observationId).get();
  } catch (error) {
    return fail(res, 500, 'AI_REVIEW_LOOKUP_FAILED', 'Could not read the observation record.');
  }
  if (!observationSnap.exists) return fail(res, 404, 'AI_REVIEW_OBSERVATION_NOT_FOUND', 'Observation was not found.');
  const observation = observationSnap.data() || {};

  // Tenant isolation: the manager's OWN organizationId (server-resolved)
  // must match the observation's organizationId (server-stored) — never a
  // client-supplied value on either side.
  if (observation.organizationId !== caller.organizationId) {
    return fail(res, 403, 'forbidden', 'cross_organization_denied');
  }
  if (!observation.aiAnalysis || typeof observation.aiAnalysis !== 'object') {
    return fail(res, 409, 'AI_REVIEW_NO_ANALYSIS', 'This observation has no AI analysis to review.');
  }

  try {
    await db.collection('observations').doc(observationId).update(buildReviewUpdate(decision, caller.uid));
  } catch (error) {
    console.error('ai-review: update failed', { name: (error && error.name) || 'unknown_error' });
    return fail(res, 502, 'AI_REVIEW_UPDATE_FAILED', 'Could not save the review decision.');
  }

  return sendJson(res, 200, { ok: true, reviewStatus: decision });
}

module.exports = handler;
module.exports._test = { DECISIONS, cleanId, cleanDecision, readJsonBody, buildReviewUpdate, handler };
