'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const manager=read('manager.html');
const head=read('field-head-runtime.js');
const employee=read('dashboard.html');
const login=read('login.html');
const users=read('api/admin/users.js');

test('Field Survey manager surface is present and operationally separated',()=>{
  assert.match(manager,/الخدمات البلدية الرقمية · إدارة الحصر الميداني/);
  assert.match(manager,/الخريطة التشغيلية للحصر الميداني/);
  assert.match(manager,/إجمالي أعمال الحصر/);
  assert.match(manager,/المراقبون/);
});

test('Field Survey department head has the required operational workspaces',()=>{
  for(const label of ['مركز قيادة القسم','التشوه البصري','موظفو القسم','الحركة الميدانية','الخريطة التشغيلية','البلاغات العامة','سجل القسم']){
    assert.match(head,new RegExp(label));
  }
  assert.match(head,/getFieldVisualDistortionCommand/);
  assert.match(head,/listDepartmentMissions/);
  assert.match(head,/listFieldDepartmentAudit/);
});

test('Field Survey inspector has trusted capture and own-observation workspace',()=>{
  assert.match(employee,/role !== 'inspector'/);
  assert.match(employee,/where\('createdByUid', '==', inspectorContext\.uid\)/);
  assert.match(employee,/تحديد الموقع الحالي/);
  assert.match(employee,/رفع صورة الملاحظة/);
  assert.match(employee,/الخريطة الذكية لملاحظاتي/);
  assert.match(employee,/التوأم التشغيلي المصغّر/);
});

test('Visual Distortion closure preserves inspector verification then department-head closure',()=>{
  assert.match(employee,/action:'verifyFieldObservation'/);
  assert.match(users,/reporting_inspector_required/);
  assert.match(users,/inspector_verification_required/);
  assert.match(head,/close_visual_distortion_case/);
  assert.match(employee,/toggleHidden\('completeObservationBtn', true\)/);
});

test('Canonical Field identities route to one institutional workspace',()=>{
  assert.match(login,/canonicalFieldPath/);
  assert.match(login,/institutionalRole === 'department_head'\) window\.location\.href = 'department-head\.html'/);
  assert.match(login,/window\.location\.href = 'dashboard\.html'/);
});
