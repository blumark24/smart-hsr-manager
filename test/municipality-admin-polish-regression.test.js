'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const manager=read('manager.html');
const mark=read('smart-hsr-mark.svg');
const center=read('manager-phase11d-user-center-enhancements.js');
const employees=read('api/admin/employees.js');
const contractors=read('contractors-registry.html');

test('manager uses the approved SMART HSR mark from the department-head identity',()=>{
  assert.match(manager,/smart-hsr-mark\.svg/);
  assert.match(mark,/viewBox="0 0 76 84"/);
  assert.match(mark,/M38 4a30 30 0 1 0 0 60/);
  assert.match(mark,/M12 46 38 80 64 46/);
});

test('contracts and contractor companies are presented as the fifth institutional workspace',()=>{
  assert.match(contractors,/إدارة العقود والشركات المتعاقدة/);
  assert.match(contractors,/مسار مؤسسي خامس مستقل/);
  assert.doesNotMatch(center,/data-open-contractors/);
  assert.doesNotMatch(manager,/href="contractors-registry\.html"/);
  assert.match(manager,/data-manager-view="contracts"/);
});

test('employee grid exposes direct edit and safe remove actions',()=>{
  assert.match(center,/>تعديل<\/th><th class="ucv2-edit-head">حذف<\/th>/);
  assert.match(center,/data-open-employee/);
  assert.match(center,/data-remove-employee/);
  assert.match(center,/حذف \/ أرشفة الموظف/);
});

test('safe removal hard-deletes only an unused never-activated registry row',()=>{
  const start=employees.indexOf("case 'removeEmployee':");
  assert.notEqual(start,-1);
  const end=employees.indexOf("// ---- PHASE12C.5",start);
  const block=employees.slice(start,end);
  assert.match(block,/!hasLinkedAccount && !hasHistory/);
  assert.match(block,/ACCOUNT_STATUS\.NO_ACCOUNT/);
  assert.match(block,/await employee\.ref\.delete\(\)/);
  assert.match(block,/employee_delete_unused/);
});

test('safe removal archives identities with accounts or municipal history',()=>{
  const start=employees.indexOf("case 'removeEmployee':");
  const end=employees.indexOf("// ---- PHASE12C.5",start);
  const block=employees.slice(start,end);
  assert.match(block,/auth\.updateUser\(employee\.data\.authUid, \{ disabled: true \}\)/);
  assert.match(block,/employmentStatus: 'inactive'/);
  assert.match(block,/accountStatus: ACCOUNT_STATUS\.SUSPENDED/);
  assert.match(block,/action: 'employee_archive'/);
  assert.match(block,/employeeAssignments/);
  assert.match(block,/requestedEmployeeId/);
  assert.match(block,/directManagerEmployeeId/);
});
