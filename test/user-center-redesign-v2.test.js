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
const executivePolish = read('manager-phase11f-executive-polish.js');
const approvedSkin = read('manager-phase11g-user-center-approved-skin.js');
const legacyBridge = read('manager-phase11c-legacy-account-bridge.js');
const dialogs = read('manager-phase11c-user-center-dialogs.js');
const importer = read('manager-phase11c-user-center-import.js');
const preview = read('manager-phase11b-preview-v3.html');
const managerFormat = read('manager-dashboard-format.js');
const usersApi = read('api/admin/users.js');
const employeesApi = read('api/admin/employees.js');

test('Phase 11F/11G presentation layers parse as JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(enhancements, { filename: 'manager-phase11d-user-center-enhancements.js' }));
  assert.doesNotThrow(() => new vm.Script(referenceUi, { filename: 'manager-phase11f-reference-ui.js' }));
  assert.doesNotThrow(() => new vm.Script(executivePolish, { filename: 'manager-phase11f-executive-polish.js' }));
  assert.doesNotThrow(() => new vm.Script(approvedSkin, { filename: 'manager-phase11g-user-center-approved-skin.js' }));
  assert.doesNotThrow(() => new vm.Script(legacyBridge, { filename: 'manager-phase11c-legacy-account-bridge.js' }));
  assert.doesNotThrow(() => new vm.Script(importer, { filename: 'manager-phase11c-user-center-import.js' }));
  assert.doesNotThrow(() => new vm.Script(managerFormat, { filename: 'manager-dashboard-format.js' }));
});

test('manager route owns the deterministic approved User Center chain', () => {
  const core = managerFormat.indexOf('manager-phase11c-user-center-core.js');
  const dialogsLoader = managerFormat.indexOf('manager-phase11c-user-center-dialogs.js');
  const redesign = managerFormat.indexOf('manager-phase11d-user-center-enhancements.js');
  const reference = managerFormat.indexOf('manager-phase11f-reference-ui.js');
  const interactions = managerFormat.indexOf('manager-phase11e-user-center-interactions.js');
  const executive = managerFormat.indexOf('manager-phase11f-executive-polish.js');
  const skin = managerFormat.indexOf('manager-phase11g-user-center-approved-skin.js');
  assert.ok(core >= 0 && dialogsLoader > core && redesign > dialogsLoader && reference > redesign && interactions > reference && executive > interactions && skin > executive);
  assert.match(managerFormat, /script\.async\s*=\s*false/);
  assert.match(managerFormat, /script\.onload\s*=/);
  assert.match(managerFormat, /smartHsrUserCenterReady/);
  assert.doesNotMatch(managerFormat, /manager-phase11b-user-center-v2\.js|manager-phase11b-modal-layer-fix\.js|manager-phase11b-controls-fix\.js/);
});

test('preview is a passive harness and does not inject a second User Center chain', () => {
  assert.match(preview, /manager\.html\?preview=phase11f-ordered/);
  assert.doesNotMatch(preview, /manager-phase11c-user-center-core\.js/);
  assert.doesNotMatch(preview, /manager-phase11d-user-center-enhancements\.js/);
  assert.doesNotMatch(preview, /manager-phase11f-reference-ui\.js/);
  assert.doesNotMatch(preview, /manager-phase11g-user-center-approved-skin\.js/);
  assert.doesNotMatch(preview, /loadNext|createElement\(['"]script['"]\)/);
});

test('approved skin is CSS-only and preserves manager header/sidebar outside User Center', () => {
  assert.match(approvedSkin, /FINAL VISUAL OWNER/);
  assert.match(approvedSkin, /\.ucv2-host/);
  assert.match(approvedSkin, /right:calc\(var\(--sbW,232px\) \+ 28px\)/);
  assert.match(approvedSkin, /top:92px/);
  // Phase12c-user-center-refero-v1 — institutional-restraint pass: decorative
  // radial blooms on .ucv2-app are removed in favor of a flat surface
  // (Refero/Apple "geometry over atmosphere" restraint), and the single-page
  // profile/Add-User dialogs move from the old ad hoc 620/720px widths into
  // the approved "Complex" 680-760px sizing tier.
  assert.doesNotMatch(approvedSkin, /\.ucv2-app:before,\.ucv2-app:after\{content:""!important;position:absolute!important;pointer-events:none!important;border-radius:999px!important;filter:blur\(90px\)/);
  assert.match(approvedSkin, /\.ucv2-app:before,\.ucv2-app:after\{display:none!important\}/);
  assert.match(approvedSkin, /#iuc-profile>div\.ucv21-single-page/);
  assert.match(approvedSkin, /width:min\(760px,calc\(100vw - 42px\)\)/);
  assert.match(approvedSkin, /@media\(max-width:820px\)/);
  assert.match(approvedSkin, /@media\(max-width:640px\)/);
  assert.doesNotMatch(approvedSkin, /\/api\/|firebase|firestore|setPassword|setTempPassword|fetch\s*\(/);
});

test('password UX keeps final-password semantics and setPassword contract', () => {
  assert.match(dialogs, /تعديل كلمة المرور/);
  assert.match(dialogs, /action\s*:\s*['"]activateAccount['"]/);
  assert.match(dialogs, /password\s*:\s*pw/);
  assert.match(usersApi, /['"]setPassword['"]/);
  assert.match(employeesApi, /mustChangePassword\s*:\s*false/);
  assert.doesNotMatch(enhancements, /كلمة مرور مؤقتة|تغيير عند أول دخول/);
  assert.doesNotMatch(referenceUi, /setTempPassword|كلمة مرور مؤقتة|تغيير إجباري عند أول دخول/);
  assert.doesNotMatch(executivePolish, /setTempPassword|كلمة مرور مؤقتة|تغيير إجباري عند أول دخول/);
  assert.doesNotMatch(approvedSkin, /setTempPassword|كلمة مرور مؤقتة|تغيير إجباري عند أول دخول/);
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

test('manager presentation contains no native alert confirm or prompt calls', () => {
  for (const source of [legacyBridge, importer, enhancements, referenceUi, executivePolish, approvedSkin]) {
    assert.doesNotMatch(source, /\balert\s*\(/);
    assert.doesNotMatch(source, /\bconfirm\s*\(/);
    assert.doesNotMatch(source, /\bprompt\s*\(/);
  }
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

test('approved edit experience is a single-page manager modal with inline final-password editing', () => {
  assert.match(referenceUi, /ucv21-single-page/);
  // Phase12c-user-center-refero-v1 — approved section renames: بيانات الحساب /
  // الدور والصلاحيات (was البيانات الأساسية / الخدمات والصلاحيات), same panes,
  // same fields, same save behavior.
  assert.match(referenceUi, /بيانات الحساب/);
  assert.match(referenceUi, /الدور والصلاحيات/);
  assert.match(referenceUi, /حالة الحساب/);
  assert.match(referenceUi, /تعديل كلمة المرور/);
  assert.match(referenceUi, /كلمة المرور الجديدة/);
  assert.match(referenceUi, /تأكيد كلمة المرور/);
  assert.match(referenceUi, /إذا تركت الحقلين فارغين تبقى كلمة المرور الحالية بدون تغيير/);
  assert.match(referenceUi, /حفظ التعديلات/);
  assert.match(referenceUi, /action:'setPassword'/);
  assert.match(referenceUi, /panel\.__ucv21Employee/);
  assert.match(referenceUi, /if\(!panel\|\|!panel\.__ucv21Employee\)return/);
});

test('KPI/filter layer is derived from loaded employee records', () => {
  assert.match(enhancements, /function kpis\(records\)/);
  assert.match(enhancements, /employees\.filter\(e => enabled\(e,'field'\)\)/);
  assert.match(enhancements, /employees\.filter\(e => enabled\(e,'lands'\)\)/);
  assert.match(enhancements, /employees\.filter\(e => enabled\(e,'mobility'\)\)/);
  assert.match(enhancements, /function matches\(record\)/);
});

test('User Center renderer retries after authenticated center activation', () => {
  assert.match(enhancements, /attributeFilter:\['class','style','hidden','aria-hidden'\]/);
  assert.match(enhancements, /مركز إدارة المستخدمين\|مركز المستخدمين/);
  assert.match(enhancements, /directoryCache=null;renderCenter\(true\)/);
  assert.match(enhancements, /root\.classList\.add\('ucv2-host'\)/);
  assert.match(enhancements, /ucv2-shell-overlay/);
  assert.match(referenceUi, /\.ucv2-shell-overlay\{background:transparent!important;pointer-events:none!important/);
});

test('executive handoff polish covers observations, maps, brand and three products without replacing business logic', () => {
  assert.match(executivePolish, /data-hsr-obs-filter="status"/);
  assert.match(executivePolish, /data-hsr-obs-filter="priority"/);
  assert.match(executivePolish, /data-hsr-obs-filter="type"/);
  assert.match(executivePolish, /الخريطة التشغيلية/);
  assert.match(executivePolish, /leaflet-interactive/);
  assert.match(executivePolish, /smart-hsr-mark/);
  assert.match(executivePolish, /إدارة الحصر الميداني/);
  assert.match(executivePolish, /إدارة الأراضي والممتلكات/);
  assert.match(executivePolish, /إدارة الحركة والسير/);
  assert.doesNotMatch(executivePolish, /L\.map\s*\(|new\s+L\.Map|\/api\/|firebase|firestore|setPassword/);
});
