'use strict';

const { createDecision, deepFreeze } = require('../contracts/decision');

const ASSIGNMENT_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  REPLACED: 'REPLACED',
});

const ASSIGNMENT_STATUS_VALUES = Object.freeze(Object.values(ASSIGNMENT_STATUSES));

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateAssignmentContract(value) {
  if (!value || typeof value !== 'object') {
    return createDecision(false, 'ASSIGNMENT_REQUIRED', 'An assignment contract is required.');
  }

  for (const field of ['assignmentId', 'observationId', 'organizationId', 'contractorId', 'assignedBy', 'createdAt', 'updatedAt']) {
    if (!normalizeId(value[field])) {
      return createDecision(false, 'ASSIGNMENT_FIELD_REQUIRED', `Assignment field ${field} is required.`, { field });
    }
  }

  if (!ASSIGNMENT_STATUS_VALUES.includes(value.status)) {
    return createDecision(false, 'ASSIGNMENT_STATUS_UNSUPPORTED', 'The assignment status is not supported.', { status: value.status });
  }

  if (!Number.isInteger(value.version) || value.version < 1) {
    return createDecision(false, 'ASSIGNMENT_VERSION_INVALID', 'Assignment version must be a positive integer.');
  }

  if (!value.assignedAt) {
    return createDecision(false, 'ASSIGNED_AT_REQUIRED', 'Assignment assignedAt is required.');
  }

  if (value.status === ASSIGNMENT_STATUSES.ACTIVE && (value.replacedByAssignmentId || value.endedAt)) {
    return createDecision(false, 'ACTIVE_ASSIGNMENT_TERMINATION_CONFLICT', 'An active assignment cannot be replaced or ended.');
  }

  if (value.status === ASSIGNMENT_STATUSES.REPLACED && !normalizeId(value.replacedByAssignmentId)) {
    return createDecision(false, 'REPLACEMENT_ID_REQUIRED', 'A replaced assignment must identify its replacement.');
  }

  if (value.status !== ASSIGNMENT_STATUSES.ACTIVE && !value.endedAt) {
    return createDecision(false, 'ENDED_AT_REQUIRED', 'An inactive or replaced assignment must include endedAt.');
  }

  return createDecision(true, 'ASSIGNMENT_CONTRACT_VALID', 'The assignment contract is structurally valid.');
}

function createAssignmentContract(value) {
  const validation = validateAssignmentContract(value);
  if (!validation.allowed) return { decision: validation, assignment: null };

  const assignment = {
    assignmentId: normalizeId(value.assignmentId),
    observationId: normalizeId(value.observationId),
    organizationId: normalizeId(value.organizationId),
    contractorId: normalizeId(value.contractorId),
    status: value.status,
    version: value.version,
    assignedAt: value.assignedAt,
    assignedBy: normalizeId(value.assignedBy),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
  if (normalizeId(value.replacedByAssignmentId)) assignment.replacedByAssignmentId = normalizeId(value.replacedByAssignmentId);
  if (value.endedAt) assignment.endedAt = value.endedAt;

  return deepFreeze({ decision: validation, assignment: deepFreeze(assignment) });
}

module.exports = Object.freeze({
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_STATUS_VALUES,
  createAssignmentContract,
  validateAssignmentContract,
});
