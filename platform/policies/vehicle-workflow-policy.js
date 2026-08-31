'use strict';

// Smart Mobility fleet/vehicle lifecycle. Mirrors the approved design's
// vehicle status vocabulary (متاحة/محجوزة/في مهمة/عائدة/صيانة/خارج الخدمة)
// and the brief's conceptual flow:
//   available -> allocated/reserved -> handed over -> in mission
//   -> return pending -> returned -> available
// "handed over" and "in mission" collapse into IN_MISSION here: the
// mission record (mission-workflow-policy.js) already tracks the finer
// HANDED_OVER / READY / IN_PROGRESS distinction on its own side: the
// vehicle only needs to know it is committed to that mission.
//
// IMPORTANT — conflict prevention: evaluateVehicleTransition and the
// mirrored firestore.rules function both refuse to reserve a vehicle
// that is not AVAILABLE. That refusal is real, but on its own it only
// protects a single write. The caller allocating a vehicle to a mission
// MUST perform the mission update and the vehicle update inside one
// Firestore runTransaction() (read the vehicle, verify AVAILABLE, write
// both docs) so two concurrent allocation attempts cannot both succeed.
// This module and firestore.rules enforce the per-document legality;
// the transaction is what makes two racing writers mutually exclusive.

const VEHICLE_STATUSES = Object.freeze([
  'AVAILABLE',
  'RESERVED',
  'IN_MISSION',
  'RETURN_PENDING',
  'MAINTENANCE',
  'OUT_OF_SERVICE',
]);

function decision(allowed, code, reason) {
  return Object.freeze({ allowed, code, reason });
}

const TRANSITION_MATRIX = Object.freeze({
  AVAILABLE: Object.freeze({
    RESERVED: Object.freeze({ roles: Object.freeze(['mobility_head']), action: 'allocate', requiresFields: Object.freeze(['assignedEmployeeUid', 'currentMissionId']) }),
    MAINTENANCE: Object.freeze({ roles: Object.freeze(['mobility_head']), action: 'set_maintenance' }),
    OUT_OF_SERVICE: Object.freeze({ roles: Object.freeze(['mobility_head']), action: 'set_out_of_service' }),
  }),
  RESERVED: Object.freeze({
    IN_MISSION: Object.freeze({ roles: Object.freeze(['mobility_head']), action: 'handover' }),
  }),
  IN_MISSION: Object.freeze({
    RETURN_PENDING: Object.freeze({ roles: Object.freeze(['employee']), action: 'return_vehicle', ownership: 'employee_is_assigned' }),
  }),
  RETURN_PENDING: Object.freeze({
    AVAILABLE: Object.freeze({ roles: Object.freeze(['mobility_head']), action: 'confirm_return', clearsFields: Object.freeze(['assignedEmployeeUid', 'currentMissionId']) }),
  }),
  MAINTENANCE: Object.freeze({
    AVAILABLE: Object.freeze({ roles: Object.freeze(['mobility_head']), action: 'return_to_service' }),
  }),
  OUT_OF_SERVICE: Object.freeze({
    AVAILABLE: Object.freeze({ roles: Object.freeze(['mobility_head']), action: 'return_to_service' }),
  }),
});

function checkOwnership(kind, actor, vehicle) {
  if (!kind) return decision(true, 'OWNERSHIP_NOT_REQUIRED', 'This transition has no ownership constraint.');
  if (kind === 'employee_is_assigned') {
    return actor.uid && vehicle.assignedEmployeeUid === actor.uid
      ? decision(true, 'OWNERSHIP_CONFIRMED', 'The employee is assigned to this vehicle.')
      : decision(false, 'OWNERSHIP_MISMATCH', 'Only the employee assigned to this vehicle may return it.');
  }
  return decision(false, 'OWNERSHIP_RULE_UNKNOWN', `Unknown ownership rule: ${kind}`);
}

function evaluateVehicleTransition({ actor, vehicle, toStatus, requestedFields } = {}) {
  const fromStatus = vehicle && vehicle.status;
  if (!VEHICLE_STATUSES.includes(fromStatus) || !VEHICLE_STATUSES.includes(toStatus)) {
    return decision(false, 'UNSUPPORTED_STATUS', 'The current or requested vehicle status is not supported.');
  }
  if (fromStatus === toStatus) {
    return decision(false, 'STATUS_UNCHANGED', 'A vehicle transition must change the status.');
  }
  if (!actor || !vehicle || actor.organizationId !== vehicle.organizationId) {
    return decision(false, 'ORGANIZATION_SCOPE_DENIED', 'The actor and vehicle must share the same organization.');
  }

  const contract = TRANSITION_MATRIX[fromStatus] && TRANSITION_MATRIX[fromStatus][toStatus];
  if (!contract) {
    return decision(false, 'INVALID_TRANSITION', `The transition ${fromStatus} -> ${toStatus} is not legal.`);
  }
  if (!contract.roles.includes(actor.role)) {
    return decision(false, 'ROLE_TRANSITION_DENIED', 'The authenticated role may not request this transition.');
  }

  const ownership = checkOwnership(contract.ownership, actor, vehicle);
  if (!ownership.allowed) return ownership;

  if (contract.requiresFields && contract.requiresFields.length) {
    const fields = requestedFields || {};
    const missing = contract.requiresFields.filter(field => !fields[field]);
    if (missing.length) {
      return decision(false, 'REQUIRED_FIELDS_MISSING', `Missing required fields: ${missing.join(', ')}`);
    }
  }

  return decision(true, 'TRANSITION_ALLOWED', `The ${actor.role} role may request ${fromStatus} -> ${toStatus}.`);
}

function describeVehicleTransition(fromStatus, toStatus) {
  return (TRANSITION_MATRIX[fromStatus] && TRANSITION_MATRIX[fromStatus][toStatus]) || null;
}

module.exports = Object.freeze({
  VEHICLE_STATUSES,
  TRANSITION_MATRIX,
  evaluateVehicleTransition,
  describeVehicleTransition,
});
