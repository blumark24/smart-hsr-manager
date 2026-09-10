'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MISSION_STATUSES,
  evaluateMissionTransition,
} = require('../platform/policies/mission-workflow-policy');

const ORG_A = 'org-a';
const ORG_B = 'org-b';

function actor(role, overrides = {}) {
  return { uid: `${role}-uid`, role, organizationId: ORG_A, ...overrides };
}

function mission(status, overrides = {}) {
  return { organizationId: ORG_A, createdByUid: 'dept-head-uid', status, ...overrides };
}

test('every canonical status is a non-empty string, no duplicates', () => {
  const seen = new Set();
  for (const status of MISSION_STATUSES) {
    assert.equal(typeof status, 'string');
    assert.ok(status.length > 0);
    assert.equal(seen.has(status), false, `${status} duplicated`);
    seen.add(status);
  }
});

test('department head may submit their own draft for approval', () => {
  const decision = evaluateMissionTransition({
    actor: actor('department_head'),
    mission: mission('DRAFT', { createdByUid: 'department_head-uid' }),
    toStatus: 'PENDING_APPROVAL',
  });
  assert.equal(decision.allowed, true);
});

test('department head may not submit a mission created by someone else', () => {
  const decision = evaluateMissionTransition({
    actor: actor('department_head'),
    mission: mission('DRAFT', { createdByUid: 'someone-else-uid' }),
    toStatus: 'PENDING_APPROVAL',
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'OWNERSHIP_MISMATCH');
});

test('mobility head cannot approve a mission request (not their authority)', () => {
  const decision = evaluateMissionTransition({
    actor: actor('mobility_head'),
    mission: mission('PENDING_APPROVAL'),
    toStatus: 'APPROVED',
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'ROLE_TRANSITION_DENIED');
});

test('administrative affairs may approve, reject, or return for review', () => {
  for (const toStatus of ['APPROVED', 'REJECTED', 'DRAFT']) {
    const decision = evaluateMissionTransition({
      actor: actor('administrative_affairs'),
      mission: mission('PENDING_APPROVAL'),
      toStatus,
    });
    assert.equal(decision.allowed, true, `expected ${toStatus} to be allowed`);
  }
});

test('mobility head allocating a vehicle must supply vehicleId and assignedEmployeeUid', () => {
  const withoutFields = evaluateMissionTransition({
    actor: actor('mobility_head'),
    mission: mission('APPROVED'),
    toStatus: 'VEHICLE_ALLOCATED',
  });
  assert.equal(withoutFields.allowed, false);
  assert.equal(withoutFields.code, 'REQUIRED_FIELDS_MISSING');

  const withFields = evaluateMissionTransition({
    actor: actor('mobility_head'),
    mission: mission('APPROVED'),
    toStatus: 'VEHICLE_ALLOCATED',
    requestedFields: { vehicleId: 'V101', assignedEmployeeUid: 'emp-1' },
  });
  assert.equal(withFields.allowed, true);
});

test('only the assigned employee may advance their own mission', () => {
  const notAssigned = evaluateMissionTransition({
    actor: actor('employee', { uid: 'someone-else' }),
    mission: mission('HANDED_OVER', { assignedEmployeeUid: 'emp-1' }),
    toStatus: 'READY',
  });
  assert.equal(notAssigned.allowed, false);
  assert.equal(notAssigned.code, 'OWNERSHIP_MISMATCH');

  const assigned = evaluateMissionTransition({
    actor: actor('employee', { uid: 'emp-1' }),
    mission: mission('HANDED_OVER', { assignedEmployeeUid: 'emp-1' }),
    toStatus: 'READY',
  });
  assert.equal(assigned.allowed, true);
});

test('the full happy path is walkable end to end', () => {
  const steps = [
    ['DRAFT', 'PENDING_APPROVAL', 'department_head'],
    ['PENDING_APPROVAL', 'APPROVED', 'administrative_affairs'],
    ['APPROVED', 'VEHICLE_ALLOCATED', 'mobility_head'],
    ['VEHICLE_ALLOCATED', 'HANDED_OVER', 'mobility_head'],
    ['HANDED_OVER', 'READY', 'employee'],
    ['READY', 'IN_PROGRESS', 'employee'],
    ['IN_PROGRESS', 'COMPLETED', 'employee'],
    ['COMPLETED', 'AWAITING_RETURN', 'employee'],
    ['AWAITING_RETURN', 'CLOSED', 'mobility_head'],
  ];
  for (const [from, to, role] of steps) {
    const decision = evaluateMissionTransition({
      actor: actor(role, { uid: role === 'department_head' ? 'dept-head-uid' : role === 'employee' ? 'emp-1' : `${role}-uid` }),
      mission: mission(from, { createdByUid: 'dept-head-uid', assignedEmployeeUid: 'emp-1' }),
      toStatus: to,
      requestedFields: { vehicleId: 'V101', assignedEmployeeUid: 'emp-1' },
    });
    assert.equal(decision.allowed, true, `${from} -> ${to} by ${role} should be allowed: ${decision.code}`);
  }
});

test('an incident hold can be resumed by either the employee or mobility head', () => {
  for (const [role, uid] of [['employee', 'emp-1'], ['mobility_head', 'mobility_head-uid']]) {
    const decision = evaluateMissionTransition({
      actor: actor(role, { uid }),
      mission: mission('INCIDENT_HOLD', { assignedEmployeeUid: 'emp-1' }),
      toStatus: 'IN_PROGRESS',
    });
    assert.equal(decision.allowed, true, `${role} should be able to resume`);
  }
});

test('a closed mission accepts no further transitions', () => {
  const decision = evaluateMissionTransition({
    actor: actor('mobility_head'),
    mission: mission('CLOSED'),
    toStatus: 'IN_PROGRESS',
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'INVALID_TRANSITION');
});

test('a cross-organization actor is denied regardless of role', () => {
  const decision = evaluateMissionTransition({
    actor: actor('administrative_affairs', { organizationId: ORG_B }),
    mission: mission('PENDING_APPROVAL'),
    toStatus: 'APPROVED',
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'ORGANIZATION_SCOPE_DENIED');
});

test('an unsupported status is rejected outright', () => {
  const decision = evaluateMissionTransition({
    actor: actor('mobility_head'),
    mission: mission('SOMETHING_MADE_UP'),
    toStatus: 'IN_PROGRESS',
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'UNSUPPORTED_STATUS');
});

console.log('mission workflow policy OK');
