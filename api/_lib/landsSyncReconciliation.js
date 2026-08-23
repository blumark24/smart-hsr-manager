'use strict';
// ============================================================================
// Resolves what api/admin/users.js should actually record as landsAccess
// syncStatus/syncError after a trusted Lands mutation attempt.
//
// WHY: Lands' entitlement.enable/change_role/disable operations are single
// state transitions, not idempotent — retrying one that already landed
// returns 409 MUTATION_EXECUTION_FAILED (see
// server/lands-mutation-executor.js in the Lands repo), even though the
// membership is now in EXACTLY the state the caller wanted. Treating that
// conflict as a plain failure leaves syncStatus stuck at
// 'pending_trusted_sync' forever, even once the real Lands record is
// correct — which is exactly what blocked the unified SSO login.
//
// This reconciles that ONE specific case, narrowly: only when Lands reports
// MUTATION_EXECUTION_FAILED do we read back the authoritative record
// (api/_lib/landsBridge.js: callLandsMembershipStatus, itself read-only) and
// compare it field-for-field against what THIS save actually requested.
// Every other failure reason (LANDS_ACCESS_DENIED, network failure, wrong
// role from a genuinely different actor's conflicting change, etc.) is left
// exactly as before — visible, unresolved, never silently accepted.
// ============================================================================
const { callLandsMembershipStatus } = require('./landsBridge');

/**
 * @param {object} params
 * @param {{ok:boolean, eventId?:string, reason?:string}} params.landsSync
 *   The result of a callLandsTrustedMutation attempt that WAS made. Only
 *   call this function when a mutation was actually attempted — when no
 *   operation was needed at all (e.g. the record is already known-synced
 *   with the same role), the caller keeps its own existing logic and never
 *   reaches this function.
 * @param {string} params.idToken - forwarded verbatim, never logged/stored.
 * @param {string} params.municipalityId
 * @param {string} params.uid - the target employee's uid.
 * @param {boolean} params.desiredEnabled - what THIS save is requesting.
 * @param {string|null} params.desiredRole - required when desiredEnabled is true.
 * @returns {Promise<{syncStatus:string, syncError:string|null, eventId:string|null, reconciled?:boolean}>}
 */
async function resolveLandsSyncOutcome({ landsSync, idToken, municipalityId, uid, desiredEnabled, desiredRole }) {
  if (landsSync.ok) {
    return { syncStatus: 'synced', syncError: null, eventId: landsSync.eventId || null };
  }
  if (landsSync.reason !== 'MUTATION_EXECUTION_FAILED') {
    // Any other failure (LANDS_ACCESS_DENIED, network unreachable, bad
    // config, a genuine validation error) is left exactly as it was before
    // this reconciliation existed — visible, not reinterpreted.
    return { syncStatus: 'pending_trusted_sync', syncError: landsSync.reason, eventId: null };
  }

  const status = await callLandsMembershipStatus({ idToken, municipalityId, targetUid: uid });
  const matchesExactly = Boolean(
    status.ok &&
    status.exists &&
    status.firebase_uid === uid &&
    status.municipality_id === municipalityId &&
    status.enabled === desiredEnabled &&
    (desiredEnabled ? status.lands_role === desiredRole : true)
  );

  if (matchesExactly) {
    return { syncStatus: 'synced', syncError: null, eventId: null, reconciled: true };
  }
  // Conflict did not resolve to the desired state (wrong org, wrong role,
  // wrong enabled state, or the record doesn't even exist) — keep the
  // original failure visible. Never overwrite Lands, never retry the write
  // here.
  return { syncStatus: 'pending_trusted_sync', syncError: landsSync.reason, eventId: null };
}

module.exports = { resolveLandsSyncOutcome };
