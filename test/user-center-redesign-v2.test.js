'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const enhancements = read('manager-phase11d-user-center-enhancements.js');
const dialogs = read('manager-phase11c-user-center-dialogs.js');
const preview = read('manager-phase11b-preview-v3.html');
const usersApi = read('api/admin/users.js');
const employeesApi = read('api/admin/employees.js');

test('User Center V2 enhancement parses as JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(enhancements, { filename: 'manager-phase11d-user-center-enhancements.js' }));
});

test('preview shell loads redesign after core/dialogs and before interaction polish', () => {
  const core = preview.indexOf('manager-phase11c-user-center-core.js');
  const dialogsLoader = preview.indexOf('manager-phase11c-user-center-dialogs.js');
  const redesign = preview.indexOf('manager-phase11d-user-center-enhancements.js');
  const interactions = preview.indexOf('manager-phase11e-user-center-interactions.js');
  assert.ok(core >= 0 && dialogsLoader > core && redesign > dialogsLoader && interactions > redesign);
});

test('password UX keeps final-password semantics and setPassword contract', () => {
  assert.match(dialogs, /تعديل كلمة المرور/);
  assert.match(dialogs, /action\s*:\s*['"]activateAccount['"]/);
  assert.match(dialogs, /password\s*:\s*pw/);
  assert.match(usersApi, /['"]setPassword['"]/);
  assert.match(employeesApi, /mustChangePassword\s*:\s*false/);
  assert.doesNotMatch(enhancements, /كلمة مرور مؤقتة|تغيير عند أول دخول/);
  assert.doesNotMatch(enhancements, /action\s*:\s*['"]setTempPassword['"]/);
});

test('redesign reuses secure email/history actions and does not create identities', () => {
  assert.match(enhancements, /userCenter\.changeLoginEmail/);
  assert.match(enhancements, /userCenter\.listHistory/);
  assert.match(enhancements, /حساب قديم غير مرتبط بسجل موظف/);
  assert.doesNotMatch(enhancements, /createUserWithEmailAndPassword|admin\.auth\(\)\.createUser|createUser\s*\(/);
});

test('KPI/filter layer is derived from loaded employee records', () => {
  assert.match(enhancements, /function kpis\(records\)/);
  assert.match(enhancements, /employees\.filter\(e => enabled\(e,'field'\)\)/);
  assert.match(enhancements, /employees\.filter\(e => enabled\(e,'lands'\)\)/);
  assert.match(enhancements, /employees\.filter\(e => enabled\(e,'mobility'\)\)/);
  assert.match(enhancements, /function matches\(record\)/);
});
