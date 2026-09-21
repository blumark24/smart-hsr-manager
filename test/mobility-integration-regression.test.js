'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const usersApi = fs.readFileSync(path.join(root, 'api/admin/users.js'), 'utf8');
const mission = require('../platform/policies/mission-workflow-policy');
const vehicle = require('../platform/policies/vehicle-workflow-policy');
const incident = require('../platform/policies/incident-workflow-policy');
const authorization = require('../platform/policies/vehicle-authorization-policy');

test('Mission lifecycle preserves institutional role separation', () => {
  const org = 'org-1';
  const deptHead = { uid:'dh', role:'department_head', organizationId:org };
  const admin = { uid:'aa', role:'administrative_affairs', organizationId:org };
  const mobilityHead = { uid:'mh', role:'mobility_head', organizationId:org };
  const employee = { uid:'emp', role:'employee', organizationId:org };

  assert.equal(mission.evaluateMissionTransition({
    actor:deptHead,
    mission:{ status:'DRAFT', organizationId:org, createdByUid:'dh' },
    toStatus:'PENDING_APPROVAL'
  }).allowed, true);

  assert.equal(mission.evaluateMissionTransition({
    actor:admin,
    mission:{ status:'PENDING_APPROVAL', organizationId:org },
    toStatus:'APPROVED'
  }).allowed, true);

  assert.equal(mission.evaluateMissionTransition({
    actor:mobilityHead,
    mission:{ status:'APPROVED', organizationId:org },
    toStatus:'VEHICLE_ALLOCATED',
    requestedFields:{ vehicleId:'v1', assignedEmployeeUid:'emp' }
  }).allowed, true);

  assert.equal(mission.evaluateMissionTransition({
    actor:employee,
    mission:{ status:'HANDED_OVER', organizationId:org, assignedEmployeeUid:'emp' },
    toStatus:'READY'
  }).allowed, true);

  assert.equal(mission.evaluateMissionTransition({
    actor:employee,
    mission:{ status:'COMPLETED', organizationId:org, assignedEmployeeUid:'emp' },
    toStatus:'AWAITING_RETURN'
  }).allowed, true);

  assert.equal(mission.evaluateMissionTransition({
    actor:mobilityHead,
    mission:{ status:'AWAITING_RETURN', organizationId:org },
    toStatus:'CLOSED'
  }).allowed, true);
});

test('Vehicle lifecycle prevents stale or conflicting commitments', () => {
  assert.equal(vehicle.evaluateVehicleTransition({
    actor:{uid:'mh',role:'mobility_head',organizationId:'org-1'},
    vehicle:{status:'AVAILABLE',organizationId:'org-1'},
    toStatus:'RESERVED',
    requestedFields:{assignedEmployeeUid:'emp',currentMissionId:'m1'},
    assignedEmployee:{organizationId:'org-1',active:true,role:'employee',vehicleEligible:true}
  }).allowed, true);

  assert.equal(vehicle.evaluateVehicleTransition({
    actor:{uid:'mh',role:'mobility_head',organizationId:'org-1'},
    vehicle:{status:'MAINTENANCE',organizationId:'org-1'},
    toStatus:'RESERVED',
    requestedFields:{assignedEmployeeUid:'emp',currentMissionId:'m1'},
    assignedEmployee:{organizationId:'org-1',active:true,role:'employee',vehicleEligible:true}
  }).allowed, false);
});

test('Vehicle authorization separates Administrative Affairs from Mobility Head', () => {
  const pending={organizationId:'org-1',status:'PENDING_AUTHORIZATION'};
  assert.equal(authorization.evaluateVehicleAuthorizationTransition({
    actor:{uid:'aa',role:'administrative_affairs',organizationId:'org-1'},
    authorization:pending,toStatus:'AUTHORIZED'
  }).allowed,true);

  assert.equal(authorization.evaluateVehicleAuthorizationTransition({
    actor:{uid:'mh',role:'mobility_head',organizationId:'org-1'},
    authorization:pending,toStatus:'AUTHORIZED'
  }).allowed,false);
});

test('Incident lifecycle is employee-report then Mobility-head resolution', () => {
  assert.equal(incident.canCreateIncident({
    actor:{uid:'emp',role:'employee',organizationId:'org-1'},
    mission:{organizationId:'org-1',assignedEmployeeUid:'emp',status:'IN_PROGRESS'}
  }).allowed,true);

  assert.equal(incident.evaluateIncidentTransition({
    actor:{uid:'mh',role:'mobility_head',organizationId:'org-1'},
    incident:{organizationId:'org-1',status:'NEW'},
    toStatus:'ACKNOWLEDGED'
  }).allowed,true);
});

test('Trusted server bridge owns allocation, handover, employee execution and final return', () => {
  for (const action of [
    "action === 'allocateVehicle'",
    "action === 'handoverVehicle'",
    "action === 'employeeAdvanceMission'",
    "action === 'employeeReturnVehicle'",
    "action === 'confirmVehicleReturn'",
    "action === 'createIncident'"
  ]) assert.ok(usersApi.includes(action), 'missing trusted action: '+action);
});
