'use strict';
// Unified SMART HSR deterministic report endpoint.
// Legacy public routes remain available through vercel.json rewrites:
//   /api/report/root-cause -> /api/report?kind=root-cause
//   /api/report/work-order -> /api/report?kind=work-order
// This consolidation keeps the original auth/tenant/ownership behavior while
// reducing the Vercel Serverless Function count by one.

const { getDb } = require('./_lib/firebaseAdmin');
const { verifyRequestToken } = require('./_lib/authz');
const { resolveInspectorContext, evaluateObservationAccess } = require('./_lib/inspectorAccess');
const { createRootCauseAdvisory } = require('../platform/intelligence/root-cause-advisory');
const { createWorkOrderDraft } = require('../platform/intelligence/work-order-draft');

const MAX_ID_LENGTH = 128;
const MAX_BODY_BYTES = 2048;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(payload));
}

function fail(res, statusCode, errorCode, reason) {
  return sendJson(res, statusCode, {
    ok: false,
    advisoryOnly: true,
    requiresExplicitHumanAction: true,
    errorCode,
    reason,
  });
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
      if (size > MAX_BODY_BYTES) {
        throw Object.assign(new Error('payload_too_large'), { statusCode: 413 });
      }
      chunks.push(chunk);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

async function getAuthorizedObservation(req, res, codes) {
  if (req.method !== 'POST') {
    fail(res, 405, 'method_not_allowed', 'Only POST is supported.');
    return null;
  }

  let decoded;
  try {
    decoded = await verifyRequestToken(req);
  } catch (error) {
    fail(res, error.statusCode || 401, 'unauthenticated', 'Authentication is required.');
    return null;
  }

  const db = getDb();
  const caller = await resolveInspectorContext(db, decoded.uid);
  if (!caller) {
    fail(res, 403, 'AI_INSPECTOR_ROLE_REQUIRED', 'inspector_role_required');
    return null;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    fail(res, error.statusCode || 400, 'invalid_request', 'Malformed request body.');
    return null;
  }

  const observationId = cleanId(body.observationId);
  if (!observationId) {
    fail(res, 400, codes.required, 'observationId is required.');
    return null;
  }

  let observationSnap;
  try {
    observationSnap = await db.collection('observations').doc(observationId).get();
  } catch (_) {
    fail(res, 500, codes.lookupFailed, 'Could not read the observation record.');
    return null;
  }

  if (!observationSnap.exists) {
    fail(res, 404, codes.notFound, 'Observation was not found.');
    return null;
  }

  const observation = observationSnap.data() || {};
  const access = evaluateObservationAccess(observation, caller);
  if (!access.allowed) {
    fail(res, 403, access.code, access.reason);
    return null;
  }

  return observation;
}

async function handleRootCause(req, res) {
  const observation = await getAuthorizedObservation(req, res, {
    required: 'ROOT_CAUSE_OBSERVATION_REQUIRED',
    lookupFailed: 'ROOT_CAUSE_LOOKUP_FAILED',
    notFound: 'ROOT_CAUSE_OBSERVATION_NOT_FOUND',
  });
  if (!observation) return;

  const result = createRootCauseAdvisory({ aiAnalysis: observation.aiAnalysis, observation });
  if (!result.ok) return fail(res, 409, result.errorCode, result.reason);

  return sendJson(res, 200, {
    ok: true,
    advisoryOnly: true,
    requiresExplicitHumanAction: true,
    rootCause: result.rootCause,
  });
}

async function handleWorkOrder(req, res) {
  const observation = await getAuthorizedObservation(req, res, {
    required: 'WORK_ORDER_OBSERVATION_REQUIRED',
    lookupFailed: 'WORK_ORDER_LOOKUP_FAILED',
    notFound: 'WORK_ORDER_OBSERVATION_NOT_FOUND',
  });
  if (!observation) return;

  const result = createWorkOrderDraft({ aiAnalysis: observation.aiAnalysis, observation });
  if (!result.ok) return fail(res, 409, result.errorCode, result.reason);

  return sendJson(res, 200, {
    ok: true,
    advisoryOnly: true,
    requiresExplicitHumanAction: true,
    workOrder: result.workOrder,
  });
}

function reportKind(req) {
  const queryKind = req && req.query && typeof req.query.kind === 'string' ? req.query.kind.trim() : '';
  if (queryKind) return queryKind;
  try {
    return new URL((req && req.url) || '/', 'http://localhost').searchParams.get('kind') || '';
  } catch (_) {
    return '';
  }
}

async function handler(req, res) {
  const kind = reportKind(req);
  if (kind === 'root-cause') return handleRootCause(req, res);
  if (kind === 'work-order') return handleWorkOrder(req, res);
  return fail(res, 404, 'report_not_found', 'Unknown report endpoint.');
}

const sharedTestSurface = {
  cleanId,
  resolveInspectorContext,
  evaluateObservationAccess,
  readJsonBody,
};

module.exports = handler;
module.exports._test = {
  reportKind,
  rootCause: { ...sharedTestSurface, handler: handleRootCause },
  workOrder: { ...sharedTestSurface, handler: handleWorkOrder },
};
