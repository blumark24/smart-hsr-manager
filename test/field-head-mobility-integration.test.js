'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api', 'department-head', 'mobility.js'), 'utf8');
const policy = fs.readFileSync(path.join(root, 'platform', 'policies', 'mission-workflow-policy.js'), 'utf8');

test('field head exposes one institutional mobility request workflow without fleet ownership', () => {
  assert.match(page, /الحركة الميدانية لموظفي القسم/);
  assert.match(page, /اعتماد وإرسال للشؤون الإدارية/);
  assert.match(page, /إدارة حركة السير/);
  assert.match(page, /لا يدير الأسطول/);
  assert.match(page, /\/api\/department-head\/mobility/);
  assert.doesNotMatch(page, /addVehicle|createVehicle|deleteVehicle|setMaintenance/);
});

test('field head mobility API derives tenant and department from authenticated caller', () => {
  assert.match(api, /verifyRequestToken\(req\)/);
  assert.match(api, /getCallerContext\(decoded\.uid\)/);
  assert.match(api, /caller\.isDepartmentHead/);
  assert.match(api, /isFieldSurveyDepartment\(caller\.department\)/);
  assert.doesNotMatch(api, /body\.organizationId/);
  assert.doesNotMatch(api, /body\.department/);
});

test('vehicle request target must be a same-department active eligible mobility employee', () => {
  assert.match(api, /employee\.organizationId !== caller\.organizationId/);
  assert.match(api, /employee\.department/);
  assert.match(api, /employee\.accountStatus !== 'ACTIVE'/);
  assert.match(api, /mobility\.role !== 'employee'/);
  assert.match(api, /mobility\.vehicleEligible !== true/);
});

test('field head creates one shared mission and submits it to administrative affairs', () => {
  assert.match(api, /status: 'PENDING_APPROVAL'/);
  assert.match(api, /evaluateMissionTransition/);
  assert.match(api, /role: 'department_head'/);
  assert.match(api, /action: 'create_and_submit'/);
  assert.match(api, /toStatus: 'PENDING_APPROVAL'/);
  assert.match(api, /db\.batch\(\)/);
});

test('shared mission state machine preserves approved cross-department handoff', () => {
  assert.match(policy, /DRAFT/);
  assert.match(policy, /PENDING_APPROVAL/);
  assert.match(policy, /administrative_affairs/);
  assert.match(policy, /APPROVED/);
  assert.match(policy, /mobility_head/);
  assert.match(policy, /VEHICLE_ALLOCATED/);
  assert.match(policy, /AWAITING_RETURN/);
  assert.match(policy, /CLOSED/);
});
