'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const usersApi = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');
const missionPolicy = fs.readFileSync(path.join(root, 'platform', 'policies', 'mission-workflow-policy.js'), 'utf8');
const vehiclePolicy = fs.readFileSync(path.join(root, 'platform', 'policies', 'vehicle-workflow-policy.js'), 'utf8');

test('administrative affairs owns the approval decision', () => {
  assert.match(usersApi, /action === 'decideMobilityMission'/);
  assert.match(usersApi, /\['administrative_affairs'\]/);
  assert.match(usersApi, /\['APPROVED', 'REJECTED', 'DRAFT'\]/);
  assert.match(missionPolicy, /PENDING_APPROVAL/);
});

test('traffic owns allocation, handover and final return', () => {
  assert.match(usersApi, /action === 'allocateVehicle'/);
  assert.match(usersApi, /action === 'handoverVehicle'/);
  assert.match(usersApi, /action === 'confirmVehicleReturn'/);
  assert.match(usersApi, /approved_employee_mismatch/);
  assert.match(usersApi, /resourceType: 'vehicle'/);
  assert.match(vehiclePolicy, /AVAILABLE/);
  assert.match(vehiclePolicy, /RESERVED/);
  assert.match(vehiclePolicy, /IN_MISSION/);
  assert.match(vehiclePolicy, /RETURN_PENDING/);
});

test('employee owns mission execution and return transitions', () => {
  assert.match(usersApi, /action === 'employeeAdvanceMission'/);
  assert.match(usersApi, /action === 'employeeReturnVehicle'/);
  assert.match(usersApi, /\['READY', 'IN_PROGRESS', 'INCIDENT_HOLD', 'COMPLETED'\]/);
  assert.match(missionPolicy, /employee_is_assigned/);
  assert.match(missionPolicy, /AWAITING_RETURN/);
  assert.match(missionPolicy, /CLOSED/);
});

test('cross-product workflow derives operational organization from authenticated identities', () => {
  assert.match(usersApi, /getMobilityOperationalCaller\(db, decoded\.uid/);
  assert.match(usersApi, /getMobilityEmployeeCallerContext\(decoded\.uid\)/);
  assert.match(usersApi, /const organizationId = mobilityCaller\.organizationId/);
  assert.match(usersApi, /cross_organization_denied/);
});
