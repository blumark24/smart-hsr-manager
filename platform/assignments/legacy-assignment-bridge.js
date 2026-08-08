'use strict';

const { validateAssignmentContract } = require('./assignment-contract');
const { deepFreeze } = require('../contracts/decision');

const BRIDGE_CLASSIFICATIONS = Object.freeze({
  CANONICAL: 'canonical',
  LEGACY_COMPATIBLE: 'legacy-compatible',
  AMBIGUOUS: 'ambiguous',
  INVALID: 'invalid',
});

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function resolveAssignmentBridge({ observation, assignment } = {}) {
  if (!observation || typeof observation !== 'object') {
    return deepFreeze({ classification: BRIDGE_CLASSIFICATIONS.INVALID, assignment: null, contractorActionAllowed: false, reason: 'Observation is required.' });
  }
  const observationId = text(observation.id || observation.docId);
  const organizationId = text(observation.organizationId);
  if (!observationId || !organizationId) {
    return deepFreeze({ classification: BRIDGE_CLASSIFICATIONS.INVALID, assignment: null, contractorActionAllowed: false, reason: 'Observation identity and organization are required.' });
  }
  if (assignment) {
    const validation = validateAssignmentContract(assignment);
    const pointerMatches = observation.currentAssignmentId === assignment.assignmentId
      && observation.currentAssignmentVersion === assignment.version;
    const resourceMatches = assignment.observationId === observationId
      && assignment.organizationId === organizationId;
    const valid = validation.allowed && pointerMatches && resourceMatches;
    return deepFreeze({
      classification: valid ? BRIDGE_CLASSIFICATIONS.CANONICAL : BRIDGE_CLASSIFICATIONS.INVALID,
      assignment: valid ? assignment : null,
      contractorActionAllowed: valid,
      reason: valid ? 'Canonical assignment and observation pointer match.' : 'Canonical assignment or pointer is invalid.',
    });
  }
  const contractorId = text(observation.assignedContractorUid);
  if (!contractorId) {
    return deepFreeze({ classification: BRIDGE_CLASSIFICATIONS.LEGACY_COMPATIBLE, assignment: null, contractorActionAllowed: false, reason: 'Legacy observation is unassigned.' });
  }
  if (observation.assignedAt && text(observation.assignedByUid)) {
    return deepFreeze({
      classification: BRIDGE_CLASSIFICATIONS.LEGACY_COMPATIBLE,
      assignment: null,
      contractorActionAllowed: false,
      reason: 'Legacy assignment can be displayed but lacks canonical identity, status, and version.',
    });
  }
  return deepFreeze({ classification: BRIDGE_CLASSIFICATIONS.AMBIGUOUS, assignment: null, contractorActionAllowed: false, reason: 'Legacy assignment provenance is incomplete.' });
}

module.exports = Object.freeze({ BRIDGE_CLASSIFICATIONS, resolveAssignmentBridge });
