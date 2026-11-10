'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const login=read('login.html');
const manager=read('manager.html');
const users=read('api/admin/users.js');

test('Contracts is not a canonical workforce workspace',()=>{
  assert.doesNotMatch(login,/canonicalContractsPath/);
  assert.doesNotMatch(login,/window\.location\.href\s*=\s*['"]contractors-registry\.html['"]/);
  assert.doesNotMatch(login,/جارٍ فتح إدارة العقود والشركات المتعاقدة/);
});

test('Municipality Manager owns the contracts supervisory module',()=>{
  assert.match(manager,/data-manager-view="contracts"/);
  assert.match(manager,/viewIsContracts/);
  assert.match(manager,/إدارة العقود والشركات المتعاقدة/);
  assert.match(manager,/سجل إشرافي داخل لوحة مدير البلدية/);
  assert.match(manager,/دون فتح صفحة مستقلة أو شاشة تشغيل رئيس قسم/);
});

test('Contracts registry backend authority is Municipality Manager only',()=>{
  const start=users.indexOf('async function getContractsRegistryCaller');
  const end=users.indexOf('function isFieldSurveyDepartment',start);
  assert.notEqual(start,-1);
  const block=users.slice(start,end);
  assert.match(block,/manager\.isManager/);
  assert.match(block,/manager\.role === 'manager'/);
  assert.match(block,/return null/);
  assert.doesNotMatch(block,/institutionalRole === 'department_head'/);
  assert.doesNotMatch(block,/db\.collection\('users'\)/);
});

test('Contractor company mutations remain manager-gated',()=>{
  for(const action of ['createFieldContractorCompany','updateFieldContractorCompany','archiveFieldContractorCompany']){
    const start=users.indexOf(`if (action === '${action}')`);
    assert.notEqual(start,-1,action+' missing');
    const block=users.slice(start,start+1800);
    assert.match(block,/getContractsRegistryCaller/);
    assert.match(block,/!caller \|\| !caller\.canManage/);
    assert.match(block,/municipality_manager_required/);
  }
});

test('Contractors remain external identities, never municipal employees',()=>{
  assert.match(users,/role: 'contractor'/);
  assert.match(users,/collection\('contractorProfiles'\)/);
});
