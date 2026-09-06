'use strict';
// ============================================================================
// POST /api/ai/bind-analysis — cache-only binding of an already-successful
// Vision analysis onto a newly-created observation.
//
// Why this exists: Smart Input runs Vision in DRAFT mode (before the
// observation exists), so api/ai/analyze.js intentionally does not persist
// aiAnalysis then -- there is no document to write to yet. Once the
// observation is created (with the same client-generated id and the same
// evidence image reused as the analyze call's observationId/imageReference),
// this endpoint binds that already-computed result onto the real document.
//
// STRICT NON-NEGOTIABLE: this file NEVER calls a Vision/LLM provider. It has
// zero capability to -- it does not import provider-router, the vision
// provider selector, the AI storage boundary, or any B2/S3 read helper. It
// only ever reads the cached aiOperations record that api/ai/analyze.js's
// original draft call already wrote. If that cached record is missing,
// wrong status, expired, or identity-mismatched, this endpoint fails closed
// with AI_CACHED_RESULT_NOT_AVAILABLE -- it never falls through to running
// Vision again. Root Cause/Work Order simply stay unavailable until this is
// resolved through some other explicit action.
//
// Auth/authz reuses the shared, already-proven production contract from
// api/_lib/inspectorAccess.js -- the exact same functions api/ai/analyze.js,
// api/report/root-cause.js, and api/report/work-order.js use. Never a
// parallel or weaker copy.
//
// Persistence is written ONLY through the existing, unchanged
// buildPersistedAiAnalysis() allowlist (api/_lib/persistedAiAnalysis.js) --
// the same function api/ai/analyze.js already uses for persisted-mode
// Vision. No raw client field, prompt, provider payload, or secret is ever
// part of the write.
//
// Validation of the cached operation and the idempotency check both happen
// inside the SAME Firestore transaction as the write, immediately before it
// commits, to close the stale-read/write race.
// ============================================================================
const { getDb } = require('../_lib/firebaseAdmin');
const { verifyRequestToken } = require('../_lib/authz');
const { resolveInspectorContext, evaluateObservationAccess } = require('../_lib/inspectorAccess');
const { buildPersistedAiAnalysis } = require('../_lib/persistedAiAnalysis');
const { stableOperationId } = require('../_lib/aiGuard');

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

function millis(value) {
  if (value?.toMillis) return value.toMillis();
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

// Same canonical + legacy evidence field order used by api/ai/analyze.js and
// the authenticated storage reader -- never a client-supplied value.
function resolveImageReference(observation) {
  return [
    observation.imageObjectKey,
    observation.imagePath,
    observation.imageUrl,
    observation.beforeImagePath,
  ].find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

// Thrown inside the transaction to short-circuit with a specific, mapped
// HTTP outcome. Never thrown after a write has been queued.
class BindDenied extends Error {
  constructor(statusCode, errorCode, reason) {
    super(errorCode);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.reason = reason;
  }
}

// The entire cache-only bind decision + write happens inside one
// transaction: both the observation and the cached aiOperations record are
// read fresh here, immediately before the (conditional) write, so nothing
// read earlier in the request (e.g. for the access check) can go stale
// between validation and commit.
async function bindCachedAnalysis(db, { organizationId, uid, observationId }, now = Date.now()) {
  const observationRef = db.collection('observations').doc(observationId);
  return db.runTransaction(async transaction => {
    const observationSnap = await transaction.get(observationRef);
    if (!observationSnap.exists) throw new BindDenied(404, 'AI_OBSERVATION_NOT_FOUND', 'Observation was not found.');
    const observation = observationSnap.data() || {};

    // Re-verify tenant/ownership against the fresh read, not the caller's
    // earlier read -- defense in depth against any change between requests.
    const access = evaluateObservationAccess(observation, { organizationId, uid });
    if (!access.allowed) throw new BindDenied(403, access.code, access.reason);

    // Idempotent: a repeated bind request is always safe and never
    // overwrites an existing result.
    if (observation.aiAnalysis) return { ok: true, alreadyBound: true };

    const imageReference = resolveImageReference(observation);
    if (!imageReference) throw new BindDenied(400, 'AI_PRIVATE_IMAGE_REQUIRED', 'Observation has no evidence image to bind.');

    const operationId = stableOperationId({ organizationId, uid, observationId, imageReference });
    const operationSnap = await transaction.get(db.collection('aiOperations').doc(operationId));
    const operation = operationSnap.exists ? operationSnap.data() || {} : null;

    const valid = Boolean(operation)
      && operation.status === 'SUCCEEDED'
      && millis(operation.expiresAt) > now
      && operation.response && operation.response.ok === true
      && operation.response.analysis && operation.response.intelligence
      && operation.organizationId === organizationId
      && operation.ownerUid === uid
      && operation.observationId === observationId;
    if (!valid) throw new BindDenied(409, 'AI_CACHED_RESULT_NOT_AVAILABLE', 'No matching successful Vision result is cached for this observation.');

    // The ONLY persistence path -- identical allowlist api/ai/analyze.js
    // already uses for persisted-mode Vision. No raw client/provider field
    // is ever written.
    const aiAnalysis = buildPersistedAiAnalysis(operation.response.analysis, operation.response.intelligence);
    transaction.update(observationRef, { aiAnalysis });
    return { ok: true, bound: true };
  });
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
  if (!observationId) return fail(res, 400, 'AI_BIND_OBSERVATION_REQUIRED', 'observationId is required.');

  try {
    const result = await bindCachedAnalysis(db, { organizationId: caller.organizationId, uid: caller.uid, observationId });
    return sendJson(res, 200, { ok: true, advisoryOnly: true, requiresExplicitHumanAction: true, ...result });
  } catch (error) {
    if (error instanceof BindDenied) return fail(res, error.statusCode, error.errorCode, error.reason);
    return fail(res, 500, 'AI_BIND_FAILED', 'Could not bind the cached Vision result.');
  }
}

module.exports = handler;
module.exports._test = {
  cleanId,
  readJsonBody,
  resolveImageReference,
  bindCachedAnalysis,
  BindDenied,
  resolveInspectorContext,
  evaluateObservationAccess,
  handler,
};
