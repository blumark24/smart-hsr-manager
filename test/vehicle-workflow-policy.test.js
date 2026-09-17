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
// PHASE 06A hotfix — a valid allocation target must be a real, same-org,
// active, genuinely-Mobility-role employee with vehicleEligible === true;
// this is the "everything correct" baseline every positive test starts
// from, overridden per test to probe exactly one failure at a time.
function mobilityEmployee(overrides = {}) {
  return { organizationId: ORG_A, active: true, role: 'employee', vehicleEligible: true, ...overrides };
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

test('mobility_head reserves an available vehicle with the required fields (and confirmed vehicle eligibility)', () => {
  const decision = evaluateVehicleTransition({
    actor: actor('mobility_head'), vehicle: vehicle('AVAILABLE'), toStatus: 'RESERVED',
    requestedFields: { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' },
    assignedEmployee: mobilityEmployee(),
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
      // Only the allocate step (AVAILABLE -> RESERVED) is gated by
      // vehicleEligible; a confirmed-eligible employee lets the whole
      // lifecycle walk through unaffected by the Phase 03B.1 fail-safe.
      assignedEmployee: mobilityEmployee(),
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

// ---- Phase 03B.1 hotfix: vehicleEligible is fail-safe — ONLY an explicit
// true is eligible; missing/false/anything else denies a NEW allocation ----

test('vehicleEligible: true allows allocation', () => {
  const decision = evaluateVehicleTransition({
    actor: actor('mobility_head'), vehicle: vehicle('AVAILABLE'), toStatus: 'RESERVED',
    requestedFields: { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' },
    assignedEmployee: mobilityEmployee(),
  });
  assert.equal(decision.allowed, true);
});

test('vehicleEligible: an explicit false on the target employee denies allocation', () => {
  const decision = evaluateVehicleTransition({
    actor: actor('mobility_head'), vehicle: vehicle('AVAILABLE'), toStatus: 'RESERVED',
    requestedFields: { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' },
    assignedEmployee: mobilityEmployee({ vehicleEligible: false }),
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'VEHICLE_ELIGIBILITY_DENIED');
});

test('vehicleEligible: a record with no vehicleEligible field at all is denied (fail-safe default)', () => {
  const decision = evaluateVehicleTransition({
    actor: actor('mobility_head'), vehicle: vehicle('AVAILABLE'), toStatus: 'RESERVED',
    requestedFields: { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' },
    assignedEmployee: { organizationId: ORG_A, active: true, role: 'employee' },
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'VEHICLE_ELIGIBILITY_DENIED');
});

// ---- PHASE 06A hotfix: the target employee itself must be real, same-org,
// active, and a genuine Mobility role — not just vehicleEligible ----

test('PHASE 06A: a nonexistent/unverifiable target employee (assignedEmployee omitted) is denied', () => {
  const decision = evaluateVehicleTransition({
    actor: actor('mobility_head'), vehicle: vehicle('AVAILABLE'), toStatus: 'RESERVED',
    requestedFields: { assignedEmployeeUid: 'ghost-uid', currentMissionId: 'm-1' },
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'ASSIGNED_EMPLOYEE_NOT_FOUND');
});

test('PHASE 06A: a target employee from a different organization is denied, even if vehicleEligible', () => {
  const decision = evaluateVehicleTransition({
    actor: actor('mobility_head'), vehicle: vehicle('AVAILABLE'), toStatus: 'RESERVED',
    requestedFields: { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' },
    assignedEmployee: mobilityEmployee({ organizationId: 'org-b' }),
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'ASSIGNED_EMPLOYEE_ORGANIZATION_MISMATCH');
});

test('PHASE 06A: an inactive target employee is denied, even if vehicleEligible', () => {
  const decision = evaluateVehicleTransition({
    actor: actor('mobility_head'), vehicle: vehicle('AVAILABLE'), toStatus: 'RESERVED',
    requestedFields: { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' },
    assignedEmployee: mobilityEmployee({ active: false }),
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'ASSIGNED_EMPLOYEE_INACTIVE');
});

test('PHASE 06A: a target employee holding a non-Mobility role (e.g. a Field/Lands role) is denied, even if vehicleEligible', () => {
  for (const role of ['supervisor', 'inspector', 'contractor', 'lands_employee', 'lands_department_manager']) {
    const decision = evaluateVehicleTransition({
      actor: actor('mobility_head'), vehicle: vehicle('AVAILABLE'), toStatus: 'RESERVED',
      requestedFields: { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' },
      assignedEmployee: mobilityEmployee({ role }),
    });
    assert.equal(decision.allowed, false, `role ${role} must not be allocatable a vehicle`);
    assert.equal(decision.code, 'ASSIGNED_EMPLOYEE_NOT_MOBILITY_ROLE');
  }
});

test('PHASE 06A: each of the four real Mobility operational roles is a valid allocation target when otherwise eligible', () => {
  for (const role of ['mobility_head', 'department_head', 'administrative_affairs', 'employee']) {
    const decision = evaluateVehicleTransition({
      actor: actor('mobility_head'), vehicle: vehicle('AVAILABLE'), toStatus: 'RESERVED',
      requestedFields: { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' },
      assignedEmployee: mobilityEmployee({ role }),
    });
    assert.equal(decision.allowed, true, `role ${role} should be a valid allocation target: ${decision.code}`);
  }
});

test('vehicleEligible: an omitted assignedEmployee argument is denied (fail-safe default)', () => {
  const decision = evaluateVehicleTransition({
    actor: actor('mobility_head'), vehicle: vehicle('AVAILABLE'), toStatus: 'RESERVED',
    requestedFields: { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' },
  });
  assert.equal(decision.allowed, false, 'omitting eligibility data must never be silently treated as eligible');
  // PHASE 06A hotfix: an omitted target is now caught by the earlier,
  // broader "could not verify the target at all" check, before eligibility
  // is even reached — same fail-safe outcome, more specific reason.
  assert.equal(decision.code, 'ASSIGNED_EMPLOYEE_NOT_FOUND');
});

test('vehicleEligible: revocation (true -> false) denies a subsequent NEW allocation attempt', () => {
  const employee = mobilityEmployee();
  const firstAttempt = evaluateVehicleTransition({
    actor: actor('mobility_head'), vehicle: vehicle('AVAILABLE'), toStatus: 'RESERVED',
    requestedFields: { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' },
    assignedEmployee: employee,
  });
  assert.equal(firstAttempt.allowed, true);

  employee.vehicleEligible = false; // manager revokes eligibility
  const secondAttempt = evaluateVehicleTransition({
    actor: actor('mobility_head'), vehicle: vehicle('AVAILABLE'), toStatus: 'RESERVED',
    requestedFields: { assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' },
    assignedEmployee: employee,
  });
  assert.equal(secondAttempt.allowed, false);
  assert.equal(secondAttempt.code, 'VEHICLE_ELIGIBILITY_DENIED');
});

test('vehicleEligible removal only blocks a NEW allocation, never a transition where it is not passed (e.g. handover, return)', () => {
  const handover = evaluateVehicleTransition({
    actor: actor('mobility_head'), vehicle: vehicle('RESERVED'), toStatus: 'IN_MISSION',
    assignedEmployee: { vehicleEligible: false },
  });
  assert.equal(handover.allowed, true, 'vehicleEligible is only checked on the allocate transition, not on transitions of an already-allocated vehicle');
});

console.log('vehicle workflow policy OK');
