'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const enhancements = read('manager-phase11d-user-center-enhancements.js');
const referenceUi = read('manager-phase11f-reference-ui.js');
const legacyBridge = read('manager-phase11c-legacy-account-bridge.js');
const dialogs = read('manager-phase11c-user-center-dialogs.js');
const preview = read('manager-phase11b-preview-v3.html');
const usersApi = read('api/admin/users.js');
const employeesApi = read('api/admin/employees.js');

test('Phase 11F presentation layers parse as JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(enhancements, { filename: 'manager-phase11d-user-center-enhancements.js' }));
  assert.doesNotThrow(() => new vm.Script(referenceUi, { filename: 'manager-phase11f-reference-ui.js' }));
  assert.doesNotThrow(() => new vm.Script(legacyBridge, { filename: 'manager-phase11c-legacy-account-bridge.js' }));
});

test('preview shell loads core, redesign, reference UI, then interaction polish in deterministic order', () => {
  const core = preview.indexOf('manager-phase11c-user-center-core.js');
  const dialogsLoader = preview.indexOf('manager-phase11c-user-center-dialogs.js');
  const redesign = preview.indexOf('manager-phase11d-user-center-enhancements.js');
  const reference = preview.indexOf('manager-phase11f-reference-ui.js');
  const interactions = preview.indexOf('manager-phase11e-user-center-interactions.js');
  assert.ok(core >= 0 && dialogsLoader > core && redesign > dialogsLoader && reference > redesign && interactions > reference);
  assert.match(preview, /s\.async\s*=\s*false/);
  assert.match(preview, /s\.onload\s*=\s*loadNext/);
  assert.doesNotMatch(preview, /manager-phase11b-user-center-v2\.js|manager-phase11b-modal-layer-fix\.js|manager-phase11b-controls-fix\.js/);
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

test('Add Employee remains wired to existing employee APIs', () => {
  assert.match(dialogs, /\/api\/admin\/employees/);
  assert.match(dialogs, /action\s*:\s*['"]create['"]/);
  assert.match(dialogs, /action\s*:\s*['"]activateAccount['"]/);
});

test('redesign reuses secure email/history actions and does not create identities', () => {
  assert.match(enhancements, /userCenter\.changeLoginEmail/);
  assert.match(enhancements, /userCenter\.listHistory/);
  assert.match(enhancements, /حساب قديم غير مرتبط بسجل موظف/);
  assert.doesNotMatch(enhancements, /createUserWithEmailAndPassword|admin\.auth\(\)\.createUser|createUser\s*\(/);
  assert.doesNotMatch(legacyBridge, /createUserWithEmailAndPassword|admin\.auth\(\)\.createUser|createUser\s*\(/);
});

test('User Center legacy flow contains no native alert confirm or prompt calls', () => {
  assert.doesNotMatch(legacyBridge, /\balert\s*\(/);
  assert.doesNotMatch(legacyBridge, /\bconfirm\s*\(/);
  assert.doesNotMatch(legacyBridge, /\bprompt\s*\(/);
});

test('reference UI carries the approved Arabic hierarchy and edit modal title', () => {
  assert.match(referenceUi, /مركز إدارة المستخدمين/);
  assert.match(referenceUi, /إدارة بيانات الموظفين والصلاحيات والمنتجات والربط مع الأنظمة المختلفة/);
  assert.match(referenceUi, /إجمالي الموظفين/);
  assert.match(referenceUi, /الحسابات النشطة/);
  assert.match(referenceUi, /الأراضي والممتلكات/);
  assert.match(referenceUi, /الحركة والسير/);
  assert.match(referenceUi, /تعديل المستخدم/);
  assert.match(referenceUi, /تحديث بيانات المستخدم والصلاحيات/);
});

test('KPI/filter layer is derived from loaded employee records', () => {
  assert.match(enhancements, /function kpis\(records\)/);
  assert.match(enhancements, /employees\.filter\(e => enabled\(e,'field'\)\)/);
  assert.match(enhancements, /employees\.filter\(e => enabled\(e,'lands'\)\)/);
  assert.match(enhancements, /employees\.filter\(e => enabled\(e,'mobility'\)\)/);
  assert.match(enhancements, /function matches\(record\)/);
});
