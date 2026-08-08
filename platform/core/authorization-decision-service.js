'use strict';

const { createDecision, withDecisionMetadata } = require('../contracts/decision');
const { ROLES, evaluateRoleAuthority } = require('../contracts/role-contract');
const { evaluateOrganizationScope } = require('../policies/organization-scope-policy');
const { evaluateAssignmentOwnership } = require('../policies/assignment-ownership-policy');
const { evaluateTransition } = require('../policies/observation-workflow-policy');

function observationIdOf(observation) {
  const value = observation && (observation.id || observation.docId);
  return typeof value === 'string' ? value.trim() : '';
}

function actorOf(context) {
  return context && context.actor;
}

function resourceOf(context) {
  return context && (context.observation || context.resource);
}

function decorate(decision, action, context) {
  return withDecisionMetadata(decision, {
    action,
    actorRole: actorOf(context) && actorOf(context).role,
    resourceId: observationIdOf(resourceOf(context)) || null,
  });
}

function requireScope(context, action) {
  return decorate(evaluateOrganizationScope({ actor: actorOf(context), resource: resourceOf(context) }), action, context);
}

function canCreateObservation(context = {}) {
  const actor = actorOf(context);
  const observation = resourceOf(context);
  const scope = requireScope(context, 'create_observation');
  if (!scope.allowed) return scope;
  const authority = evaluateRoleAuthority(actor.role, 'canCreateObservation');
  if (!authority.allowed) return decorate(authority, 'create_observation', context);
  if (!actor.uid || observation.createdByUid !== actor.uid) {
    return decorate(createDecision(false, 'CREATOR_IDENTITY_MISMATCH', 'The inspector must create the observation as their own resource.'), 'create_observation', context);
  }
  if (observation.status !== 'PENDING') {
    return decorate(createDecision(false, 'INITIAL_STATUS_INVALID', 'A new observation must start as PENDING.'), 'create_observation', context);
  }
  return decorate(createDecision(true, 'OBSERVATION_CREATE_ALLOWED', 'The inspector may create this organization-scoped observation.'), 'create_observation', context);
}

function canUpdateObservation(context = {}) {
  const actor = actorOf(context);
  const role = actor && actor.role;
  if (role !== ROLES.INSPECTOR) {
    return decorate(createDecision(false, 'INSPECTOR_UPDATE_ROLE_REQUIRED', 'Generic observation editing is restricted to the creating inspector; managerial actions use named methods.'), 'update_observation', context);
  }
  return decorate(evaluateAssignmentOwnership({
    actor,
    observation: resourceOf(context),
    assignment: context.assignment,
    action: 'update',
  }), 'update_observation', context);
}

function canAssignObservation(context = {}) {
  const actor = actorOf(context);
  const scope = requireScope(context, 'assign_observation');
  if (!scope.allowed) return scope;
  const authority = evaluateRoleAuthority(actor && actor.role, 'canAssign');
  if (!authority.allowed) return decorate(authority, 'assign_observation', context);
  if (resourceOf(context).status !== 'PENDING') {
    return decorate(createDecision(false, 'ASSIGNMENT_STATUS_INVALID', 'Assignment is supported only while the observation is PENDING.'), 'assign_observation', context);
  }
  return decorate(createDecision(true, 'OBSERVATION_ASSIGN_ALLOWED', 'The managerial role may assign this observation.'), 'assign_observation', context);
}

function canStartObservation(context = {}) {
  if (!actorOf(context) || actorOf(context).role !== ROLES.CONTRACTOR) {
    return decorate(createDecision(false, 'CONTRACTOR_START_ROLE_REQUIRED', 'Only the current assigned contractor may start an observation.'), 'start_observation', context);
  }
  return decorate(evaluateTransition({
    actor: actorOf(context), observation: resourceOf(context), assignment: context.assignment, toStatus: 'IN_PROGRESS',
  }), 'start_observation', context);
}

function canSubmitEvidence(context = {}) {
  return decorate(evaluateTransition({
    actor: actorOf(context), observation: resourceOf(context), assignment: context.assignment, toStatus: 'PENDING_REVIEW',
  }), 'submit_evidence', context);
}

function canReviewObservation(context = {}) {
  const actor = actorOf(context);
  const scope = requireScope(context, 'review_observation');
  if (!scope.allowed) return scope;
  const authority = evaluateRoleAuthority(actor && actor.role, 'canReview');
  if (!authority.allowed) return decorate(authority, 'review_observation', context);
  if (resourceOf(context).status !== 'PENDING_REVIEW') {
    return decorate(createDecision(false, 'REVIEW_STATUS_INVALID', 'Review requires PENDING_REVIEW status.'), 'review_observation', context);
  }
  return decorate(createDecision(true, 'OBSERVATION_REVIEW_ALLOWED', 'The managerial role may review this observation.'), 'review_observation', context);
}

function canReturnObservation(context = {}) {
  return decorate(evaluateTransition({
    actor: actorOf(context), observation: resourceOf(context), assignment: context.assignment, toStatus: 'IN_PROGRESS',
  }), 'return_observation', context);
}

function canCompleteObservation(context = {}) {
  return decorate(evaluateTransition({
    actor: actorOf(context), observation: resourceOf(context), assignment: context.assignment, toStatus: 'COMPLETED',
  }), 'complete_observation', context);
}

module.exports = Object.freeze({
  canAssignObservation,
  canCompleteObservation,
  canCreateObservation,
  canReviewObservation,
  canReturnObservation,
  canStartObservation,
  canSubmitEvidence,
  canUpdateObservation,
});
