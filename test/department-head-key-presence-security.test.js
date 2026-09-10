'use strict';
// ============================================================================
// PHASE 02B.2 / 06C.2 — DEPARTMENT-HEAD AUTHORIZATION CONTRACT HOTFIX.
//
// api/_lib/authz.js's getCallerContext() previously granted department-head
// employee-registry authorization (isDepartmentHead) directly from the
// legacy scalar field:
//
//   d.role === 'department_head'
//
// This bypassed the canonical Mobility entitlement contract already locked
// everywhere else in this codebase (firestore.rules' `'mobilityAccess' in
// data`, this same file's resolveMobilityRole() used for mobility_head):
// once the `mobilityAccess` KEY exists on a record at all, it alone decides
// that record's Mobility-family role (mobility_head/department_head/
// administrative_affairs/employee) — legacy `role` fallback is allowed
// ONLY when the key is genuinely absent. A stale role:'department_head'
// record whose mobilityAccess had been explicitly disabled (or set to any
// malformed value) still kept full department-head Employee Registry
// authorization under the old code — the exact same class of bug already
// fixed for Mobility routing/discovery in Phase 02B.1/06C.1, now closed for
// this one remaining direct-role-literal authorization check.
//
// Fixed by resolving department-head identity through the SAME
// resolveMobilityRole(d) already used for mobility_head, rather than a
// duplicate resolver. This file proves the fix against the REAL,
// unmodified getCallerContext()/assertCanManageEmployee() and the REAL
// api/admin/employees.js handler — no reimplementations.
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

function seedDepartmentHeadRecord(fakes, overrides = {}) {
  const uid = overrides.uid || 'depthead-sec';
  const organizationId = overrides.organizationId || 'org-sec';
  const department = overrides.department || 'الصيانة';
  const data = {
    uid, active: true, organizationId, department, email: 'depthead-sec@example.com',
    ...overrides.data,
  };
  fakes.store.seed(`users/${uid}`, data);
  return { uid, organizationId, department };
}

function seedEmployee(fakes, id, data) {
  fakes.store.seed(`employees/${id}`, {
    organizationId: 'org-sec', name: 'موظف', accountStatus: 'NO_ACCOUNT', authUid: null,
    products: { field: { enabled: false, role: null }, lands: { enabled: false, role: null }, mobility: { enabled: false, role: null, vehicleEligible: true } },
    ...data,
  });
  return id;
}

// The MALFORMED matrix from the hotfix brief — every one of these, on a
// STALE role:'department_head' record, must deny department-head
// authorization entirely (never fall back to the legacy role once the
// mobilityAccess key exists at all, however malformed its value).
const MALFORMED_MOBILITY_ACCESS = [
  ['null', null],
  ['a string', 'department_head'],
  ['a number', 123],
  ['an array', []],
  ['an empty object', {}],
  ['{enabled:false}', { enabled: false }],
  ['{enabled:false, role:"department_head"}', { enabled: false, role: 'department_head' }],
  ['{enabled:true} with no role', { enabled: true }],
  ['{enabled:true, role:"invalid"}', { enabled: true, role: 'invalid' }],
];

// ---- 1. legacy fallback: mobilityAccess key absent ----
test('1. legacy fallback: role:department_head with mobilityAccess absent is authorized (list)', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId, department } = seedDepartmentHeadRecord(fakes, { data: { role: 'department_head' } });
    seedEmployee(fakes, 'emp-1', { organizationId, department });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'list', organizationId } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.employees.length, 1);
  } finally { fakes.restore(); }
});

// ---- 2-10. every malformed mobilityAccess value denies department-head
// authorization for a stale legacy role:department_head record, across
// every relevant action, proving the SHARED gate rejects the caller before
// any action-specific logic executes ----
for (const [label, value] of MALFORMED_MOBILITY_ACCESS) {
  for (const action of ['list', 'create', 'activateAccount', 'assignProducts', 'setAccountStatus', 'setVehicleEligible']) {
    test(`mobilityAccess = ${label} on a stale role:department_head record is denied for action "${action}"`, async () => {
      const fakes = installFakes();
      try {
        const { uid, organizationId, department } = seedDepartmentHeadRecord(fakes, {
          uid: 'depthead-malformed', data: { role: 'department_head', mobilityAccess: value },
        });
        const employeeId = seedEmployee(fakes, 'emp-target', { organizationId, department });
        const handler = loadFreshHandler();
        const res = fakeResponse();
        const body = { action, organizationId, employeeId, name: 'موظف جديد', department, status: 'ACTIVE', email: 'x@example.com', vehicleEligible: true };
        await handler(fakeRequest({ uid, body }), res);
        assert.equal(res.statusCode, 403, `expected the shared gate to reject action "${action}" with mobilityAccess = ${JSON.stringify(value)}, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.reason, 'owner_manager_or_department_head_required');
        // No employee record was created and no target employee was mutated —
        // the gate rejects BEFORE any action-specific logic runs.
        assert.equal(fakes.store.docs.get(`employees/${employeeId}`).accountStatus, 'NO_ACCOUNT', 'the target employee must be completely untouched');
      } finally { fakes.restore(); }
    });
  }
}

// ---- 11. positive control: a valid, migrated mobilityAccess department
// head retains the intended same-org, same-department permissions ----
test('11. positive control: valid mobilityAccess {enabled:true, role:"department_head"} (migrated, legacy role null) is authorized', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId, department } = seedDepartmentHeadRecord(fakes, {
      uid: 'depthead-migrated', data: { role: null, mobilityAccess: { enabled: true, role: 'department_head' } },
    });
    seedEmployee(fakes, 'emp-own-dept', { organizationId, department });
    seedEmployee(fakes, 'emp-other-dept', { organizationId, department: 'أخرى' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'list', organizationId } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.employees.length, 1, 'only the own-department employee is visible');
    assert.equal(res.body.employees[0].employeeId, 'emp-own-dept');
  } finally { fakes.restore(); }
});

test('11b. positive control: a migrated department head can create an employee record in their own department', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId, department } = seedDepartmentHeadRecord(fakes, {
      uid: 'depthead-migrated-create', data: { role: null, mobilityAccess: { enabled: true, role: 'department_head' } },
    });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'create', organizationId, name: 'موظف جديد', department } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.employee.department, department);
  } finally { fakes.restore(); }
});

test('11c. positive control: a migrated department head can activate an account for an employee in their own department', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId, department } = seedDepartmentHeadRecord(fakes, {
      uid: 'depthead-migrated-activate', data: { role: null, mobilityAccess: { enabled: true, role: 'department_head' } },
    });
    const employeeId = seedEmployee(fakes, 'emp-to-activate', { organizationId, department });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'activateAccount', employeeId, email: 'newhire@example.com', field: { enabled: true, role: 'inspector' } } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.accountStatus, 'ACTIVE');
  } finally { fakes.restore(); }
});

// ---- 12. inactive department head (valid mobilityAccess, active:false) is denied ----
test('12. inactive migrated department head is denied', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedDepartmentHeadRecord(fakes, {
      uid: 'depthead-inactive', data: { role: null, mobilityAccess: { enabled: true, role: 'department_head' }, active: false },
    });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'list', organizationId } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'owner_manager_or_department_head_required');
  } finally { fakes.restore(); }
});

// ---- 13. cross-org denied for a migrated department head ----
test('13. cross-org denied for a migrated department head', async () => {
  const fakes = installFakes();
  try {
    const { uid } = seedDepartmentHeadRecord(fakes, {
      uid: 'depthead-cross-org', organizationId: 'org-sec-a',
      data: { role: null, mobilityAccess: { enabled: true, role: 'department_head' } },
    });
    seedEmployee(fakes, 'emp-other-org', { organizationId: 'org-sec-b' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'list', organizationId: 'org-sec-b' } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_organization_denied');
  } finally { fakes.restore(); }
});

// ---- 14. cross-department denied for a migrated department head ----
test('14. cross-department denied for a migrated department head (direct mutation)', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedDepartmentHeadRecord(fakes, {
      uid: 'depthead-cross-dept', department: 'الصيانة',
      data: { role: null, mobilityAccess: { enabled: true, role: 'department_head' } },
    });
    const employeeId = seedEmployee(fakes, 'emp-other-dept-2', { organizationId, department: 'المالية' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'setVehicleEligible', employeeId, vehicleEligible: false } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_department_denied');
  } finally { fakes.restore(); }
});

// ---- 15. mobility_head behavior unchanged (untouched by this hotfix) ----
test('15. mobility_head is still correctly denied Employee Registry authorization (unrelated authority, unaffected)', async () => {
  const fakes = installFakes();
  try {
    const uid = 'mobhead-1';
    fakes.store.seed(`users/${uid}`, { uid, active: true, organizationId: 'org-sec', mobilityAccess: { enabled: true, role: 'mobility_head' } });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'list', organizationId: 'org-sec' } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'owner_manager_or_department_head_required');
  } finally { fakes.restore(); }
});

// ---- 16. Manager behavior unchanged ----
test('16. manager same-org access unchanged by this hotfix', async () => {
  const fakes = installFakes();
  try {
    const uid = 'mgr-sec';
    const organizationId = 'org-sec';
    fakes.store.seed(`managers/${uid}`, { uid, role: 'manager', active: true, organizationId });
    seedEmployee(fakes, 'emp-mgr', { organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'list', organizationId } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.employees.length, 1);
  } finally { fakes.restore(); }
});

// ---- 17. Owner behavior unchanged ----
test('17. owner access unchanged by this hotfix', async () => {
  const fakes = installFakes();
  try {
    const uid = 'owner-sec';
    const organizationId = 'org-sec';
    fakes.store.seed(`owners/${uid}`, { uid, role: 'owner', active: true });
    seedEmployee(fakes, 'emp-owner', { organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'list', organizationId } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.employees.length, 1);
  } finally { fakes.restore(); }
});

// ---- 18. a Field supervisor never gains department-head authority ----
test('18. a Field supervisor (role:supervisor, no mobilityAccess) does not gain department-head authority', async () => {
  const fakes = installFakes();
  try {
    const uid = 'supervisor-sec';
    const organizationId = 'org-sec';
    fakes.store.seed(`users/${uid}`, { uid, role: 'supervisor', active: true, organizationId, department: 'الصيانة' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'list', organizationId } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'owner_manager_or_department_head_required');
  } finally { fakes.restore(); }
});

test('18b. a Field supervisor with an independent, unrelated mobilityAccess entitlement still does not gain department-head authority', async () => {
  const fakes = installFakes();
  try {
    const uid = 'supervisor-sec-2';
    const organizationId = 'org-sec';
    fakes.store.seed(`users/${uid}`, {
      uid, role: 'supervisor', active: true, organizationId, department: 'الصيانة',
      mobilityAccess: { enabled: true, role: 'employee' },
    });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'list', organizationId } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'owner_manager_or_department_head_required');
  } finally { fakes.restore(); }
});

console.log('department-head authorization key-presence security hotfix (Phase 02B.2/06C.2) OK');
