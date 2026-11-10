'use strict';

const { createDecision, deepFreeze } = require('./decision');
const { MISSION_STATUSES } = require('../policies/mission-workflow-policy');

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateMissionContract(value) {
  if (!value || typeof value !== 'object') {
    return createDecision(false, 'MISSION_REQUIRED', 'A mission contract is required.');
  }

  for (const field of ['missionId', 'organizationId', 'department', 'createdByUid', 'createdAt', 'updatedAt']) {
    if (!normalizeId(value[field])) {
      return createDecision(false, 'MISSION_FIELD_REQUIRED', `Mission field ${field} is required.`, { field });
    }
  }

  if (!MISSION_STATUSES.includes(value.status)) {
    return createDecision(false, 'MISSION_STATUS_UNSUPPORTED', 'The mission status is not supported.', { status: value.status });
  }

  const vehicleStage = ['VEHICLE_ALLOCATED', 'HANDED_OVER', 'READY', 'IN_PROGRESS', 'INCIDENT_HOLD', 'COMPLETED', 'AWAITING_RETURN', 'CLOSED'];
  if (vehicleStage.includes(value.status) && (!normalizeId(value.vehicleId) || !normalizeId(value.assignedEmployeeUid))) {
    return createDecision(false, 'MISSION_ALLOCATION_REQUIRED', 'A mission past approval must carry a vehicleId and assignedEmployeeUid.');
  }

  return createDecision(true, 'MISSION_CONTRACT_VALID', 'The mission contract is structurally valid.');
}

function createMissionContract(value) {
  const validation = validateMissionContract(value);
  if (!validation.allowed) return { decision: validation, mission: null };

  const mission = {
    missionId: normalizeId(value.missionId),
    organizationId: normalizeId(value.organizationId),
    department: normalizeId(value.department),
    createdByUid: normalizeId(value.createdByUid),
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
  for (const optional of ['type', 'destination', 'reason', 'scope', 'vehicleId', 'assignedEmployeeUid', 'updatedByUid']) {
    if (normalizeId(value[optional])) mission[optional] = normalizeId(value[optional]);
  }

  return deepFreeze({ decision: validation, mission: deepFreeze(mission) });
}

module.exports = Object.freeze({
  createMissionContract,
  validateMissionContract,
});
