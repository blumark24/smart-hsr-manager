'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const core=read('manager-phase11c-user-center-core.js');
const dialogs=read('manager-phase11c-user-center-dialogs.js');
const employees=read('api/admin/employees.js');
const adminPage=read('admin-affairs.html');
const adminRuntime=read('admin-affairs-runtime.js');
const users=read('api/admin/users.js');

test('add/edit employee uses one institutional role and a separate permissions step',()=>{
  assert.match(dialogs,/الصلاحيات والخدمات/);
  assert.match(dialogs,/U\.permissions\('employee'\)/);
  assert.match(dialogs,/الدور المؤسسي','inst-role'/);
  assert.match(dialogs,/const stepTitles=\['البيانات الأساسية','التعيين المؤسسي','الصلاحيات والخدمات','حساب الدخول والمراجعة'\]/);
  const pane3Start=dialogs.indexOf('const pane3=');
  const pane4Start=dialogs.indexOf('const pane4=',pane3Start);
  const pane3=dialogs.slice(pane3Start,pane4Start);
  assert.match(pane3,/U\.permissions\('employee'\)/);
  assert.doesNotMatch(pane3,/U\.roles\(/);
  assert.match(core,/U\.permissions=/);
  assert.match(core,/خيار مستقل: نعم أو لا/);
});

test('direct manager candidates are constrained to institutional leaders',()=>{
  assert.match(core,/U\.managerOptions=/);
  assert.match(core,/\['manager','general_supervisor','department_head'\]/);
  assert.match(core,/direct_manager_role_not_allowed|managerOptions/);
  assert.match(employees,/validateDirectManagerChoice/);
  assert.match(employees,/direct_manager_role_not_allowed/);
  assert.match(employees,/direct_manager_cross_department/);
});

test('create and edit persist institutional role with the employee registry',()=>{
  assert.match(dialogs,/institutionalRole:roleSelect\.value/);
  assert.match(dialogs,/action:'transfer'[\s\S]{0,300}institutionalRole:c\.querySelector\('#inst-role'\)\.value/);
  assert.match(employees,/const \{ employeeId, administration, department, directManagerEmployeeId, institutionalRole \} = body/);
  assert.match(employees,/update\.institutionalRole = nextRole/);
});

test('administrative affairs works only with internal employee registry and controlled fields',()=>{
  assert.match(adminPage,/الموظفون الداخليون/);
  assert.match(adminPage,/تعديل إداري محكوم/);
  assert.match(adminPage,/بدون المقاولين/);
  assert.match(users,/action === 'administrativeUpdateEmployee'/);
  const start=users.indexOf("action === 'administrativeUpdateEmployee'");
  const end=users.indexOf("if (action === 'listMobilityMissions')",start);
  const block=users.slice(start,end);
  assert.match(block,/jobTitle/);
  assert.match(block,/employmentStatus/);
  assert.match(block,/vehicleEligible/);
  assert.doesNotMatch(block,/password|deleteUser|contractorProfiles/);
});

test('administrative decisions support notes audit and printing',()=>{
  assert.match(adminPage,/سجل الإجراءات/);
  assert.match(adminPage,/id="printPage"/);
  assert.match(adminPage,/id="decisionDlg"/);
  assert.match(adminRuntime,/decisionNote/);
  assert.match(adminRuntime,/window\.print\(\)/);
  assert.match(users,/administrativeNote/);
  assert.match(users,/administrativeAudit/);
});
