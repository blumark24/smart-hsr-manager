'use strict';
// ============================================================================
// PRE-PHASE-07 IAM HARDENING GATE — Legacy Field supervisor / municipality
// manager separation.
//
// Institutional architecture lock this file proves against the REAL,
// unmodified code (not reimplementations):
//
//   - managers/{uid}, role:'manager'  = municipal administrative authority.
//   - users/{uid}, role:'supervisor'  = legacy Field operational role only.
//   - A Field supervisor must NEVER be internally represented as
//     role:'manager' for authorization purposes, even when the same
//     historical manager.html/manager-operations.html screen shell is
//     reused for both. Session-storage/display labels may differ from the
//     underlying truthful role, but must never themselves become the
//     source of authorization.
//   - Server-side (Admin API + Firestore Rules) authority is the source of
//     truth; the UI shell is never trusted as an authorization boundary.
//
// Three real code paths are exercised here, each via real execution of the
// actual shipped source (VM/eval extraction — the same technique already
// established by test/manager-lands-sso.test.js and
// test/unified-login-entitlement-routing.test.js), plus real-handler
// integration tests against api/admin/users.js and api/admin/employees.js
// via the existing in-memory Firebase Admin fakes:
//
//   1. manager-dashboard-adapter.js's verifyManagerAccess(api, db, user) —
//      the gate that decides who is even allowed to load manager.html data.
//   2. manager-login.html's inline authorization + session-role resolution —
//      the PRE-PHASE-07 fix that stopped hardcoding role:"manager".
//   3. manager-operations.html's verifyStaffAccess(user) — the same gate
//      for the /manager-operations.html "مركز القيادة" surface.
//   4. api/admin/users.js and api/admin/employees.js — proving a Field
//      supervisor's bearer token is rejected before any admin action runs.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { installFakes, fakeRequest, fakeResponse } = require('./helpers/fakeFirebaseAdmin');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const USERS_HANDLER_PATH = require.resolve('../api/admin/users.js');
const EMPLOYEES_HANDLER_PATH = require.resolve('../api/admin/employees.js');
const AUTHZ_PATH = require.resolve('../api/_lib/authz.js');

function loadFreshHandlers() {
  delete require.cache[AUTHZ_PATH];
  delete require.cache[USERS_HANDLER_PATH];
  delete require.cache[EMPLOYEES_HANDLER_PATH];
  return {
    usersHandler: require(USERS_HANDLER_PATH),
    employeesHandler: require(EMPLOYEES_HANDLER_PATH),
  };
}

// ---- Fake Firestore doc/getDoc for real-execution of the client-side
// verification functions (manager-dashboard-adapter.js, manager-login.html,
// manager-operations.html), which all share the same doc(db,coll,id) /
// getDoc(ref) -> {exists(), data()} shape. ----
function fakeFirestore(store) {
  const doc = (_db, coll, id) => ({ coll, id });
  const getDoc = async (ref) => {
    const data = store[`${ref.coll}/${ref.id}`];
    return { exists: () => data !== undefined, data: () => data };
  };
  return { doc, getDoc };
}

// ============================================================================
// 1. manager-dashboard-adapter.js — verifyManagerAccess(api, db, user)
// ============================================================================

function extractVerifyManagerAccess() {
  const source = read('manager-dashboard-adapter.js');
  const start = source.indexOf('async function verifyManagerAccess(api, db, user) {');
  const end = source.indexOf('async function start(component) {');
  assert.ok(start >= 0 && end > start, 'verifyManagerAccess markers not found — has it moved?');
  const fnText = source.slice(start, end).trim();
  // eslint-disable-next-line no-eval -- real-execution proof of shipped code
  return (0, eval)(`(${fnText})`);
}

const PERSONA_STORE = {
  'managers/mgr-1': { role: 'manager', active: true, organizationId: 'org-a', organizationName: 'بلدية أ', name: 'المدير' },
  'users/sup-1': { role: 'supervisor', active: true, organizationId: 'org-a', organizationName: 'بلدية أ', name: 'المشرف' },
  'users/insp-1': { role: 'inspector', active: true, organizationId: 'org-a' },
  'users/contractor-1': { role: 'contractor', active: true, organizationId: 'org-a' },
  'users/mobonly-1': { role: null, active: true, organizationId: 'org-a', mobilityAccess: { enabled: true, role: 'employee' } },
  'users/depthead-1': { role: 'department_head', active: true, organizationId: 'org-a', department: 'x' },
  'users/inactive-sup-1': { role: 'supervisor', active: false, organizationId: 'org-a' },
  'users/noorg-sup-1': { role: 'supervisor', active: true, organizationId: '' },
};

test('verifyManagerAccess: municipality manager (managers/{uid}, role:manager) resolves truthfully as manager', async () => {
  const verifyManagerAccess = extractVerifyManagerAccess();
  const { doc, getDoc } = fakeFirestore(PERSONA_STORE);
  const result = await verifyManagerAccess({ doc, getDoc }, {}, { uid: 'mgr-1' });
  assert.deepEqual(result, { role: 'manager', organizationId: 'org-a', organizationName: 'بلدية أ', name: 'المدير' });
});

test('verifyManagerAccess: Field supervisor (users/{uid}, role:supervisor) resolves truthfully as supervisor, NEVER as manager', async () => {
  const verifyManagerAccess = extractVerifyManagerAccess();
  const { doc, getDoc } = fakeFirestore(PERSONA_STORE);
  const result = await verifyManagerAccess({ doc, getDoc }, {}, { uid: 'sup-1' });
  assert.deepEqual(result, { role: 'supervisor', organizationId: 'org-a', organizationName: 'بلدية أ', name: 'المشرف' });
  assert.notEqual(result.role, 'manager', 'a Field supervisor must never be internally represented as role:manager');
});

for (const [label, uid] of [
  ['inspector', 'insp-1'],
  ['contractor', 'contractor-1'],
  ['Mobility-only employee (role:null, independent mobilityAccess)', 'mobonly-1'],
  ['legacy department_head', 'depthead-1'],
  ['an inactive supervisor', 'inactive-sup-1'],
  ['a supervisor with no organizationId', 'noorg-sup-1'],
]) {
  test(`verifyManagerAccess: ${label} is denied entry to manager.html entirely (returns null)`, async () => {
    const verifyManagerAccess = extractVerifyManagerAccess();
    const { doc, getDoc } = fakeFirestore(PERSONA_STORE);
    const result = await verifyManagerAccess({ doc, getDoc }, {}, { uid });
    assert.equal(result, null, `${label} must never be granted a manager.html session`);
  });
}

test('verifyManagerAccess: an unknown uid (no managers/ or users/ doc at all) is denied', async () => {
  const verifyManagerAccess = extractVerifyManagerAccess();
  const { doc, getDoc } = fakeFirestore(PERSONA_STORE);
  const result = await verifyManagerAccess({ doc, getDoc }, {}, { uid: 'ghost-uid' });
  assert.equal(result, null);
});

// ============================================================================
// 2. manager-login.html — the PRE-PHASE-07 fix: resolvedRole must reflect
// which branch actually authorized, never a hardcoded "manager".
// ============================================================================

function extractManagerLoginResolvedRole() {
  const source = read('manager-login.html');
  const start = source.indexOf('const managerOrg = typeof managerData?.organizationId');
  const end = source.indexOf('if (!authorized) {\n      await signOut(auth);');
  assert.ok(start >= 0 && end > start, 'manager-login.html authorization snippet markers not found — has it moved?');
  let snippet = source.slice(start, end);
  snippet += 'module.exports = { authorized, resolvedRole };';
  const sandbox = {
    module: { exports: {} },
    managerData: null,
    user: { uid: 'u1' },
    getDoc: async (ref) => ({ exists: () => ref.data !== undefined, data: () => ref.data }),
    doc: (_db, coll, id) => ({ coll, id, data: sandbox.__store[`${coll}/${id}`] }),
    db: {},
  };
  return { snippet, sandbox };
}

async function resolveManagerLoginRole(managerData, userStore) {
  const { snippet, sandbox } = extractManagerLoginResolvedRole();
  sandbox.managerData = managerData;
  sandbox.__store = { 'users/u1': userStore };
  const context = vm.createContext(sandbox);
  const fullSnippet = `(async () => {\n${snippet}\n})()`;
  const script = new vm.Script(fullSnippet, { filename: 'manager-login.html (auth snippet)' });
  await script.runInContext(context);
  return sandbox.module.exports;
}

test('manager-login.html: a real managers/{uid} manager record resolves resolvedRole:"manager"', async () => {
  const out = await resolveManagerLoginRole(
    { role: 'manager', active: true, organizationId: 'org-a' },
    undefined
  );
  assert.equal(out.authorized, true);
  assert.equal(out.resolvedRole, 'manager');
});

test('manager-login.html: a Field supervisor with NO managers/{uid} record resolves resolvedRole:"supervisor", never "manager"', async () => {
  const out = await resolveManagerLoginRole(
    null,
    { role: 'supervisor', active: true, organizationId: 'org-a' }
  );
  assert.equal(out.authorized, true);
  assert.equal(out.resolvedRole, 'supervisor', 'PRE-PHASE-07 fix: the stored session role must be the truthful supervisor role, never the legacy hardcoded "manager"');
});

test('manager-login.html: an inspector (not supervisor, not manager) is denied — authorized stays false, resolvedRole stays null', async () => {
  const out = await resolveManagerLoginRole(
    null,
    { role: 'inspector', active: true, organizationId: 'org-a' }
  );
  assert.equal(out.authorized, false);
  assert.equal(out.resolvedRole, null);
});

test('manager-login.html source: the sessionStorage write uses the resolved role variable, not a literal "manager" string', () => {
  const source = read('manager-login.html');
  const writeStart = source.indexOf('sessionStorage.setItem("smartHSRUser"');
  const writeBlock = source.slice(writeStart, writeStart + 200);
  assert.match(writeBlock, /role:\s*resolvedRole/, 'the session role field must be the truthfully-resolved role');
  assert.doesNotMatch(writeBlock, /role:\s*"manager"/, 'must never hardcode "manager" regardless of which branch authorized');
});

// ============================================================================
// 3. manager-operations.html — verifyStaffAccess(user), the same gate for
// the "مركز القيادة" surface reachable from smart-mobility.html's Executive
// Overview board.
// ============================================================================

function extractVerifyStaffAccess() {
  const source = read('manager-operations.html');
  const start = source.indexOf('async function verifyStaffAccess(user){');
  const end = source.indexOf('async function denyManagerAccess(message){');
  assert.ok(start >= 0 && end > start, 'verifyStaffAccess markers not found — has it moved?');
  const fnText = source.slice(start, end).trim();
  const sandbox = {
    db: {},
    doc: (_db, coll, id) => ({ coll, id }),
    getDoc: async (ref) => {
      const data = PERSONA_STORE[`${ref.coll}/${ref.id}`];
      return { exists: () => data !== undefined, data: () => data };
    },
    module: { exports: {} },
  };
  const context = vm.createContext(sandbox);
  const script = new vm.Script(`${fnText}\nmodule.exports = verifyStaffAccess;`, { filename: 'manager-operations.html (verifyStaffAccess)' });
  script.runInContext(context);
  return sandbox.module.exports;
}

test('manager-operations.html verifyStaffAccess: manager resolves truthfully as manager', async () => {
  const verifyStaffAccess = extractVerifyStaffAccess();
  const result = await verifyStaffAccess({ uid: 'mgr-1' });
  assert.equal(result.role, 'manager');
});

test('manager-operations.html verifyStaffAccess: Field supervisor resolves truthfully as supervisor, never manager', async () => {
  const verifyStaffAccess = extractVerifyStaffAccess();
  const result = await verifyStaffAccess({ uid: 'sup-1' });
  assert.equal(result.role, 'supervisor');
});

test('manager-operations.html verifyStaffAccess: inspector/contractor/department_head/Mobility-only employee are all denied (null)', async () => {
  const verifyStaffAccess = extractVerifyStaffAccess();
  for (const uid of ['insp-1', 'contractor-1', 'depthead-1', 'mobonly-1']) {
    assert.equal(await verifyStaffAccess({ uid }), null, `${uid} must be denied`);
  }
});

test('manager-operations.html: isManagerMode() gates on the re-verified managerContext.role, never on the sessionStorage badge value', () => {
  const source = read('manager-operations.html');
  assert.match(source, /const isManagerMode = \(\) => managerContext\.role === 'manager';/);
  // The comment right above the sessionStorage-reading IIFE already documents
  // this must never gate authorization — assert that documented intent
  // still matches the code: isManagerMode never reads sessionStorage/window.__SMART_USER__.
  const fnStart = source.indexOf("const isManagerMode = () =>");
  const fnLine = source.slice(fnStart, fnStart + 120);
  assert.doesNotMatch(fnLine, /sessionStorage|__SMART_USER__/, 'isManagerMode must only ever consult the server-verified managerContext, never the display-only session cache');
});

// ============================================================================
// 4. Server-side Admin API — a Field supervisor's bearer token must be
// rejected before ANY admin mutation, on both api/admin/users.js and
// api/admin/employees.js. Real handlers, real in-memory Firestore/Auth
// fakes — not a reimplementation.
// ============================================================================

test('api/admin/users.js: a Field supervisor cannot call action:list at all (rejected at the entry gate, before any org check)', async () => {
  const fakes = installFakes();
  try {
    fakes.store.seed('users/sup-api-1', { uid: 'sup-api-1', role: 'supervisor', active: true, organizationId: 'org-sup' });
    const { usersHandler } = loadFreshHandlers();
    const res = fakeResponse();
    await usersHandler(fakeRequest({ uid: 'sup-api-1', body: { action: 'list', organizationId: 'org-sup' } }), res);
    assert.equal(res.statusCode, 403, JSON.stringify(res.body));
    assert.equal(res.body.reason, 'owner_or_manager_required');
  } finally { fakes.restore(); }
});

for (const action of ['create', 'setServices', 'setTempPassword', 'setActive']) {
  test(`api/admin/users.js: a Field supervisor cannot call action:${action}`, async () => {
    const fakes = installFakes();
    try {
      fakes.store.seed('users/sup-api-2', { uid: 'sup-api-2', role: 'supervisor', active: true, organizationId: 'org-sup' });
      fakes.store.seed('users/target-1', { uid: 'target-1', role: 'inspector', active: true, organizationId: 'org-sup' });
      const { usersHandler } = loadFreshHandlers();
      const res = fakeResponse();
      await usersHandler(fakeRequest({ uid: 'sup-api-2', body: { action, uid: 'target-1', organizationId: 'org-sup', email: 'x@example.com', role: 'inspector', password: 'Sup3rSecure!2026' } }), res);
      assert.equal(res.statusCode, 403, JSON.stringify(res.body));
      assert.equal(res.body.reason, 'owner_or_manager_required', `a Field supervisor must never reach the ${action} action`);
    } finally { fakes.restore(); }
  });
}

for (const action of ['list', 'create', 'activateAccount', 'setAccountStatus', 'assignProducts']) {
  test(`api/admin/employees.js: a Field supervisor cannot call action:${action}`, async () => {
    const fakes = installFakes();
    try {
      fakes.store.seed('users/sup-emp-1', { uid: 'sup-emp-1', role: 'supervisor', active: true, organizationId: 'org-sup-emp' });
      const { employeesHandler } = loadFreshHandlers();
      const res = fakeResponse();
      await employeesHandler(fakeRequest({ uid: 'sup-emp-1', body: { action, organizationId: 'org-sup-emp', employeeId: 'emp-x', name: 'موظف', email: 'x@example.com', status: 'ACTIVE' } }), res);
      assert.equal(res.statusCode, 403, JSON.stringify(res.body));
      assert.equal(res.body.reason, 'owner_manager_or_department_head_required', `a Field supervisor must never reach employees.js action:${action}`);
    } finally { fakes.restore(); }
  });
}

test('api/admin/users.js: municipality manager (managers/{uid}, role:manager) retains current same-org access — positive control', async () => {
  const fakes = installFakes();
  try {
    fakes.store.seed('managers/mgr-api-1', { uid: 'mgr-api-1', role: 'manager', active: true, organizationId: 'org-mgr' });
    fakes.store.seed('users/emp-mgr-1', { uid: 'emp-mgr-1', role: 'inspector', active: true, organizationId: 'org-mgr' });
    const { usersHandler } = loadFreshHandlers();
    const res = fakeResponse();
    await usersHandler(fakeRequest({ uid: 'mgr-api-1', body: { action: 'list', organizationId: 'org-mgr' } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.users));
  } finally { fakes.restore(); }
});

test('api/admin/users.js: cross-organization access remains denied for a manager (unrelated to this gate, verified unbroken)', async () => {
  const fakes = installFakes();
  try {
    fakes.store.seed('managers/mgr-api-2', { uid: 'mgr-api-2', role: 'manager', active: true, organizationId: 'org-mgr-a' });
    const { usersHandler } = loadFreshHandlers();
    const res = fakeResponse();
    await usersHandler(fakeRequest({ uid: 'mgr-api-2', body: { action: 'list', organizationId: 'org-mgr-b' } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_organization_denied');
  } finally { fakes.restore(); }
});

test('api/admin/users.js and employees.js: a supervisor with independent, valid Mobility entitlement is STILL rejected by the Admin API (Field-supervisor page access grants nothing; Mobility authority, if any, must come only through the supervisor\'s own separate mobilityAccess-gated surfaces, never through manager.html)', async () => {
  const fakes = installFakes();
  try {
    fakes.store.seed('users/sup-mob-1', {
      uid: 'sup-mob-1', role: 'supervisor', active: true, organizationId: 'org-sup-mob',
      mobilityAccess: { enabled: true, role: 'employee' },
    });
    const { usersHandler, employeesHandler } = loadFreshHandlers();
    const usersRes = fakeResponse();
    await usersHandler(fakeRequest({ uid: 'sup-mob-1', body: { action: 'list', organizationId: 'org-sup-mob' } }), usersRes);
    assert.equal(usersRes.statusCode, 403);
    const employeesRes = fakeResponse();
    await employeesHandler(fakeRequest({ uid: 'sup-mob-1', body: { action: 'list', organizationId: 'org-sup-mob' } }), employeesRes);
    assert.equal(employeesRes.statusCode, 403);
  } finally { fakes.restore(); }
});

console.log('field supervisor / municipality manager separation (Pre-Phase-07 IAM hardening) OK');
