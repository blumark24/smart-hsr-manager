'use strict';
// ============================================================================
// SMART HSR GEO CORE — write safety guard.
//
// "A map is NOT an authorization bypass" (Phase 08 brief). Selecting a
// building/place/observation on a map must never itself grant permission to
// mutate it. This module is the single allowlist of trusted mutation
// endpoints a map-triggered action may ever call — anything not on this
// list is refused before any network call is attempted, and there is
// deliberately no generic "write this map object" path.
//
// Phase 08 itself introduces NO new mutation endpoint: the Geo Entity
// Card's primary action is navigation ("عرض التفاصيل") to an existing
// product detail screen, never an inline map-triggered write. This guard
// exists so that stays true even as future layers are added — a future
// map-triggered action (e.g. "suspend this mission from the map") must be
// registered here explicitly, pointing at an EXISTING trusted product API,
// before any adapter is allowed to call it.
// ============================================================================

const { createDecision } = require('../contracts/decision');

// Every entry must be an existing, already-authorized trusted endpoint —
// never a raw Firestore collection path. Empty today by design (see above).
const ALLOWED_MAP_TRIGGERED_ACTIONS = Object.freeze({
  // Example shape for a future entry:
  // suspend_mobility_mission: { endpoint: '/api/admin/mobility', method: 'POST' },
});

function evaluateMapTriggeredWrite({ action, endpoint, method } = {}) {
  const registered = ALLOWED_MAP_TRIGGERED_ACTIONS[action];
  if (!registered) {
    return createDecision(false, 'GEO_WRITE_ACTION_NOT_REGISTERED', 'This map-triggered action is not a registered trusted mutation.', { action });
  }
  if (registered.endpoint !== endpoint || registered.method !== method) {
    return createDecision(false, 'GEO_WRITE_ENDPOINT_MISMATCH', 'The requested endpoint/method does not match the registered trusted mutation for this action.', { action });
  }
  return createDecision(true, 'GEO_WRITE_ACTION_ALLOWED', 'This map-triggered action is a registered trusted mutation.', { action });
}

// Defensive helper a map adapter can call before ever attempting a Firestore
// write directly — always denies, by design, until/unless a future phase
// deliberately introduces a real exception here (it never should: the
// pattern is "map calls the same trusted API a non-map screen would call").
function assertNoDirectFirestoreWrite() {
  return createDecision(false, 'GEO_DIRECT_FIRESTORE_WRITE_FORBIDDEN', 'Map surfaces must never write to Firestore directly — use an existing trusted product API.');
}

module.exports = Object.freeze({
  ALLOWED_MAP_TRIGGERED_ACTIONS,
  evaluateMapTriggeredWrite,
  assertNoDirectFirestoreWrite,
});
