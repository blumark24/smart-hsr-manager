'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { VEHICLE_STATUSES, evaluateVehicleTransition } = require('../platform/policies/vehicle-workflow-policy');

const ORG_A = 'org-a';

function actor(role, overrides = {}) {
  return { uid: `${role}-uid`, role, organizationId: ORG_A, ...overrides };
}
function vehicle(status, overrides = {}) {
  return { organizationId: ORG_A, status, ...overrides };
}

test('every canonical vehicle status is unique and non-empty', () => {
  const seen = new Set();
  for (const status of VEHICLE_STATUSES) {
    assert.ok(status.length > 0);
    assert.equal(seen.has(status), false);
    seen.add(status);
  }
});

test('mobility_head cannot reserve a vehicle without assignedEmployeeUid and currentMissionId', () => {
  const decision = evaluateVehicleTransition({
    actor: actor('mobility_head'), vehicle: vehicle('AVAILABLE'), toStatus: 'RESERVED',
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'REQUIRED_FIELDS_MISSING');
});

test('mobility_head reserves an available vehicle with the required fields', () => {
  const decision = evaluateVehicleTransition({
    actor: actor('mobility_head'), vehicle: vehicle('AVAILABLE'), toStatus: 'RESERVED',
    requestedFields: { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' },
  });
  assert.equal(decision.allowed, true);
});

test('a vehicle that is not AVAILABLE cannot be reserved (conflict prevention)', () => {
  for (const busyStatus of ['IN_MISSION', 'RETURN_PENDING', 'MAINTENANCE', 'OUT_OF_SERVICE']) {
    const decision = evaluateVehicleTransition({
      actor: actor('mobility_head'), vehicle: vehicle(busyStatus), toStatus: 'RESERVED',
      requestedFields: { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' },
    });
    assert.equal(decision.allowed, false, `${busyStatus} should not be reservable`);
    assert.equal(decision.code, 'INVALID_TRANSITION');
  }
});

test('only the assigned employee may return the vehicle they hold', () => {
  const notAssigned = evaluateVehicleTransition({
    actor: actor('employee', { uid: 'someone-else' }),
    vehicle: vehicle('IN_MISSION', { assignedEmployeeUid: 'emp-1' }),
    toStatus: 'RETURN_PENDING',
  });
  assert.equal(notAssigned.allowed, false);
  assert.equal(notAssigned.code, 'OWNERSHIP_MISMATCH');

  const assigned = evaluateVehicleTransition({
    actor: actor('employee', { uid: 'emp-1' }),
    vehicle: vehicle('IN_MISSION', { assignedEmployeeUid: 'emp-1' }),
    toStatus: 'RETURN_PENDING',
  });
  assert.equal(assigned.allowed, true);
});

test('the full fleet lifecycle is walkable end to end', () => {
  const steps = [
    ['AVAILABLE', 'RESERVED', 'mobility_head'],
    ['RESERVED', 'IN_MISSION', 'mobility_head'],
    ['IN_MISSION', 'RETURN_PENDING', 'employee'],
    ['RETURN_PENDING', 'AVAILABLE', 'mobility_head'],
  ];
  for (const [from, to, role] of steps) {
    const decision = evaluateVehicleTransition({
      actor: actor(role, { uid: role === 'employee' ? 'emp-1' : `${role}-uid` }),
      vehicle: vehicle(from, { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' }),
      toStatus: to,
      requestedFields: { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' },
    });
    assert.equal(decision.allowed, true, `${from} -> ${to} by ${role} should be allowed: ${decision.code}`);
  }
});

test('mobility_head can take an available vehicle out of service and back', () => {
  for (const outStatus of ['MAINTENANCE', 'OUT_OF_SERVICE']) {
    const out = evaluateVehicleTransition({ actor: actor('mobility_head'), vehicle: vehicle('AVAILABLE'), toStatus: outStatus });
    assert.equal(out.allowed, true);
    const back = evaluateVehicleTransition({ actor: actor('mobility_head'), vehicle: vehicle(outStatus), toStatus: 'AVAILABLE' });
    assert.equal(back.allowed, true);
  }
});

test('a cross-organization actor is denied regardless of role', () => {
  const decision = evaluateVehicleTransition({
    actor: actor('mobility_head', { organizationId: 'org-b' }),
    vehicle: vehicle('AVAILABLE'),
    toStatus: 'RESERVED',
    requestedFields: { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' },
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'ORGANIZATION_SCOPE_DENIED');
});

console.log('vehicle workflow policy OK');
