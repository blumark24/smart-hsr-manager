'use strict';
// ============================================================================
// PHASE12C.5 — USER CENTER updateProfile / changeLoginEmail ENDPOINT MIGRATION
//
// Phase12C.4 found that manager-phase11c-user-center-dialogs.js's profile
// save and manager-phase11d-user-center-enhancements.js's change-email
// dialog both POSTed to /api/organization/context with a userCenter.*
// action — a server contract that never existed there (that endpoint's POST
// path is exclusively the Lands SSO handoff, which ignores req.body.action
// entirely). A third action, userCenter.listHistory, had the same problem
// AND silently shadowed an earlier, real, working U.loadHist implementation
// (POST /api/admin/employees, action:'listAssignments') defined first in
// dialogs.js and overwritten by a later definition in 11d.
//
// This phase moves updateProfile and changeLoginEmail onto the existing,
// already-multi-action /api/admin/employees endpoint (Candidate B from the
// Phase12C.4 diagnostic — api/organization/context.js is NOT touched), and
// removes the 11d U.loadHist override so dialogs.js's original,
// listAssignments-based implementation is authoritative again.
//
// Part 1 (static/structural) matches this repo's dominant existing test
// style: real source, regex-verified. Part 2 (real execution) goes further
// for the newly-added, security-critical branches — cross-organization
// denial, manager-only gating, linked-account requirement, email
// confirmation mismatch, recent-authentication requirement — by requiring
// the ACTUAL, unmodified api/admin/employees.js handler with Firebase Admin
// (api/_lib/firebaseAdmin) and token verification (api/_lib/authz's
// verifyRequestToken/getCallerContext) swapped for in-memory fakes via
// require.cache injection (no real Firestore/Auth, no special Node flags —
// plain `node --test` compatible). assertCanManageEmployee itself is NOT
// mocked — the real, unmodified authorization decision function is used,
// so these tests prove the real authorization outcome, not a re-implemented
// guess at it.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const employeesSource = read('api/admin/employees.js');
const contextSource = read('api/organization/context.js');
const dialogsSource = read('manager-phase11c-user-center-dialogs.js');
const centerSource = read('manager-phase11d-user-center-enhancements.js');

// ---------------------------------------------------------------------------
// PART 1 — static contract verification (real source, no execution)
// ---------------------------------------------------------------------------

test('client: updateProfile now posts to /api/admin/employees, not organization/context', () => {
  assert.match(dialogsSource, /action:'updateProfile'/);
  assert.match(dialogsSource, /U\.post\('\/api\/admin\/employees',q\)/);
  assert.doesNotMatch(dialogsSource, /userCenter\.updateProfile/);
  assert.doesNotMatch(dialogsSource, /organization\/context.*updateProfile|updateProfile.*organization\/context/s);
});

test('client: changeLoginEmail now posts to /api/admin/employees, not organization/context', () => {
  assert.match(centerSource, /U\.post\('\/api\/admin\/employees',\{action:'changeLoginEmail'/);
  assert.doesNotMatch(centerSource, /userCenter\.changeLoginEmail/);
});

test('client: no userCenter.* action is ever sent to /api/organization/context anywhere in the client', () => {
  for (const source of [dialogsSource, centerSource]) {
    assert.doesNotMatch(source, /userCenter\./);
  }
});

test('client: U.loadHist override removed from 11d — dialogs.js\'s listAssignments-based definition is authoritative', () => {
  assert.doesNotMatch(centerSource, /U\.loadHist=/);
  assert.match(dialogsSource, /U\.loadHist=async\(c,e\)=>/);
  assert.match(dialogsSource, /action:'listAssignments'/);
  assert.match(dialogsSource, /U\.post\('\/api\/admin\/employees',\{action:'listAssignments'/);
});

test('server: api/organization/context.js is completely unchanged by this phase (Finding B fix stays out of it)', () => {
  assert.match(contextSource, /if \(req\.method === 'POST'\) return handleLandsSsoHandoff\(req, res\);/);
  assert.doesNotMatch(contextSource, /updateProfile|changeLoginEmail|listHistory|req\.body\.action/);
});

test('server: api/admin/employees.js gained updateProfile and changeLoginEmail as additive dispatch cases only', () => {
  assert.match(employeesSource, /case 'updateProfile': \{/);
  assert.match(employeesSource, /case 'changeLoginEmail': \{/);
  // Still additive, not a replacement — every pre-existing action stays.
  for (const existing of ['list', 'create', 'activateAccount', 'setAccountStatus', 'assignProducts', 'setVehicleEligible', 'transfer', 'createAssignment', 'endAssignment', 'listAssignments']) {
    assert.match(employeesSource, new RegExp(`case '${existing}': \\{`));
  }
});

test('server: updateProfile is manager/owner only and enforces same-organization scope', () => {
  const block = employeesSource.slice(employeesSource.indexOf("case 'updateProfile'"), employeesSource.indexOf("case 'changeLoginEmail'"));
  assert.match(block, /if \(!caller\.isOwner && !caller\.isManager\)/);
  assert.match(block, /assertCanManageEmployee\(caller, \{ targetOrganizationId: employee\.data\.organizationId/);
  assert.match(block, /linked_account_email_change_requires_account_flow/);
  assert.match(block, /recordAdminAudit\(db, \{ caller, organizationId: employee\.data\.organizationId, targetEmployeeId: employeeId, action: 'employee_profile_update'/);
});

test('server: changeLoginEmail is manager-role-only, requires recent re-authentication, linked account, matching confirmation, and same organization', () => {
  const start = employeesSource.indexOf("case 'changeLoginEmail'");
  const end = employeesSource.indexOf('// ====================================================================', start);
  const block = employeesSource.slice(start, end);
  assert.match(block, /email\.trim\(\)\.toLowerCase\(\) !== confirmEmail\.trim\(\)\.toLowerCase\(\)/);
  assert.match(block, /email_confirmation_mismatch/);
  assert.match(block, /if \(!caller\.isManager \|\| caller\.role !== 'manager' \|\| !isNonEmptyString\(caller\.organizationId\)\)/);
  assert.match(block, /hasRecentAuthentication\(decoded\)/);
  assert.match(block, /reauthentication_required/);
  assert.match(block, /employee\.data\.organizationId !== caller\.organizationId/);
  assert.match(block, /cross_organization_denied/);
  assert.match(block, /no_linked_account/);
  assert.match(block, /auth\.updateUser\(employee\.data\.authUid, \{ email: newEmail \}\)/);
  assert.match(block, /auth\.revokeRefreshTokens\(employee\.data\.authUid\)/);
  assert.match(block, /sessionsRevokedAt: FieldValue\.serverTimestamp\(\)/);
  assert.match(block, /recordAdminAudit\(db, \{[\s\S]*?action: 'employee_login_email_change'/);
});

// ---------------------------------------------------------------------------
// PART 2 — real execution against the actual handler, Firebase Admin/authz
// swapped for in-memory fakes via require.cache injection
// ---------------------------------------------------------------------------

const firebaseAdminPath = path.join(root, 'api', '_lib', 'firebaseAdmin.js');
const authzPath = path.join(root, 'api', '_lib', 'authz.js');
const employeesPath = path.join(root, 'api', 'admin', 'employees.js');

function buildFakeDb(seed) {
  const store = new Map(); // "collection/id" -> data
  const key = (col, id) => `${col}/${id}`;
  let autoId = 0;
  for (const [col, docs] of Object.entries(seed)) {
    for (const [id, data] of Object.entries(docs)) store.set(key(col, id), { ...data });
  }
  function docRef(col, id) {
    return {
      id,
      get: async () => ({ exists: store.has(key(col, id)), data: () => store.get(key(col, id)) }),
      set: async (data, opts) => {
        const existing = opts && opts.merge ? (store.get(key(col, id)) || {}) : {};
        store.set(key(col, id), { ...existing, ...resolveFieldValues(data) });
      },
    };
  }
  function resolveFieldValues(data) {
    const out = {};
    for (const [k, v] of Object.entries(data)) out[k] = (v && v.__serverTimestamp) ? new Date() : v;
    return out;
  }
  function queryFrom(col, filters) {
    return {
      where(field, _op, value) { return queryFrom(col, [...filters, [field, value]]); },
      get: async () => ({
        docs: [...store.entries()]
          .filter(([k, v]) => k.startsWith(`${col}/`) && filters.every(([f, val]) => v[f] === val))
          .map(([k, v]) => ({ id: k.split('/')[1], data: () => v })),
      }),
    };
  }
  return {
    collection(col) {
      return {
        doc(id) { return docRef(col, id || `auto${++autoId}`); },
        add: async data => { const id = `auto${++autoId}`; store.set(key(col, id), resolveFieldValues(data)); return docRef(col, id); },
        where(field, _op, value) { return queryFrom(col, [[field, value]]); },
        get: async () => ({
          docs: [...store.entries()].filter(([k]) => k.startsWith(`${col}/`)).map(([k, v]) => ({ id: k.split('/')[1], data: () => v })),
        }),
      };
    },
    _dump: () => Object.fromEntries(store),
  };
}

function buildHandler({ seed, callers, authThrows }) {
  const authCalls = { updateUser: [], revokeRefreshTokens: [] };
  const fakeAuth = {
    updateUser: async (uid, patch) => {
      authCalls.updateUser.push({ uid, patch });
      if (authThrows && authThrows.updateUser) throw authThrows.updateUser;
    },
    revokeRefreshTokens: async uid => { authCalls.revokeRefreshTokens.push(uid); },
  };
  const fakeDb = buildFakeDb(seed);

  const fakeFirebaseAdmin = {
    getAuth: () => fakeAuth,
    getDb: () => fakeDb,
    FieldValue: { serverTimestamp: () => ({ __serverTimestamp: true }) },
  };
  const realAuthz = require(authzPath);
  const fakeAuthz = {
    verifyRequestToken: async req => {
      const header = req.headers.authorization || '';
      const uid = header.replace('Bearer ', '');
      if (!callers[uid]) { const e = new Error('bad token'); e.statusCode = 401; throw e; }
      return { uid, auth_time: callers[uid].authTime };
    },
    getCallerContext: async uid => callers[uid].context,
    assertCanManageEmployee: realAuthz.assertCanManageEmployee, // real, unmodified authorization logic
  };

  require.cache[firebaseAdminPath] = { id: firebaseAdminPath, filename: firebaseAdminPath, loaded: true, exports: fakeFirebaseAdmin };
  require.cache[authzPath] = { id: authzPath, filename: authzPath, loaded: true, exports: fakeAuthz };
  delete require.cache[employeesPath];
  const handler = require(employeesPath);
  delete require.cache[employeesPath];
  delete require.cache[firebaseAdminPath];
  delete require.cache[authzPath];

  return { handler, fakeDb, authCalls };
}

function fakeReqRes(uid, bodyObj) {
  const req = { method: 'POST', headers: { authorization: `Bearer ${uid}` }, body: bodyObj };
  let statusCode = 0, payload = null;
  const res = {
    set statusCode(v) { statusCode = v; },
    get statusCode() { return statusCode; },
    setHeader() {},
    end(text) { payload = JSON.parse(text); },
  };
  return { req, res, result: () => ({ status: statusCode, body: payload }) };
}

const MANAGER_A = 'mgr-a';
const OWNER = 'owner-1';
const DEPT_HEAD_A = 'depthead-a';
const NOW = Math.floor(Date.now() / 1000);

function baseSeed() {
  return {
    employees: {
      'emp-linked-a': { organizationId: 'org-a', name: 'Old Name', department: 'ops', authUid: 'auth-emp-a', email: 'old@org-a.test' },
      'emp-unlinked-a': { organizationId: 'org-a', name: 'No Account', department: 'ops', authUid: null, email: null },
      'emp-linked-b': { organizationId: 'org-b', name: 'Other Org', department: 'ops', authUid: 'auth-emp-b', email: 'other@org-b.test' },
    },
    users: {},
  };
}
function baseCallers() {
  return {
    [MANAGER_A]: { authTime: NOW, context: { uid: MANAGER_A, isOwner: false, isManager: true, isDepartmentHead: false, role: 'manager', organizationId: 'org-a', department: null } },
    [OWNER]: { authTime: NOW, context: { uid: OWNER, isOwner: true, isManager: false, isDepartmentHead: false, role: 'owner', organizationId: null, department: null } },
    [DEPT_HEAD_A]: { authTime: NOW, context: { uid: DEPT_HEAD_A, isOwner: false, isManager: false, isDepartmentHead: true, role: 'department_head', organizationId: 'org-a', department: 'ops' } },
    'nobody': { authTime: NOW, context: { uid: 'nobody', isOwner: false, isManager: false, isDepartmentHead: false, role: null, organizationId: null, department: null } },
  };
}

test('EXECUTION: updateProfile succeeds for a same-org manager and writes the expected fields', async () => {
  const { handler, fakeDb } = buildHandler({ seed: baseSeed(), callers: baseCallers() });
  const { req, res, result } = fakeReqRes(MANAGER_A, { action: 'updateProfile', employeeId: 'emp-unlinked-a', name: 'New Name', phone: '0500000000' });
  await handler(req, res);
  const r = result();
  assert.equal(r.status, 200);
  assert.equal(r.body.employee.name, 'New Name');
  assert.equal(fakeDb._dump()['employees/emp-unlinked-a'].phone, '0500000000');
});

test('EXECUTION: updateProfile rejects a cross-organization employee (manager from org-a targeting org-b)', async () => {
  const { handler } = buildHandler({ seed: baseSeed(), callers: baseCallers() });
  const { req, res, result } = fakeReqRes(MANAGER_A, { action: 'updateProfile', employeeId: 'emp-linked-b', name: 'Hacked Name' });
  await handler(req, res);
  const r = result();
  assert.equal(r.status, 403);
  assert.equal(r.body.reason, 'cross_organization_denied');
});

test('EXECUTION: updateProfile rejects a non-manager/non-owner caller (department_head passes the outer gate but not this action\'s own gate)', async () => {
  const { handler } = buildHandler({ seed: baseSeed(), callers: baseCallers() });
  const { req, res, result } = fakeReqRes(DEPT_HEAD_A, { action: 'updateProfile', employeeId: 'emp-unlinked-a', name: 'X' });
  await handler(req, res);
  const r = result();
  assert.equal(r.status, 403);
  assert.equal(r.body.reason, 'update_profile_requires_manager_or_owner');
});

test('EXECUTION: updateProfile rejects a caller with no recognized role at all (outer gate)', async () => {
  const { handler } = buildHandler({ seed: baseSeed(), callers: baseCallers() });
  const { req, res, result } = fakeReqRes('nobody', { action: 'updateProfile', employeeId: 'emp-unlinked-a', name: 'X' });
  await handler(req, res);
  const r = result();
  assert.equal(r.status, 403);
  assert.equal(r.body.reason, 'owner_manager_or_department_head_required');
});

test('EXECUTION: updateProfile rejects an email change for an already-linked account (must use changeLoginEmail instead)', async () => {
  const { handler } = buildHandler({ seed: baseSeed(), callers: baseCallers() });
  const { req, res, result } = fakeReqRes(MANAGER_A, { action: 'updateProfile', employeeId: 'emp-linked-a', name: 'Old Name', email: 'sneaky@org-a.test' });
  await handler(req, res);
  const r = result();
  assert.equal(r.status, 403);
  assert.equal(r.body.reason, 'linked_account_email_change_requires_account_flow');
});

test('EXECUTION: changeLoginEmail succeeds for a same-org manager with recent auth, updates Auth+Firestore, revokes sessions, writes audit', async () => {
  const { handler, fakeDb, authCalls } = buildHandler({ seed: baseSeed(), callers: baseCallers() });
  const { req, res, result } = fakeReqRes(MANAGER_A, { action: 'changeLoginEmail', employeeId: 'emp-linked-a', email: 'New@Org-A.test', confirmEmail: 'new@org-a.test' });
  await handler(req, res);
  const r = result();
  assert.equal(r.status, 200);
  assert.equal(r.body.email, 'new@org-a.test');
  assert.deepEqual(authCalls.updateUser, [{ uid: 'auth-emp-a', patch: { email: 'new@org-a.test' } }]);
  assert.deepEqual(authCalls.revokeRefreshTokens, ['auth-emp-a']);
  assert.equal(fakeDb._dump()['employees/emp-linked-a'].email, 'new@org-a.test');
  assert.equal(fakeDb._dump()['users/auth-emp-a'].email, 'new@org-a.test');
  assert.ok(fakeDb._dump()['users/auth-emp-a'].sessionsRevokedAt);
  const auditKeys = Object.keys(fakeDb._dump()).filter(k => k.startsWith('adminAuditEvents/'));
  assert.equal(auditKeys.length, 1);
  assert.equal(fakeDb._dump()[auditKeys[0]].action, 'employee_login_email_change');
});

test('EXECUTION: changeLoginEmail rejects mismatched email confirmation before any Auth/Firestore write happens', async () => {
  const { handler, authCalls } = buildHandler({ seed: baseSeed(), callers: baseCallers() });
  const { req, res, result } = fakeReqRes(MANAGER_A, { action: 'changeLoginEmail', employeeId: 'emp-linked-a', email: 'new@org-a.test', confirmEmail: 'different@org-a.test' });
  await handler(req, res);
  const r = result();
  assert.equal(r.status, 400);
  assert.equal(r.body.reason, 'email_confirmation_mismatch');
  assert.equal(authCalls.updateUser.length, 0, 'must not touch Auth when confirmation fails validation');
});

test('EXECUTION: changeLoginEmail rejects an unlinked employee (no_linked_account)', async () => {
  const { handler } = buildHandler({ seed: baseSeed(), callers: baseCallers() });
  const { req, res, result } = fakeReqRes(MANAGER_A, { action: 'changeLoginEmail', employeeId: 'emp-unlinked-a', email: 'x@org-a.test', confirmEmail: 'x@org-a.test' });
  await handler(req, res);
  const r = result();
  assert.equal(r.status, 400);
  assert.equal(r.body.reason, 'no_linked_account');
});

test('EXECUTION: changeLoginEmail rejects cross-organization target even for a manager', async () => {
  const { handler } = buildHandler({ seed: baseSeed(), callers: baseCallers() });
  const { req, res, result } = fakeReqRes(MANAGER_A, { action: 'changeLoginEmail', employeeId: 'emp-linked-b', email: 'x@org-a.test', confirmEmail: 'x@org-a.test' });
  await handler(req, res);
  const r = result();
  assert.equal(r.status, 403);
  assert.equal(r.body.reason, 'cross_organization_denied');
});

test('EXECUTION: changeLoginEmail rejects an owner caller (manager-role-only, matching setPassword\'s posture)', async () => {
  const { handler } = buildHandler({ seed: baseSeed(), callers: baseCallers() });
  const { req, res, result } = fakeReqRes(OWNER, { action: 'changeLoginEmail', employeeId: 'emp-linked-a', email: 'x@org-a.test', confirmEmail: 'x@org-a.test' });
  await handler(req, res);
  const r = result();
  assert.equal(r.status, 403);
  assert.equal(r.body.reason, 'email_management_denied');
});

test('EXECUTION: changeLoginEmail rejects a stale (not-recently-authenticated) session', async () => {
  const callers = baseCallers();
  callers[MANAGER_A].authTime = NOW - 20 * 60; // 20 minutes ago, outside the 10-minute window
  const { handler } = buildHandler({ seed: baseSeed(), callers });
  const { req, res, result } = fakeReqRes(MANAGER_A, { action: 'changeLoginEmail', employeeId: 'emp-linked-a', email: 'x@org-a.test', confirmEmail: 'x@org-a.test' });
  await handler(req, res);
  const r = result();
  assert.equal(r.status, 401);
  assert.equal(r.body.reason, 'reauthentication_required');
});

test('EXECUTION: an unknown action still returns the existing deterministic error, unaffected by the new actions', async () => {
  const { handler } = buildHandler({ seed: baseSeed(), callers: baseCallers() });
  const { req, res, result } = fakeReqRes(MANAGER_A, { action: 'totallyMadeUp' });
  await handler(req, res);
  const r = result();
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'unknown_action');
});

test('EXECUTION: listAssignments (the real history endpoint dialogs.js now exclusively relies on) is untouched and still works', async () => {
  const seed = baseSeed();
  seed.employeeAssignments = {
    'a1': { assignmentId: 'a1', employeeId: 'emp-linked-a', organizationId: 'org-a', productId: 'field', assignmentType: 'MEMBER', status: 'ACTIVE' },
  };
  const { handler } = buildHandler({ seed, callers: baseCallers() });
  const { req, res, result } = fakeReqRes(MANAGER_A, { action: 'listAssignments', organizationId: 'org-a', employeeId: 'emp-linked-a' });
  await handler(req, res);
  const r = result();
  assert.equal(r.status, 200);
  assert.equal(r.body.assignments.length, 1);
  assert.equal(r.body.assignments[0].employeeId, 'emp-linked-a');
});
