'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const users=read('api/admin/users.js');
const center=read('manager-phase11d-user-center-enhancements.js');
const page=read('contractors-registry.html');
const runtime=read('contractors-registry-runtime.js');
const manager=read('manager.html');
const login=read('login.html');

test('contracts data has a Municipality Manager supervisory surface',()=>{
  assert.match(manager,/data-manager-view="contracts"/);
  assert.match(manager,/viewIsContracts/);
  assert.match(manager,/listFieldContractorCompanies/);
  assert.match(manager,/سجل إشرافي داخل لوحة مدير البلدية/);
});

test('legacy contracts page is not a workforce route',()=>{
  assert.match(page,/إدارة العقود والشركات المتعاقدة/);
  assert.match(runtime,/listFieldContractorCompanies/);
  assert.doesNotMatch(login,/window\.location\.href\s*=\s*['"]contractors-registry\.html['"]/);
  assert.doesNotMatch(login,/canonicalContractsPath/);
});

test('municipal employee registry excludes contractor records',()=>{
  assert.match(center,/const records = employees\.map\(employee => \(\{ kind:'employee', employee \}\)\)/);
  assert.match(center,/user\.role==='contractor'/);
  assert.doesNotMatch(center,/data-open-contractors/);
  assert.doesNotMatch(center,/data-add-contractor/);
  assert.doesNotMatch(center,/kpiCard\('contractors'/);
});

test('only Municipality Manager receives contracts registry authority',()=>{
  const start=users.indexOf('async function getContractsRegistryCaller');
  const end=users.indexOf('function isFieldSurveyDepartment',start);
  const block=users.slice(start,end);
  assert.match(block,/manager\.isManager/);
  assert.match(block,/manager\.role === 'manager'/);
  assert.doesNotMatch(block,/contracts_head|contracts_employee/);
});

test('authorized contracts management edits contractor profile without rewriting employee registry',()=>{
  assert.match(users,/action === 'updateFieldContractorCompany'/);
  assert.match(users,/db\.collection\('contractorProfiles'\)\.doc\(contractorUid\)/);
  const start=users.indexOf("if (action === 'updateFieldContractorCompany')");
  const end=users.indexOf("if (action === 'archiveFieldContractorCompany')",start);
  const block=users.slice(start,end);
  assert.doesNotMatch(block,/collection\('employees'\)/);
});

test('archive is soft and blocked while contractor has open cases',()=>{
  assert.match(users,/action === 'archiveFieldContractorCompany'/);
  assert.match(users,/contractor_has_open_cases/);
  assert.match(users,/active: false/);
  assert.match(users,/status: 'ENDED'/);
});
