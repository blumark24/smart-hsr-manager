'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { INCIDENT_STATUSES, evaluateIncidentTransition, canCreateIncident } = require('../platform/policies/incident-workflow-policy');

const ORG_A = 'org-a';
function actor(role, overrides = {}) { return { uid: `${role}-uid`, role, organizationId: ORG_A, ...overrides }; }
function incident(status, overrides = {}) { return { organizationId: ORG_A, status, ...overrides }; }
function mission(status, overrides = {}) { return { organizationId: ORG_A, status, assignedEmployeeUid: 'emp-1', ...overrides }; }

test('every canonical incident status is unique and non-empty', () => {
  const seen = new Set();
  for (const s of INCIDENT_STATUSES) { assert.ok(s.length > 0); assert.equal(seen.has(s), false); seen.add(s); }
});

test('mobility_head walks the full incident lifecycle', () => {
  const steps = [['NEW', 'ACKNOWLEDGED'], ['ACKNOWLEDGED', 'IN_PROGRESS'], ['IN_PROGRESS', 'RESOLVED']];
  for (const [from, to] of steps) {
    const decision = evaluateIncidentTransition({ actor: actor('mobility_head'), incident: incident(from), toStatus: to });
    assert.equal(decision.allowed, true, `${from} -> ${to} should be allowed`);
  }
});

test('an employee cannot process an incident (not their authority)', () => {
  const decision = evaluateIncidentTransition({ actor: actor('employee'), incident: incident('NEW'), toStatus: 'ACKNOWLEDGED' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'ROLE_TRANSITION_DENIED');
});

test('a resolved incident accepts no further transitions', () => {
  const decision = evaluateIncidentTransition({ actor: actor('mobility_head'), incident: incident('RESOLVED'), toStatus: 'IN_PROGRESS' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'INVALID_TRANSITION');
});

test('a cross-organization actor is denied regardless of role', () => {
  const decision = evaluateIncidentTransition({ actor: actor('mobility_head', { organizationId: 'org-b' }), incident: incident('NEW'), toStatus: 'ACKNOWLEDGED' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'ORGANIZATION_SCOPE_DENIED');
});

test('only the assigned employee may create an incident, only on their own in-progress mission', () => {
  const wrongRole = canCreateIncident({ actor: actor('mobility_head'), mission: mission('IN_PROGRESS') });
  assert.equal(wrongRole.allowed, false);
  assert.equal(wrongRole.code, 'ROLE_CREATE_DENIED');

  const notAssigned = canCreateIncident({ actor: actor('employee', { uid: 'someone-else' }), mission: mission('IN_PROGRESS') });
  assert.equal(notAssigned.allowed, false);
  assert.equal(notAssigned.code, 'OWNERSHIP_MISMATCH');

  const wrongStatus = canCreateIncident({ actor: actor('employee', { uid: 'emp-1' }), mission: mission('READY') });
  assert.equal(wrongStatus.allowed, false);
  assert.equal(wrongStatus.code, 'MISSION_NOT_IN_PROGRESS');

  const ok = canCreateIncident({ actor: actor('employee', { uid: 'emp-1' }), mission: mission('IN_PROGRESS') });
  assert.equal(ok.allowed, true);
});

console.log('incident workflow policy OK');
