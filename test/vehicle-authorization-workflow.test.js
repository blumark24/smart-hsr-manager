'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const usersApi = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'field-head-runtime.js'), 'utf8');
const {
  VEHICLE_AUTHORIZATION_STATUSES,
  evaluateVehicleAuthorizationTransition,
} = require('../platform/policies/vehicle-authorization-policy');

test('internal vehicle authorization has the approved lifecycle vocabulary', () => {
  assert.deepEqual(VEHICLE_AUTHORIZATION_STATUSES, [
    'PENDING_AUTHORIZATION', 'AUTHORIZED', 'ACTIVE', 'EXPIRED', 'REJECTED', 'REVOKED'
  ]);
});

test('administrative affairs authorizes while mobility activates and expires', () => {
  const auth = { organizationId:'org-1', status:'PENDING_AUTHORIZATION' };
  assert.equal(evaluateVehicleAuthorizationTransition({
    actor:{uid:'a',role:'administrative_affairs',organizationId:'org-1'},
    authorization:auth,toStatus:'AUTHORIZED'
  }).allowed, true);
  assert.equal(evaluateVehicleAuthorizationTransition({
    actor:{uid:'m',role:'mobility_head',organizationId:'org-1'},
    authorization:auth,toStatus:'AUTHORIZED'
  }).allowed, false);

  const approved = { organizationId:'org-1', status:'AUTHORIZED' };
  assert.equal(evaluateVehicleAuthorizationTransition({
    actor:{uid:'m',role:'mobility_head',organizationId:'org-1'},
    authorization:approved,toStatus:'ACTIVE'
  }).allowed, true);

  const active = { organizationId:'org-1', status:'ACTIVE' };
  assert.equal(evaluateVehicleAuthorizationTransition({
    actor:{uid:'m',role:'mobility_head',organizationId:'org-1'},
    authorization:active,toStatus:'EXPIRED'
  }).allowed, true);
});

test('allocation atomically creates the internal authorization request', () => {
  assert.match(usersApi, /collection\('vehicleAuthorizations'\)\.doc\(missionId\)/);
  assert.match(usersApi, /vehicleAuthorizationStatus: 'PENDING_AUTHORIZATION'/);
  assert.match(usersApi, /authorizationNumber = 'VA-'/);
  assert.match(usersApi, /action: 'create_vehicle_authorization_request'/);
});

test('administrative affairs owns authorization decision and rejection releases the reservation', () => {
  assert.match(usersApi, /action === 'decideVehicleAuthorization'/);
  assert.match(usersApi, /\['administrative_affairs'\]/);
  assert.match(usersApi, /\['AUTHORIZED', 'REJECTED', 'REVOKED'\]/);
  assert.match(usersApi, /status: 'APPROVED'/);
  assert.match(usersApi, /status: 'AVAILABLE'/);
  assert.match(usersApi, /action: 'authorization_release'/);
});

test('handover is blocked until authorization is approved then activates it', () => {
  assert.match(usersApi, /vehicle_authorization_required/);
  assert.match(usersApi, /toStatus: 'ACTIVE'/);
  assert.match(usersApi, /vehicleAuthorizationStatus: 'ACTIVE'/);
  assert.match(usersApi, /action: 'activate_vehicle_authorization'/);
});

test('confirmed vehicle return expires the internal authorization', () => {
  assert.match(usersApi, /toStatus: 'EXPIRED'/);
  assert.match(usersApi, /vehicleAuthorizationStatus: 'EXPIRED'/);
  assert.match(usersApi, /action: 'expire_vehicle_authorization'/);
});

test('department head sees authorization state but never owns allocation or authorization', () => {
  assert.match(usersApi, /vehicleAuthorizationNumber: data\.vehicleAuthorizationNumber/);
  assert.match(usersApi, /vehicleAuthorizationStatus: data\.vehicleAuthorizationStatus/);
  assert.match(runtime, /حالة التفويض/);
  assert.match(runtime, /بانتظار الاعتماد/);
  assert.match(runtime, /ساري/);
  assert.doesNotMatch(runtime, /decideVehicleAuthorization|allocateVehicle|handoverVehicle|confirmVehicleReturn/);
});
