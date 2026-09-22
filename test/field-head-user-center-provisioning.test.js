'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'manager-phase11c-user-center-core.js'), 'utf8');
const dialogs = fs.readFileSync(path.join(root, 'manager-phase11c-user-center-dialogs.js'), 'utf8');
const employeesApi = fs.readFileSync(path.join(root, 'api', 'admin', 'employees.js'), 'utf8');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const enhancements = fs.readFileSync(path.join(root, 'manager-phase11d-user-center-enhancements.js'), 'utf8');
const usersApi = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');
const skin = fs.readFileSync(path.join(root, 'manager-phase11g-user-center-approved-skin.js'), 'utf8');
const managerFormat = fs.readFileSync(path.join(root, 'manager-dashboard-format.js'), 'utf8');
const managerLogin = fs.readFileSync(path.join(root, 'manager-login.html'), 'utf8');

test('User Center exposes Field Survey department-head selection', () => {
  assert.match(core, /\['head','رئيس قسم داخل المنتج'\]/);
  assert.match(core, /الوجهة: مركز قيادة قسم الحصر الميداني/);
  assert.doesNotMatch(core, /field_head_not_ready/);
});

test('Field Survey head selection uses institutional role plus the existing Field entitlement', () => {
  assert.match(core, /fieldHead=role==='department_head'/);
  assert.match(core, /if\(k==='field'\)\{x\.field=\{enabled:true,role:'inspector'\}/);
  assert.doesNotMatch(core, /x\.mobility=\{enabled:true,role:'department_head'\}/);
  assert.match(core, /institutionalRole:o\.institutionalRole/);
  assert.match(core, /field_head_department_required/);
  assert.doesNotMatch(core, /field_head_mobility_conflict/);
});

test('User Center presents compatibility-stored Field head as Field, not Mobility', () => {
  assert.match(core, /U\.isFieldHeadCompat=/);
  assert.match(core, /compat&&k==='field'/);
  assert.match(core, /compat&&k==='mobility'/);
});

test('account activation already persists independent mobilityAccess and department scope', () => {
  assert.match(employeesApi, /department: employee\.data\.department \|\| null/);
  assert.match(employeesApi, /mobilityAccess: \{ enabled: true, role: mobilitySel\.role/);
});

test('login routes active Field Survey institutional department head to department-head.html', () => {
  assert.match(login, /const hasDepartmentHeadRole = institutionalRole === 'department_head' \|\| mobilityRole === 'department_head'/);
  assert.match(login, /const hasFieldDepartmentHeadRole = hasDepartmentHeadRole/);
  assert.match(login, /\/الحصر\|ميداني\|field\/i\.test\(administration \|\| department\)/);
  assert.match(login, /window\.location\.href = 'department-head\.html'/);
});

test('Add Employee and existing employee activation both use shared readProducts contract', () => {
  const occurrences = (dialogs.match(/U\.readProducts\(/g) || []).length;
  assert.ok(occurrences >= 3);
  assert.match(dialogs, /action:'activateAccount'/);
});


test('User Center separates external contractor companies from municipal employees', () => {
  assert.match(enhancements, /data-add-contractor/);
  assert.match(enhancements, /\+ إضافة شركة متعاقدة/);
  assert.match(enhancements, /openContractorCompanyDialog/);
  assert.match(enhancements, /جهة خارجية متعاقدة — ليست موظف بلدية/);
  assert.match(enhancements, /لا يظهر كسجل موظف بلدية/);
  assert.doesNotMatch(enhancements, /data-close-center/);
  assert.doesNotMatch(managerFormat, /data-route-close/);
});

test('contracted-company window collects contract and representative account data', () => {
  for (const id of [
    'cc-company','cc-contract','cc-scope','cc-start','cc-end',
    'cc-contact','cc-phone','cc-email','cc-password','cc-password2'
  ]) assert.match(enhancements, new RegExp(id));
  assert.match(enhancements, /createFieldContractorCompany/);
  assert.match(enhancements, /department:'إدارة الحصر الميداني'/);
});

test('contracted-company onboarding reuses trusted users API and existing contractor schema', () => {
  assert.match(usersApi, /action === 'createFieldContractorCompany'/);
  assert.match(usersApi, /caller\.role !== 'manager'/);
  assert.match(usersApi, /role: 'contractor'/);
  assert.match(usersApi, /collection\('contractorProfiles'\)/);
  assert.match(usersApi, /action: 'create_contractor_company'/);
  assert.doesNotMatch(usersApi, /api\/contractor-company/);
});

test('contracted-company action uses restrained blue styling and keeps the icon close', () => {
  assert.match(skin, /\.ucv2-btn\.contractor/);
  assert.match(skin, /rgba\(49,94,182/);
  assert.match(skin, /\.ucv2-btn\.icon-close/);
  assert.match(skin, /\.ucv2-contractor-dialog/);
});

test('Field department head identity is persisted independently from Mobility access', () => {
  assert.match(employeesApi, /institutionalRole: employee\.data\.institutionalRole \|\| 'employee'/);
  assert.match(employeesApi, /if \(institutionalRole !== undefined\) userUpdate\.institutionalRole = institutionalRole/);
  assert.match(dialogs, /institutionalRole:c\.querySelector\('#inst-role'\)\.value/);
});
