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

test('contractors have a dedicated registry surface',()=>{
  assert.match(page,/سجل الشركات والعقود/);
  assert.match(page,/الشركات منفصلة عن موظفي البلدية/);
  assert.match(runtime,/listFieldContractorCompanies/);
  assert.match(runtime,/updateFieldContractorCompany/);
  assert.match(runtime,/archiveFieldContractorCompany/);
});

test('municipal employee registry excludes contractor records',()=>{
  assert.match(center,/const records = employees\.map\(employee => \(\{ kind:'employee', employee \}\)\)/);
  assert.match(center,/user\.role==='contractor'/);
  assert.match(center,/data-open-contractors/);
  assert.doesNotMatch(center,/data-add-contractor/);
  assert.doesNotMatch(center,/kpiCard\('contractors'/);
});

test('manager can edit contractor profile without rewriting employee registry',()=>{
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
  assert.match(users,/action: 'archive_contractor_company'/);
  assert.doesNotMatch(users,/deleteUser\(contractorUid\)/);
});

test('registry keeps tenant boundary manager-only',()=>{
  const actions=['listFieldContractorCompanies','updateFieldContractorCompany','archiveFieldContractorCompany'];
  for(const action of actions){
    const start=users.indexOf("action === '"+action+"'");
    assert.notEqual(start,-1);
    const block=users.slice(start,start+1600);
    assert.match(block,/caller\.isManager/);
    assert.match(block,/caller\.role !== 'manager'/);
    assert.match(block,/caller\.organizationId/);
  }
});
