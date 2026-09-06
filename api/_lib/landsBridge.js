'use strict';
// ============================================================================
// Server-to-server bridge from the Smart HSR Manager backend to Smart HSR
// Lands' own trusted mutation endpoint (POST /api/lands-mutations on the
// Lands app). This module never runs in the browser, so it is never subject
// to CORS, and it never writes to Lands' protected Firestore collections
// directly — every entitlement lifecycle change other than the one-time
// institution-manager bootstrap (see lands-bootstrap.js) goes through
// Lands' own commitMutationAndAudit transaction via this HTTP call, which is
// the only thing that can atomically write the real membership document AND
// its Trusted Audit event together.
//
// The manager's OWN already-verified Firebase ID token (the same one this
// Admin API just verified for the current request) is forwarded as-is — no
// service-account JSON, refresh token, or other secret ever leaves this
// process. Forwarding only succeeds when both apps currently share the same
// Firebase project, which today is true only on Preview
// (smart-hsr-staging-blumark24, see firebase-runtime-config.js). In
// Production, where smart-hsr-manager uses its own separate Firebase
// project, Lands' own verifyIdToken() call simply rejects the forwarded
// token with 401 — this bridge fails closed there with no special-casing.
//
// LANDS_TRUSTED_API_URL is an env var (unset by default) so this bridge is a
// safe, explicit no-op wherever it isn't configured.
//
// LANDS_TRUSTED_API_BYPASS_SECRET (optional): the Lands Preview deployment
// itself sits behind Vercel Deployment Protection, same as this app's own
// Preview. Vercel's own "Protection Bypass for Automation" secret for the
// Lands project — a pre-existing credential meant exactly for
// server-to-server automation like this, not something created for this
// bridge — is forwarded as the x-vercel-protection-bypass header so the
// request reaches Lands' actual handler instead of a 401 protection page.
// This never bypasses Lands' OWN authorization (verifyIdToken,
// canManageEntitlements, the anti-self-escalation rule, etc.) — it only gets
// past Vercel's platform-level access gate to let those real checks run.
// ============================================================================

function bridgeBaseUrl() {
  const value = process.env.LANDS_TRUSTED_API_URL;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().replace(/\/$/, '') : '';
}

function bridgeBypassSecret() {
  const value = process.env.LANDS_TRUSTED_API_BYPASS_SECRET;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function bridgeConfigured() {
  return bridgeBaseUrl().length > 0;
}

/**
 * Calls Lands' trusted mutation endpoint with a forwarded manager identity.
 * Never throws — every failure mode (not configured, unreachable, rejected)
 * comes back as { ok:false, reason }, so a caller can always fail closed
 * (leave the local declaration as "pending sync") instead of crashing the
 * surrounding admin request.
 */
async function callLandsTrustedMutation({ idToken, municipalityId, operation, recordId, recordChanges, safeMetadata }) {
  const base = bridgeBaseUrl();
  if (!base) return { ok: false, bridged: false, reason: 'lands_bridge_not_configured' };

  let response;
  try {
    response = await fetch(`${base}/api/lands-mutations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${idToken}`,
        'x-municipality-id': municipalityId,
        ...(bridgeBypassSecret() ? { 'x-vercel-protection-bypass': bridgeBypassSecret() } : {}),
      },
      body: JSON.stringify({
        operation,
        record_id: recordId,
        ...(recordChanges !== undefined ? { record_changes: recordChanges } : {}),
        ...(safeMetadata !== undefined ? { safe_metadata: safeMetadata } : {}),
      }),
    });
  } catch (_) {
    return { ok: false, bridged: true, reason: 'lands_bridge_unreachable' };
  }

  let data = {};
  try { data = await response.json(); } catch (_) { /* ignore non-JSON body */ }

  if (!response.ok) {
    return { ok: false, bridged: true, status: response.status, reason: typeof data.error === 'string' ? data.error : 'lands_bridge_request_failed' };
  }
  return { ok: true, bridged: true, eventId: data.event_id, result: data.result };
}

/**
 * Registers a one-time SSO handoff on Lands' own /api/lands-sso-register
 * endpoint, forwarding the EMPLOYEE'S OWN already-verified ID token (never a
 * manager's, never a service credential) — the same forwarding pattern as
 * callLandsTrustedMutation above. Lands performs its own independent,
 * authoritative eligibility check against its real membership record; this
 * call never asserts eligibility itself, only carries the identity across.
 * Never throws — every failure mode comes back as { ok:false, reason }.
 */
async function callLandsSsoRegister({ idToken, municipalityId }) {
  const base = bridgeBaseUrl();
  if (!base) return { ok: false, reason: 'lands_bridge_not_configured' };

  let response;
  try {
    response = await fetch(`${base}/api/lands-sso-register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${idToken}`,
        'x-municipality-id': municipalityId,
        ...(bridgeBypassSecret() ? { 'x-vercel-protection-bypass': bridgeBypassSecret() } : {}),
      },
      body: JSON.stringify({}),
    });
  } catch (_) {
    return { ok: false, reason: 'lands_bridge_unreachable' };
  }

  let data = {};
  try { data = await response.json(); } catch (_) { /* ignore non-JSON body */ }

  if (!response.ok) {
    return { ok: false, status: response.status, reason: typeof data.error === 'string' ? data.error : 'lands_sso_register_failed' };
  }
  // Never logged, never persisted here — passed straight through to the caller's response body.
  return { ok: true, code: data.code, expiresAt: data.expires_at };
}

/**
 * Read-only lookup of the authoritative Lands membership record for one
 * target uid, scoped to the caller's own verified municipality (see Lands'
 * server/lands-membership-status.js — the caller's own manager identity,
 * never anything the client supplies, decides which municipality is read).
 * Used ONLY by api/_lib/landsSyncReconciliation.js to distinguish "the
 * record already matches what I asked for" from a real conflict after
 * MUTATION_EXECUTION_FAILED — never a general query surface, never a write.
 * Never throws — every failure mode comes back as { ok:false, reason }.
 */
async function callLandsMembershipStatus({ idToken, municipalityId, targetUid }) {
  const base = bridgeBaseUrl();
  if (!base) return { ok: false, reason: 'lands_bridge_not_configured' };

  let response;
  try {
    response = await fetch(`${base}/api/lands-membership-status`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${idToken}`,
        'x-municipality-id': municipalityId,
        ...(bridgeBypassSecret() ? { 'x-vercel-protection-bypass': bridgeBypassSecret() } : {}),
      },
      body: JSON.stringify({ target_uid: targetUid }),
    });
  } catch (_) {
    return { ok: false, reason: 'lands_bridge_unreachable' };
  }

  let data = {};
  try { data = await response.json(); } catch (_) { /* ignore non-JSON body */ }

  if (!response.ok) {
    return { ok: false, status: response.status, reason: typeof data.error === 'string' ? data.error : 'lands_membership_status_failed' };
  }
  return {
    ok: true,
    exists: data.exists === true,
    firebase_uid: typeof data.firebase_uid === 'string' ? data.firebase_uid : null,
    municipality_id: typeof data.municipality_id === 'string' ? data.municipality_id : null,
    lands_role: typeof data.lands_role === 'string' ? data.lands_role : null,
    enabled: data.enabled === true,
  };
}

module.exports = { callLandsTrustedMutation, callLandsSsoRegister, callLandsMembershipStatus, bridgeConfigured };
