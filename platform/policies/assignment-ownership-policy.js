'use strict';

const { evaluateOrganizationScope } = require('./organization-scope-policy');
const { resolveAssignment } = require('../assignments/assignment-resolver');

const OPERATIONAL_ROLES = Object.freeze(['manager', 'supervisor', 'inspector', 'contractor']);

function decision(allowed, code, reason) {
  return Object.freeze({ allowed, reason, code });
}

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function observationIdOf(observation) {
  return normalizeId(observation && (observation.id || observation.docId));
}

function evaluateContractorAssignment({ actor, observation, assignment } = {}) {
  return resolveAssignment({ actor, observation, assignment });
}

function evaluateAssignmentOwnership({ actor, observation, assignment, action = 'update' } = {}) {
  const scope = evaluateOrganizationScope({ actor, resource: observation });
  if (!scope.allowed) return scope;

  if (!actor || !OPERATIONAL_ROLES.includes(actor.role)) {
    return decision(false, 'OPERATIONAL_ROLE_REQUIRED', 'The actor does not hold an operational observation role.');
  }

  const actorUid = normalizeId(actor.uid);
  if (!actorUid) {
    return decision(false, 'ACTOR_UID_REQUIRED', 'The authenticated actor has no uid.');
  }

  if (!observation || typeof observation !== 'object') {
    return decision(false, 'OBSERVATION_REQUIRED', 'An observation is required.');
  }

  if (actor.role === 'contractor') {
    if (!['start', 'submit_evidence', 'view'].includes(action)) {
      return decision(false, 'CONTRACTOR_ACTION_DENIED', 'The requested action is outside the contractor assignment contract.');
    }
    const assignmentDecision = evaluateContractorAssignment({ actor, observation, assignment });
    if (!assignmentDecision.allowed) return assignmentDecision;
    return decision(true, 'CONTRACTOR_ASSIGNEE', 'The contractor owns the current assignment.');
  }

  if (actor.role === 'inspector') {
    if (normalizeId(observation.createdByUid) !== actorUid) {
      return decision(false, 'INSPECTOR_OWNERSHIP_REQUIRED', 'The observation was created by another inspector.');
    }
    if (!['update', 'view'].includes(action)) {
      return decision(false, 'INSPECTOR_ACTION_DENIED', 'An inspector may update an owned observation before assignment, but may not approve or complete it.');
    }
    if (action === 'update' && (normalizeId(observation.assignedContractorUid) || assignment)) {
      return decision(false, 'INSPECTOR_UPDATE_AFTER_ASSIGNMENT_DENIED', 'An inspector may not update an observation after assignment.');
    }
    return decision(true, 'INSPECTOR_CREATOR', 'The inspector created the observation.');
  }

  if (actor.role === 'supervisor') {
    if (!['assign', 'review', 'return', 'view'].includes(action)) {
      return decision(false, 'SUPERVISOR_ACTION_DENIED', 'A supervisor may assign, review, return, or view, but may not close.');
    }
    return decision(true, 'SUPERVISOR_ORGANIZATION_AUTHORITY', 'The supervisor may perform the requested same-organization action.');
  }

  if (actor.role === 'manager') {
    if (!['assign', 'review', 'return', 'close', 'view'].includes(action)) {
      return decision(false, 'MANAGER_ACTION_DENIED', 'The requested action is outside the manager observation contract.');
    }
    return decision(true, 'MANAGER_ORGANIZATION_AUTHORITY', 'The manager may perform the requested same-organization action.');
  }

  return decision(false, 'OPERATIONAL_ROLE_REQUIRED', 'The actor does not hold an operational observation role.');
}

module.exports = Object.freeze({
  OPERATIONAL_ROLES,
  evaluateContractorAssignment,
  evaluateAssignmentOwnership,
});
