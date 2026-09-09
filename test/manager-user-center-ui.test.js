'use strict';
// Phase 03B — مركز المستخدمين UI. Source-contract coverage for manager.html's
// renamed/extended Users view, following the same convention as
// manager-phase3-functional-parity.test.js and manager-single-service-hotfix.
// test.js: regex/string assertions against the real, raw manager.html
// source (Manager shell/header/sidebar markup is untouched — only the
// existing users-view content changes, per the Phase 03B brief's explicit
// scope boundary).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');

function methodBody(source, signature, maxLen = 2500) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  return source.slice(start, start + maxLen);
}

test('the existing users area is renamed to مركز المستخدمين everywhere it is labeled (sidebar, view title, quick actions, mobile nav)', () => {
  assert.doesNotMatch(manager, /المستخدمون والصلاحيات/, 'the old label must not remain anywhere');
  assert.match(manager, /viewTitle:[\s\S]{0,80}'مركز المستخدمين'/);
  const occurrences = (manager.match(/مركز المستخدمين/g) || []).length;
  assert.ok(occurrences >= 4, 'expected the new label in the sidebar, view title, quick actions, and mobile nav');
});

test('the Manager shell (header/sidebar markup, locked product names, sidebar order) is untouched by this rename', () => {
  // Locked names must survive byte-for-byte.
  assert.match(manager, /إدارة الحصر الميداني/);
  assert.match(manager, /إدارة الأراضي والممتلكات/);
  assert.match(manager, /إدارة الحركة والسير/);
  assert.match(manager, /خدمات البلدية الرقمية/);
  // The sidebar's مركز المستخدمين entry still sits at the same onClick
  // target (goUsers) it always did — only its label text changed.
  assert.match(manager, /onClick="\{\{ goUsers \}\}"[\s\S]{0,400}مركز المستخدمين/);
});

test('the stale "read-only view" claim is gone — real capabilities (activation, product assignment) exist on this page', () => {
  assert.doesNotMatch(manager, /عرض للقراءة فقط للمستخدمين/);
});

test('KPI cards are derived from the real, already-loaded allUsers array — never a fabricated/hardcoded statistic', () => {
  const start = manager.indexOf("if (st.view === 'users')");
  const block = manager.slice(start, manager.indexOf("} else if (st.view === 'incidents')", start));
  assert.match(block, /const allUsers = Array\.isArray\(this\.liveUsers\) \? this\.liveUsers : \[\]/);
  assert.match(block, /userCenterKpis = \[/);
  assert.match(block, /kpiCard\('إجمالي الموظفين', allUsers\.length\)/);
  assert.match(block, /kpiCard\('الحسابات المفعلة', activatedCount\)/);
  assert.match(block, /kpiCard\('غير المفعلة', deactivatedCount\)/);
  assert.match(block, /kpiCard\('المستخدمون حسب المنتجات',/);
  assert.match(block, /kpiCard\('المؤهلون لاستلام مركبة', vehicleEligibleCount\)/);
  // Every count is a real .filter(...).length off allUsers, never a
  // literal number.
  assert.doesNotMatch(block, /kpiCard\('[^']+',\s*\d+\)/, 'no KPI card may be a hardcoded literal number');
});

test('filters exist for role, product, vehicle eligibility, and department — all derived from live data', () => {
  const start = manager.indexOf("if (st.view === 'users')");
  const block = manager.slice(start, manager.indexOf("} else if (st.view === 'incidents')", start));
  assert.match(block, /tProductFilters = productFilterNames\.map/);
  assert.match(block, /tVehicleFilters = vehicleFilterNames\.map/);
  assert.match(block, /const deptValues = Array\.from\(new Set\(allUsers\.map\(u => u\.department\)\.filter\(Boolean\)\)\)/);
});

test('the table shows الإدارة/القسم/المسمى/الحصر/الأراضي/الحركة/دور الحركة/المركبة columns', () => {
  const start = manager.indexOf("if (st.view === 'users')");
  const block = manager.slice(start, manager.indexOf("} else if (st.view === 'incidents')", start));
  for (const label of ['الإدارة', 'القسم', 'المسمى', 'الحصر', 'الأراضي', 'الحركة', 'دور الحركة', 'المركبة']) {
    assert.match(block, new RegExp(`label: '${label}'`), `expected a "${label}" column`);
  }
});

test('"إضافة موظف بلا حساب" opens a real drawer wired to the new employees registry endpoint, never /api/admin/users', () => {
  assert.match(manager, /openAddEmployee/);
  const fn = methodBody(manager, 'async submitAddEmployee() {');
  assert.match(fn, /callAdminEmployeesApi\('create',/);
  assert.doesNotMatch(fn, /callAdminUsersApi/);
  // A registry-only record must never carry a password or role field.
  assert.doesNotMatch(fn, /password/i);
  assert.doesNotMatch(fn, /field:\s*\{/);
});

test('callAdminEmployeesApi posts to /api/admin/employees with a verified bearer token, mirroring callAdminUsersApi', () => {
  const fn = methodBody(manager, 'async callAdminEmployeesApi(action, params) {');
  assert.match(fn, /fetch\('\/api\/admin\/employees'/);
  assert.match(fn, /Authorization.*Bearer \$\{token\}/);
  assert.match(fn, /getAuthToken\?\.\(\)/);
});

test('resolveManagerProductEntitlements never invents a landsAccess.role outside LANDS_MANAGEABLE_ROLES, and defaults vehicleEligible to true', () => {
  const fn = methodBody(manager, 'function resolveManagerProductEntitlements(u) {');
  assert.match(fn, /lands_employee/);
  assert.match(fn, /lands_department_manager/);
  assert.match(fn, /vehicleEligible: data\.vehicleEligible !== false/);
});
