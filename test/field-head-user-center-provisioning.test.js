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

test('User Center exposes Field Survey department-head selection', () => {
  assert.match(core, /\['head','رئيس قسم داخل المنتج'\]/);
  assert.match(core, /الوجهة: مركز قيادة قسم الحصر الميداني/);
  assert.doesNotMatch(core, /field_head_not_ready/);
});

test('Field Survey head selection maps to the existing canonical compatibility entitlement', () => {
  assert.match(core, /fieldHead=role==='department_head'/);
  assert.match(core, /x\.field=\{enabled:false,role:null\}/);
  assert.match(core, /x\.mobility=\{enabled:true,role:'department_head'\}/);
  assert.match(core, /field_head_department_required/);
  assert.match(core, /field_head_mobility_conflict/);
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

test('login routes active Field Survey department_head compatibility role to department-head.html', () => {
  assert.match(login, /const hasFieldDepartmentHeadRole = hasDepartmentHeadRole/);
  assert.match(login, /\/الحصر\|ميداني\|field\/i\.test\(department\)/);
  assert.match(login, /window\.location\.href = 'department-head\.html'/);
});

test('Add Employee and existing employee activation both use shared readProducts contract', () => {
  const occurrences = (dialogs.match(/U\.readProducts\(/g) || []).length;
  assert.ok(occurrences >= 3);
  assert.match(dialogs, /action:'activateAccount'/);
});
