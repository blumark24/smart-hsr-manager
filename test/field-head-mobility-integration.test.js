'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'field-head-runtime.js'), 'utf8');
const fieldHead = page + '\n' + runtime;
const usersApi = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');
const policy = fs.readFileSync(path.join(root, 'platform', 'policies', 'mission-workflow-policy.js'), 'utf8');

test('field head uses the existing trusted admin API instead of adding a serverless function', () => {
  assert.match(fieldHead, /fetch\("\/api\/admin\/users"/);
  assert.match(fieldHead, /action:"createMissionRequest"/);
  assert.match(fieldHead, /action:"submitMissionForApproval"/);
  assert.match(fieldHead, /action:"listDepartmentMissions"/);
  assert.equal(fs.existsSync(path.join(root, 'api', 'department-head', 'mobility.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'api', 'mobility', 'workflow.js')), false);
});

test('field head exposes one institutional mobility workflow without fleet ownership', () => {
  assert.match(fieldHead, /الحركة الميدانية لموظفي القسم/);
  assert.match(fieldHead, /اعتماد وإرسال للشؤون الإدارية/);
  assert.match(fieldHead, /إدارة حركة السير/);
  assert.match(fieldHead, /لا يدير الأسطول/);
  assert.doesNotMatch(fieldHead, /addVehicle|createVehicle|deleteVehicle|setMaintenance/);
});

test('mission request binds the approved employee server-side', () => {
  assert.match(usersApi, /requestedEmployeeId/);
  assert.match(usersApi, /employee\.organizationId !== caller\.organizationId/);
  assert.match(usersApi, /cleanString\(employee\.department\) !== cleanString\(caller\.department\)/);
  assert.match(usersApi, /employee\.accountStatus !== 'ACTIVE'/);
  assert.match(usersApi, /mobility\.role !== 'employee'/);
  assert.match(usersApi, /mobility\.vehicleEligible !== true/);
  assert.match(usersApi, /requestedEmployeeUid: requestedEmployee\.uid/);
});

test('field head submits its own draft to administrative affairs using the shared mission state machine', () => {
  assert.match(usersApi, /action === 'submitMissionForApproval'/);
  assert.match(usersApi, /toStatus: 'PENDING_APPROVAL'/);
  assert.match(usersApi, /evaluateMissionTransition/);
  assert.match(policy, /department_head_is_creator/);
  assert.match(policy, /administrative_affairs/);
});
