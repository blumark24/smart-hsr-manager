'use strict';

const { createAuditEvent } = require('./audit-event-contract');

const ACTIONS = Object.freeze({
  ORGANIZATION_CREATED: 'organization_created',
  ORGANIZATION_UPDATED: 'organization_updated',
  ORGANIZATION_DELETED: 'organization_deleted',
  INVOICE_ISSUED: 'invoice_issued',
  USER_ACCOUNT_CREATED: 'user_account_created',
  USER_ACCOUNT_DEACTIVATED: 'user_account_deactivated',
  USER_ACCOUNT_REACTIVATED: 'user_account_reactivated',
  USER_SESSIONS_REVOKED: 'user_sessions_revoked',
});

const RESOURCE_TYPE_BY_ACTION = Object.freeze({
  [ACTIONS.ORGANIZATION_CREATED]: 'organization',
  [ACTIONS.ORGANIZATION_UPDATED]: 'organization',
  [ACTIONS.ORGANIZATION_DELETED]: 'organization',
  [ACTIONS.INVOICE_ISSUED]: 'invoice',
  [ACTIONS.USER_ACCOUNT_CREATED]: 'user',
  [ACTIONS.USER_ACCOUNT_DEACTIVATED]: 'user',
  [ACTIONS.USER_ACCOUNT_REACTIVATED]: 'user',
  [ACTIONS.USER_SESSIONS_REVOKED]: 'user',
});

// Owner-domain audit events for the future Owner Command Center audit log.
// This module only builds and validates event records — it is not called
// from owner.html or any API route yet; wiring the actual write path into
// production is a separate, later step.
function buildOrganizationAuditEvent({ action, actor, organizationId, resourceId, decision, previousState, requestedState, timestamp, eventId, correlationId } = {}) {
  return createAuditEvent({
    eventId,
    context: { actor },
    resourceType: RESOURCE_TYPE_BY_ACTION[action] || 'organization',
    resourceId,
    organizationId,
    action,
    decision,
    previousState,
    requestedState,
    timestamp,
    correlationId,
  });
}

module.exports = Object.freeze({ ACTIONS, RESOURCE_TYPE_BY_ACTION, buildOrganizationAuditEvent });
