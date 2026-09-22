'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root=path.join(__dirname,'..');
const login=fs.readFileSync(path.join(root,'login.html'),'utf8');
const workspace=fs.readFileSync(path.join(root,'workspace.html'),'utf8');
const switcher=fs.readFileSync(path.join(root,'service-switcher.js'),'utf8');
const employees=fs.readFileSync(path.join(root,'api/admin/employees.js'),'utf8');
const dashboard=fs.readFileSync(path.join(root,'dashboard.html'),'utf8');
const department=fs.readFileSync(path.join(root,'department-head.html'),'utf8');
const manager=fs.readFileSync(path.join(root,'manager.html'),'utf8');
const mobile=fs.readFileSync(path.join(root,'mobile-map.html'),'utf8');

test('multi-service login routes the same identity to one unified workspace',()=>{
  assert.match(login,/serviceCount\s*=\s*/);
  assert.match(login,/if \(serviceCount > 1\)/);
  assert.match(login,/signInWithEmailAndPassword\(auth, email, password\)/);
  assert.match(login,/window\.location\.href = 'workspace\.html'/);
  assert.doesNotMatch(login,/createUserWithEmailAndPassword/);
});

test('single-service routing remains direct and Lands keeps trusted SSO',()=>{
  assert.match(login,/if \(hasLandsRole && !hasFieldRole && !mobilityRole\)/);
  assert.match(login,/fetch\('\/api\/organization\/context'/);
  assert.match(login,/department-head\.html\?mode=mobility/);
  assert.match(login,/window\.location\.href = 'dashboard\.html'/);
});

test('workspace derives Field, Lands and Mobility from one users uid',()=>{
  assert.match(workspace,/getDoc\(doc\(db,'users',user\.uid\)\)/);
  assert.match(workspace,/FIELD_ROLES/);
  assert.match(workspace,/landsAccess/);
  assert.match(workspace,/mobilityAccess/);
  assert.match(workspace,/department-head\.html\?mode=mobility/);
  assert.match(workspace,/openLands\(user\)/);
});

test('workspace does not create or clone identities',()=>{
  assert.doesNotMatch(workspace,/createUser|createEmployee|employees\/|addDoc|setDoc/);
  assert.doesNotMatch(switcher,/createUser|createEmployee|addDoc|setDoc/);
});

test('employee registry prevents same-municipality duplicate person records',()=>{
  assert.match(employees,/ONE PERSON = ONE EMPLOYEE RECORD/);
  assert.match(employees,/employee_ref_already_exists/);
  assert.match(employees,/employee_email_already_exists/);
  assert.match(employees,/where\('organizationId', '==', organizationId\)/);
});

test('operational surfaces expose the same service switcher',()=>{
  for(const [name,source] of [
    ['dashboard',dashboard],['department-head',department],['manager',manager],['mobile-map',mobile]
  ]){
    assert.ok(source.includes('./service-switcher.js'), name+' missing service switcher');
  }
});

test('service switcher appears only when the same account has multiple workspaces',()=>{
  assert.match(switcher,/countServices\(d\)<2/);
  assert.match(switcher,/location\.href='workspace\.html'/);
  assert.match(switcher,/doc\(db,'users',user\.uid\)/);
});
