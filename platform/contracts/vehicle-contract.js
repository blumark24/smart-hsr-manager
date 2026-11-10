'use strict';

const { createDecision, deepFreeze } = require('./decision');
const { VEHICLE_STATUSES } = require('../policies/vehicle-workflow-policy');

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateVehicleContract(value) {
  if (!value || typeof value !== 'object') {
    return createDecision(false, 'VEHICLE_REQUIRED', 'A vehicle contract is required.');
  }

  for (const field of ['vehicleId', 'organizationId', 'createdAt', 'updatedAt']) {
    if (!normalizeId(value[field])) {
      return createDecision(false, 'VEHICLE_FIELD_REQUIRED', `Vehicle field ${field} is required.`, { field });
    }
  }

  if (!VEHICLE_STATUSES.includes(value.status)) {
    return createDecision(false, 'VEHICLE_STATUS_UNSUPPORTED', 'The vehicle status is not supported.', { status: value.status });
  }

  const committedStages = ['RESERVED', 'IN_MISSION', 'RETURN_PENDING'];
  if (committedStages.includes(value.status) && (!normalizeId(value.assignedEmployeeUid) || !normalizeId(value.currentMissionId))) {
    return createDecision(false, 'VEHICLE_COMMITMENT_REQUIRED', 'A reserved/in-mission/return-pending vehicle must carry assignedEmployeeUid and currentMissionId.');
  }
  if (['AVAILABLE', 'MAINTENANCE', 'OUT_OF_SERVICE'].includes(value.status)
    && (normalizeId(value.assignedEmployeeUid) || normalizeId(value.currentMissionId))) {
    return createDecision(false, 'VEHICLE_COMMITMENT_STALE', 'An available/maintenance/out-of-service vehicle must not carry a stale mission commitment.');
  }

  return createDecision(true, 'VEHICLE_CONTRACT_VALID', 'The vehicle contract is structurally valid.');
}

function createVehicleContract(value) {
  const validation = validateVehicleContract(value);
  if (!validation.allowed) return { decision: validation, vehicle: null };

  const vehicle = {
    vehicleId: normalizeId(value.vehicleId),
    organizationId: normalizeId(value.organizationId),
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
  for (const optional of ['type', 'plate', 'assignedEmployeeUid', 'currentMissionId', 'updatedByUid']) {
    if (normalizeId(value[optional])) vehicle[optional] = normalizeId(value[optional]);
  }

  return deepFreeze({ decision: validation, vehicle: deepFreeze(vehicle) });
}

module.exports = Object.freeze({
  createVehicleContract,
  validateVehicleContract,
});
