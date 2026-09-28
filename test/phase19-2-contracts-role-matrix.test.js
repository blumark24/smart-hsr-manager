'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const login=read('login.html');
const page=read('contractors-registry.html');
const runtime=read('contractors-registry-runtime.js');
const users=read('api/admin/users.js');

test('Contracts administration is a canonical institutional path',()=>{
  assert.match(login,/canonicalContractsPath/);
  assert.match(login,/contractors-registry\.html/);
  assert.match(page,/إدارة العقود والشركات المتعاقدة/);
});

test('Contracts registry distinguishes manager head and employee authority',()=>{
  assert.match(users,/getContractsRegistryCaller/);
  assert.match(users,/contracts_head/);
  assert.match(users,/contracts_employee/);
  assert.match(users,/canManage/);
});

test('Contracts employee is read-only in the client',()=>{
  assert.match(runtime,/state\.canManage=d\.canManage===true/);
  assert.match(runtime,/state\.canManage\?'<button class="btn" data-edit=/);
  assert.match(runtime,/if\(!state\.canManage\)return/);
});

test('Contracts mutations require manager or contracts head server-side',()=>{
  for(const action of ['createFieldContractorCompany','updateFieldContractorCompany','archiveFieldContractorCompany']){
    const start=users.indexOf(`if (action === '${action}')`);
    assert.notEqual(start,-1,action+' missing');
    const block=users.slice(start,start+1000);
    assert.match(block,/!caller\.canManage/);
  }
});

test('Contractors remain external identities, never municipal employees',()=>{
  assert.match(users,/role: 'contractor'/);
  assert.match(users,/collection\('contractorProfiles'\)/);
  assert.doesNotMatch(runtime,/collection\('employees'\)/);
});
