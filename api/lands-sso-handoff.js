'use strict';
// ============================================================================
// POST /api/lands-sso-handoff — one-time server-side SSO handoff registration
// for a Lands-only employee who just authenticated once at /login.html.
//
// Auth: Authorization: Bearer <Firebase ID token> — the employee's OWN
// token, verified exactly like every other Admin API endpoint (revoke-
// checked via verifyRequestToken). This is deliberately self-service: the
// caller only ever acts on their OWN uid, never another user's, so there is
// no manager-authorization decision to make here — only "is this
// authenticated identity currently an eligible, active Lands-only employee
// of a real organization".
//
// The employee's own token is forwarded as-is to Lands' own trusted
// /api/lands-sso-register endpoint (api/_lib/landsBridge.js), which performs
// its own independent, authoritative check against Lands' real membership
// record — the eligibility check in this file is a fast local pre-check
// only, never the actual authority for whether the handoff is issued.
//
// SECURITY: the handoff code is never logged, never stored here, never
// placed in a URL by this endpoint — it is returned once in this response
// body and nothing else. No client-supplied uid, municipality, or role is
// ever trusted; every value used comes from the verified token and the
// caller's OWN Firestore record.
// ============================================================================
const { verifyRequestToken } = require('./_lib/authz');
const { getDb } = require('./_lib/firebaseAdmin');
const { callLandsSsoRegister, bridgeConfigured } = require('./_lib/landsBridge');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function extractBearerToken(req) {
  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return m ? m[1] : null;
}

const ALLOWED_LANDS_ROLES = ['lands_employee', 'lands_department_manager'];

function isSsoEligible(data) {
  if (!data) return false;
  const organizationId = typeof data.organizationId === 'string' ? data.organizationId.trim() : '';
  const landsAccess = data.landsAccess;
  return Boolean(
    data.active !== false &&
    organizationId &&
    landsAccess && landsAccess.enabled === true &&
    landsAccess.syncStatus === 'synced' &&
    ALLOWED_LANDS_ROLES.includes(landsAccess.role)
  );
}

async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  let decoded;
  try {
    decoded = await verifyRequestToken(req);
  } catch (e) {
    return sendJson(res, e.statusCode || 401, { error: 'unauthenticated' });
  }
  const rawToken = extractBearerToken(req);

  if (!bridgeConfigured()) {
    return sendJson(res, 503, { error: 'lands_sso_not_configured' });
  }

  const db = getDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  const data = userSnap.exists ? (userSnap.data() || {}) : {};
  if (!isSsoEligible(data)) {
    return sendJson(res, 403, { error: 'not_lands_eligible' });
  }
  const organizationId = data.organizationId.trim();

  const result = await callLandsSsoRegister({ idToken: rawToken, municipalityId: organizationId });
  if (!result.ok) {
    return sendJson(res, 502, { error: 'lands_sso_register_failed', reason: result.reason });
  }

  return sendJson(res, 200, { code: result.code, expiresAt: result.expiresAt });
}

module.exports = handler;
module.exports._test = { isSsoEligible };
