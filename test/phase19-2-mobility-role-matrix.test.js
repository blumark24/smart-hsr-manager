'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const manager=read('manager.html');
const runtime=read('mobility-runtime.js');
const page=read('department-head.html');
const login=read('login.html');
const users=read('api/admin/users.js');

test('Mobility manager surface exists with real operational KPIs',()=>{
  assert.match(manager,/إدارة حركة السير/);
  assert.match(manager,/mobilityKpiMissionsActive/);
  assert.match(manager,/mobilityKpiVehiclesAvailable/);
  assert.match(manager,/mobilityKpiIncidentsOpen/);
});

test('Mobility department head owns requests, not allocation or authorization',()=>{
  assert.match(runtime,/department_head/);
  assert.match(runtime,/طلبات المركبات ومهام موظفي القسم/);
  assert.match(runtime,/createMissionRequest/);
  assert.match(runtime,/submitMissionForApproval/);
  const headBlock=runtime.slice(runtime.indexOf("if (role === 'dept'"),runtime.indexOf("return originalNavFor",runtime.indexOf("if (role === 'dept'")));
  assert.doesNotMatch(headBlock,/allocateVehicle|decideVehicleAuthorization|handoverVehicle|confirmVehicleReturn/);
});

test('Mobility employee lifecycle is wired through trusted server actions',()=>{
  assert.match(runtime,/employeeAdvanceMission/);
  assert.match(runtime,/employeeReturnVehicle/);
  assert.match(runtime,/createIncident/);
  assert.match(users,/action === 'employeeAdvanceMission'/);
  assert.match(users,/action === 'employeeReturnVehicle'/);
  assert.match(users,/action === 'createIncident'/);
});

test('Traffic operations own allocation handover and return',()=>{
  assert.match(runtime,/allocateVehicle/);
  assert.match(runtime,/handoverMission/);
  assert.match(runtime,/confirmVehicleReturn/);
  assert.match(users,/action === 'allocateVehicle'/);
  assert.match(users,/action === 'handoverVehicle'/);
  assert.match(users,/action === 'confirmVehicleReturn'/);
});

test('Canonical Mobility identities route to Mobility mode',()=>{
  assert.match(login,/canonicalMobilityPath/);
  assert.match(login,/department-head\.html\?mode=mobility/);
});
