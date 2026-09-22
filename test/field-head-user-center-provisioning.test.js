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
const contractorRegistryPage = fs.readFileSync(path.join(root, 'contractors-registry.html'), 'utf8');
const contractorRegistryRuntime = fs.readFileSync(path.join(root, 'contractors-registry-runtime.js'), 'utf8');

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
  assert.match(enhancements, /data-open-contractors/);
  assert.match(enhancements, /إدارة العقود والشركات المتعاقدة/);
  assert.match(enhancements, /contractors-registry\.html/);
  assert.doesNotMatch(enhancements, /data-add-contractor/);
  assert.doesNotMatch(enhancements, /kpiCard\('contractors'/);
  assert.match(contractorRegistryPage, /إدارة العقود والشركات المتعاقدة/);
  assert.doesNotMatch(managerFormat, /data-route-close/);
});

test('dedicated contractor registry collects contract and representative account data', () => {
  for (const id of [
    'aCompany','aContract','aScope','aStart','aEnd',
    'aContact','aPhone','aEmail','aPassword'
  ]) assert.match(contractorRegistryPage, new RegExp(id));
  assert.match(contractorRegistryRuntime, /createFieldContractorCompany/);
  assert.match(contractorRegistryRuntime, /department:'إدارة الحصر الميداني'/);
});

test('contracted-company onboarding reuses trusted users API and existing contractor schema', () => {
  const contractorRegistry = fs.readFileSync(path.join(root, 'contractors-registry-runtime.js'), 'utf8');
  assert.match(contractorRegistry, /createFieldContractorCompany/);
  assert.match(usersApi, /action === 'createFieldContractorCompany'/);
  assert.match(usersApi, /caller\.role !== 'manager'/);
  assert.match(usersApi, /role: 'contractor'/);
  assert.match(usersApi, /collection\('contractorProfiles'\)/);
  assert.match(usersApi, /action: 'create_contractor_company'/);
  assert.doesNotMatch(usersApi, /api\/contractor-company/);
});

test('contractor registry has a dedicated responsive institutional surface', () => {
  assert.match(contractorRegistryPage, /SMART HSR — إدارة العقود والشركات المتعاقدة/);
  assert.match(contractorRegistryPage, /class="card"/);
  assert.match(contractorRegistryPage, /@media\(max-width:900px\)/);
  assert.match(contractorRegistryPage, /id="addDlg"/);
  assert.match(contractorRegistryPage, /id="editDlg"/);
});

test('Field department head identity is persisted independently from Mobility access', () => {
  assert.match(employeesApi, /institutionalRole: employee\.data\.institutionalRole \|\| 'employee'/);
  assert.match(employeesApi, /if \(institutionalRole !== undefined\) userUpdate\.institutionalRole = institutionalRole/);
  assert.match(dialogs, /institutionalRole:c\.querySelector\('#inst-role'\)\.value/);
});
