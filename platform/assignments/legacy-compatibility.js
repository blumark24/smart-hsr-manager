'use strict';

const { validateAssignmentContract } = require('./assignment-contract');
const { deepFreeze } = require('../contracts/decision');

const LEGACY_COMPATIBILITY = Object.freeze({
  FULLY_COMPATIBLE: 'FULLY_COMPATIBLE',
  PARTIALLY_COMPATIBLE: 'PARTIALLY_COMPATIBLE',
  INCOMPATIBLE: 'INCOMPATIBLE',
  AMBIGUOUS: 'AMBIGUOUS',
});

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function classifyLegacyAssignment(observation) {
  if (!observation || typeof observation !== 'object') {
    return deepFreeze({ classification: LEGACY_COMPATIBILITY.INCOMPATIBLE, reason: 'Observation is missing.', mapping: null });
  }

  const observationId = normalizeId(observation.id || observation.docId);
  const organizationId = normalizeId(observation.organizationId);
  if (!observationId || !organizationId) {
    return deepFreeze({ classification: LEGACY_COMPATIBILITY.INCOMPATIBLE, reason: 'Observation identity or organization is missing.', mapping: null });
  }

  if (observation.assignment && typeof observation.assignment === 'object') {
    const validation = validateAssignmentContract(observation.assignment);
    return deepFreeze({
      classification: validation.allowed ? LEGACY_COMPATIBILITY.FULLY_COMPATIBLE : LEGACY_COMPATIBILITY.INCOMPATIBLE,
      reason: validation.reason,
      mapping: validation.allowed ? observation.assignment : null,
    });
  }

  const contractorId = normalizeId(observation.assignedContractorUid);
  if (!contractorId) {
    return deepFreeze({ classification: LEGACY_COMPATIBILITY.FULLY_COMPATIBLE, reason: 'The observation is unassigned and requires no assignment mapping.', mapping: null });
  }

  const assignedBy = normalizeId(observation.assignedByUid);
  if (!observation.assignedAt || !assignedBy) {
    return deepFreeze({
      classification: LEGACY_COMPATIBILITY.AMBIGUOUS,
      reason: 'Legacy contractor identity exists without complete assignment provenance.',
      mapping: { observationId, organizationId, contractorId },
    });
  }

  return deepFreeze({
    classification: LEGACY_COMPATIBILITY.PARTIALLY_COMPATIBLE,
    reason: 'Legacy fields map identity and provenance but lack assignmentId, status, and version.',
    mapping: { observationId, organizationId, contractorId, assignedAt: observation.assignedAt, assignedBy },
  });
}

module.exports = Object.freeze({ LEGACY_COMPATIBILITY, classifyLegacyAssignment });
