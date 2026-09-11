'use strict';
// ============================================================================
// USER CENTER SHADOW READ (micro-phase) — source-contract coverage for
// manager.html's new read-only institutional-assignment section inside the
// existing employee detail drawer, following the same convention already
// established by test/manager-account-activation-ui.test.js and
// test/manager-user-center-ui.test.js: manager.html is read as raw text and
// its method bodies / template blocks are matched directly, since this
// custom "DC" component framework has no live React/DOM test harness in
// this repo.
//
// employeeAssignments remains history/governance data only in this phase —
// this file exists to prove the new UI never turns it into a second
// authorization source, never mutates it, never bypasses the trusted Admin
// API, and never disturbs any existing User Center behavior.
// ============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');
const authz = fs.readFileSync(path.join(root, 'api', '_lib', 'authz.js'), 'utf8');
const loginHtml = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const managerLoginHtml = fs.readFileSync(path.join(root, 'manager-login.html'), 'utf8');
const dashboardAdapter = fs.readFileSync(path.join(root, 'manager-dashboard-adapter.js'), 'utf8');
const smartMobilityAdapter = fs.readFileSync(path.join(root, 'smart-mobility-adapter.js'), 'utf8');

function methodBody(source, signature, maxLen = 2200) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  return source.slice(start, start + maxLen);
}

// ---- 1. manager opens employee detail -> assignments fetched through Admin API ----

test('SHADOW READ: opening the employee detail drawer triggers a fetch of that employee\'s institutional assignments', () => {
  const fn = methodBody(manager, 'openEmployeeDetail(employee) {', 400);
  assert.match(fn, /this\.loadEmployeeAssignments\(employee\)/);
});

test('SHADOW READ: loadEmployeeAssignments fetches exclusively through the existing trusted Admin API (api/admin/employees.js, action listAssignments)', () => {
  const fn = methodBody(manager, 'async loadEmployeeAssignments(employee) {');
  assert.match(fn, /this\.callAdminEmployeesApi\('listAssignments',/);
});

// ---- 2. same-org employee -> assignments displayed ----

test('SHADOW READ: the listAssignments request is scoped to the employee\'s own organizationId and employeeId (same-org, single-employee fetch)', () => {
  const fn = methodBody(manager, 'async loadEmployeeAssignments(employee) {');
  assert.match(fn, /organizationId:\s*employee\.organizationId/);
  assert.match(fn, /employeeId:\s*employee\.id/);
});

test('SHADOW READ: the render view-model derives displayed assignment rows from fetched state, not from any client-side guess', () => {
  const start = manager.indexOf('employeeCurrentAssignmentRows: (st.employeeAssignmentsCurrent || []).map(formatInstitutionalAssignmentRow),');
  assert.notEqual(start, -1, 'employeeCurrentAssignmentRows must be derived from st.employeeAssignmentsCurrent');
  assert.match(manager, /employeeHistoryAssignmentRows: \(st\.employeeAssignmentsHistory \|\| \[\]\)\.map\(formatInstitutionalAssignmentRow\)/);
});

// ---- 3/4/5. ACTIVE -> current, ENDED/CANCELLED -> history ----

test('SHADOW READ: ACTIVE assignments are classified as current; ENDED and CANCELLED are classified as history', () => {
  const fn = methodBody(manager, 'async loadEmployeeAssignments(employee) {');
  assert.match(fn, /const current = assignments\.filter\(a => a\.status === 'ACTIVE'\)/);
  assert.match(fn, /const history = assignments\.filter\(a => a\.status === 'ENDED' \|\| a\.status === 'CANCELLED'\)/);
});

// ---- 6. empty state ----

test('SHADOW READ: an employee with no assignments at all shows the specified Arabic empty state, never a fabricated row', () => {
  assert.match(manager, /employeeAssignmentsEmpty: !st\.employeeAssignmentsLoading && !st\.employeeAssignmentsError\s*\n?\s*&& \(st\.employeeAssignmentsCurrent \|\| \[\]\)\.length === 0 && \(st\.employeeAssignmentsHistory \|\| \[\]\)\.length === 0/);
  const start = manager.indexOf('employeeAssignmentsEmpty }}');
  assert.notEqual(start, -1);
  const block = manager.slice(start, start + 200);
  assert.match(block, /لا توجد تكليفات مؤسسية مسجلة لهذا الموظف\./);
});

// ---- 7. permanent home always from the employee record ----

test('SHADOW READ: permanent organizational home (administration/department/jobTitle) is read exclusively from the employee record, never inferred from assignment history', () => {
  assert.match(manager, /employeeHomeAdministration: st\.selectedEmployee\?\.administration \|\| '—'/);
  assert.match(manager, /employeeHomeDepartment: st\.selectedEmployee\?\.department \|\| '—'/);
  assert.match(manager, /employeeHomeJobTitle: st\.selectedEmployee\?\.jobTitle \|\| '—'/);
});

test('SHADOW READ: the permanent-home section in the drawer template binds to the employee-record-derived fields, not to any assignment field', () => {
  const start = manager.indexOf('الانتماء المؤسسي الأصلي');
  assert.notEqual(start, -1);
  const block = manager.slice(start, start + 1400);
  assert.match(block, /employeeHomeAdministration/);
  assert.match(block, /employeeHomeDepartment/);
  assert.match(block, /employeeHomeJobTitle/);
});

// ---- 8. assignment data never overwrites employee fields ----

test('SHADOW READ: loadEmployeeAssignments never writes administration/department/jobTitle or mutates selectedEmployee', () => {
  const fn = methodBody(manager, 'async loadEmployeeAssignments(employee) {');
  assert.doesNotMatch(fn, /administration/);
  assert.doesNotMatch(fn, /department/);
  assert.doesNotMatch(fn, /jobTitle/);
  assert.doesNotMatch(fn, /selectedEmployee:/, 'assignment fetch must never reassign the selectedEmployee record');
});

// ---- 9. no authorization logic imports/reads employeeAssignments ----

test('SHADOW READ: api/_lib/authz.js (the actual authorization engine) never imports or references employeeAssignments — it is not yet an authorization source', () => {
  assert.doesNotMatch(authz, /employeeAssignments/);
  assert.doesNotMatch(authz, /employee-assignment-contract/);
  assert.doesNotMatch(authz, /employee-assignment-lock-contract/);
});

// ---- 10. no login/routing changes ----

test('SHADOW READ: login.html and manager-login.html never reference employeeAssignments — routing/login logic is untouched', () => {
  assert.doesNotMatch(loginHtml, /employeeAssignments/);
  assert.doesNotMatch(managerLoginHtml, /employeeAssignments/);
});

test('SHADOW READ: manager-dashboard-adapter.js\'s routing/session wiring never references employeeAssignments', () => {
  assert.doesNotMatch(dashboardAdapter, /employeeAssignments/);
});

test('SHADOW READ: smart-mobility-adapter.js (Mobility role/routing resolution) never references employeeAssignments', () => {
  assert.doesNotMatch(smartMobilityAdapter, /employeeAssignments/);
});

// ---- 11. no direct Firestore employeeAssignments read in frontend code ----

test('SHADOW READ: manager.html never reads employeeAssignments directly from Firestore — no firestoreApi.collection(..., \'employeeAssignments\') anywhere', () => {
  assert.doesNotMatch(manager, /collection\(\s*db\s*,\s*['"]employeeAssignments['"]\s*\)/);
  assert.doesNotMatch(manager, /firestoreApi\.collection\([^)]*employeeAssignments/);
});

test('SHADOW READ: the only occurrences of "employeeAssignments" as a literal string in manager.html are in explanatory comments, never a Firestore collection() call', () => {
  const lines = manager.split('\n').filter(l => l.includes('employeeAssignments'));
  assert.ok(lines.length > 0, 'expected at least the explanatory comments referencing employeeAssignments');
  for (const line of lines) {
    assert.doesNotMatch(line, /\.collection\(/, `unexpected direct collection() reference: ${line}`);
  }
});

// ---- 12. API forbidden/cross-org -> fail closed, no fallback ----

test('SHADOW READ: on any Admin API failure (unauthenticated/forbidden/cross_organization_denied), the drawer fails closed — an honest error, empty lists, never a Firestore fallback', () => {
  const fn = methodBody(manager, 'async loadEmployeeAssignments(employee) {');
  const catchStart = fn.indexOf('} catch (e) {');
  assert.notEqual(catchStart, -1);
  const catchBlock = fn.slice(catchStart, fn.indexOf('    const assignments', catchStart) === -1 ? fn.length : fn.indexOf('    const assignments', catchStart));
  assert.match(catchBlock, /employeeAssignmentsError: this\.adminApiErrorMessage\(e\)/);
  assert.doesNotMatch(catchBlock, /firestoreApi/);
  assert.doesNotMatch(catchBlock, /\.collection\(/);
  assert.doesNotMatch(catchBlock, /onSnapshot/);
});

test('SHADOW READ: adminApiErrorMessage carries a real Arabic message for the new manager_required_for_assignments denial reason', () => {
  const fn = methodBody(manager, 'adminApiErrorMessage(e) {', 1800);
  assert.match(fn, /manager_required_for_assignments/);
});

// ---- 13. no assignment mutation controls exist ----

test('SHADOW READ: the institutional-assignments section has no create/end/mutation controls — read-only by construction', () => {
  const start = manager.indexOf('التكليفات المؤسسية');
  assert.notEqual(start, -1);
  const sectionEnd = manager.indexOf('<sc-if value="{{ incidentDrawerOpen }}">', start);
  assert.notEqual(sectionEnd, -1);
  const section = manager.slice(start, sectionEnd);
  assert.doesNotMatch(section, /createAssignment/);
  assert.doesNotMatch(section, /endAssignment/);
  assert.doesNotMatch(section, /deleteAssignment/);
  assert.doesNotMatch(section, /<button/i, 'no button of any kind belongs in a read-only shadow-read section');
  assert.doesNotMatch(section, /onClick/);
});

// ---- 14. existing User Center behavior remains unchanged ----

test('SHADOW READ: the existing NO_ACCOUNT/PENDING_ACTIVATION activation flow is untouched by this change', () => {
  const fn = methodBody(manager, 'async activateSelectedEmployee() {');
  assert.match(fn, /callAdminEmployeesApi\('activateAccount',/);
  assert.match(fn, /generateTempPassword\(\)/);
});

test('SHADOW READ: closing the employee drawer resets the shadow-read state so a subsequent open never shows a stale previous employee\'s data', () => {
  const fn = methodBody(manager, 'closeEmployeeDrawer() {', 400);
  assert.match(fn, /employeeAssignmentsLoading: false/);
  assert.match(fn, /employeeAssignmentsCurrent: \[\]/);
  assert.match(fn, /employeeAssignmentsHistory: \[\]/);
});

// ---- performance: simple per-employeeId caching within one open session ----

test('SHADOW READ: repeated opens of the same employee within one session reuse a cached result instead of refetching (no premature complex caching framework — a plain Map)', () => {
  const fn = methodBody(manager, 'async loadEmployeeAssignments(employee) {');
  assert.match(fn, /this\._employeeAssignmentsCache = this\._employeeAssignmentsCache \|\| new Map\(\)/);
  assert.match(fn, /const cached = this\._employeeAssignmentsCache\.get\(employee\.id\)/);
  assert.match(fn, /if \(cached\) \{/);
});

console.log('employee-assignment-shadow-read-ui source-contract tests OK');
