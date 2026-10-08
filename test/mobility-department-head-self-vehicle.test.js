'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const api=fs.readFileSync(path.join(root,'api','admin','users.js'),'utf8');
const runtime=fs.readFileSync(path.join(root,'mobility-runtime.js'),'utf8');
const page=fs.readFileSync(path.join(root,'department-head.html'),'utf8');

test('eligible department head may request a vehicle for self without changing institutional role',()=>{
  assert.match(api,/assignSelf/);
  assert.match(api,/department_head_vehicle_eligibility_required/);
  assert.match(api,/selfOperator\.role !== 'department_head'/);
  assert.match(api,/selfOperator\.capabilities\.includes\('vehicle\.drive'\)/);
  assert.match(api,/requestedBySelf: true/);
});

test('approved beneficiary stays authoritative during allocation',()=>{
  assert.match(page,/m\.requestedUid \|\| this\.state\.form\.allocEmployeeUid/);
  assert.match(page,/مثبت في الطلب/);
  assert.match(api,/approved_employee_mismatch/);
});

test('department head gets a personal operator surface only when vehicle.drive is effective',()=>{
  assert.match(runtime,/mobilityCapabilities/);
  assert.match(runtime,/vehicle\.drive/);
  assert.match(runtime,/مركبتي ومهمتي/);
  assert.match(page,/s === 'emp' \|\| s === 'myvehicle'/);
  assert.match(page,/M\.filter\(x => x\.assignedUid === st\.sessionUid \|\| x\.requestedUid === st\.sessionUid\)/);
  assert.doesNotMatch(page,/\? EM\.filter\(x => x\.assignedUid/);
});

test('trusted telemetry follows any assigned vehicle.drive operator, not employee role only',()=>{
  assert.match(runtime,/function activeTelemetryMission/);
  assert.match(runtime,/workspace\.capabilities\.includes\('vehicle\.drive'\)/);
  assert.doesNotMatch(runtime,/workspace\.role !== 'employee'/);
});
