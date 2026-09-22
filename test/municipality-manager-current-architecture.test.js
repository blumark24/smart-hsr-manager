'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const manager=read('manager.html');
const core=read('manager-phase11c-user-center-core.js');
const dialogs=read('manager-phase11c-user-center-dialogs.js');
const enhancements=read('manager-phase11d-user-center-enhancements.js');
const employeesApi=read('api/admin/employees.js');
const usersApi=read('api/admin/users.js');
const contractorsPage=read('contractors-registry.html');

test('manager shell exposes the approved municipal administration routes',()=>{
  for(const route of ['home','survey','lands','mobility','observations','map','reports','users']){
    assert.match(manager,new RegExp('data-manager-view="'+route+'"'));
  }
  assert.match(manager,/إدارة الحصر الميداني/);
  assert.match(manager,/إدارة الأراضي والممتلكات/);
  assert.match(manager,/إدارة حركة السير/);
});

test('current User Center owns employee identity and account editing',()=>{
  assert.match(dialogs,/ملف الموظف/);
  assert.match(dialogs,/البيانات الأساسية/);
  assert.match(dialogs,/الحساب والأمان/);
  assert.match(dialogs,/المنتجات والصلاحيات/);
  assert.match(dialogs,/changeLoginEmail/);
  assert.match(dialogs,/updateProfile/);
  assert.match(dialogs,/activateAccount/);
  assert.match(dialogs,/setPassword/);
});

test('employee email is editable in profile but account identity changes use trusted endpoint',()=>{
  assert.match(dialogs,/id="edit-email"|edit-email/);
  assert.match(employeesApi,/case 'changeLoginEmail':/);
  assert.match(employeesApi,/employee_login_email_change/);
  assert.match(enhancements,/تحديث موحّد للهوية وسجل الموظف/);
});

test('manager account operations remain available through trusted users API',()=>{
  assert.match(usersApi,/case 'setPassword':/);
  assert.match(usersApi,/case 'setActive':/);
  assert.match(usersApi,/case 'revokeSessions':/);
  assert.match(usersApi,/owner_or_manager_required|manager_required/);
});

test('institutional identity remains separate from product entitlements',()=>{
  assert.match(core,/institutionalRole/);
  assert.match(core,/fieldHead=role==='department_head'/);
  assert.doesNotMatch(core,/x\.mobility=\{enabled:true,role:'department_head'\}/);
});

test('contractors are managed outside the municipal employee registry',()=>{
  assert.match(enhancements,/data-open-contractors/);
  assert.match(enhancements,/contractors-registry\.html/);
  assert.doesNotMatch(enhancements,/data-add-contractor/);
  assert.match(contractorsPage,/الشركات منفصلة عن موظفي البلدية/);
});

test('manager surfaces retain current operational integrations',()=>{
  assert.match(manager,/manager-lands|lands/i);
  assert.match(manager,/mobility/i);
  assert.match(manager,/manager-users-mount/);
});
