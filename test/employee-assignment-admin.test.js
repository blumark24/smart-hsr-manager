'use strict';
// ============================================================================
// INSTITUTIONAL ASSIGNMENT FOUNDATION (micro-phase) — integration tests for
// the REAL, unmodified api/admin/employees.js createAssignment/
// endAssignment/listAssignments actions, running against the in-memory
// Firebase Admin fakes (no real Firebase project, no network) — the same
// harness already used by test/manager-employee-center.test.js and
// test/admin-list-mobility-employees.test.js.
//
// Proves, against the REAL handler code:
//   - AUTH: only owner/manager (same org) may create/end/list assignments;
//     every operational role (supervisor, inspector, contractor, Mobility
//     employee, department_head) is denied, and department_head does NOT
//     silently inherit institutional HR authority from
//     assertCanManageEmployee()'s same-department carve-out.
//   - LIFECYCLE: create -> ACTIVE, end -> ENDED, an ended assignment cannot
//     be re-ended, identity fields are never mutated, there is no delete
//     path (the action does not exist at all).
//   - UNIQUENESS: at most one ACTIVE SECTION_HEAD per
//     (organizationId, productId, scope.id).
//   - HISTORY SCENARIOS 1-4 from the brief.
//   - No employee-record or users/{uid} field is ever touched by any of
//     these actions.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakes, fakeRequest, fakeResponse } = require('./helpers/fakeFirebaseAdmin');

const EMPLOYEES_HANDLER_PATH = require.resolve('../api/admin/employees.js');
const AUTHZ_PATH = require.resolve('../api/_lib/authz.js');

function loadFreshHandler() {
  delete require.cache[AUTHZ_PATH];
  delete require.cache[EMPLOYEES_HANDLER_PATH];
  return require(EMPLOYEES_HANDLER_PATH);
}

function seedManager(fakes, { uid = 'mgr-1', organizationId = 'org-a' } = {}) {
  fakes.store.seed(`managers/${uid}`, { uid, role: 'manager', active: true, organizationId });
  return { uid, organizationId };
}

function seedEmployee(fakes, id, data) {
  fakes.store.seed(`employees/${id}`, {
    organizationId: 'org-a', name: 'موظف', accountStatus: 'NO_ACCOUNT', authUid: null,
    products: { field: { enabled: false, role: null }, lands: { enabled: false, role: null }, mobility: { enabled: false, role: null, vehicleEligible: true } },
    ...data,
  });
  return id;
}

const SCOPE = { type: 'PRODUCT', id: 'mobility' };

function assignmentBody(overrides = {}) {
  return {
    action: 'createAssignment',
    employeeId: 'emp-1',
    organizationId: 'org-a',
    productId: 'mobility',
    scope: SCOPE,
    assignmentType: 'PRIMARY',
    startAt: '2026-01-01',
    issuedBy: 'mgr-1',
    ...overrides,
  };
}

// ============================================================================
// AUTH
// ============================================================================

test('AUTH: manager same-org create allowed', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ issuedBy: uid }) }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.assignment.status, 'ACTIVE');
  } finally { fakes.restore(); }
});

test('AUTH: manager cross-org denied', async () => {
  const fakes = installFakes();
  try {
    const { uid } = seedManager(fakes, { organizationId: 'org-a' });
    seedEmployee(fakes, 'emp-1', { organizationId: 'org-b' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ organizationId: 'org-b', issuedBy: uid }) }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_organization_denied');
  } finally { fakes.restore(); }
});

test('AUTH: owner may create an assignment for any organization', async () => {
  const fakes = installFakes();
  try {
    fakes.store.seed('owners/owner-1', { role: 'owner', active: true });
    seedEmployee(fakes, 'emp-1', { organizationId: 'org-a' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid: 'owner-1', body: assignmentBody({ issuedBy: 'owner-1' }) }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  } finally { fakes.restore(); }
});

for (const [label, seedFn] of [
  ['supervisor denied', (fakes) => fakes.store.seed('users/sup-1', { uid: 'sup-1', role: 'supervisor', active: true, organizationId: 'org-a' })],
  ['inspector denied', (fakes) => fakes.store.seed('users/insp-1', { uid: 'insp-1', role: 'inspector', active: true, organizationId: 'org-a' })],
  ['contractor denied', (fakes) => fakes.store.seed('users/con-1', { uid: 'con-1', role: 'contractor', active: true, organizationId: 'org-a' })],
  ['mobility employee denied', (fakes) => fakes.store.seed('users/mob-1', { uid: 'mob-1', role: null, active: true, organizationId: 'org-a', mobilityAccess: { enabled: true, role: 'employee' } })],
  ['department_head denied', (fakes) => fakes.store.seed('users/dept-1', { uid: 'dept-1', role: 'department_head', active: true, organizationId: 'org-a', department: 'x' })],
]) {
  test(`AUTH: ${label}`, async () => {
    const fakes = installFakes();
    try {
      seedFn(fakes);
      seedEmployee(fakes, 'emp-1', { organizationId: 'org-a' });
      const uid = ['sup-1', 'insp-1', 'con-1', 'mob-1', 'dept-1'].find(u => fakes.store.docs.get(`users/${u}`));
      const handler = loadFreshHandler();
      const res = fakeResponse();
      await handler(fakeRequest({ uid, body: assignmentBody({ issuedBy: uid }) }), res);
      // supervisor/inspector/contractor/mobility-employee never even pass the
      // OUTER handler gate (only owner/manager/department_head do), so they
      // are denied there with the outer gate's own reason.
      // department_head DOES pass the outer gate (isDepartmentHead), so it
      // reaches the switch statement — its denial must come from the
      // assignment-specific gate, never a 200, and never silently inherit
      // institutional HR authority.
      assert.equal(res.statusCode, 403, `${label}: expected 403, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
      if (uid === 'dept-1') {
        assert.equal(res.body.reason, 'owner_or_manager_required_for_assignments');
      } else {
        assert.equal(res.body.reason, 'owner_manager_or_department_head_required');
      }
    } finally { fakes.restore(); }
  });
}

test('AUTH: unauthenticated denied', async () => {
  const fakes = installFakes();
  try {
    const handler = loadFreshHandler();
    const req = { method: 'POST', headers: {}, body: assignmentBody() };
    const res = fakeResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 401);
  } finally { fakes.restore(); }
});

test('AUTH: department_head is denied even though it already has same-department authority over ordinary employee-record actions (no silent institutional-HR inheritance)', async () => {
  const fakes = installFakes();
  try {
    fakes.store.seed('users/dept-2', { uid: 'dept-2', role: 'department_head', active: true, organizationId: 'org-a', department: 'الصيانة' });
    seedEmployee(fakes, 'emp-dept', { organizationId: 'org-a', department: 'الصيانة' });
    const handler = loadFreshHandler();
    // Sanity: department_head CAN manage this employee via the pre-existing
    // 'transfer'-adjacent actions is out of scope here, but 'list' (an
    // ordinary employee-record action) should succeed for their department...
    const listRes = fakeResponse();
    await handler(fakeRequest({ uid: 'dept-2', body: { action: 'list', organizationId: 'org-a' } }), listRes);
    assert.equal(listRes.statusCode, 200, 'department_head retains its existing employee-registry list authority, unaffected by this micro-phase');
    // ...but creating an institutional assignment must still be denied.
    const assignRes = fakeResponse();
    await handler(fakeRequest({ uid: 'dept-2', body: assignmentBody({ employeeId: 'emp-dept', issuedBy: 'dept-2' }) }), assignRes);
    assert.equal(assignRes.statusCode, 403);
    assert.equal(assignRes.body.reason, 'owner_or_manager_required_for_assignments');
  } finally { fakes.restore(); }
});

test('AUTH: issuedBy must be the verified caller, never a client-supplied identity (no attribution spoofing)', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ issuedBy: 'someone-else-uid' }) }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'issuedBy_must_be_caller');
  } finally { fakes.restore(); }
});

// ============================================================================
// CONTRACT-VALIDATION passthrough (a small confirming sample; the full
// matrix lives in test/employee-assignment-contract.test.js)
// ============================================================================

test('CONTRACT via handler: invalid productId denied', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ productId: '', issuedBy: uid }) }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'productId_required');
  } finally { fakes.restore(); }
});

test('CONTRACT via handler: invalid assignmentType denied', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ assignmentType: 'GENERAL_SUPERVISOR', issuedBy: uid }) }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'invalid_assignment_type');
  } finally { fakes.restore(); }
});

test('CONTRACT via handler: invalid scope denied', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ scope: { type: 'PRODUCT' }, issuedBy: uid }) }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'invalid_scope');
  } finally { fakes.restore(); }
});

test('CONTRACT via handler: endAt before startAt denied', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ assignmentType: 'TEMPORARY', startAt: '2026-06-01', endAt: '2026-01-01', issuedBy: uid }) }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'end_before_start');
  } finally { fakes.restore(); }
});

test('a request targeting an employee in a DIFFERENT org than the one declared is denied even for a same-org manager (defense in depth)', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes, { organizationId: 'org-a' });
    seedEmployee(fakes, 'emp-elsewhere', { organizationId: 'org-b' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ employeeId: 'emp-elsewhere', organizationId: 'org-a', issuedBy: uid }) }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_organization_denied');
  } finally { fakes.restore(); }
});

// ============================================================================
// LIFECYCLE
// ============================================================================

test('LIFECYCLE: create ACTIVE assignment', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ issuedBy: uid }) }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.assignment.status, 'ACTIVE');
    assert.equal(res.body.assignment.issuedBy, uid);
    assert.ok(res.body.assignment.createdAt);
  } finally { fakes.restore(); }
});

test('LIFECYCLE: end assignment', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    const handler = loadFreshHandler();
    const createRes = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ issuedBy: uid }) }), createRes);
    const assignmentId = createRes.body.assignment.assignmentId;

    const endRes = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'endAssignment', assignmentId, endReason: 'انتهت المهمة' } }), endRes);
    assert.equal(endRes.statusCode, 200, JSON.stringify(endRes.body));
    assert.equal(endRes.body.status, 'ENDED');

    const stored = fakes.store.docs.get(`employeeAssignments/${assignmentId}`);
    assert.equal(stored.status, 'ENDED');
    assert.equal(stored.endedBy, uid);
    assert.ok(stored.endedAt);
    assert.equal(stored.endReason, 'انتهت المهمة');
  } finally { fakes.restore(); }
});

test('LIFECYCLE: ended assignment not reactivated (a second endAssignment call on an already-ended row is rejected)', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    const handler = loadFreshHandler();
    const createRes = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ issuedBy: uid }) }), createRes);
    const assignmentId = createRes.body.assignment.assignmentId;
    await handler(fakeRequest({ uid, body: { action: 'endAssignment', assignmentId } }), fakeResponse());

    const secondEnd = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'endAssignment', assignmentId } }), secondEnd);
    assert.equal(secondEnd.statusCode, 400);
    assert.equal(secondEnd.body.reason, 'assignment_not_active');
  } finally { fakes.restore(); }
});

test('LIFECYCLE: immutable identity fields cannot be changed by ending an assignment', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    const handler = loadFreshHandler();
    const createRes = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ issuedBy: uid }) }), createRes);
    const assignmentId = createRes.body.assignment.assignmentId;
    const before = { ...fakes.store.docs.get(`employeeAssignments/${assignmentId}`) };

    await handler(fakeRequest({ uid, body: { action: 'endAssignment', assignmentId, endReason: 'x' } }), fakeResponse());
    const after = fakes.store.docs.get(`employeeAssignments/${assignmentId}`);

    for (const field of ['employeeId', 'organizationId', 'productId', 'assignmentType', 'issuedBy', 'createdAt']) {
      assert.deepEqual(after[field], before[field], `${field} must remain immutable after ending an assignment`);
    }
  } finally { fakes.restore(); }
});

test('LIFECYCLE: there is no delete path — an unrecognized "deleteAssignment" action is rejected as unknown', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'deleteAssignment', assignmentId: 'whatever' } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'unknown_action');
  } finally { fakes.restore(); }
});

test('LIFECYCLE: ending a nonexistent assignment returns 404, never silently succeeds', async () => {
  const fakes = installFakes();
  try {
    const { uid } = seedManager(fakes);
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'endAssignment', assignmentId: 'ghost' } }), res);
    assert.equal(res.statusCode, 404);
  } finally { fakes.restore(); }
});

// ============================================================================
// UNIQUENESS — at most one ACTIVE SECTION_HEAD per (org, product, scope.id)
// ============================================================================

test('UNIQUENESS: first active SECTION_HEAD allowed', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ assignmentType: 'SECTION_HEAD', issuedBy: uid }) }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  } finally { fakes.restore(); }
});

test('UNIQUENESS: second active SECTION_HEAD same org/product/scope denied', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    seedEmployee(fakes, 'emp-2', { organizationId });
    const handler = loadFreshHandler();
    await handler(fakeRequest({ uid, body: assignmentBody({ employeeId: 'emp-1', assignmentType: 'SECTION_HEAD', issuedBy: uid }) }), fakeResponse());

    const res2 = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ employeeId: 'emp-2', assignmentType: 'SECTION_HEAD', issuedBy: uid }) }), res2);
    assert.equal(res2.statusCode, 409, JSON.stringify(res2.body));
    assert.equal(res2.body.reason, 'section_head_already_active');
  } finally { fakes.restore(); }
});

test('UNIQUENESS: SECTION_HEAD different scope allowed', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    seedEmployee(fakes, 'emp-2', { organizationId });
    const handler = loadFreshHandler();
    await handler(fakeRequest({ uid, body: assignmentBody({ employeeId: 'emp-1', productId: 'field', scope: { type: 'SECTION', id: 'الأسواق' }, assignmentType: 'SECTION_HEAD', issuedBy: uid }) }), fakeResponse());

    const res2 = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ employeeId: 'emp-2', productId: 'field', scope: { type: 'SECTION', id: 'صحة البيئة' }, assignmentType: 'SECTION_HEAD', issuedBy: uid }) }), res2);
    assert.equal(res2.statusCode, 200, JSON.stringify(res2.body));
  } finally { fakes.restore(); }
});

test('UNIQUENESS: SECTION_HEAD different product allowed', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    seedEmployee(fakes, 'emp-2', { organizationId });
    const handler = loadFreshHandler();
    await handler(fakeRequest({ uid, body: assignmentBody({ employeeId: 'emp-1', productId: 'mobility', scope: { type: 'PRODUCT', id: 'mobility' }, assignmentType: 'SECTION_HEAD', issuedBy: uid }) }), fakeResponse());

    const res2 = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ employeeId: 'emp-2', productId: 'lands', scope: { type: 'PRODUCT', id: 'lands' }, assignmentType: 'SECTION_HEAD', issuedBy: uid }) }), res2);
    assert.equal(res2.statusCode, 200, JSON.stringify(res2.body));
  } finally { fakes.restore(); }
});

test('UNIQUENESS: SECTION_HEAD different organization allowed', async () => {
  const fakes = installFakes();
  try {
    const mgrA = seedManager(fakes, { uid: 'mgr-a', organizationId: 'org-a' });
    const mgrB = seedManager(fakes, { uid: 'mgr-b', organizationId: 'org-b' });
    seedEmployee(fakes, 'emp-a', { organizationId: 'org-a' });
    seedEmployee(fakes, 'emp-b', { organizationId: 'org-b' });
    const handler = loadFreshHandler();
    await handler(fakeRequest({ uid: mgrA.uid, body: assignmentBody({ employeeId: 'emp-a', organizationId: 'org-a', assignmentType: 'SECTION_HEAD', issuedBy: mgrA.uid }) }), fakeResponse());

    const res2 = fakeResponse();
    await handler(fakeRequest({ uid: mgrB.uid, body: assignmentBody({ employeeId: 'emp-b', organizationId: 'org-b', assignmentType: 'SECTION_HEAD', issuedBy: mgrB.uid }) }), res2);
    assert.equal(res2.statusCode, 200, JSON.stringify(res2.body));
  } finally { fakes.restore(); }
});

test('UNIQUENESS: new SECTION_HEAD allowed after previous is ended', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    seedEmployee(fakes, 'emp-2', { organizationId });
    const handler = loadFreshHandler();
    const createRes = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ employeeId: 'emp-1', assignmentType: 'SECTION_HEAD', issuedBy: uid }) }), createRes);
    const firstId = createRes.body.assignment.assignmentId;

    await handler(fakeRequest({ uid, body: { action: 'endAssignment', assignmentId: firstId } }), fakeResponse());

    const res2 = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ employeeId: 'emp-2', assignmentType: 'SECTION_HEAD', issuedBy: uid }) }), res2);
    assert.equal(res2.statusCode, 200, JSON.stringify(res2.body));
  } finally { fakes.restore(); }
});

// ============================================================================
// listAssignments
// ============================================================================

test('listAssignments: manager same-org can list; cross-org denied', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    const handler = loadFreshHandler();
    await handler(fakeRequest({ uid, body: assignmentBody({ issuedBy: uid }) }), fakeResponse());

    const okRes = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'listAssignments', organizationId } }), okRes);
    assert.equal(okRes.statusCode, 200);
    assert.equal(okRes.body.assignments.length, 1);

    const crossRes = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'listAssignments', organizationId: 'org-other' } }), crossRes);
    assert.equal(crossRes.statusCode, 403);
  } finally { fakes.restore(); }
});

// ============================================================================
// HISTORY SCENARIOS (from the brief)
// ============================================================================

test('HISTORY 1: employee administration=\'الزراعة\' + Mobility SECTION_HEAD assignment => employee record unchanged', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId, administration: 'الزراعة', department: 'قسم الزراعة', jobTitle: 'مهندس زراعي' });
    const before = { ...fakes.store.docs.get('employees/emp-1') };

    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ employeeId: 'emp-1', productId: 'mobility', scope: { type: 'PRODUCT', id: 'mobility' }, assignmentType: 'SECTION_HEAD', issuedBy: uid }) }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));

    const after = fakes.store.docs.get('employees/emp-1');
    assert.deepEqual(after, before, 'the employee record must be byte-for-byte unchanged by creating an assignment');
    assert.equal(after.administration, 'الزراعة');
  } finally { fakes.restore(); }
});

test('HISTORY 2: Field employee + temporary Mobility assignment => primary employee data unchanged', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-field', { organizationId, department: 'الحصر الميداني', authUid: 'auth-field-1' });
    fakes.store.seed('users/auth-field-1', { uid: 'auth-field-1', role: 'inspector', active: true, organizationId });
    const beforeEmployee = { ...fakes.store.docs.get('employees/emp-field') };
    const beforeUser = { ...fakes.store.docs.get('users/auth-field-1') };

    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ employeeId: 'emp-field', productId: 'mobility', scope: { type: 'PRODUCT', id: 'mobility' }, assignmentType: 'TEMPORARY', endAt: '2026-03-01', issuedBy: uid }) }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));

    assert.deepEqual(fakes.store.docs.get('employees/emp-field'), beforeEmployee, 'primary employee data unchanged');
    assert.deepEqual(fakes.store.docs.get('users/auth-field-1'), beforeUser, 'the linked users/{uid} record is untouched — no live entitlement was granted by this assignment');
  } finally { fakes.restore(); }
});

test('HISTORY 3: change section head => old assignment ended, new assignment active, both history rows retained', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-old-head', { organizationId });
    seedEmployee(fakes, 'emp-new-head', { organizationId });
    const handler = loadFreshHandler();

    const createOld = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ employeeId: 'emp-old-head', assignmentType: 'SECTION_HEAD', issuedBy: uid }) }), createOld);
    const oldId = createOld.body.assignment.assignmentId;

    await handler(fakeRequest({ uid, body: { action: 'endAssignment', assignmentId: oldId, endReason: 'نقل رئاسة القسم' } }), fakeResponse());

    const createNew = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ employeeId: 'emp-new-head', assignmentType: 'SECTION_HEAD', issuedBy: uid }) }), createNew);
    const newId = createNew.body.assignment.assignmentId;
    assert.equal(createNew.statusCode, 200, JSON.stringify(createNew.body));

    const oldRow = fakes.store.docs.get(`employeeAssignments/${oldId}`);
    const newRow = fakes.store.docs.get(`employeeAssignments/${newId}`);
    assert.equal(oldRow.status, 'ENDED');
    assert.equal(newRow.status, 'ACTIVE');
    assert.ok(oldRow, 'old assignment row retained in history, never deleted');
    assert.ok(newRow, 'new assignment row exists');
    assert.notEqual(oldId, newId);
  } finally { fakes.restore(); }
});

test('HISTORY 4: temporary assignment expiry/end => historical row retained', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    const handler = loadFreshHandler();
    const createRes = fakeResponse();
    await handler(fakeRequest({ uid, body: assignmentBody({ assignmentType: 'TEMPORARY', endAt: '2026-02-01', issuedBy: uid }) }), createRes);
    const assignmentId = createRes.body.assignment.assignmentId;

    await handler(fakeRequest({ uid, body: { action: 'endAssignment', assignmentId, endReason: 'انتهاء المهمة المؤقتة' } }), fakeResponse());

    const row = fakes.store.docs.get(`employeeAssignments/${assignmentId}`);
    assert.ok(row, 'the historical row is retained, never deleted');
    assert.equal(row.status, 'ENDED');
    assert.equal(row.assignmentType, 'TEMPORARY');
  } finally { fakes.restore(); }
});

console.log('employee assignment Admin API integration tests (Institutional Assignment Foundation) OK');
