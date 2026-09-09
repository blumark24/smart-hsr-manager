'use strict';
// Phase 03B — Unified User Center. Integration-level coverage of
// api/admin/employees.js: the REAL handler and the REAL authorization logic
// (api/_lib/authz.js assertCanManageEmployee/getCallerContext) run
// unmodified against an in-memory Firestore/Auth double — no real Firebase
// project, no network. Mirrors the existing pattern established by
// test/manager-lands-bridge-integration.test.js and
// test/manager-user-center-negative-security.test.js.

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

function seedManager(fakes, { uid = 'manager-1', organizationId = 'org-alpha' } = {}) {
  fakes.store.seed(`managers/${uid}`, { uid, role: 'manager', active: true, organizationId, email: 'manager@example.com' });
  return { uid, organizationId };
}

function seedDepartmentHead(fakes, { uid = 'depthead-1', organizationId = 'org-alpha', department = 'الصيانة' } = {}) {
  fakes.store.seed(`users/${uid}`, { uid, role: 'department_head', active: true, organizationId, department, email: 'depthead@example.com' });
  return { uid, organizationId, department };
}

function seedEmployee(fakes, id, data) {
  fakes.store.seed(`employees/${id}`, {
    organizationId: 'org-alpha', name: 'موظف', accountStatus: 'NO_ACCOUNT', authUid: null,
    products: { field: { enabled: false, role: null }, lands: { enabled: false, role: null }, mobility: { enabled: false, role: null, vehicleEligible: true } },
    ...data,
  });
  return id;
}

// ---- 1. employee record without account ----
test('1. employee record without account: create() writes NO_ACCOUNT with no Firebase Auth call', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const handler = loadFreshHandler();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, name: 'أحمد علي', department: 'الصيانة' } });
    const res = fakeResponse();
    await handler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.employee.accountStatus, 'NO_ACCOUNT');
    assert.equal(res.body.employee.authUid, null);
    assert.equal(fakes.auth._users.size, 0, 'no Firebase Auth account was created for a plain registry record');
  } finally { fakes.restore(); }
});

// ---- 2. employee account activation state ----
test('2. account activation: NO_ACCOUNT -> ACTIVE creates a real Auth account and links it', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const handler = loadFreshHandler();
    const createRes = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'create', organizationId, name: 'سارة محمد' } }), createRes);
    const employeeId = createRes.body.employee.employeeId;

    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'activateAccount', employeeId, email: 'sara@example.com', field: { enabled: true, role: 'inspector' } } }), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.accountStatus, 'ACTIVE');
    assert.ok(res.body.authUid);
    assert.equal(fakes.auth._users.size, 1);
    const stored = fakes.store.docs.get(`employees/${employeeId}`);
    assert.equal(stored.accountStatus, 'ACTIVE');
    assert.equal(stored.authUid, res.body.authUid);
    const userDoc = fakes.store.docs.get(`users/${res.body.authUid}`);
    assert.equal(userDoc.role, 'inspector');
    assert.equal(userDoc.employeeId, employeeId, 'the users/{uid} doc back-links to its employee record');
  } finally { fakes.restore(); }
});

test('2b. account activation is rejected once already ACTIVE (no double-activation)', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const handler = loadFreshHandler();
    const employeeId = 'emp-active-1';
    seedEmployee(fakes, employeeId, { organizationId, accountStatus: 'ACTIVE', authUid: 'uid_existing' });

    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'activateAccount', employeeId, email: 'x@example.com' } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'account_already_active_or_invalid_state');
  } finally { fakes.restore(); }
});

// ---- 3/4. manager same-org / cross-org ----
test('3. manager same-org access: manager may list and manage employees in their own organization', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'list', organizationId } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.employees.length, 1);
  } finally { fakes.restore(); }
});

test('4. manager cross-org access denied', async () => {
  const fakes = installFakes();
  try {
    const { uid } = seedManager(fakes, { organizationId: 'org-alpha' });
    seedEmployee(fakes, 'emp-1', { organizationId: 'org-beta' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'list', organizationId: 'org-beta' } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_organization_denied');
  } finally { fakes.restore(); }
});

// ---- 5/6. department head own department allowed / other denied ----
test('5. department head own department allowed', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId, department } = seedDepartmentHead(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId, department });
    seedEmployee(fakes, 'emp-2', { organizationId, department: 'أخرى' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'list', organizationId } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.employees.length, 1);
    assert.equal(res.body.employees[0].employeeId, 'emp-1');
  } finally { fakes.restore(); }
});

test('6. department head other department denied for a direct mutation', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedDepartmentHead(fakes, { department: 'الصيانة' });
    seedEmployee(fakes, 'emp-other-dept', { organizationId, department: 'المالية' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'setVehicleEligible', employeeId: 'emp-other-dept', vehicleEligible: false } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_department_denied');
  } finally { fakes.restore(); }
});

// ---- 7. self-privilege escalation denied ----
test('7. self-privilege escalation denied: a department head cannot target their own record for a privileged change', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId, department } = seedDepartmentHead(fakes);
    seedEmployee(fakes, 'emp-self', { organizationId, department, authUid: uid, accountStatus: 'ACTIVE' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'setAccountStatus', employeeId: 'emp-self', status: 'SUSPENDED' } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'self_elevation_denied');
  } finally { fakes.restore(); }
});

// ---- 8. jobTitle change does not change security role ----
test('8. employee jobTitle change does not change security role', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    seedEmployee(fakes, 'emp-1', { organizationId, jobTitle: 'مفتش أول', authUid: 'uid_x', accountStatus: 'ACTIVE' });
    fakes.store.seed('users/uid_x', { uid: 'uid_x', role: 'inspector', active: true, organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'transfer', employeeId: 'emp-1', administration: 'الإدارة العامة' } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const userDoc = fakes.store.docs.get('users/uid_x');
    assert.equal(userDoc.role, 'inspector', 'a jobTitle/administration change never touches the security role field');
  } finally { fakes.restore(); }
});

// ---- 9/10/11. Field-only / Lands-only / Field+Lands same identity ----
test('9. Field-only account activation', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const create = fakeResponse();
    const handler = loadFreshHandler();
    await handler(fakeRequest({ uid, body: { action: 'create', organizationId, name: 'Field Only' } }), create);
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'activateAccount', employeeId: create.body.employee.employeeId, email: 'f@example.com', field: { enabled: true, role: 'inspector' } } }), res);
    assert.equal(res.body.products.field.enabled, true);
    assert.equal(res.body.products.lands.enabled, false);
  } finally { fakes.restore(); }
});

test('10. Lands-only account activation', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const create = fakeResponse();
    const handler = loadFreshHandler();
    await handler(fakeRequest({ uid, body: { action: 'create', organizationId, name: 'Lands Only' } }), create);
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'activateAccount', employeeId: create.body.employee.employeeId, email: 'l@example.com', lands: { enabled: true, role: 'lands_employee' } } }), res);
    assert.equal(res.body.products.field.enabled, false);
    assert.equal(res.body.products.lands.enabled, true);
    assert.equal(res.body.products.lands.role, 'lands_employee');
  } finally { fakes.restore(); }
});

test('11. Field + Lands same identity: both entitlements coexist on one activated account', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const create = fakeResponse();
    const handler = loadFreshHandler();
    await handler(fakeRequest({ uid, body: { action: 'create', organizationId, name: 'Dual' } }), create);
    const res = fakeResponse();
    await handler(fakeRequest({
      uid, body: {
        action: 'activateAccount', employeeId: create.body.employee.employeeId, email: 'dual@example.com',
        field: { enabled: true, role: 'supervisor' }, lands: { enabled: true, role: 'lands_department_manager' },
      },
    }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.products.field.enabled, true);
    assert.equal(res.body.products.field.role, 'supervisor');
    assert.equal(res.body.products.lands.enabled, true);
    assert.equal(res.body.products.lands.role, 'lands_department_manager');
    const userDoc = fakes.store.docs.get(`users/${res.body.authUid}`);
    assert.equal(userDoc.role, 'supervisor');
    assert.equal(userDoc.landsAccess.enabled, true);
  } finally { fakes.restore(); }
});

// ---- 12/13/14. Mobility access, single role only, conflicting roles denied ----
test('12. Mobility access on the same identity', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const create = fakeResponse();
    const handler = loadFreshHandler();
    await handler(fakeRequest({ uid, body: { action: 'create', organizationId, name: 'Mobility Emp' } }), create);
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'activateAccount', employeeId: create.body.employee.employeeId, email: 'm@example.com', field: { enabled: true, role: 'employee' } } }), res);
    assert.equal(res.body.products.mobility.enabled, true);
    assert.equal(res.body.products.mobility.role, 'employee');
  } finally { fakes.restore(); }
});

test('13. one Mobility role only: assignProducts always overwrites role, never accumulates a second one', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const employeeId = 'emp-mob-1';
    seedEmployee(fakes, employeeId, { organizationId, authUid: 'uid_mob', accountStatus: 'ACTIVE', products: { field: { enabled: true, role: 'mobility_head' }, lands: { enabled: false, role: null }, mobility: { enabled: true, role: 'mobility_head', vehicleEligible: true } } });
    fakes.store.seed('users/uid_mob', { uid: 'uid_mob', role: 'mobility_head', active: true, organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'assignProducts', employeeId, field: { enabled: true, role: 'department_head' } } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const userDoc = fakes.store.docs.get('users/uid_mob');
    assert.equal(userDoc.role, 'department_head', 'the single role field is overwritten, never a second role added alongside it');
  } finally { fakes.restore(); }
});

test('14. conflicting Mobility roles denied: the API rejects a non-string/array role outright', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const employeeId = 'emp-mob-2';
    seedEmployee(fakes, employeeId, { organizationId, authUid: 'uid_mob2', accountStatus: 'ACTIVE' });
    fakes.store.seed('users/uid_mob2', { uid: 'uid_mob2', role: 'employee', active: true, organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'assignProducts', employeeId, field: { enabled: true, role: ['mobility_head', 'employee'] } } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'invalid_field_role');
  } finally { fakes.restore(); }
});

// ---- 15/16/17. vehicleEligible false / true / removal ----
test('15. vehicleEligible false is set and audited', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const employeeId = 'emp-veh-1';
    seedEmployee(fakes, employeeId, { organizationId, authUid: 'uid_veh1', accountStatus: 'ACTIVE' });
    fakes.store.seed('users/uid_veh1', { uid: 'uid_veh1', role: 'employee', active: true, organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'setVehicleEligible', employeeId, vehicleEligible: false } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(fakes.store.docs.get('users/uid_veh1').vehicleEligible, false);
    assert.equal(fakes.store.docs.get(`employees/${employeeId}`).products.mobility.vehicleEligible, false);
  } finally { fakes.restore(); }
});

test('16. vehicleEligible true is set', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const employeeId = 'emp-veh-2';
    seedEmployee(fakes, employeeId, { organizationId, authUid: 'uid_veh2', accountStatus: 'ACTIVE' });
    fakes.store.seed('users/uid_veh2', { uid: 'uid_veh2', role: 'employee', active: true, organizationId, vehicleEligible: false });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'setVehicleEligible', employeeId, vehicleEligible: true } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(fakes.store.docs.get('users/uid_veh2').vehicleEligible, true);
  } finally { fakes.restore(); }
});

test('17. vehicle eligibility removal does not remove account access', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const employeeId = 'emp-veh-3';
    seedEmployee(fakes, employeeId, { organizationId, authUid: 'uid_veh3', accountStatus: 'ACTIVE' });
    fakes.store.seed('users/uid_veh3', { uid: 'uid_veh3', role: 'employee', active: true, organizationId });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'setVehicleEligible', employeeId, vehicleEligible: false } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(fakes.store.docs.get('users/uid_veh3').active, true, 'account access is untouched by a vehicle-eligibility change');
    assert.equal(fakes.store.docs.get(`employees/${employeeId}`).accountStatus, 'ACTIVE');
  } finally { fakes.restore(); }
});

// ---- 18. contractor excluded from employee registry ----
test('18. contractor excluded from the employee registry: no field of this schema represents a contractor, and none is ever created', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const handler = loadFreshHandler();
    const create = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'create', organizationId, name: 'Regular Employee' } }), create);
    const stored = fakes.store.docs.get(`employees/${create.body.employee.employeeId}`);
    assert.ok(!('role' in stored), 'an employee registry record never carries a role field at all — contractor or otherwise — until activation');
  } finally { fakes.restore(); }
});

// ---- 19. audit written for privileged changes ----
test('19. audit written for privileged changes (activate, suspend, assignProducts, transfer, setVehicleEligible)', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const handler = loadFreshHandler();
    const create = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'create', organizationId, name: 'Audited Employee' } }), create);
    const employeeId = create.body.employee.employeeId;
    const activate = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'activateAccount', employeeId, email: 'aud@example.com', field: { enabled: true, role: 'inspector' } } }), activate);

    const auditDocs = [...fakes.store.docs.entries()].filter(([path]) => path.startsWith('adminAuditEvents/'));
    const actions = auditDocs.map(([, d]) => d.action);
    assert.ok(actions.includes('employee_create'));
    assert.ok(actions.includes('employee_activate'));
    for (const [, d] of auditDocs) {
      assert.equal(d.actorId, uid, 'actorId always comes from the verified caller, never the request body');
    }
  } finally { fakes.restore(); }
});

// ---- 20. inactive account denied ----
test('20. inactive (SUSPENDED) account cannot have products reassigned while suspended', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const employeeId = 'emp-suspended-1';
    seedEmployee(fakes, employeeId, { organizationId, authUid: 'uid_susp', accountStatus: 'ACTIVE' });
    fakes.store.seed('users/uid_susp', { uid: 'uid_susp', role: 'inspector', active: true, organizationId });
    const handler = loadFreshHandler();
    const suspend = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'setAccountStatus', employeeId, status: 'SUSPENDED' } }), suspend);
    assert.equal(suspend.statusCode, 200);
    assert.equal(fakes.store.docs.get('users/uid_susp').active, false);
    assert.equal(fakes.auth._users.get('uid_susp').disabled, true);
  } finally { fakes.restore(); }
});

// ---- 21. product removal persists ----
test('21. product removal persists: disabling Lands actually clears landsAccess, not just the response', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const employeeId = 'emp-remove-1';
    seedEmployee(fakes, employeeId, { organizationId, authUid: 'uid_remove', accountStatus: 'ACTIVE' });
    fakes.store.seed('users/uid_remove', { uid: 'uid_remove', role: null, active: true, organizationId, landsAccess: { enabled: true, role: 'lands_employee' } });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'assignProducts', employeeId, lands: { enabled: false } } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(fakes.store.docs.get('users/uid_remove').landsAccess, undefined);
    assert.equal(fakes.store.docs.get(`employees/${employeeId}`).products.lands.enabled, false);
  } finally { fakes.restore(); }
});

// ---- 22. legacy compatibility preserved ----
test('22. legacy compatibility preserved: api/admin/users.js is completely untouched by this endpoint', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: true, bridged: true, eventId: 'legacy_evt' }] });
  try {
    const { uid, organizationId } = seedManager(fakes);
    delete require.cache[require.resolve('../api/admin/users.js')];
    const usersHandler = require('../api/admin/users.js');
    const res = fakeResponse();
    await usersHandler(fakeRequest({ uid, body: { action: 'create', organizationId, email: 'legacy@example.com', name: 'Legacy', field: { enabled: true, role: 'inspector' } } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.field.enabled, true);
  } finally { fakes.restore(); }
});

// ---- 25. existing Mobility routing unchanged (a department_head caller is still denied by the OLD endpoint) ----
test('25. existing Mobility/users.js routing unchanged: a department_head caller is still denied by the ORIGINAL users.js endpoint exactly as before', async () => {
  const fakes = installFakes();
  try {
    const { uid } = seedDepartmentHead(fakes);
    delete require.cache[require.resolve('../api/admin/users.js')];
    const usersHandler = require('../api/admin/users.js');
    const res = fakeResponse();
    await usersHandler(fakeRequest({ uid, body: { action: 'list', organizationId: 'org-alpha' } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'owner_or_manager_required', 'the original endpoint never gained department_head access — only the new employees endpoint did');
  } finally { fakes.restore(); }
});

// ---- transfer preserves history, never destroys prior state ----
test('transfer: preserves history and is manager/owner-only, never department_head', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const employeeId = 'emp-transfer-1';
    seedEmployee(fakes, employeeId, { organizationId, department: 'الصيانة' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'transfer', employeeId, department: 'المالية' } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(fakes.store.docs.get(`employees/${employeeId}`).department, 'المالية');
    const historyDocs = [...fakes.store.docs.entries()].filter(([path]) => path.startsWith(`employees/${employeeId}/transferHistory/`));
    assert.equal(historyDocs.length, 1);
    assert.equal(historyDocs[0][1].before.department, 'الصيانة');
    assert.equal(historyDocs[0][1].after.department, 'المالية');
  } finally { fakes.restore(); }
});

test('transfer: a department head is denied outright, regardless of department match', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId, department } = seedDepartmentHead(fakes);
    seedEmployee(fakes, 'emp-t2', { organizationId, department });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'transfer', employeeId: 'emp-t2', department: 'قسم آخر' } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'transfer_requires_manager_or_owner');
  } finally { fakes.restore(); }
});

// ---- honest failure state: Auth succeeds but no fake ACTIVE if Firestore linking fails ----
test('activation never fakes success: if the Firestore linking write fails, the employee is left in an honest PENDING_ACTIVATION with activationError, never a fabricated ACTIVE', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const handler = loadFreshHandler();
    const create = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'create', organizationId, name: 'Failure Case' } }), create);
    const employeeId = create.body.employee.employeeId;

    // Force the Firestore transaction to fail by breaking runTransaction
    // after the Auth account is already created.
    const originalRunTransaction = fakes.store.runTransaction;
    fakes.store.runTransaction = async () => { throw new Error('simulated_firestore_outage'); };
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'activateAccount', employeeId, email: 'failure@example.com', field: { enabled: true, role: 'inspector' } } }), res);
    fakes.store.runTransaction = originalRunTransaction;

    assert.equal(res.statusCode, 502);
    assert.equal(res.body.reason, 'firestore_link_failed');
    const stored = fakes.store.docs.get(`employees/${employeeId}`);
    assert.equal(stored.accountStatus, 'PENDING_ACTIVATION', 'never silently reported as ACTIVE');
    assert.ok(stored.activationError);
    assert.equal(fakes.auth._users.size, 1, 'the Auth account genuinely was created — this is a real partial-failure state, not a full rollback');
  } finally { fakes.restore(); }
});

// ---- Phase 03B.1 hotfix: explicit activateAccount authorization coverage ----

test('activateAccount: an unauthorized caller (no owner/manager/department_head identity at all) is denied outright', async () => {
  const fakes = installFakes();
  try {
    const { organizationId } = seedManager(fakes);
    const employeeId = 'emp-unauth-1';
    seedEmployee(fakes, employeeId, { organizationId });
    // A random signed-in uid with no owners/managers/users record at all.
    fakes.store.seed('users/random-uid', undefined);
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid: 'random-uid', body: { action: 'activateAccount', employeeId, email: 'x@example.com' } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'owner_manager_or_department_head_required');
    assert.equal(fakes.auth._users.size, 0, 'no Firebase Auth account was created for a denied caller');
    assert.equal(fakes.store.docs.get(`employees/${employeeId}`).accountStatus, 'NO_ACCOUNT', 'the employee record is untouched by a denied request');
  } finally { fakes.restore(); }
});

test('activateAccount: cross-org manager is denied', async () => {
  const fakes = installFakes();
  try {
    const { uid } = seedManager(fakes, { organizationId: 'org-alpha' });
    const employeeId = 'emp-cross-org-1';
    seedEmployee(fakes, employeeId, { organizationId: 'org-beta' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'activateAccount', employeeId, email: 'x@example.com' } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_organization_denied');
    assert.equal(fakes.auth._users.size, 0);
  } finally { fakes.restore(); }
});

test('activateAccount: department head limited to their own department — other department denied, own department allowed', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId, department } = seedDepartmentHead(fakes);
    const otherDeptEmployee = 'emp-other-dept-activate';
    seedEmployee(fakes, otherDeptEmployee, { organizationId, department: 'أخرى' });
    const ownDeptEmployee = 'emp-own-dept-activate';
    seedEmployee(fakes, ownDeptEmployee, { organizationId, department });
    const handler = loadFreshHandler();

    const deniedRes = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'activateAccount', employeeId: otherDeptEmployee, email: 'other@example.com' } }), deniedRes);
    assert.equal(deniedRes.statusCode, 403);
    assert.equal(deniedRes.body.reason, 'cross_department_denied');
    assert.equal(fakes.auth._users.size, 0);

    const allowedRes = fakeResponse();
    await handler(fakeRequest({ uid, body: { action: 'activateAccount', employeeId: ownDeptEmployee, email: 'own@example.com' } }), allowedRes);
    assert.equal(allowedRes.statusCode, 200, JSON.stringify(allowedRes.body));
    assert.equal(allowedRes.body.accountStatus, 'ACTIVE');
  } finally { fakes.restore(); }
});
