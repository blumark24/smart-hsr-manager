'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RESOURCE_TYPES, createAuditEvent } = require('../platform/audit/audit-event-contract');
const { ACTIONS, RESOURCE_TYPE_BY_ACTION, buildOrganizationAuditEvent } = require('../platform/audit/organization-audit-events');

const owner = { uid: 'owner-1', role: 'owner' };
const allow = Object.freeze({ allowed: true, code: 'ORG_ACTION_ALLOWED' });
const deny = Object.freeze({ allowed: false, code: 'ORG_ACTION_DENIED' });

test('resource types remain backward compatible and additively include invoice and user', () => {
  assert.equal(RESOURCE_TYPES.includes('observation'), true);
  assert.equal(RESOURCE_TYPES.includes('assignment'), true);
  assert.equal(RESOURCE_TYPES.includes('organization'), true);
  assert.equal(RESOURCE_TYPES.includes('invoice'), true);
  assert.equal(RESOURCE_TYPES.includes('user'), true);
});

test('createAuditEvent still defaults organizationId from actor context when no override is given', () => {
  const actor = { uid: 'inspector-1', role: 'inspector', organizationId: 'org-a' };
  const result = createAuditEvent({ eventId: 'evt-1', context: { actor }, resourceType: 'observation', resourceId: 'obs-1', action: 'create_observation', decision: allow, timestamp: '2026-08-07T00:00:00.000Z' });
  assert.equal(result.decision.allowed, true);
  assert.equal(result.event.organizationId, 'org-a');
});

test('createAuditEvent accepts an explicit organizationId override for owner-initiated events', () => {
  const result = createAuditEvent({ eventId: 'evt-2', context: { actor: owner }, resourceType: 'organization', resourceId: 'org-b', organizationId: 'org-b', action: 'organization_created', decision: allow, timestamp: '2026-08-07T00:00:00.000Z' });
  assert.equal(result.decision.allowed, true);
  assert.equal(result.event.organizationId, 'org-b');
  assert.equal(result.event.actorRole, 'owner');
});

test('missing organizationId is still rejected (the requirement is not weakened)', () => {
  const result = createAuditEvent({ eventId: 'evt-3', context: { actor: { uid: 'owner-1', role: 'owner' } }, resourceType: 'organization', resourceId: 'org-c', action: 'organization_created', decision: allow, timestamp: '2026-08-07T00:00:00.000Z' });
  assert.equal(result.decision.allowed, false);
  assert.equal(result.decision.code, 'AUDIT_FIELD_REQUIRED');
  assert.equal(result.event, null);
});

test('buildOrganizationAuditEvent produces a valid ALLOW event for organization creation', () => {
  const result = buildOrganizationAuditEvent({ action: ACTIONS.ORGANIZATION_CREATED, actor: owner, organizationId: 'org-d', resourceId: 'org-d', decision: allow, timestamp: '2026-08-07T00:00:00.000Z', eventId: 'evt-4' });
  assert.equal(result.decision.allowed, true);
  assert.equal(result.event.resourceType, 'organization');
  assert.equal(result.event.action, ACTIONS.ORGANIZATION_CREATED);
});

test('buildOrganizationAuditEvent tags invoice issuance with resourceType invoice', () => {
  const result = buildOrganizationAuditEvent({ action: ACTIONS.INVOICE_ISSUED, actor: owner, organizationId: 'org-e', resourceId: 'INV-1', decision: allow, timestamp: '2026-08-07T00:00:00.000Z', eventId: 'evt-5' });
  assert.equal(result.decision.allowed, true);
  assert.equal(result.event.resourceType, 'invoice');
});

test('buildOrganizationAuditEvent tags user account actions with resourceType user and records DENY outcomes', () => {
  const result = buildOrganizationAuditEvent({ action: ACTIONS.USER_ACCOUNT_DEACTIVATED, actor: owner, organizationId: 'org-f', resourceId: 'user-1', decision: deny, timestamp: '2026-08-07T00:00:00.000Z', eventId: 'evt-6' });
  assert.equal(result.decision.allowed, true);
  assert.equal(result.event.resourceType, 'user');
  assert.equal(result.event.decision, 'DENY');
  assert.equal(result.event.reasonCode, 'ORG_ACTION_DENIED');
});

test('every action in RESOURCE_TYPE_BY_ACTION maps to a resource type registered in RESOURCE_TYPES', () => {
  for (const [action, resourceType] of Object.entries(RESOURCE_TYPE_BY_ACTION)) {
    assert.equal(RESOURCE_TYPES.includes(resourceType), true, `${action} -> ${resourceType}`);
  }
});

test('organization-audit-events exports are frozen', () => {
  const mod = require('../platform/audit/organization-audit-events');
  assert.equal(Object.isFrozen(mod), true);
  assert.equal(Object.isFrozen(mod.ACTIONS), true);
});
