'use strict';

// Smart Mobility incident lifecycle, matching the approved design's status
// vocabulary exactly: جديد -> تم الاستلام -> تحت المعالجة -> تم الحل.
// An employee creates an incident (tied to their own active mission and
// vehicle); mobility_head processes it. Incidents are never deleted.

const INCIDENT_STATUSES = Object.freeze(['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED']);

function decision(allowed, code, reason) {
  return Object.freeze({ allowed, code, reason });
}

const TRANSITION_MATRIX = Object.freeze({
  NEW: Object.freeze({
    ACKNOWLEDGED: Object.freeze({ roles: Object.freeze(['mobility_head']), action: 'acknowledge' }),
  }),
  ACKNOWLEDGED: Object.freeze({
    IN_PROGRESS: Object.freeze({ roles: Object.freeze(['mobility_head']), action: 'start_processing' }),
  }),
  IN_PROGRESS: Object.freeze({
    RESOLVED: Object.freeze({ roles: Object.freeze(['mobility_head']), action: 'resolve' }),
  }),
  RESOLVED: Object.freeze({}),
});

function evaluateIncidentTransition({ actor, incident, toStatus } = {}) {
  const fromStatus = incident && incident.status;
  if (!INCIDENT_STATUSES.includes(fromStatus) || !INCIDENT_STATUSES.includes(toStatus)) {
    return decision(false, 'UNSUPPORTED_STATUS', 'The current or requested incident status is not supported.');
  }
  if (fromStatus === toStatus) {
    return decision(false, 'STATUS_UNCHANGED', 'An incident transition must change the status.');
  }
  if (!actor || !incident || actor.organizationId !== incident.organizationId) {
    return decision(false, 'ORGANIZATION_SCOPE_DENIED', 'The actor and incident must share the same organization.');
  }
  const contract = TRANSITION_MATRIX[fromStatus] && TRANSITION_MATRIX[fromStatus][toStatus];
  if (!contract) {
    return decision(false, 'INVALID_TRANSITION', `The transition ${fromStatus} -> ${toStatus} is not legal.`);
  }
  if (!contract.roles.includes(actor.role)) {
    return decision(false, 'ROLE_TRANSITION_DENIED', 'The authenticated role may not request this transition.');
  }
  return decision(true, 'TRANSITION_ALLOWED', `The ${actor.role} role may request ${fromStatus} -> ${toStatus}.`);
}

// Only the employee assigned to the referenced mission may create an
// incident against it, and only while the mission is IN_PROGRESS (matches
// mission-workflow-policy.js's report_incident transition).
function canCreateIncident({ actor, mission } = {}) {
  if (!actor || actor.role !== 'employee') {
    return decision(false, 'ROLE_CREATE_DENIED', 'Only an employee may create an incident.');
  }
  if (!mission || mission.organizationId !== actor.organizationId) {
    return decision(false, 'ORGANIZATION_SCOPE_DENIED', 'The mission must be in the actor\'s own organization.');
  }
  if (mission.assignedEmployeeUid !== actor.uid) {
    return decision(false, 'OWNERSHIP_MISMATCH', 'The incident must be reported by the employee assigned to the mission.');
  }
  if (mission.status !== 'IN_PROGRESS') {
    return decision(false, 'MISSION_NOT_IN_PROGRESS', 'An incident may only be reported while the mission is in progress.');
  }
  return decision(true, 'INCIDENT_CREATE_ALLOWED', 'The employee may report an incident on their own in-progress mission.');
}

module.exports = Object.freeze({
  INCIDENT_STATUSES,
  TRANSITION_MATRIX,
  evaluateIncidentTransition,
  canCreateIncident,
});
