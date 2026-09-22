'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const login=read('login.html');
const page=read('admin-affairs.html');
const runtime=read('admin-affairs-runtime.js');
const users=read('api/admin/users.js');

test('Administrative Affairs head and employee share one institutional workspace',()=>{
  assert.match(login,/canonicalAdministrativePath/);
  assert.match(login,/['department_head','employee'].includes(institutionalRole)/);
  assert.match(login,/admin-affairs.html/);
  assert.match(page,/إدارة الشؤون الإدارية/);
});

test('Administrative Affairs employee is read-only in the client',()=>{
  assert.match(runtime,/state.readOnly=d.institutionalRole==='employee'/);
  assert.match(runtime,/state.readOnly?'—'/);
  assert.match(runtime,/!state.readOnly&&m.status==='PENDING_APPROVAL'/);
  assert.match(runtime,/!state.readOnly&&a.status==='PENDING_AUTHORIZATION'/);
});

test('Administrative Affairs employee has a distinct trusted read role server-side',()=>{
  assert.match(users,/administrative_affairs_employee/);
  assert.match(users,/['mobility_head', 'department_head', 'administrative_affairs', 'administrative_affairs_employee', 'employee']/);
});

test('Sensitive Administrative Affairs mutations remain head-only',()=>{
  const updateStart=users.indexOf("if (action === 'administrativeUpdateEmployee')");
  const updateBlock=users.slice(updateStart,updateStart+1800);
  assert.match(updateBlock,/['administrative_affairs']/);
  const decideStart=users.indexOf("if (action === 'decideMobilityMission')");
  const decideBlock=users.slice(decideStart,decideStart+1800);
  assert.match(decideBlock,/['administrative_affairs']/);
  const authStart=users.indexOf("if (action === 'decideVehicleAuthorization')");
  const authBlock=users.slice(authStart,authStart+1800);
  assert.match(authBlock,/['administrative_affairs']/);
});
