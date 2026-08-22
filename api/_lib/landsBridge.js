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
// ============================================================================

function bridgeBaseUrl() {
  const value = process.env.LANDS_TRUSTED_API_URL;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().replace(/\/$/, '') : '';
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

module.exports = { callLandsTrustedMutation, bridgeConfigured };
