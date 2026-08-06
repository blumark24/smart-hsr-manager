'use strict';

const authorization = require('../core/authorization-decision-service');
const { PLATFORM_ASSIGNMENT_V2 } = require('../config/feature-flags');
const { resolveAssignmentBridge, BRIDGE_CLASSIFICATIONS } = require('../assignments/legacy-assignment-bridge');
const { ACTIONS, buildAssignmentAuditEvent } = require('../audit/assignment-audit-events');

function createAssignmentV2Gateway({ flags, assignmentService, legacyHandlers = {}, clock = () => new Date().toISOString(), idFactory = () => 'event' } = {}) {
  const enabled = () => flags.isEnabled(PLATFORM_ASSIGNMENT_V2);
  const route = (legacyName, v2) => (...args) => enabled() ? v2(...args) : legacyHandlers[legacyName](...args);

  async function transition(method, input) {
    const bridge = resolveAssignmentBridge({ observation: input.observation, assignment: input.assignment });
    if (input.actor.role === 'contractor' && bridge.classification !== BRIDGE_CLASSIFICATIONS.CANONICAL) {
      return { allowed: false, code: 'V2_CANONICAL_ASSIGNMENT_REQUIRED', reason: bridge.reason, auditEvent: null };
    }
    const decision = authorization[method]({ actor: input.actor, observation: input.observation, assignment: bridge.assignment || input.assignment });
    const auditEvent = buildAssignmentAuditEvent({ action: decision.allowed ? ACTIONS.TRANSITION : ACTIONS.DENIED, actor: input.actor, observation: input.observation, assignmentId: input.assignment && input.assignment.assignmentId, decision, requestedState: input.toStatus, timestamp: clock(), eventId: `audit-${idFactory()}` }).event;
    if (!decision.allowed) return { ...decision, auditEvent };
    return { ...decision, auditEvent, writeRequest: { observationId: input.observation.id, patch: input.patch } };
  }

  return Object.freeze({
    createAssignment: route('createAssignment', input => assignmentService.createAssignment(input)),
    replaceAssignment: route('replaceAssignment', input => assignmentService.replaceAssignment(input)),
    endAssignment: route('endAssignment', input => assignmentService.endAssignment(input)),
    startExecution: route('startExecution', input => transition('canStartObservation', input)),
    submitEvidence: route('submitEvidence', input => transition('canSubmitEvidence', input)),
    returnObservation: route('returnObservation', input => transition('canReturnObservation', input)),
    completeObservation: route('completeObservation', input => transition('canCompleteObservation', input)),
    updateInspectorObservation: route('updateInspectorObservation', input => transition('canUpdateObservation', input)),
  });
}

module.exports = Object.freeze({ createAssignmentV2Gateway });
