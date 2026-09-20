'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const reference = fs.readFileSync(path.join(root, 'manager-phase11f-reference-ui.js'), 'utf8');
const skin = fs.readFileSync(path.join(root, 'manager-phase11g-user-center-approved-skin.js'), 'utf8');

test('edit-user window uses four true stages like Add Employee', () => {
  assert.match(reference, /const steps=\['البيانات الأساسية','الدور والخدمات','حساب الدخول','السجل'\]/);
  assert.match(reference, /data-profile-step=/);
  assert.match(reference, /if\(basic\)basic\.dataset\.ucv21Step='1'/);
  assert.match(reference, /if\(org\)org\.dataset\.ucv21Step='2'/);
  assert.match(reference, /if\(roles\)roles\.dataset\.ucv21Step='2'/);
  assert.match(reference, /if\(account\)account\.dataset\.ucv21Step='3'/);
  assert.match(reference, /hw\.dataset\.ucv21Step='4'/);
  assert.match(reference, /step<=4/);
  assert.match(reference, /ucv21-profile-stage/);
  assert.match(reference, /dataset\.profilePanel/);
  assert.match(reference, /ucv21-step-hidden/);
});

test('edit-user window exposes an explicit institutional role selector', () => {
  assert.match(reference, /ucv21-role-seg/);
  assert.match(reference, /\['employee','موظف'\]/);
  assert.match(reference, /\['department_head','رئيس قسم'\]/);
  assert.match(reference, /\['general_supervisor','مشرف عام'\]/);
  assert.match(reference, /editRoleSelect\.dispatchEvent\(new Event\('change'/);
});

test('promoting to department head normalizes a single enabled product into head scope', () => {
  assert.match(reference, /btn\.dataset\.role==='department_head'/);
  assert.match(reference, /normalizeDepartmentHeadSelection/);
  assert.match(reference, /level\.value='head'/);
  assert.match(reference, /enabled\.length===1|enabled\.length!==1/);
});

test('edit-user window has explicit previous and next navigation while preserving save', () => {
  assert.match(reference, /ucv21-prev/);
  assert.match(reference, /ucv21-next/);
  assert.match(reference, /ucv21-save/);
  assert.match(reference, /setProfileStep/);
});

test('only the modal body scrolls while header, step navigation and footer remain fixed', () => {
  assert.match(skin, /ucv21-profile-stage\{[^}]*overflow:auto/i);
  assert.match(skin, /ucv21-single-page\{[^}]*overflow:hidden/i);
  assert.match(skin, /ucv21-profile-footer\{[^}]*position:relative/i);
  assert.match(skin, /ucv21-role-seg/);
});

test('login and password controls stay grouped in step three', () => {
  assert.match(reference, /if\(account\)account\.dataset\.ucv21Step='3'/);
  assert.match(reference, /wrap\.dataset\.ucv21Step='3'/);
});

test('employee history is a dedicated fourth section', () => {
  assert.match(reference, /hw\.dataset\.ucv21Step='4'/);
  assert.match(reference, /السجل والتكليفات/);
  assert.match(reference, /history\.hidden=false/);
});

test('existing save orchestration remains intact', () => {
  assert.match(reference, /profileSnapshot\(/);
  assert.match(reference, /runExisting\(/);
  assert.match(reference, /U\.post\('\/api\/admin\/users',\{action:'setPassword'/);
});


test('role save validation keeps product errors on role/services step', () => {
  assert.match(reference, /try\{current=profileSnapshot/);
  assert.match(reference, /setProfileStep\(2\)/);
});


test('department-head selection normalizes a single enabled product to head scope', () => {
  assert.match(reference, /normalizeDepartmentHeadSelection/);
  assert.match(reference, /enabled\.length!==1/);
  assert.match(reference, /level\.value='head'/);
  assert.match(reference, /إدارة الحصر الميداني/);
});


test('inactive edit stages are actually hidden after the base panel display rule', () => {
  assert.match(skin, /\.ucv21-step-panel\.ucv21-step-hidden\{display:none!important\}/);
});
