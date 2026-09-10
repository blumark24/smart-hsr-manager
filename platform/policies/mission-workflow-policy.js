'use strict';

// Smart Mobility mission lifecycle — the ONE shared state machine every
// role transitions through the same record. Canonical English status
// values are what Firestore/firestore.rules store and enforce; the
// Arabic labels shown in the UI (smart-mobility.html) map onto these.
//
// Lifecycle (matches the approved design's status set and the brief's
// conceptual flow):
//   DRAFT -> PENDING_APPROVAL -> APPROVED -> VEHICLE_ALLOCATED
//   -> HANDED_OVER -> READY -> IN_PROGRESS <-> INCIDENT_HOLD
//   -> COMPLETED -> AWAITING_RETURN -> CLOSED
//   (PENDING_APPROVAL may also resolve to REJECTED or back to DRAFT.)

const MISSION_STATUSES = Object.freeze([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'VEHICLE_ALLOCATED',
  'HANDED_OVER',
  'READY',
  'IN_PROGRESS',
  'INCIDENT_HOLD',
  'COMPLETED',
  'AWAITING_RETURN',
  'CLOSED',
]);

function decision(allowed, code, reason) {
  return Object.freeze({ allowed, code, reason });
}

// Ownership rules beyond role + status: who besides "any actor with the
// right role" must additionally match the record.
//   'department_head_is_creator' -> actor.uid === mission.createdByUid
//   'employee_is_assigned'       -> actor.uid === mission.assignedEmployeeUid
const TRANSITION_MATRIX = Object.freeze({
  DRAFT: Object.freeze({
    PENDING_APPROVAL: Object.freeze({
      roles: Object.freeze(['department_head']),
      action: 'submit_for_approval',
      ownership: 'department_head_is_creator',
    }),
  }),
  PENDING_APPROVAL: Object.freeze({
    APPROVED: Object.freeze({ roles: Object.freeze(['administrative_affairs']), action: 'approve' }),
    REJECTED: Object.freeze({ roles: Object.freeze(['administrative_affairs']), action: 'reject' }),
    DRAFT: Object.freeze({ roles: Object.freeze(['administrative_affairs']), action: 'return_for_review' }),
  }),
  APPROVED: Object.freeze({
    VEHICLE_ALLOCATED: Object.freeze({
      roles: Object.freeze(['mobility_head']),
      action: 'allocate_vehicle',
      requiresFields: Object.freeze(['vehicleId', 'assignedEmployeeUid']),
    }),
  }),
  VEHICLE_ALLOCATED: Object.freeze({
    HANDED_OVER: Object.freeze({ roles: Object.freeze(['mobility_head']), action: 'handover' }),
  }),
  HANDED_OVER: Object.freeze({
    READY: Object.freeze({ roles: Object.freeze(['employee']), action: 'receive', ownership: 'employee_is_assigned' }),
  }),
  READY: Object.freeze({
    IN_PROGRESS: Object.freeze({ roles: Object.freeze(['employee']), action: 'start', ownership: 'employee_is_assigned' }),
  }),
  IN_PROGRESS: Object.freeze({
    INCIDENT_HOLD: Object.freeze({ roles: Object.freeze(['employee']), action: 'report_incident', ownership: 'employee_is_assigned' }),
    COMPLETED: Object.freeze({ roles: Object.freeze(['employee']), action: 'finish', ownership: 'employee_is_assigned' }),
  }),
  INCIDENT_HOLD: Object.freeze({
    IN_PROGRESS: Object.freeze({ roles: Object.freeze(['employee', 'mobility_head']), action: 'resume' }),
  }),
  COMPLETED: Object.freeze({
    AWAITING_RETURN: Object.freeze({ roles: Object.freeze(['employee']), action: 'return_vehicle', ownership: 'employee_is_assigned' }),
  }),
  AWAITING_RETURN: Object.freeze({
    CLOSED: Object.freeze({ roles: Object.freeze(['mobility_head']), action: 'confirm_return' }),
  }),
  REJECTED: Object.freeze({}),
  CLOSED: Object.freeze({}),
});

function checkOwnership(kind, actor, mission) {
  if (!kind) return decision(true, 'OWNERSHIP_NOT_REQUIRED', 'This transition has no ownership constraint.');
  if (kind === 'department_head_is_creator') {
    return actor.uid && mission.createdByUid === actor.uid
      ? decision(true, 'OWNERSHIP_CONFIRMED', 'The department head created this mission.')
      : decision(false, 'OWNERSHIP_MISMATCH', 'Only the department head who created this mission may submit it.');
  }
  if (kind === 'employee_is_assigned') {
    return actor.uid && mission.assignedEmployeeUid === actor.uid
      ? decision(true, 'OWNERSHIP_CONFIRMED', 'The employee is assigned to this mission.')
      : decision(false, 'OWNERSHIP_MISMATCH', 'Only the employee assigned to this mission may act on it.');
  }
  return decision(false, 'OWNERSHIP_RULE_UNKNOWN', `Unknown ownership rule: ${kind}`);
}

function evaluateMissionTransition({ actor, mission, toStatus, requestedFields } = {}) {
  const fromStatus = mission && mission.status;
  if (!MISSION_STATUSES.includes(fromStatus) || !MISSION_STATUSES.includes(toStatus)) {
    return decision(false, 'UNSUPPORTED_STATUS', 'The current or requested mission status is not supported.');
  }
  if (fromStatus === toStatus) {
    return decision(false, 'STATUS_UNCHANGED', 'A mission transition must change the status.');
  }
  if (!actor || !mission || actor.organizationId !== mission.organizationId) {
    return decision(false, 'ORGANIZATION_SCOPE_DENIED', 'The actor and mission must share the same organization.');
  }

  const contract = TRANSITION_MATRIX[fromStatus] && TRANSITION_MATRIX[fromStatus][toStatus];
  if (!contract) {
    return decision(false, 'INVALID_TRANSITION', `The transition ${fromStatus} -> ${toStatus} is not legal.`);
  }
  if (!contract.roles.includes(actor.role)) {
    return decision(false, 'ROLE_TRANSITION_DENIED', 'The authenticated role may not request this transition.');
  }

  const ownership = checkOwnership(contract.ownership, actor, mission);
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

function describeMissionTransition(fromStatus, toStatus) {
  return (TRANSITION_MATRIX[fromStatus] && TRANSITION_MATRIX[fromStatus][toStatus]) || null;
}

module.exports = Object.freeze({
  MISSION_STATUSES,
  TRANSITION_MATRIX,
  evaluateMissionTransition,
  describeMissionTransition,
});
