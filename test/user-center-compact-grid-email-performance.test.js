'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const enh=fs.readFileSync(path.join(root,'manager-phase11d-user-center-enhancements.js'),'utf8');
const dialogs=fs.readFileSync(path.join(root,'manager-phase11c-user-center-dialogs.js'),'utf8');
const finalSkin=fs.readFileSync(path.join(root,'manager-phase11f-reference-ui.js'),'utf8');
const managerFormat=fs.readFileSync(path.join(root,'manager-dashboard-format.js'),'utf8');

test('employee grid uses the approved compact column order',()=>{
  assert.match(enh,/الموظف<\/th><th>الرقم الوظيفي<\/th><th>الإدارة<\/th><th>القسم<\/th><th>المسمى<\/th><th>الدور الوظيفي<\/th><th>الخدمات المفعلة<\/th><th>أهلية المركبة<\/th><th>الحالة<\/th>/);
  assert.doesNotMatch(enh,/آخر تعديل \/ انتهاء العقد/);
  assert.doesNotMatch(enh,/<th>الحصر<\/th><th>الأراضي<\/th><th>الحركة<\/th>/);
});

test('services are consolidated into one visual cell and mobility role stays separate',()=>{
  assert.match(enh,/productChips\(e\)/);
  assert.match(enh,/mobilityRoleMarkup\(e\)/);
  assert.match(enh,/vehicleBadge\(e\)/);
});

test('employee email stays in profile data and is not rendered in the registry table',()=>{
  assert.doesNotMatch(enh,/class="ucv2-email">\$\{esc\(e\.email\|\|'—'\)\}/);
  assert.match(dialogs,/edit-email/);
  assert.match(dialogs,/action:'changeLoginEmail'/);
});

test('pencil edit action replaces the old extra action menu',()=>{
  assert.match(enh,/function editIconButton/);
  assert.match(enh,/ucv2-edit-btn/);
  assert.match(enh,/data-open-employee/);
});

test('edit opens from cached employee directory without forced full refetch',()=>{
  assert.match(dialogs,/U\.cache&&Array\.isArray\(U\.cache\.employees\)/);
  assert.match(dialogs,/await U\.dir\(false\)/);
  assert.doesNotMatch(dialogs,/U\.profile=async e=>\{let d=await U\.dir\(true\)/);
});

test('email is editable in profile and linked accounts use trusted email mutation',()=>{
  assert.match(dialogs,/U\.input\('البريد','edit-email',e\.email\|\|'',\{type:'email',ac:'email'\}\)/);
  assert.match(dialogs,/action:'changeLoginEmail'/);
  assert.match(dialogs,/تم حفظ بيانات الموظف والبريد/);
});

test('legacy misplaced email is presented as email, not employee number',()=>{
  assert.match(enh,/misplacedEmail=!storedEmail&&emailPattern\.test\(storedRef\)/);
  assert.match(enh,/employeeRef:misplacedEmail\?null:employee\.employeeRef/);
});


test('final visual owner cannot restore legacy service columns',()=>{
  assert.match(finalSkin,/الدور الوظيفي','الخدمات المفعلة','أهلية المركبة','الحالة','تعديل'/);
  assert.doesNotMatch(finalSkin,/const labels=\['الموظف','الإدارة','القسم','المسمى','الحصر','الأراضي','الحركة'/);
  assert.doesNotMatch(finalSkin,/row\.innerHTML='';row\.appendChild\(employee\)/);
});

test('user center loading layout keeps header at top and status centered',()=>{
  assert.match(managerFormat,/grid-template-rows:auto minmax\(0,1fr\)/);
  assert.match(managerFormat,/ucv2-route-loading\{[^}]*height:100%[^}]*justify-content:center[^}]*align-self:stretch/s);
  assert.match(managerFormat,/ucv2-header\{[^}]*align-items:flex-start[^}]*align-self:start/s);
  assert.match(managerFormat,/phase15-user-center-compact-grid-v3/);
});

test('registry shows employee number and institutional role instead of mobility role',()=>{
  assert.match(enh,/\$\{esc\(e\.employeeRef\|\|'—'\)\}/);
  assert.match(enh,/institutionalRoleMarkup\(e\)/);
  assert.doesNotMatch(enh,/<th>دور الحركة<\/th>/);
  assert.doesNotMatch(enh,/<th>البريد<\/th>/);
});
