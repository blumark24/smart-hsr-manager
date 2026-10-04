'use strict';
const { getAuth, getDb } = require('./firebaseAdmin');

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const ERROR_STATUS = {
  INVALID_SMART_HSR_SESSION: 401,
  LANDS_ACCESS_DENIED: 403,
  AUDIT_ROLE_ACTION_DENIED: 403,
  AUDIT_ACTION_NOT_AUTHORIZED: 403,
  MUTATION_NOT_AUTHORIZED: 403,
  UNSUPPORTED_AUDIT_ACTION: 400,
  UNSUPPORTED_AUDIT_DOMAIN: 400,
  UNSUPPORTED_MUTATION_OPERATION: 400,
  UNTRUSTED_AUDIT_FIELD: 400,
  UNTRUSTED_MUTATION_FIELD: 400,
  INVALID_AUDIT_RECORD_ID: 400,
  INVALID_MUTATION_RECORD_ID: 400,
  INVALID_MUTATION_OPERATION: 400,
  INVALID_AUDIT_ACTION: 400,
  UNSAFE_AUDIT_METADATA: 400,
  PII_METADATA_DENIED: 400,
  AUDIT_METADATA_TOO_LARGE: 400,
  INVALID_RECORD_CHANGES: 400,
  AUDIT_EVENT_EXISTS: 409,
  MUTATION_EXECUTION_FAILED: 409,
  AUDIT_APPEND_FAILED: 500,
  DOCUMENT_STORAGE_WRITE_FAILED: 502,
  DOCUMENT_STORAGE_UNAVAILABLE: 410,
  LANDS_SSO_NOT_ENTITLED: 403,
  LANDS_SSO_HANDOFF_MALFORMED: 400,
  LANDS_SSO_HANDOFF_NOT_FOUND: 401,
  LANDS_SSO_HANDOFF_ALREADY_CONSUMED: 401,
  LANDS_SSO_HANDOFF_EXPIRED: 401,
  LANDS_SSO_ENTITLEMENT_REVOKED: 403,
  LANDS_SSO_ACCOUNT_NOT_FOUND: 401,
  LANDS_SSO_ACCOUNT_DISABLED: 403,
};

let modulesPromise;
function loadModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import('../../embedded-lands/server/trusted-audit.js'),
      import('../../embedded-lands/server/trusted-lands-mutations.js'),
      import('../../embedded-lands/server/lands-authorization.js'),
      import('../../embedded-lands/server/lands-mutation-executor.js'),
      import('../../embedded-lands/server/lands-membership-status.js'),
      import('../../embedded-lands/server/lands-sso.js'),
    ]).then(([audit, mutations, authorization, executor, membership, sso]) => ({
      audit, mutations, authorization, executor, membership, sso
    }));
  }
  return modulesPromise;
}

function header(req, name) {
  const key = String(name).toLowerCase();
  if (typeof req?.get === 'function') {
    const value = req.get(name);
    if (typeof value === 'string') return value;
  }
  const headers = req?.headers || {};
  const direct = headers[key] ?? headers[name] ?? headers[String(name).toUpperCase()];
  return typeof direct === 'string' ? direct : '';
}

async function buildRuntime() {
  const modules = await loadModules();
  const auth = getAuth();
  const db = getDb();

  const verifyRequest = async (request) => {
    const raw = header(request, 'authorization').replace(/^Bearer\s+/i, '').trim();
    if (!raw) throw new modules.audit.TrustedAuditError('INVALID_SMART_HSR_SESSION');
    let decoded;
    try { decoded = await auth.verifyIdToken(raw); }
    catch (_) { throw new modules.audit.TrustedAuditError('INVALID_SMART_HSR_SESSION'); }

    const municipalityId = header(request, 'x-municipality-id').trim();
    if (!SAFE_ID.test(municipalityId)) throw new modules.audit.TrustedAuditError('INVALID_SMART_HSR_SESSION');

    const snap = await db.doc(`landsMunicipalities/${municipalityId}/userAccess/${decoded.uid}`).get();
    const membership = snap.exists ? (snap.data() || {}) : null;
    const valid = Boolean(
      membership &&
      membership.municipality_id === municipalityId &&
      membership.firebase_uid === decoded.uid &&
      modules.audit.TRUSTED_AUDIT_ROLES.includes(membership.lands_role)
    );
    return Object.freeze({
      actor_uid: decoded.uid,
      municipality_id: municipalityId,
      lands_role: valid ? membership.lands_role : modules.audit.TRUSTED_AUDIT_ROLES[0],
      lands_entitled: valid,
      membership_enabled: valid && membership.enabled === true,
    });
  };

  const authorizer = modules.authorization.createLandsAuthorizer({ db });
  const commitMutation = modules.executor.createLandsMutationExecutor({ db, documentStorage: null });
  const membershipStatus = modules.membership.createLandsMembershipStatusService({ verifyRequest, db });
  const mutationServiceFor = (recordChanges) => modules.mutations.createTrustedLandsMutationService({
    verifyRequest,
    authorizeMutation: authorizer.authorizeMutation,
    commitMutationAndAudit: (context, command, event) => commitMutation(context, command, event, recordChanges),
  });

  return { modules, auth, db, verifyRequest, mutationServiceFor, membershipStatus };
}

function localRequest(idToken, municipalityId) {
  return { headers: { authorization: `Bearer ${idToken}`, 'x-municipality-id': municipalityId } };
}

function errorResult(error) {
  const code = error && (error.code || error.message);
  return { ok:false, status: ERROR_STATUS[code] || 500, reason: typeof code === 'string' ? code : 'LANDS_SERVICE_ERROR' };
}

async function embeddedMutation({ idToken, municipalityId, operation, recordId, recordChanges, safeMetadata }) {
  try {
    const runtime = await buildRuntime();
    const outcome = await runtime.mutationServiceFor(recordChanges).mutate({
      request: localRequest(idToken, municipalityId),
      command: {
        operation,
        record_id: recordId,
        ...(safeMetadata !== undefined ? { safe_metadata: safeMetadata } : {}),
      },
    });
    return { ok:true, eventId: outcome.event.event_id, result: outcome.result };
  } catch (error) { return errorResult(error); }
}

async function embeddedMembershipStatus({ idToken, municipalityId, targetUid }) {
  try {
    const runtime = await buildRuntime();
    const data = await runtime.membershipStatus.read({
      request: localRequest(idToken, municipalityId),
      targetUid,
    });
    return { ok:true, ...data };
  } catch (error) { return errorResult(error); }
}

async function embeddedSsoRegister({ idToken, municipalityId }) {
  try {
    const runtime = await buildRuntime();
    const result = await runtime.modules.sso.registerHandoff({
      db: runtime.db,
      verifyRequest: runtime.verifyRequest,
      request: localRequest(idToken, municipalityId),
    });
    return { ok:true, code:result.code, expiresAt:result.expiresAt };
  } catch (error) { return errorResult(error); }
}

async function embeddedSsoConsume({ code }) {
  try {
    const runtime = await buildRuntime();
    const result = await runtime.modules.sso.consumeHandoff({ db:runtime.db, auth:runtime.auth, code });
    return { ok:true, customToken:result.customToken, municipalityId:result.municipalityId, landsRole:result.landsRole };
  } catch (error) { return errorResult(error); }
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(payload));
}

function bearer(req) {
  const m = /^Bearer\s+(.+)$/i.exec(header(req, 'authorization').trim());
  return m ? m[1] : '';
}

async function handleEmbeddedLandsHttp(req, res, action) {
  if (action === 'health') return sendJson(res, 200, { service:'smart-hsr-lands-embedded', status:'ok' });
  if (req.method !== 'POST') return sendJson(res, 405, { error:'method_not_allowed' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  let result;
  if (action === 'mutation') {
    result = await embeddedMutation({
      idToken: bearer(req),
      municipalityId: header(req, 'x-municipality-id'),
      operation: body.operation,
      recordId: body.record_id,
      recordChanges: body.record_changes,
      safeMetadata: body.safe_metadata,
    });
    if (!result.ok) return sendJson(res, result.status, { error:result.reason });
    return sendJson(res, 200, { event_id:result.eventId, result:result.result });
  }
  if (action === 'membership') {
    result = await embeddedMembershipStatus({
      idToken: bearer(req),
      municipalityId: header(req, 'x-municipality-id'),
      targetUid: body.target_uid,
    });
    if (!result.ok) return sendJson(res, result.status, { error:result.reason });
    const { ok, ...payload } = result;
    return sendJson(res, 200, payload);
  }
  if (action === 'sso-register') {
    result = await embeddedSsoRegister({ idToken:bearer(req), municipalityId:header(req, 'x-municipality-id') });
    if (!result.ok) return sendJson(res, result.status, { error:result.reason });
    return sendJson(res, 200, { code:result.code, expires_at:result.expiresAt });
  }
  if (action === 'sso-consume') {
    result = await embeddedSsoConsume({ code:body.code });
    if (!result.ok) return sendJson(res, result.status, { error:result.reason });
    return sendJson(res, 200, {
      custom_token:result.customToken,
      municipality_id:result.municipalityId,
      lands_role:result.landsRole,
    });
  }
  return sendJson(res, 404, { error:'embedded_lands_action_not_found' });
}

module.exports = {
  embeddedMutation,
  embeddedMembershipStatus,
  embeddedSsoRegister,
  embeddedSsoConsume,
  handleEmbeddedLandsHttp,
};
