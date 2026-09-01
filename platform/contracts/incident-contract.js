'use strict';

const { createDecision, deepFreeze } = require('./decision');
const { INCIDENT_STATUSES } = require('../policies/incident-workflow-policy');

const INCIDENT_SEVERITIES = Object.freeze(['LOW', 'MEDIUM', 'CRITICAL']);

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateIncidentContract(value) {
  if (!value || typeof value !== 'object') {
    return createDecision(false, 'INCIDENT_REQUIRED', 'An incident contract is required.');
  }
  for (const field of ['incidentId', 'organizationId', 'missionId', 'vehicleId', 'createdByUid', 'category', 'createdAt', 'updatedAt']) {
    if (!normalizeId(value[field])) {
      return createDecision(false, 'INCIDENT_FIELD_REQUIRED', `Incident field ${field} is required.`, { field });
    }
  }
  if (!INCIDENT_STATUSES.includes(value.status)) {
    return createDecision(false, 'INCIDENT_STATUS_UNSUPPORTED', 'The incident status is not supported.', { status: value.status });
  }
  if (!INCIDENT_SEVERITIES.includes(value.severity)) {
    return createDecision(false, 'INCIDENT_SEVERITY_UNSUPPORTED', 'The incident severity is not supported.', { severity: value.severity });
  }
  return createDecision(true, 'INCIDENT_CONTRACT_VALID', 'The incident contract is structurally valid.');
}

function createIncidentContract(value) {
  const validation = validateIncidentContract(value);
  if (!validation.allowed) return { decision: validation, incident: null };
  const incident = {
    incidentId: normalizeId(value.incidentId), organizationId: normalizeId(value.organizationId),
    missionId: normalizeId(value.missionId), vehicleId: normalizeId(value.vehicleId),
    createdByUid: normalizeId(value.createdByUid), category: normalizeId(value.category),
    status: value.status, severity: value.severity,
    createdAt: value.createdAt, updatedAt: value.updatedAt,
  };
  for (const optional of ['note', 'location', 'department', 'updatedByUid']) {
    if (normalizeId(value[optional])) incident[optional] = normalizeId(value[optional]);
  }
  return deepFreeze({ decision: validation, incident: deepFreeze(incident) });
}

module.exports = Object.freeze({ INCIDENT_SEVERITIES, createIncidentContract, validateIncidentContract });
