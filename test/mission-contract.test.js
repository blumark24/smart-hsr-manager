'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createMissionContract, validateMissionContract } = require('../platform/contracts/mission-contract');

function base(overrides = {}) {
  return {
    missionId: 'm-1', organizationId: 'org-a', department: 'الرقابة البلدية',
    createdByUid: 'dept-head-1', status: 'DRAFT', createdAt: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z', ...overrides,
  };
}

test('a well-formed draft mission is valid', () => {
  const { decision, mission } = createMissionContract(base());
  assert.equal(decision.allowed, true);
  assert.equal(mission.status, 'DRAFT');
});

test('a required field missing is rejected', () => {
  const decision = validateMissionContract(base({ department: '' }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'MISSION_FIELD_REQUIRED');
});

test('an unsupported status is rejected', () => {
  const decision = validateMissionContract(base({ status: 'NOT_A_REAL_STATUS' }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'MISSION_STATUS_UNSUPPORTED');
});

test('a mission past approval must carry vehicleId and assignedEmployeeUid', () => {
  const decision = validateMissionContract(base({ status: 'VEHICLE_ALLOCATED' }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'MISSION_ALLOCATION_REQUIRED');

  const withAllocation = validateMissionContract(base({
    status: 'VEHICLE_ALLOCATED', vehicleId: 'V101', assignedEmployeeUid: 'emp-1',
  }));
  assert.equal(withAllocation.allowed, true);
});

console.log('mission contract OK');
