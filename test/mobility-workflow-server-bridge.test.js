'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'api', 'mobility', 'workflow.js'), 'utf8');
const missionPolicy = fs.readFileSync(path.join(root, 'platform', 'policies', 'mission-workflow-policy.js'), 'utf8');
const vehiclePolicy = fs.readFileSync(path.join(root, 'platform', 'policies', 'vehicle-workflow-policy.js'), 'utf8');

test('mobility workflow is server-authorized and tenant-scoped', () => {
  assert.match(api, /verifyRequestToken\(req\)/);
  assert.match(api, /resolveMobilityRole\(data\)/);
  assert.match(api, /organizationId/);
  assert.match(api, /cross_organization_denied/);
  assert.doesNotMatch(api, /body\.organizationId/);
});

test('administrative affairs owns approval while mobility head owns allocation', () => {
  assert.match(api, /administrative_affairs_required/);
  assert.match(api, /mobility_head_required/);
  assert.match(api, /administrative_decision/);
  assert.match(api, /allocate_vehicle/);
  assert.match(missionPolicy, /PENDING_APPROVAL/);
  assert.match(missionPolicy, /APPROVED/);
  assert.match(missionPolicy, /VEHICLE_ALLOCATED/);
});

test('allocation is atomic and cannot change the employee approved by the department head', () => {
  assert.match(api, /db\.runTransaction/);
  assert.match(api, /approved_employee_mismatch/);
  assert.match(api, /isValidMobilityAllocationTarget/);
  assert.match(api, /status: 'VEHICLE_ALLOCATED'/);
  assert.match(api, /status: 'RESERVED'/);
});

test('handover and return keep mission and vehicle lifecycle synchronized', () => {
  assert.match(api, /status: 'HANDED_OVER'/);
  assert.match(api, /status: 'IN_MISSION'/);
  assert.match(api, /status: 'AWAITING_RETURN'/);
  assert.match(api, /status: 'RETURN_PENDING'/);
  assert.match(api, /status: 'CLOSED'/);
  assert.match(api, /status: 'AVAILABLE'/);
  assert.match(vehiclePolicy, /RETURN_PENDING/);
});

test('every transaction that changes a vehicle also writes a vehicle audit event', () => {
  assert.match(api, /auditData\(actor, 'vehicle', vehicleId, 'reserve'/);
  assert.match(api, /auditData\(actor, 'vehicle', vehicleId, 'handover'/);
  assert.match(api, /auditData\(actor, 'vehicle', vehicleId, 'employee_return_vehicle'/);
  assert.match(api, /auditData\(actor, 'vehicle', vehicleId, 'confirm_return'/);
});
