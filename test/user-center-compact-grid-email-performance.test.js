'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const enh=fs.readFileSync(path.join(root,'manager-phase11d-user-center-enhancements.js'),'utf8');
const dialogs=fs.readFileSync(path.join(root,'manager-phase11c-user-center-dialogs.js'),'utf8');

test('employee grid uses the approved compact column order',()=>{
  assert.match(enh,/الموظف<\/th><th>البريد<\/th><th>الإدارة<\/th><th>القسم<\/th><th>المسمى<\/th><th>الخدمات المفعلة<\/th><th>دور الحركة<\/th><th>أهلية المركبة<\/th><th>الحالة<\/th>/);
  assert.doesNotMatch(enh,/آخر تعديل \/ انتهاء العقد/);
  assert.doesNotMatch(enh,/<th>الحصر<\/th><th>الأراضي<\/th><th>الحركة<\/th>/);
});

test('services are consolidated into one visual cell and mobility role stays separate',()=>{
  assert.match(enh,/productChips\(e\)/);
  assert.match(enh,/mobilityRoleMarkup\(e\)/);
  assert.match(enh,/vehicleBadge\(e\)/);
});

test('employee email is visible as its own table value',()=>{
  assert.match(enh,/class="ucv2-email">\$\{esc\(e\.email\|\|'—'\)\}/);
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
