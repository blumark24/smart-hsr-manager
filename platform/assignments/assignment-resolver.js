'use strict';

const { ASSIGNMENT_STATUSES } = require('./assignment-contract');
const { createDecision } = require('../contracts/decision');

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function assignmentIdOf(assignment) {
  return normalizeId(assignment && (assignment.assignmentId || assignment.id));
}

function observationIdOf(observation) {
  return normalizeId(observation && (observation.id || observation.docId));
}

function isActiveCurrent(assignment) {
  if (assignment.status !== undefined) {
    return assignment.status === ASSIGNMENT_STATUSES.ACTIVE
      && !assignment.replacedByAssignmentId
      && !assignment.endedAt;
  }
  return assignment.active === true && assignment.current === true;
}

function resolveAssignment({ actor, observation, assignment } = {}) {
  if (!assignment || typeof assignment !== 'object') {
    return createDecision(false, 'ASSIGNMENT_REQUIRED', 'A current assignment record is required for every contractor action.');
  }
  if (!actor || typeof actor !== 'object') {
    return createDecision(false, 'AUTHENTICATED_CONTEXT_REQUIRED', 'An authenticated actor context is required.');
  }
  if (!observation || typeof observation !== 'object') {
    return createDecision(false, 'OBSERVATION_REQUIRED', 'An observation is required.');
  }

  if (normalizeId(assignment.organizationId) !== normalizeId(observation.organizationId)
      || normalizeId(actor.organizationId) !== normalizeId(observation.organizationId)) {
    return createDecision(false, 'ASSIGNMENT_ORGANIZATION_MISMATCH', 'Actor, assignment, and observation organizations must match.');
  }
  if (normalizeId(assignment.contractorId) !== normalizeId(actor.uid)) {
    return createDecision(false, 'ASSIGNMENT_CONTRACTOR_MISMATCH', 'The assignment belongs to another contractor.');
  }

  const observationId = observationIdOf(observation);
  if (!observationId || normalizeId(assignment.observationId) !== observationId) {
    return createDecision(false, 'ASSIGNMENT_OBSERVATION_MISMATCH', 'The assignment does not reference the current observation.');
  }
  if (!isActiveCurrent(assignment)) {
    return createDecision(false, 'ASSIGNMENT_NOT_CURRENT', 'The assignment is inactive, ended, or replaced.');
  }

  const expectedAssignmentId = normalizeId(observation.currentAssignmentId || observation.assignmentId);
  if (expectedAssignmentId && assignmentIdOf(assignment) !== expectedAssignmentId) {
    return createDecision(false, 'ASSIGNMENT_REPLACED', 'The observation references a different current assignment.');
  }

  const observationVersion = observation.currentAssignmentVersion !== undefined
    ? observation.currentAssignmentVersion : observation.assignmentVersion;
  const observationHasVersion = observationVersion !== undefined && observationVersion !== null;
  const assignmentHasVersion = assignment.version !== undefined && assignment.version !== null;
  if ((observationHasVersion || assignmentHasVersion)
      && (!observationHasVersion || !assignmentHasVersion || observationVersion !== assignment.version)) {
    return createDecision(false, 'ASSIGNMENT_VERSION_MISMATCH', 'The assignment version is stale or does not match the observation.');
  }

  return createDecision(true, 'CURRENT_ASSIGNMENT_CONFIRMED', 'The current assignment belongs to this actor and observation.', {
    assignmentId: assignmentIdOf(assignment) || null,
    version: assignmentHasVersion ? assignment.version : null,
  });
}

module.exports = Object.freeze({ assignmentIdOf, isActiveCurrent, resolveAssignment });
