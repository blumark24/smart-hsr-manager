'use strict';

// Parallel to platform/audit/audit-event-contract.js, scoped to the Smart
// Mobility domain (missions/vehicles/incidents) and its five roles, so the
// existing observation-domain audit contract's role/resource lists don't
// have to be widened for an unrelated feature.

const { MOBILITY_ROLE_VALUES } = require('../contracts/mobility-role-contract');
const { createDecision, deepFreeze } = require('../contracts/decision');

const MOBILITY_RESOURCE_TYPES = Object.freeze(['mission', 'vehicle', 'incident']);
const DECISION_VALUES = Object.freeze(['ALLOW', 'DENY']);

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateMobilityAuditEvent(value) {
  if (!value || typeof value !== 'object') {
    return createDecision(false, 'AUDIT_EVENT_REQUIRED', 'An audit event input is required.');
  }
  for (const field of ['eventId', 'organizationId', 'actorId', 'resourceId', 'action', 'reasonCode', 'timestamp']) {
    if (!normalizeId(value[field])) {
      return createDecision(false, 'AUDIT_FIELD_REQUIRED', `Audit field ${field} is required.`, { field });
    }
  }
  if (!MOBILITY_ROLE_VALUES.includes(value.actorRole)) {
    return createDecision(false, 'AUDIT_ROLE_INVALID', 'Audit actorRole is not a verified Smart Mobility role.');
  }
  if (!MOBILITY_RESOURCE_TYPES.includes(value.resourceType)) {
    return createDecision(false, 'AUDIT_RESOURCE_TYPE_INVALID', 'Audit resourceType is not supported.');
  }
  if (!DECISION_VALUES.includes(value.decision)) {
    return createDecision(false, 'AUDIT_DECISION_INVALID', 'Audit decision must be ALLOW or DENY.');
  }
  return createDecision(true, 'AUDIT_EVENT_VALID', 'The audit event is valid.');
}

function createMobilityAuditEvent({
  eventId, context, resourceType, resourceId, action, decision,
  previousState, requestedState, timestamp, correlationId, organizationId,
} = {}) {
  const value = {
    eventId: normalizeId(eventId),
    organizationId: normalizeId(organizationId) || normalizeId(context && context.actor && context.actor.organizationId),
    actorId: normalizeId(context && context.actor && context.actor.uid),
    actorRole: context && context.actor && context.actor.role,
    resourceType,
    resourceId: normalizeId(resourceId),
    action: normalizeId(action),
    decision: decision && decision.allowed === true ? 'ALLOW' : 'DENY',
    reasonCode: normalizeId(decision && decision.code),
    timestamp: normalizeId(timestamp),
  };
  if (normalizeId(previousState)) value.previousState = normalizeId(previousState);
  if (normalizeId(requestedState)) value.requestedState = normalizeId(requestedState);
  if (normalizeId(correlationId)) value.correlationId = normalizeId(correlationId);

  const validation = validateMobilityAuditEvent(value);
  return deepFreeze({ decision: validation, event: validation.allowed ? deepFreeze(value) : null });
}

module.exports = Object.freeze({
  MOBILITY_RESOURCE_TYPES,
  DECISION_VALUES,
  createMobilityAuditEvent,
  validateMobilityAuditEvent,
});
