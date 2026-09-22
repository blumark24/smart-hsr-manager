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

test('canonical Administrative Affairs head routes to the dedicated workspace',()=>{
  assert.match(login,/canonicalAdministrativePath/);
  assert.match(login,/mobilityRole === 'administrative_affairs'/);
  assert.match(login,/window\.location\.href = 'admin-affairs\.html'/);
  assert.doesNotMatch(login,/canonicalAdministrativePath[\s\S]{0,700}department-head\.html\?mode=mobility/);
});

test('dedicated workspace exposes only implemented V1 surfaces',()=>{
  assert.match(page,/إدارة الشؤون الإدارية/);
  assert.match(page,/data-view="overview"/);
  assert.match(page,/data-view="employees"/);
  assert.match(page,/data-view="missions"/);
  assert.match(page,/data-view="authorizations"/);
  assert.doesNotMatch(page,/إضافة موظف|نقل موظف|ترقية موظف/);
});

test('Administrative Affairs runtime fails closed on institutional identity',()=>{
  assert.match(runtime,/d\.institutionalRole==='department_head'/);
  assert.match(runtime,/الشؤون الإدارية\|الشؤون الادارية\|administrative/);
  assert.match(runtime,/mobility\.role==='administrative_affairs'/);
  assert.match(runtime,/location\.replace\('login\.html'\)/);
});

test('workspace uses trusted APIs for real approvals',()=>{
  assert.match(runtime,/api\('getMobilityWorkspace'\)/);
  assert.match(runtime,/api\('decideMobilityMission'/);
  assert.match(runtime,/api\('decideVehicleAuthorization'/);
  assert.doesNotMatch(runtime,/setDoc\(|addDoc\(|updateDoc\(|deleteDoc\(/);
});

test('Administrative Affairs gets safe municipality employee projection only',()=>{
  assert.match(users,/actor\.role === 'administrative_affairs'/);
  assert.match(users,/administration: cleanString\(d\.administration\)/);
  assert.match(users,/jobTitle: cleanString\(d\.jobTitle\)/);
  assert.match(users,/institutionalRole: cleanString\(d\.institutionalRole\)/);
  const start=users.indexOf("if (actor.role === 'department_head' || actor.role === 'mobility_head' || actor.role === 'administrative_affairs')");
  const end=users.indexOf("return sendJson(res, 200, {",start);
  const block=users.slice(start,end);
  assert.doesNotMatch(block,/email\s*:/);
  assert.doesNotMatch(block,/phone\s*:/);
  assert.doesNotMatch(block,/password/i);
});

test('V1 deliberately keeps HR mutation outside Administrative Affairs runtime',()=>{
  assert.doesNotMatch(runtime,/assignProducts|updateProfile|transfer|activateAccount|changeLoginEmail|setAccountStatus/);
  assert.match(page,/تعديل بيانات الموظف أو النقل والترقية يبقى خاضعًا لصلاحيات مؤسسية مستقلة/);
});


test('workspace has delivery-grade filtering and branded institutional shell',()=>{
  assert.match(page,/Smart_HSR_Dashboard_Logo\.svg/);
  assert.match(page,/id="employeeSearch"/);
  assert.match(page,/id="missionFilter"/);
  assert.match(page,/id="authorizationFilter"/);
  assert.match(page,/role="status" aria-live="polite"/);
  assert.match(runtime,/function applyFilters\(\)/);
  assert.match(runtime,/state\.filters\.missionStatus/);
  assert.match(runtime,/state\.filters\.authorizationStatus/);
  assert.match(runtime,/متصل · بيانات موثوقة/);
});
