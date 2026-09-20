'use strict';

// SMART HSR — Internal operational vehicle authorization.
//
// This record is NOT represented as an external/legal government vehicle
// authorization. It is an internal municipal operating control bound 1:1 to
// a mission, employee and vehicle.
//
// Lifecycle:
// PENDING_AUTHORIZATION -> AUTHORIZED -> ACTIVE -> EXPIRED
// PENDING_AUTHORIZATION -> REJECTED
// AUTHORIZED -> REVOKED
//
// Role separation:
// - administrative_affairs: authorize / reject / revoke before handover.
// - mobility_head: activate on physical handover, expire on confirmed return.
// Department heads request the mission/employee but never approve this record.

const VEHICLE_AUTHORIZATION_STATUSES = Object.freeze([
  'PENDING_AUTHORIZATION',
  'AUTHORIZED',
  'ACTIVE',
  'EXPIRED',
  'REJECTED',
  'REVOKED',
]);

function decision(allowed, code, reason) {
  return Object.freeze({ allowed, code, reason });
}

const TRANSITION_MATRIX = Object.freeze({
  PENDING_AUTHORIZATION: Object.freeze({
    AUTHORIZED: Object.freeze({ roles: Object.freeze(['administrative_affairs']), action: 'authorize' }),
    REJECTED: Object.freeze({ roles: Object.freeze(['administrative_affairs']), action: 'reject' }),
  }),
  AUTHORIZED: Object.freeze({
    ACTIVE: Object.freeze({ roles: Object.freeze(['mobility_head']), action: 'activate_on_handover' }),
    REVOKED: Object.freeze({ roles: Object.freeze(['administrative_affairs']), action: 'revoke' }),
  }),
  ACTIVE: Object.freeze({
    EXPIRED: Object.freeze({ roles: Object.freeze(['mobility_head']), action: 'expire_on_return' }),
  }),
  EXPIRED: Object.freeze({}),
  REJECTED: Object.freeze({}),
  REVOKED: Object.freeze({}),
});

function evaluateVehicleAuthorizationTransition({ actor, authorization, toStatus } = {}) {
  if (!actor || !authorization || actor.organizationId !== authorization.organizationId) {
    return decision(false, 'ORGANIZATION_SCOPE_DENIED', 'Actor and authorization must share the same organization.');
  }
  const fromStatus = authorization.status;
  if (!VEHICLE_AUTHORIZATION_STATUSES.includes(fromStatus)
      || !VEHICLE_AUTHORIZATION_STATUSES.includes(toStatus)) {
    return decision(false, 'UNSUPPORTED_STATUS', 'Unsupported vehicle authorization status.');
  }
  if (fromStatus === toStatus) return decision(false, 'STATUS_UNCHANGED', 'Authorization status must change.');
  const rule = TRANSITION_MATRIX[fromStatus] && TRANSITION_MATRIX[fromStatus][toStatus];
  if (!rule) return decision(false, 'INVALID_TRANSITION', `Illegal authorization transition ${fromStatus} -> ${toStatus}.`);
  if (!rule.roles.includes(actor.role)) return decision(false, 'ROLE_TRANSITION_DENIED', 'Role cannot perform this authorization transition.');
  return decision(true, 'TRANSITION_ALLOWED', 'Vehicle authorization transition is allowed.');
}

module.exports = Object.freeze({
  VEHICLE_AUTHORIZATION_STATUSES,
  TRANSITION_MATRIX,
  evaluateVehicleAuthorizationTransition,
});
