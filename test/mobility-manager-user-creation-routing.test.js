'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const manager=fs.readFileSync(path.join(root,'manager.html'),'utf8');
const employeesApi=fs.readFileSync(path.join(root,'api','admin','employees.js'),'utf8');
const authz=fs.readFileSync(path.join(root,'api','_lib','authz.js'),'utf8');

test('Manager Mobility user creation is employee-registry-backed, not standalone users-only',()=>{
  assert.match(manager,/if \(auKind === 'mobility'\)[\s\S]{0,2200}callAdminEmployeesApi\('create'/);
  assert.match(manager,/callAdminEmployeesApi\('activateAccount'/);
  assert.match(manager,/mobility: \{ enabled: true, role: auRole \}/);
  assert.match(manager,/vehicleEligible: false/);
  assert.doesNotMatch(manager,/if \(auKind === 'mobility'\)[\s\S]{0,2200}callAdminUsersApi\('create'/);
});

test('Mobility creation requires organizational home for routing and department scope',()=>{
  assert.match(manager,/الإدارة والقسم مطلوبان لمستخدم الحركة/);
  assert.match(manager,/auAdministration/);
  assert.match(manager,/auDepartment/);
  assert.match(manager,/institutionalRole = auRole === 'employee' \? 'employee' : 'department_head'/);
});

test('Registry activation mirrors department and Mobility role to the login identity',()=>{
  assert.match(employeesApi,/department: employee\.data\.department \|\| null/);
  assert.match(employeesApi,/institutionalRole: employee\.data\.institutionalRole \|\| 'employee'/);
  assert.match(employeesApi,/mobilityAccess: \{ enabled: true, role: mobilitySel\.role/);
});

test('Department-head authorization requires a real department',()=>{
  assert.match(authz,/\(isInstitutionalDepartmentHead \|\| isLegacyDepartmentHead\) && activeIsNotFalse\(d\) && orgId && dept/);
});
