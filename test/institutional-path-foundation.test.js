'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const registry = require('../platform/contracts/employee-registry-contract');

test('employee registry accepts the canonical institutional roles', () => {
  for (const institutionalRole of ['general_supervisor','department_head','employee']) {
    const result = registry.validateEmployeeRecord({
      organizationId:'org-1',
      name:'موظف تجريبي',
      institutionalRole,
    });
    assert.equal(result.ok, true, institutionalRole);
  }
  const bad = registry.validateEmployeeRecord({
    organizationId:'org-1',
    name:'موظف تجريبي',
    institutionalRole:'mobility_head',
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'invalid_institutional_role');
});

test('Field department head is no longer serialized as Mobility department_head', () => {
  const core = read('manager-phase11c-user-center-core.js');
  assert.match(core, /if\(k==='field'\)\{x\.field=\{enabled:true,role:'inspector'\}/);
  assert.doesNotMatch(core, /if\(lv==='head'\)\{x\.field=\{enabled:false,role:null\};x\.mobility=\{enabled:true,role:'department_head'\}/);
  assert.match(core, /institutionalRole:o\.institutionalRole/);
});

test('institutional administration and section are not inferred from active services', () => {
  const ui = read('manager-phase11d-user-center-enhancements.js');
  assert.doesNotMatch(ui, /if\(enabled\(e,'mobility'\)\)return 'إدارة حركة السير'/);
  assert.doesNotMatch(ui, /if\(enabled\(e,'lands'\)\)return 'إدارة الأراضي والممتلكات'/);
  assert.match(ui, /U\.isFieldHeadCompat\(e\)\) return 'إدارة الحصر الميداني'/);
  assert.match(ui, /U\.isFieldHeadCompat\(e\)\) return 'التشوه البصري'/);
});

test('Field head authorization and runtime accept institutional role plus administration', () => {
  const authz = read('api/_lib/authz.js');
  const runtime = read('field-head-runtime.js');
  const login = read('login.html');
  assert.match(authz, /institutionalRole === 'department_head'/);
  assert.match(authz, /administration/);
  assert.match(runtime, /institutionalFieldHead = institutionalRole === 'department_head'/);
  assert.match(runtime, /administration \|\| dept/);
  assert.match(login, /institutionalRole === 'department_head' \|\| mobilityRole === 'department_head'/);
  assert.match(login, /administration \|\| department/);
});

test('employee API persists institutional role into employee and linked user identity', () => {
  const api = read('api/admin/employees.js');
  assert.match(api, /institutionalRole: data\.institutionalRole \|\| 'employee'/);
  assert.match(api, /if \(institutionalRole !== undefined\) userUpdate\.institutionalRole = institutionalRole/);
  assert.match(api, /institutionalRole: employee\.data\.institutionalRole \|\| 'employee'/);
  assert.match(api, /administration: employee\.data\.administration \|\| null/);
});
