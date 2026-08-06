'use strict';

const { ASSIGNMENT_STATUSES, validateAssignmentContract } = require('./assignment-contract');
const { createDecision, deepFreeze } = require('../contracts/decision');

function planInitialAssignment({ observation, assignment } = {}) {
  const validation = validateAssignmentContract(assignment);
  if (!validation.allowed) return deepFreeze({ decision: validation, operations: [] });
  if (!observation || assignment.observationId !== (observation.id || observation.docId)
      || assignment.organizationId !== observation.organizationId) {
    return deepFreeze({ decision: createDecision(false, 'ASSIGNMENT_RESOURCE_MISMATCH', 'Assignment must match the observation identity and organization.'), operations: [] });
  }
  if (assignment.status !== ASSIGNMENT_STATUSES.ACTIVE || assignment.version !== 1 || observation.currentAssignmentId) {
    return deepFreeze({ decision: createDecision(false, 'INITIAL_ASSIGNMENT_INVARIANT_FAILED', 'Initial assignment must be ACTIVE version 1 with no existing current assignment.'), operations: [] });
  }
  return deepFreeze({
    decision: createDecision(true, 'INITIAL_ASSIGNMENT_PLAN_VALID', 'Create assignment and observation pointer in one atomic write.'),
    operations: [
      { type: 'create', collection: 'assignments', id: assignment.assignmentId, data: assignment },
      { type: 'update', collection: 'observations', id: assignment.observationId, data: { currentAssignmentId: assignment.assignmentId, currentAssignmentVersion: assignment.version } },
    ],
  });
}

function planAssignmentReplacement({ observation, currentAssignment, nextAssignment, endedAt } = {}) {
  const validation = validateAssignmentContract(nextAssignment);
  if (!validation.allowed) return deepFreeze({ decision: validation, operations: [] });
  const currentId = currentAssignment && currentAssignment.assignmentId;
  const valid = observation && currentAssignment
    && observation.currentAssignmentId === currentId
    && observation.currentAssignmentVersion === currentAssignment.version
    && currentAssignment.status === ASSIGNMENT_STATUSES.ACTIVE
    && nextAssignment.status === ASSIGNMENT_STATUSES.ACTIVE
    && nextAssignment.observationId === (observation.id || observation.docId)
    && nextAssignment.organizationId === observation.organizationId
    && nextAssignment.version === currentAssignment.version + 1
    && nextAssignment.assignmentId !== currentId
    && endedAt;
  if (!valid) return deepFreeze({ decision: createDecision(false, 'REPLACEMENT_INVARIANT_FAILED', 'Replacement must advance the current assignment atomically by one version.'), operations: [] });
  return deepFreeze({
    decision: createDecision(true, 'ASSIGNMENT_REPLACEMENT_PLAN_VALID', 'Replace the assignment and pointer in one transaction or batch.'),
    operations: [
      { type: 'update', collection: 'assignments', id: currentId, data: { status: 'REPLACED', replacedByAssignmentId: nextAssignment.assignmentId, endedAt, updatedAt: endedAt } },
      { type: 'create', collection: 'assignments', id: nextAssignment.assignmentId, data: nextAssignment },
      { type: 'update', collection: 'observations', id: nextAssignment.observationId, data: { currentAssignmentId: nextAssignment.assignmentId, currentAssignmentVersion: nextAssignment.version } },
    ],
  });
}

module.exports = Object.freeze({ planInitialAssignment, planAssignmentReplacement });
