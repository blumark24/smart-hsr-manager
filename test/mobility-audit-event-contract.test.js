'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createMobilityAuditEvent, validateMobilityAuditEvent } = require('../platform/audit/mobility-audit-event-contract');

function context(role = 'mobility_head') {
  return { actor: { uid: 'actor-1', role, organizationId: 'org-a' } };
}

test('a valid mobility audit event is accepted', () => {
  const { decision, event } = createMobilityAuditEvent({
    eventId: 'evt-1', context: context(), resourceType: 'mission', resourceId: 'm-1',
    action: 'allocate_vehicle', decision: { allowed: true, code: 'TRANSITION_ALLOWED' }, timestamp: '2026-08-31T00:00:00.000Z',
  });
  assert.equal(decision.allowed, true);
  assert.equal(event.decision, 'ALLOW');
  assert.equal(event.actorRole, 'mobility_head');
});

test('an unrecognized actor role is rejected', () => {
  const decision = validateMobilityAuditEvent({
    eventId: 'evt-1', organizationId: 'org-a', actorId: 'a', actorRole: 'random_role',
    resourceType: 'mission', resourceId: 'm-1', action: 'x', reasonCode: 'x', timestamp: 't', decision: 'ALLOW',
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'AUDIT_ROLE_INVALID');
});

test('an unsupported resource type is rejected', () => {
  const { decision } = createMobilityAuditEvent({
    eventId: 'evt-1', context: context(), resourceType: 'observation', resourceId: 'm-1',
    action: 'x', decision: { allowed: true, code: 'OK' }, timestamp: 't',
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'AUDIT_RESOURCE_TYPE_INVALID');
});

test('a denied decision is recorded as DENY, never silently dropped', () => {
  const { decision, event } = createMobilityAuditEvent({
    eventId: 'evt-1', context: context('employee'), resourceType: 'mission', resourceId: 'm-1',
    action: 'finish', decision: { allowed: false, code: 'OWNERSHIP_MISMATCH' }, timestamp: 't',
  });
  assert.equal(decision.allowed, true);
  assert.equal(event.decision, 'DENY');
  assert.equal(event.reasonCode, 'OWNERSHIP_MISMATCH');
});

console.log('mobility audit event contract OK');
