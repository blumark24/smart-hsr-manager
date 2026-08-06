'use strict';

const { ROLE_VALUES } = require('../contracts/role-contract');
const { createDecision, deepFreeze } = require('../contracts/decision');

const RESOURCE_TYPES = Object.freeze(['observation', 'assignment', 'organization']);
const DECISION_VALUES = Object.freeze(['ALLOW', 'DENY']);

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stateValue(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.status === 'string') return value.status;
  return undefined;
}

function validateAuditEvent(value) {
  if (!value || typeof value !== 'object') return createDecision(false, 'AUDIT_EVENT_REQUIRED', 'An audit event input is required.');
  for (const field of ['eventId', 'organizationId', 'actorId', 'resourceId', 'action', 'reasonCode', 'timestamp']) {
    if (!normalizeId(value[field])) {
      return createDecision(false, 'AUDIT_FIELD_REQUIRED', `Audit field ${field} is required.`, { field });
    }
  }
  if (!ROLE_VALUES.includes(value.actorRole)) return createDecision(false, 'AUDIT_ROLE_INVALID', 'Audit actorRole is not verified.');
  if (!RESOURCE_TYPES.includes(value.resourceType)) return createDecision(false, 'AUDIT_RESOURCE_TYPE_INVALID', 'Audit resourceType is not supported.');
  if (!DECISION_VALUES.includes(value.decision)) return createDecision(false, 'AUDIT_DECISION_INVALID', 'Audit decision must be ALLOW or DENY.');
  return createDecision(true, 'AUDIT_EVENT_VALID', 'The audit event is valid.');
}

function createAuditEvent({ eventId, context, resourceType = 'observation', resourceId, action, decision, previousState, requestedState, assignmentId, timestamp, correlationId } = {}) {
  const value = {
    eventId: normalizeId(eventId),
    organizationId: normalizeId(context && context.actor && context.actor.organizationId),
    actorId: normalizeId(context && context.actor && context.actor.uid),
    actorRole: context && context.actor && context.actor.role,
    resourceType,
    resourceId: normalizeId(resourceId),
    action: normalizeId(action),
    decision: decision && decision.allowed === true ? 'ALLOW' : 'DENY',
    reasonCode: normalizeId(decision && decision.code),
    timestamp: normalizeId(timestamp),
  };

  const previous = stateValue(previousState);
  const requested = stateValue(requestedState);
  if (previous !== undefined) value.previousState = previous;
  if (requested !== undefined) value.requestedState = requested;
  if (normalizeId(assignmentId)) value.assignmentId = normalizeId(assignmentId);
  if (normalizeId(correlationId)) value.correlationId = normalizeId(correlationId);

  const validation = validateAuditEvent(value);
  return deepFreeze({ decision: validation, event: validation.allowed ? deepFreeze(value) : null });
}

module.exports = Object.freeze({
  DECISION_VALUES,
  RESOURCE_TYPES,
  createAuditEvent,
  validateAuditEvent,
});
