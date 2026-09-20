'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'field-head-runtime.js'), 'utf8');
const usersApi = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');
const policy = fs.readFileSync(path.join(root, 'platform', 'policies', 'mission-workflow-policy.js'), 'utf8');

test('field head reuses the existing trusted users API and adds no serverless endpoint', () => {
  assert.match(runtime, /fetch\('\/api\/admin\/users'/);
  assert.match(runtime, /api\('createMissionRequest'/);
  assert.match(runtime, /api\('submitMissionForApproval'/);
  assert.match(runtime, /api\('listDepartmentMissions'/);
  assert.equal(fs.existsSync(path.join(root, 'api', 'department-head', 'mobility.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'api', 'mobility', 'workflow.js')), false);
});

test('approved board preserves the institutional mobility workflow without fleet ownership', () => {
  assert.match(page, /حسب السياسة الحالية: رئيس القسم ← الشؤون الإدارية ← حركة السير ← تخصيص المركبة ← الموظف/);
  assert.doesNotMatch(runtime, /addVehicle|createVehicle|deleteVehicle|setMaintenance/);
});

test('mission request remains server-bound to an approved department employee', () => {
  assert.match(usersApi, /requestedEmployeeId/);
  assert.match(usersApi, /employee\.organizationId !== caller\.organizationId/);
  assert.match(usersApi, /cleanString\(employee\.department\) !== cleanString\(caller\.department\)/);
  assert.match(usersApi, /employee\.accountStatus !== 'ACTIVE'/);
  assert.match(usersApi, /mobility\.role !== 'employee'/);
  assert.match(usersApi, /mobility\.vehicleEligible !== true/);
});

test('department head draft submission still uses the shared mission state machine', () => {
  assert.match(usersApi, /action === 'submitMissionForApproval'/);
  assert.match(usersApi, /toStatus: 'PENDING_APPROVAL'/);
  assert.match(usersApi, /evaluateMissionTransition/);
  assert.match(policy, /department_head_is_creator/);
  assert.match(policy, /administrative_affairs/);
});
