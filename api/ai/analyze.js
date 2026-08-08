'use strict';
// ============================================================================
// POST /api/ai/analyze — secure AI Vision Gateway integration
// (Sprint 6.8: analysis + advisory response; Sprint 6.9: + persistence;
// Sprint 6.11 Phase 2: + configuration-driven provider selection).
//
// Inspector Upload Image -> Secure AI Gateway -> Configured Vision Provider
// (Gemini or OpenAI, selected by SMART_HSR_AI_PROVIDER via
// platform/ai/server/active-vision-provider-selector.js) ->
// Issue Classification -> Priority Suggestion -> AI Analysis Persistence ->
// Manager Dashboard Review -> Human Approval -> Existing Workflow Continues
//
// Auth:   Authorization: Bearer <Firebase ID token>  (verified, revoke-checked)
// Authz:  caller must be users/{uid} with role 'inspector', active != false,
//         non-empty organizationId — read from the caller's OWN Firestore
//         record only, exactly like api/storage/upload.js. The request body
//         can never choose or influence the tenant.
// Body:   { observationId, correlationId? }
//
// Scope:  Pilot rollout is restricted to Al-Qunfudhah Municipality only. Any
//         other organization receives a clear, honest "not enabled" response
//         — never a fabricated AI result. This is enforced twice: once here
//         (fast path, before any storage/provider work) and once again inside
//         the active provider's own activation guard (defense in depth) —
//         see platform/ai/server/real-provider-activation-guard.js.
//
// Advisory-only: this endpoint never assigns a contractor, never changes an
// observation's status, and never closes a report. Sprint 6.9 adds ONE
// additional write beyond Sprint 6.8: on a successful analysis, a small,
// explicit-allowlist "aiAnalysis" object (see buildPersistedAiAnalysis below)
// is attached to the observation document so a manager can review it in
// manager.html (api/report/ai-review.js handles the manager's decision). No
// API key, prompt, or raw image byte is ever part of that write. A manager
// still makes the real decision downstream through the existing workflow.
// ============================================================================
const { getDb, FieldValue } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, activeIsNotFalse } = require('../_lib/authz');
const { b2Configuration, getS3Client, safeStorageFailure } = require('../_lib/b2Client');
const { evaluateAIStorageInput } = require('../../platform/ai/ai-storage-boundary');
const { createProviderRouter } = require('../../platform/ai/provider-router');
const { createActiveVisionProviderRegistration } = require('../../platform/ai/server/active-vision-provider-selector');
const { createMunicipalIntelligence } = require('../../platform/intelligence/municipal-intelligence-engine');

// Same organization id used elsewhere for the Al-Qunfudhah pilot (see
// api/organization/context.js). Not a secret — it is a Firestore document id.
const ALQUNFUDHAH_ORGANIZATION_ID = 'CnlVlKC7UcDMp2NZzjjT';
const MAX_ID_LENGTH = 128;
const MAX_BODY_BYTES = 8192;
const PROVIDER_TIMEOUT_MS = 15000;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(payload));
}

// Every failure path returns this exact shape. There is no code path that
// returns ok:true without a real, validated provider result — a denial is
// always an honest denial, never a fabricated analysis.
function fail(res, statusCode, errorCode, reason) {
  return sendJson(res, statusCode, { ok: false, advisoryOnly: true, requiresExplicitHumanAction: true, errorCode, reason });
}

function cleanId(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw.length && raw.length <= MAX_ID_LENGTH && /^[A-Za-z0-9_-]+$/.test(raw) ? raw : '';
}

// Reads the caller's OWN users/{uid} document only. Mirrors
// api/storage/upload.js's resolveInspectorContext exactly, so AI analysis is
// gated by the identical trust boundary as the upload it analyzes.
async function resolveInspectorContext(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const organizationId = typeof data.organizationId === 'string' ? data.organizationId.trim() : '';
  if (data.role !== 'inspector' || !activeIsNotFalse(data) || !organizationId) return null;
  return { uid, role: 'inspector', organizationId };
}

// Explicit allowlist only — never a spread of the raw analysis/intelligence
// object — so an API key, prompt, or raw image byte can never reach
// Firestore even if a future upstream change accidentally added one. Matches
// the shape requested for Sprint 6.9, plus the review fields Phase 3 needs.
function buildPersistedAiAnalysis(analysis, intelligence) {
  return {
    provider: typeof analysis.provider === 'string' ? analysis.provider : 'unknown',
    category: typeof analysis.categoryCode === 'string' ? analysis.categoryCode : null,
    categoryLabelAr: typeof analysis.categoryLabelAr === 'string' ? analysis.categoryLabelAr : null,
    confidence: Number.isFinite(analysis.confidence) ? analysis.confidence : null,
    prioritySuggestion: intelligence?.prioritySuggestion?.prioritySuggestion || analysis.prioritySuggestion || 'UNKNOWN',
    explanation: typeof analysis.shortSummaryAr === 'string' ? analysis.shortSummaryAr : null,
    recommendedActionAr: typeof analysis.recommendedActionAr === 'string' ? analysis.recommendedActionAr : null,
    requiresHumanReview: true,
    reviewed: false,
    reviewStatus: 'PENDING',
    reviewedByUid: null,
    reviewedAt: null,
    generatedAt: FieldValue.serverTimestamp(),
  };
}

function extensionContentType(key) {
  const match = /\.([A-Za-z0-9]+)$/.exec(key || '');
  const ext = match ? match[1].toLowerCase() : '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return '';
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

// Reads the evidence object straight out of the private bucket into memory —
// no signed URL, no bytes ever reach the browser. Handles both the Node
// Readable-stream shape and the web-stream (transformToByteArray) shape the
// AWS SDK can return, same dual path as api/storage/read.js's streaming code.
async function readObjectBytes(config, key) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const client = getS3Client(config);
  const object = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  const body = object.Body;
  if (!body) throw new Error('empty_object_body');
  if (typeof body.transformToByteArray === 'function') return Buffer.from(await body.transformToByteArray());
  if (typeof body[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  throw new Error('unsupported_object_body');
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
  if (!caller) return fail(res, 403, 'forbidden', 'inspector_role_required');

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return fail(res, error.statusCode || 400, 'invalid_request', 'Malformed request body.');
  }

  const observationId = cleanId(body.observationId);
  if (!observationId) return fail(res, 400, 'AI_OBSERVATION_REQUIRED', 'observationId is required.');
  const correlationId = cleanId(body.correlationId) || `analyze-${observationId}-${Date.now()}`;

  // Fast pilot-scope gate: fail before touching storage or the provider at
  // all for any organization other than Al-Qunfudhah. The provider's own
  // activation guard re-checks this independently below (defense in depth).
  const organizationAllowed = caller.organizationId === ALQUNFUDHAH_ORGANIZATION_ID;
  if (!organizationAllowed) {
    return fail(res, 403, 'AI_APPLICATION_ORGANIZATION_NOT_ENABLED', 'AI vision analysis is not yet enabled for this organization.');
  }

  let observationSnap;
  try {
    observationSnap = await db.collection('observations').doc(observationId).get();
  } catch (error) {
    return fail(res, 500, 'AI_OBSERVATION_LOOKUP_FAILED', 'Could not read the observation record.');
  }
  if (!observationSnap.exists) return fail(res, 404, 'AI_OBSERVATION_NOT_FOUND', 'Observation was not found.');
  const observation = observationSnap.data() || {};

  // The organization used for every downstream check is the SERVER record on
  // the observation itself — never a client-supplied value.
  if (observation.organizationId !== caller.organizationId) {
    return fail(res, 403, 'forbidden', 'cross_organization_denied');
  }
  // Only the inspector who created the report may trigger its analysis.
  if (observation.createdByUid !== caller.uid) {
    return fail(res, 403, 'forbidden', 'not_report_owner');
  }

  const imageReference = typeof observation.imagePath === 'string' ? observation.imagePath.trim() : '';
  if (!imageReference) return fail(res, 400, 'AI_PRIVATE_IMAGE_REQUIRED', 'Observation has no evidence image to analyze.');

  const storageDecision = evaluateAIStorageInput({ organizationId: caller.organizationId, observationId, imageReference });
  if (!storageDecision.allowed) return fail(res, 403, storageDecision.code, storageDecision.reason);

  const contentType = extensionContentType(imageReference);
  if (!contentType) return fail(res, 415, 'AI_IMAGE_MIME_DENIED', 'Unsupported image type.');

  const config = b2Configuration();
  if (!config) return fail(res, 503, 'AI_STORAGE_NOT_CONFIGURED', 'Storage is not configured.');

  let controlledImagePayload;
  try {
    controlledImagePayload = await readObjectBytes(config, imageReference);
  } catch (error) {
    console.error('ai analyze: image read failed', safeStorageFailure(error));
    return fail(res, 502, 'AI_STORAGE_READ_FAILED', 'Could not read the evidence image.');
  }

  // Sprint 6.11 Phase 2: which provider is active is decided in exactly one
  // place (SMART_HSR_AI_PROVIDER, read by active-vision-provider-selector.js)
  // -- never client input, never hardcoded here. Gemini remains the default
  // when the variable is unset. An unsupported value fails closed with an
  // honest denial, same as every other AI gateway error path in this file.
  const providerSelection = createActiveVisionProviderRegistration({
    mode: 'application',
    applicationContext: { organizationAllowed, authenticatedRequest: true },
    timeoutMs: PROVIDER_TIMEOUT_MS,
  });
  if (!providerSelection.allowed) {
    return fail(res, 503, providerSelection.code, providerSelection.reason);
  }

  const router = createProviderRouter({
    selectedProvider: providerSelection.providerId,
    providers: { [providerSelection.providerId]: providerSelection.providerRegistration },
    timeoutMs: PROVIDER_TIMEOUT_MS,
  });

  const routed = await router.analyzeObservationImage(
    {
      organizationId: caller.organizationId,
      observationId,
      actorId: caller.uid,
      actorRole: 'inspector',
      correlationId,
      imageContentType: contentType,
      controlledImagePayload,
      existingDescription: typeof observation.details === 'string' ? observation.details : '',
    },
    { organizationId: caller.organizationId, actorId: caller.uid }
  );

  const analysis = routed.result;
  if (!analysis || analysis.ok !== true) {
    return fail(res, 200, analysis?.errorCode || 'AI_PROVIDER_ERROR', analysis?.reason || 'AI analysis was not available.');
  }

  // Issue classification + priority suggestion + explanation, built from the
  // already-validated, already-tested municipal decision-support layer.
  const intelligenceResult = createMunicipalIntelligence({ analysis, organizationId: caller.organizationId, observationId });
  if (!intelligenceResult.ok) {
    return fail(res, 200, intelligenceResult.errorCode, intelligenceResult.reason);
  }

  // Persist for manager review (Sprint 6.9). Best-effort: a persistence
  // failure does not invalidate an already-valid advisory result, so the
  // inspector still sees it — but the response says so honestly via
  // `persisted`, rather than silently pretending the manager will see it.
  let persisted = false;
  try {
    await db.collection('observations').doc(observationId).update({
      aiAnalysis: buildPersistedAiAnalysis(analysis, intelligenceResult.intelligence),
    });
    persisted = true;
  } catch (error) {
    console.error('ai analyze: aiAnalysis persistence failed', { name: (error && error.name) || 'unknown_error' });
  }

  return sendJson(res, 200, {
    ok: true,
    advisoryOnly: true,
    requiresExplicitHumanAction: true,
    persisted,
    inspectorOptions: routed.inspectorOptions,
    automation: routed.automation,
    analysis,
    intelligence: intelligenceResult.intelligence,
  });
}

module.exports = handler;
module.exports._test = {
  ALQUNFUDHAH_ORGANIZATION_ID,
  cleanId,
  extensionContentType,
  resolveInspectorContext,
  readJsonBody,
  readObjectBytes,
  buildPersistedAiAnalysis,
  handler,
};
