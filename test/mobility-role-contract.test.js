'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MOBILITY_ROLES,
  MOBILITY_ROLE_VALUES,
  getMobilityRoleAuthority,
  evaluateMobilityRoleAuthority,
} = require('../platform/contracts/mobility-role-contract');

test('canonical Smart Mobility roles match the five approved role experiences', () => {
  assert.deepEqual(MOBILITY_ROLE_VALUES, [
    'manager', 'mobility_head', 'department_head', 'administrative_affairs', 'employee',
  ]);
  assert.equal(MOBILITY_ROLES.MUNICIPALITY_MANAGER, 'manager');
});

test('mobility head can allocate vehicles and assign employees but not approve requests', () => {
  const authority = getMobilityRoleAuthority('mobility_head');
  assert.equal(authority.canAllocateVehicle, true);
  assert.equal(authority.canAssignEmployee, true);
  assert.equal(authority.canApproveMissionRequest, false);
});

test('department head is department-scoped and can only create mission requests', () => {
  const authority = getMobilityRoleAuthority('department_head');
  assert.equal(authority.organizationScope, 'department');
  assert.equal(authority.canCreateMissionRequest, true);
  assert.equal(authority.canAllocateVehicle, false);
  assert.equal(authority.canApproveMissionRequest, false);
});

test('administrative affairs approves requests but holds no operational authority', () => {
  const authority = getMobilityRoleAuthority('administrative_affairs');
  assert.equal(authority.canApproveMissionRequest, true);
  assert.equal(authority.canAllocateVehicle, false);
  assert.equal(authority.canAssignEmployee, false);
});

test('employee can receive handover, return the vehicle, and report incidents, nothing more', () => {
  const authority = getMobilityRoleAuthority('employee');
  assert.equal(authority.canReceiveHandover, true);
  assert.equal(authority.canReturnVehicle, true);
  assert.equal(authority.canCreateIncidentReport, true);
  assert.equal(authority.canAllocateVehicle, false);
  assert.equal(authority.canApproveMissionRequest, false);
  assert.equal(authority.canManageUsers, false);
});

test('municipality manager retains user management but no operational fleet authority', () => {
  const authority = getMobilityRoleAuthority('manager');
  assert.equal(authority.canManageUsers, true);
  assert.equal(authority.canAllocateVehicle, false);
  assert.equal(authority.canApproveMissionRequest, false);
});

test('an unrecognized role is denied every capability', () => {
  const decision = evaluateMobilityRoleAuthority('mobility_intern', 'canAllocateVehicle');
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'ROLE_NOT_RECOGNIZED');
});

test('a recognized role denied a capability it does not hold gets a clear decision code', () => {
  const decision = evaluateMobilityRoleAuthority('employee', 'canAllocateVehicle');
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'ROLE_AUTHORITY_DENIED');
});

test('a recognized role granted a capability it holds is confirmed', () => {
  const decision = evaluateMobilityRoleAuthority('mobility_head', 'canAllocateVehicle');
  assert.equal(decision.allowed, true);
  assert.equal(decision.code, 'ROLE_AUTHORITY_CONFIRMED');
});
