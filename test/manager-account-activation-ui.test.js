'use strict';
// Phase 03B.1 hotfix — Account Activation UI. Source-contract coverage for
// manager.html's new employee-detail/activation drawer and the
// manager-dashboard-adapter.js live employees/ subscription, following the
// same convention as manager-user-center-ui.test.js.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'manager-dashboard-adapter.js'), 'utf8');

function methodBody(source, signature, maxLen = 1200) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  return source.slice(start, start + maxLen);
}

test('manager-dashboard-adapter.js: employees/ is a real, independently-scoped live subscription, org-scoped like users/', () => {
  assert.match(adapter, /const employeeFilter = firestoreApi\.query\(firestoreApi\.collection\(db, 'employees'\), firestoreApi\.where\('organizationId', '==', context\.organizationId\)\)/);
  assert.match(adapter, /stopEmployees = firestoreApi\.onSnapshot\(employeeFilter,/);
  assert.match(adapter, /component\.liveEmployees = employees;/);
});

test('manager-dashboard-adapter.js: the employees listener is torn down alongside users/observations/incidents, never leaked across auth-state changes', () => {
  const authHandlerStart = adapter.indexOf('onAuthStateChanged(auth, async user =>');
  assert.notEqual(authHandlerStart, -1);
  const fn = adapter.slice(authHandlerStart, authHandlerStart + 900);
  assert.match(fn, /stopObservations\?\.\(\); stopUsers\?\.\(\); stopIncidents\?\.\(\); stopEmployees\?\.\(\);/);
  const disconnectFn = methodBody(adapter, 'function disconnect(component) {', 400);
  assert.match(disconnectFn, /stopEmployees\?\.\(\);/);
  assert.match(disconnectFn, /stopEmployees = null/);
});

test('the users table merges live accounts with registry-only employees into one real row model — never duplicating an already-linked ACTIVE account', () => {
  const start = manager.indexOf("if (st.view === 'users')");
  const block = manager.slice(start, manager.indexOf("} else if (st.view === 'incidents')", start));
  assert.match(block, /const allEmployees = Array\.isArray\(this\.liveEmployees\) \? this\.liveEmployees : \[\]/);
  assert.match(block, /const activeAuthUids = new Set\(allUsers\.map\(u => u\.id\)\)/);
  assert.match(block, /const registryOnlyEmployees = allEmployees\.filter\(e => !\(e\.accountStatus === 'ACTIVE' && e\.authUid && activeAuthUids\.has\(e\.authUid\)\)\)/);
});

test('account status is shown honestly in the table (NO_ACCOUNT/PENDING_ACTIVATION/ACTIVE/SUSPENDED), never collapsed to a fake نشط/غير نشط for a registry-only row', () => {
  const start = manager.indexOf("if (st.view === 'users')");
  const block = manager.slice(start, manager.indexOf("} else if (st.view === 'incidents')", start));
  assert.match(block, /const accountStatusLabel = s => \(\{ NO_ACCOUNT: 'بلا حساب', PENDING_ACTIVATION: 'قيد التفعيل', ACTIVE: 'نشط', SUSPENDED: 'معطل' \}\[s\] \|\| s\)/);
  assert.match(block, /chip: accountStatusLabel\(r\.accountStatus\)/);
});

test('clicking a registry-only row opens the employee activation drawer, never the account drawer', () => {
  const start = manager.indexOf("if (st.view === 'users')");
  const block = manager.slice(start, manager.indexOf("} else if (st.view === 'incidents')", start));
  assert.match(block, /on: \(\) => r\.kind === 'account' \? this\.openUserDetail\(r\.raw\) : this\.openEmployeeDetail\(r\.raw\)/);
});

test('activateSelectedEmployee reuses the existing tested backend flow (api/admin/employees.js activateAccount), never a second identity or a stored password', () => {
  const fn = methodBody(manager, 'async activateSelectedEmployee() {');
  assert.match(fn, /callAdminEmployeesApi\('activateAccount',/);
  assert.match(fn, /generateTempPassword\(\)/, 'a temp password must be generated the same way submitAddUser already does');
  assert.doesNotMatch(fn, /db\.collection\('users'\)\.doc\(\)\.set\(\{.*password/i, 'never a raw Firestore write with a password from the client');
  // No second identity: activateSelectedEmployee never calls the legacy
  // /api/admin/users create path, only the employee-registry endpoint.
  assert.doesNotMatch(fn, /callAdminUsersApi/);
});

test('activation never fakes success client-side: on failure, the drawer re-reads the REAL employee doc from the live registry rather than guessing a state', () => {
  const fn = methodBody(manager, 'async activateSelectedEmployee() {');
  assert.match(fn, /catch \(e\) \{/);
  const catchBlock = fn.slice(fn.indexOf('catch (e) {'));
  assert.match(catchBlock, /this\.refreshSelectedEmployee\(employee\.id\)/);
});

test('refreshSelectedEmployee reads from this.liveEmployees (the real live subscription), never a locally cached/guessed copy', () => {
  const fn = methodBody(manager, 'refreshSelectedEmployee(employeeId) {', 400);
  assert.match(fn, /Array\.isArray\(this\.liveEmployees\)/);
  assert.match(fn, /list\.find\(e => e\.id === employeeId\)/);
});

test('the activation drawer shows an honest PENDING_ACTIVATION message and the real activationError, never a silent/blank state', () => {
  const start = manager.indexOf('selectedEmployeeIsPending }}');
  assert.notEqual(start, -1);
  const block = manager.slice(start, start + 900);
  assert.match(block, /التفعيل قيد التنفيذ/);
  assert.match(block, /selectedEmployeeActivationError/);
});

test('adminApiErrorMessage covers the new employees.js reason codes (no fallback-only "unexpected error" for scoping/activation denials)', () => {
  const fn = methodBody(manager, 'adminApiErrorMessage(e) {', 1600);
  for (const reason of [
    'cross_department_denied', 'self_elevation_denied', 'account_already_active_or_invalid_state',
    'firestore_link_failed', 'no_linked_account', 'illegal_account_status_transition',
  ]) {
    assert.match(fn, new RegExp(reason), `expected a real message for reason code "${reason}"`);
  }
});

test('the NO_ACCOUNT activation form requires an email input before enabling تفعيل الحساب, matching the backend requirement', () => {
  const start = manager.indexOf('selectedEmployeeIsNoAccount }}');
  assert.notEqual(start, -1);
  const block = manager.slice(start, start + 1200);
  assert.match(block, /actEmail/);
  assert.match(block, /تفعيل الحساب/);
});
