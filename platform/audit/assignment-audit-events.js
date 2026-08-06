'use strict';

const { createAuditEvent } = require('./audit-event-contract');

const ACTIONS = Object.freeze({
  CREATED: 'assignment_created', REPLACED: 'assignment_replaced', ENDED: 'assignment_ended',
  DENIED: 'authorization_denied', TRANSITION: 'workflow_transition_requested',
});

function buildAssignmentAuditEvent({ action, actor, observation, assignmentId, decision, timestamp, eventId, requestedState } = {}) {
  return createAuditEvent({
    eventId,
    context: { actor },
    resourceType: action === ACTIONS.TRANSITION ? 'observation' : 'assignment',
    resourceId: action === ACTIONS.TRANSITION ? observation.id : assignmentId,
    action,
    decision,
    previousState: observation && observation.status,
    requestedState,
    assignmentId,
    timestamp,
  });
}

module.exports = Object.freeze({ ACTIONS, buildAssignmentAuditEvent });
