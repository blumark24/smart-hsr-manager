'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createVehicleContract, validateVehicleContract } = require('../platform/contracts/vehicle-contract');

function base(overrides = {}) {
  return {
    vehicleId: 'V101', organizationId: 'org-a', status: 'AVAILABLE',
    createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z', ...overrides,
  };
}

test('a well-formed available vehicle is valid', () => {
  const { decision } = createVehicleContract(base());
  assert.equal(decision.allowed, true);
});

test('an unsupported status is rejected', () => {
  const decision = validateVehicleContract(base({ status: 'FLYING' }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'VEHICLE_STATUS_UNSUPPORTED');
});

test('a reserved vehicle without a mission commitment is rejected', () => {
  const decision = validateVehicleContract(base({ status: 'RESERVED' }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'VEHICLE_COMMITMENT_REQUIRED');
});

test('an available vehicle carrying a stale mission commitment is rejected', () => {
  const decision = validateVehicleContract(base({ assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'VEHICLE_COMMITMENT_STALE');
});

test('a reserved vehicle with a proper commitment is valid', () => {
  const decision = validateVehicleContract(base({ status: 'RESERVED', assignedEmployeeUid: 'emp-1', currentMissionId: 'm-1' }));
  assert.equal(decision.allowed, true);
});

console.log('vehicle contract OK');
