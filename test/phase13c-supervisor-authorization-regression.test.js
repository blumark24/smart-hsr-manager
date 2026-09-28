'use strict';
// ============================================================================
// PHASE13C — regression tests for the approved, narrow Supervisor
// authorization change in api/_lib/authz.js's getCallerContext(): an active
// users/{uid} record with role==='supervisor' and a non-empty organizationId
// now resolves isManager:true (never isOwner, never cross-organization),
// reusing the EXACT SAME manager-scoped decision functions
// (assertCanManage/assertCanManageEmployee) a real manager already goes
// through — no new privilege framework, no Firestore Rules change.
//
// Uses the same require.cache injection technique established in
// test/user-center-employee-profile-email-endpoint-regression.test.js: the
// real, unmodified api/_lib/authz.js is exercised against a fake
// api/_lib/firebaseAdmin.js, so every assertion below runs the REAL
// getCallerContext/assertCanManage/assertCanManageEmployee logic, never a
// reimplementation of it.
// ============================================================================
const assert = require('node:assert/strict');
const test = require('node:test');

const AUTHZ_PATH = require.resolve('../api/_lib/authz');
const FIREBASE_ADMIN_PATH = require.resolve('../api/_lib/firebaseAdmin');

function makeFakeDb(docs) {
  // docs: { [collection]: { [uid]: dataOrUndefined } }
  return {
    collection(name) {
      return {
        doc(uid) {
          return {
            async get() {
              const col = docs[name] || {};
              const exists = Object.prototype.hasOwnProperty.call(col, uid) && col[uid] !== undefined;
              return { exists, data: () => (exists ? col[uid] : undefined) };
            },
          };
        },
      };
    },
  };
}

function loadAuthzWithFakeDb(docs) {
  const fakeDb = makeFakeDb(docs);
  require.cache[FIREBASE_ADMIN_PATH] = {
    id: FIREBASE_ADMIN_PATH,
    filename: FIREBASE_ADMIN_PATH,
    loaded: true,
    exports: { getDb: () => fakeDb, getAuth: () => ({}), FieldValue: {} },
  };
  delete require.cache[AUTHZ_PATH];
  const authz = require(AUTHZ_PATH);
  delete require.cache[AUTHZ_PATH];
  delete require.cache[FIREBASE_ADMIN_PATH];
  return authz;
}

test('source: the new supervisor branch exists in getCallerContext, ahead of the department_head branch, and grants exactly the manager return shape', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(AUTHZ_PATH, 'utf8');
  const supervisorIdx = source.indexOf("d.role === 'supervisor'");
  const deptHeadIdx = source.indexOf("resolveMobilityRole(d) === 'department_head'");
  assert.ok(supervisorIdx > -1, 'supervisor branch must exist');
  assert.ok(deptHeadIdx > -1, 'department_head branch must still exist');
  assert.ok(supervisorIdx < deptHeadIdx, 'supervisor branch must be checked before department_head');
  assert.match(source, /isOwner: false, isManager: true, isDepartmentHead: false, role: 'supervisor', organizationId: orgId, department: null/);
});

test('getCallerContext: an active supervisor with a valid organizationId resolves isManager:true, isOwner:false', async () => {
  const authz = loadAuthzWithFakeDb({
    users: { 'sup-1': { role: 'supervisor', active: true, organizationId: 'org-alpha' } },
  });
  const ctx = await authz.getCallerContext('sup-1');
  assert.deepEqual(ctx, {
    uid: 'sup-1', isOwner: false, isManager: true, isDepartmentHead: false,
    role: 'supervisor', organizationId: 'org-alpha', department: null,
  });
});

test('1. supervisor can perform the same approved same-org employee/service management actions as manager (assertCanManage)', async () => {
  const authz = loadAuthzWithFakeDb({
    users: { 'sup-1': { role: 'supervisor', active: true, organizationId: 'org-alpha' } },
    managers: { 'mgr-1': { role: 'manager', active: true, organizationId: 'org-alpha' } },
  });
  const supervisorCaller = await authz.getCallerContext('sup-1');
  const managerCaller = await authz.getCallerContext('mgr-1');

  const target = { targetRole: 'inspector', targetOrganizationId: 'org-alpha' };
  const supervisorDecision = authz.assertCanManage(supervisorCaller, target);
  const managerDecision = authz.assertCanManage(managerCaller, target);

  assert.deepEqual(supervisorDecision, { allowed: true, reason: 'manager_same_org' });
  assert.deepEqual(supervisorDecision, managerDecision);
});

test('1b. supervisor gets manager_same_org via assertCanManageEmployee too (the employees.js registry authorization path)', async () => {
  const authz = loadAuthzWithFakeDb({
    users: { 'sup-1': { role: 'supervisor', active: true, organizationId: 'org-alpha' } },
  });
  const supervisorCaller = await authz.getCallerContext('sup-1');
  const decision = authz.assertCanManageEmployee(supervisorCaller, { targetOrganizationId: 'org-alpha', targetDepartment: 'الحصر الميداني' });
  assert.deepEqual(decision, { allowed: true, reason: 'manager_same_org' });
});

test('2. supervisor cannot perform owner-only actions: isOwner is always false, and supervisor cannot manage another manager', async () => {
  const authz = loadAuthzWithFakeDb({
    users: { 'sup-1': { role: 'supervisor', active: true, organizationId: 'org-alpha' } },
  });
  const supervisorCaller = await authz.getCallerContext('sup-1');
  assert.equal(supervisorCaller.isOwner, false);

  const decision = authz.assertCanManage(supervisorCaller, { targetRole: 'manager', targetOrganizationId: 'org-alpha' });
  assert.deepEqual(decision, { allowed: false, reason: 'manager_cannot_manage_managers' });
});

test("2b. the role==='manager'-literal-gated actions (setPassword/setTempPassword, changeLoginEmail) remain denied for a supervisor caller — isManager alone is not enough for those two", async () => {
  const authz = loadAuthzWithFakeDb({
    users: { 'sup-1': { role: 'supervisor', active: true, organizationId: 'org-alpha' } },
  });
  const supervisorCaller = await authz.getCallerContext('sup-1');
  // Exact guard condition used verbatim by api/admin/users.js's setPassword/
  // setTempPassword and api/admin/employees.js's changeLoginEmail.
  const denied = !supervisorCaller.isManager || supervisorCaller.role !== 'manager' || !supervisorCaller.organizationId;
  assert.equal(denied, true);
});

test('3. supervisor cannot manage another organization (cross-org denied)', async () => {
  const authz = loadAuthzWithFakeDb({
    users: { 'sup-1': { role: 'supervisor', active: true, organizationId: 'org-alpha' } },
  });
  const supervisorCaller = await authz.getCallerContext('sup-1');

  const decision = authz.assertCanManage(supervisorCaller, { targetRole: 'inspector', targetOrganizationId: 'org-BETA' });
  assert.deepEqual(decision, { allowed: false, reason: 'cross_organization_denied' });

  const employeeDecision = authz.assertCanManageEmployee(supervisorCaller, { targetOrganizationId: 'org-BETA', targetDepartment: 'x' });
  assert.deepEqual(employeeDecision, { allowed: false, reason: 'cross_organization_denied' });
});

test('4. inactive supervisor is denied (isManager:false, falls through to unauthorized)', async () => {
  const authz = loadAuthzWithFakeDb({
    users: { 'sup-1': { role: 'supervisor', active: false, organizationId: 'org-alpha' } },
  });
  const ctx = await authz.getCallerContext('sup-1');
  assert.deepEqual(ctx, { uid: 'sup-1', isOwner: false, isManager: false, isDepartmentHead: false, role: null, organizationId: null, department: null });
});

test('5. supervisor without organizationId is denied', async () => {
  const authzMissing = loadAuthzWithFakeDb({
    users: { 'sup-1': { role: 'supervisor', active: true } },
  });
  const ctxMissing = await authzMissing.getCallerContext('sup-1');
  assert.equal(ctxMissing.isManager, false);

  const authzEmpty = loadAuthzWithFakeDb({
    users: { 'sup-2': { role: 'supervisor', active: true, organizationId: '   ' } },
  });
  const ctxEmpty = await authzEmpty.getCallerContext('sup-2');
  assert.equal(ctxEmpty.isManager, false);
});

test('6. a normal employee (inspector) does not gain supervisor/manager power, and this behavior is unchanged by the new branch', async () => {
  const authz = loadAuthzWithFakeDb({
    users: { 'insp-1': { role: 'inspector', active: true, organizationId: 'org-alpha' } },
  });
  const ctx = await authz.getCallerContext('insp-1');
  assert.deepEqual(ctx, { uid: 'insp-1', isOwner: false, isManager: false, isDepartmentHead: false, role: null, organizationId: null, department: null });
});

test('regression: manager and department_head resolution are completely unaffected by the new supervisor branch', async () => {
  const authz = loadAuthzWithFakeDb({
    managers: { 'mgr-1': { role: 'manager', active: true, organizationId: 'org-alpha' } },
    users: { 'dh-1': { mobilityAccess: { enabled: true, role: 'department_head' }, active: true, organizationId: 'org-alpha', department: 'الحركة والسير' } },
  });
  const managerCtx = await authz.getCallerContext('mgr-1');
  assert.deepEqual(managerCtx, { uid: 'mgr-1', isOwner: false, isManager: true, isDepartmentHead: false, role: 'manager', organizationId: 'org-alpha', department: null });

  const deptHeadCtx = await authz.getCallerContext('dh-1');
  assert.deepEqual(deptHeadCtx, { uid: 'dh-1', isOwner: false, isManager: false, isDepartmentHead: true, role: 'department_head', organizationId: 'org-alpha', department: 'الحركة والسير', name: '' });
});
