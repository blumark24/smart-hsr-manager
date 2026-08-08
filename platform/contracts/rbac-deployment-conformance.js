'use strict';

const { createDecision } = require('./decision');
const { ROLES } = require('./role-contract');

// Mirrors the deployed firestore.rules account-doc structure: owner and
// manager each have a dedicated top-level collection; the three operational
// roles (supervisor/inspector/contractor) share `users/{uid}` with a `role`
// field. This is documentation-as-code so the two systems can be checked
// against each other instead of drifting silently.
const ACCOUNT_COLLECTION_BY_ROLE = Object.freeze({
  [ROLES.OWNER]: 'owners',
  [ROLES.MANAGER]: 'managers',
  [ROLES.SUPERVISOR]: 'users',
  [ROLES.INSPECTOR]: 'users',
  [ROLES.CONTRACTOR]: 'users',
});

function resolveAccountCollection(role) {
  const collection = ACCOUNT_COLLECTION_BY_ROLE[role];
  if (!collection) return createDecision(false, 'ROLE_NOT_RECOGNIZED', 'The role is not a verified Smart HSR role.', { role, collection: null });
  return createDecision(true, 'ACCOUNT_COLLECTION_RESOLVED', 'The role resolves to its deployed account collection.', { role, collection });
}

// Deliberate, documented deviations between this platform authorization
// model (platform/policies/observation-workflow-policy.js and friends) and
// the currently deployed firestore.rules. Each entry records a real
// production path this module does not (yet) model, so future work starts
// from a known list instead of rediscovering drift. Nothing here changes
// deployed behavior — this is a read-only conformance record.
const KNOWN_DEPLOYMENT_DEVIATIONS = Object.freeze([
  Object.freeze({
    id: 'INSPECTOR_DIRECT_COMPLETION',
    role: ROLES.INSPECTOR,
    description: 'firestore.rules canInspectorUpdateObservation() (dashboard.html completeObservation, line ~4373) allows an inspector to change status/isComparative/afterImagePath/resolutionNote on their own observation directly, independent of the assignment/contractor flow.',
    modeledInWorkflowPolicy: false,
    reason: 'platform/policies/observation-workflow-policy.js TRANSITION_MATRIX only models contractor-, manager-, and supervisor-driven transitions; it has no inspector-initiated transition entry.',
  }),
]);

function findKnownDeviation(id) {
  return KNOWN_DEPLOYMENT_DEVIATIONS.find(entry => entry.id === id) || null;
}

module.exports = Object.freeze({
  ACCOUNT_COLLECTION_BY_ROLE,
  KNOWN_DEPLOYMENT_DEVIATIONS,
  resolveAccountCollection,
  findKnownDeviation,
});
