'use strict';

const { evaluateAssignmentOwnership } = require('./assignment-ownership-policy');

const OBSERVATION_STATUSES = Object.freeze([
  'PENDING',
  'IN_PROGRESS',
  'PENDING_REVIEW',
  'COMPLETED',
]);

const TRANSITION_MATRIX = Object.freeze({
  PENDING: Object.freeze({
    IN_PROGRESS: Object.freeze({
      roles: Object.freeze(['contractor', 'manager', 'supervisor']),
      actionByRole: Object.freeze({ contractor: 'start', manager: 'assign', supervisor: 'assign' }),
      assignmentOwnershipRequired: true,
      organizationOwnershipRequired: true,
    }),
  }),
  IN_PROGRESS: Object.freeze({
    PENDING_REVIEW: Object.freeze({
      roles: Object.freeze(['contractor']),
      actionByRole: Object.freeze({ contractor: 'submit_evidence' }),
      assignmentOwnershipRequired: true,
      organizationOwnershipRequired: true,
    }),
  }),
  PENDING_REVIEW: Object.freeze({
    IN_PROGRESS: Object.freeze({
      roles: Object.freeze(['manager', 'supervisor']),
      actionByRole: Object.freeze({ manager: 'return', supervisor: 'return' }),
      assignmentOwnershipRequired: false,
      organizationOwnershipRequired: true,
    }),
    COMPLETED: Object.freeze({
      roles: Object.freeze(['manager']),
      actionByRole: Object.freeze({ manager: 'close' }),
      assignmentOwnershipRequired: false,
      organizationOwnershipRequired: true,
    }),
  }),
  COMPLETED: Object.freeze({}),
});

function decision(allowed, code, reason) {
  return Object.freeze({ allowed, reason, code });
}

function evaluateTransition({ actor, observation, assignment, toStatus } = {}) {
  const fromStatus = observation && observation.status;
  if (!OBSERVATION_STATUSES.includes(fromStatus) || !OBSERVATION_STATUSES.includes(toStatus)) {
    return decision(false, 'UNSUPPORTED_STATUS', 'The current or requested observation status is not supported.');
  }

  if (fromStatus === toStatus) {
    return decision(false, 'STATUS_UNCHANGED', 'A workflow transition must change the observation status.');
  }

  const contract = TRANSITION_MATRIX[fromStatus][toStatus];
  if (!contract) {
    return decision(false, 'INVALID_TRANSITION', `The transition ${fromStatus} -> ${toStatus} is not legal.`);
  }

  if (!actor || !contract.roles.includes(actor.role)) {
    return decision(false, 'ROLE_TRANSITION_DENIED', 'The authenticated role may not request this transition.');
  }

  const action = contract.actionByRole[actor.role];
  const ownership = evaluateAssignmentOwnership({ actor, observation, assignment, action });
  if (!ownership.allowed) return ownership;

  return decision(true, 'TRANSITION_ALLOWED', `The ${actor.role} role may request ${fromStatus} -> ${toStatus}.`);
}

function describeTransition(fromStatus, toStatus) {
  return TRANSITION_MATRIX[fromStatus] && TRANSITION_MATRIX[fromStatus][toStatus]
    ? TRANSITION_MATRIX[fromStatus][toStatus]
    : null;
}

module.exports = Object.freeze({
  OBSERVATION_STATUSES,
  TRANSITION_MATRIX,
  describeTransition,
  evaluateTransition,
});
