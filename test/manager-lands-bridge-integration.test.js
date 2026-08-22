'use strict';
// Integration-level coverage of the manager -> Lands trusted bridge: real
// handler code (api/admin/users.js, api/admin/lands-bootstrap.js) and real
// authorization logic (api/_lib/authz.js) run unmodified against an
// in-memory Firestore/Auth double and a mocked Lands bridge — no real
// Firebase project, no network. This is the level the pure-function unit
// tests (manager-service-entitlements.test.js, lands-bootstrap.test.js)
// don't reach: full request -> response wiring.

const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakes, fakeRequest, fakeResponse } = require('./helpers/fakeFirebaseAdmin');

const USERS_HANDLER_PATH = require.resolve('../api/admin/users.js');
const BOOTSTRAP_HANDLER_PATH = require.resolve('../api/admin/lands-bootstrap.js');
const AUTHZ_PATH = require.resolve('../api/_lib/authz.js');

function loadFreshHandlers() {
  // authz.js destructures getAuth/getDb from firebaseAdmin.js at require
  // time — it must be re-required too, every time, or it keeps using
  // whichever fake was active the first time it was ever loaded.
  delete require.cache[AUTHZ_PATH];
  delete require.cache[USERS_HANDLER_PATH];
  delete require.cache[BOOTSTRAP_HANDLER_PATH];
  return { usersHandler: require(USERS_HANDLER_PATH), bootstrapHandler: require(BOOTSTRAP_HANDLER_PATH) };
}

function seedManager(fakes, { uid = 'manager-1', organizationId = 'org-alpha' } = {}) {
  fakes.store.seed(`managers/${uid}`, { uid, role: 'manager', active: true, organizationId, email: 'manager@example.com' });
  return { uid, organizationId };
}

test('1. Lands-only employee creation: real enabled membership + exactly one trusted bridge call', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: true, bridged: true, eventId: 'lands_evt_1' }] });
  try {
    const { uid, organizationId } = seedManager(fakes);
    const { usersHandler } = loadFreshHandlers();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'emp@example.com', name: 'Employee', field: { enabled: false }, lands: { enabled: true, role: 'lands_employee' } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.lands.enabled, true);
    assert.equal(res.body.lands.role, 'lands_employee');
    assert.equal(res.body.lands.syncStatus, 'synced');
    assert.equal(fakes.bridgeCalls.length, 1);
    assert.equal(fakes.bridgeCalls[0].operation, 'entitlement.enable');
    assert.equal(fakes.bridgeCalls[0].municipalityId, organizationId);
    assert.equal(fakes.bridgeCalls[0].recordChanges.lands_role, 'lands_employee');
    assert.equal(fakes.bridgeCalls[0].idToken, `token-for-${uid}`);

    // The created account's stored record reflects the synced state.
    const created = [...fakes.store.docs.entries()].find(([path]) => path.startsWith('users/'));
    assert.ok(created, 'user document was written');
    assert.equal(created[1].landsAccess.enabled, true);
    assert.equal(created[1].landsAccess.role, 'lands_employee');
    assert.equal(created[1].landsAccess.syncStatus, 'synced');
    assert.equal(created[1].role, null, 'Field role stays null for a Lands-only account');
  } finally { fakes.restore(); }
});

test('2. Lands department-manager creation: correct real role forwarded to the bridge', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: true, bridged: true, eventId: 'lands_evt_2' }] });
  try {
    const { uid, organizationId } = seedManager(fakes);
    const { usersHandler } = loadFreshHandlers();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'dept@example.com', name: 'Dept Mgr', field: { enabled: false }, lands: { enabled: true, role: 'lands_department_manager' } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.lands.role, 'lands_department_manager');
    assert.equal(fakes.bridgeCalls[0].recordChanges.lands_role, 'lands_department_manager');
  } finally { fakes.restore(); }
});

test('3. Service transfer: Field employee -> Lands removes Field and grants real Lands membership', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: true, bridged: true, eventId: 'lands_evt_3' }] });
  try {
    const { uid: managerUid, organizationId } = seedManager(fakes);
    fakes.store.seed('users/emp-field-1', { uid: 'emp-field-1', role: 'inspector', active: true, organizationId, email: 'field@example.com' });
    const { usersHandler } = loadFreshHandlers();

    // One operational employee = one operational service: a transfer sends
    // both the disable and the enable together in a single request.
    const req = fakeRequest({ uid: managerUid, body: { action: 'setServices', uid: 'emp-field-1', field: { enabled: false }, lands: { enabled: true, role: 'lands_employee' } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.lands.syncStatus, 'synced');
    const stored = fakes.store.docs.get('users/emp-field-1');
    assert.equal(stored.role, null, 'Field access removed by the transfer');
    assert.equal(stored.landsAccess.enabled, true);
    assert.equal(stored.landsAccess.role, 'lands_employee');
  } finally { fakes.restore(); }
});

test('dual-service request is denied: enabling Lands on an active Field employee without disabling Field', async () => {
  const fakes = installFakes();
  try {
    const { uid: managerUid, organizationId } = seedManager(fakes);
    fakes.store.seed('users/emp-field-2', { uid: 'emp-field-2', role: 'inspector', active: true, organizationId, email: 'field2@example.com' });
    const { usersHandler } = loadFreshHandlers();

    const req = fakeRequest({ uid: managerUid, body: { action: 'setServices', uid: 'emp-field-2', lands: { enabled: true, role: 'lands_employee' } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'dual_service_denied');
    assert.equal(fakes.bridgeCalls.length, 0, 'no Lands call attempted for a denied dual-service request');
    const stored = fakes.store.docs.get('users/emp-field-2');
    assert.equal(stored.role, 'inspector', 'Field record untouched by the denied request');
    assert.equal(stored.landsAccess, undefined);
  } finally { fakes.restore(); }
});

test('dual-service request is denied at creation: Field and Lands both enabled in one create call', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const { usersHandler } = loadFreshHandlers();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'dual@example.com', name: 'Dual', field: { enabled: true, role: 'inspector' }, lands: { enabled: true, role: 'lands_employee' } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'dual_service_denied');
    assert.equal(fakes.bridgeCalls.length, 0);
  } finally { fakes.restore(); }
});

test('temporary password on Lands-only creation: real Auth password set and mustChangePassword recorded', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: true, bridged: true, eventId: 'lands_evt_pw' }] });
  try {
    const { uid, organizationId } = seedManager(fakes);
    const { usersHandler } = loadFreshHandlers();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'pw-lands@example.com', name: 'Password Test', field: { enabled: false }, lands: { enabled: true, role: 'lands_department_manager' }, password: 'Br7$Munic1pal' } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.mustChangePassword, true);
    assert.equal(res.body.lands.role, 'lands_department_manager');
    const createdUid = res.body.uid;
    assert.equal(fakes.auth._users.get(createdUid).password, 'Br7$Munic1pal');
    const stored = fakes.store.docs.get(`users/${createdUid}`);
    assert.equal(stored.mustChangePassword, true);
  } finally { fakes.restore(); }
});

test('temporary password on Lands employee creation (not just department manager): real Auth password set and mustChangePassword recorded', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: true, bridged: true, eventId: 'lands_evt_pw_emp' }] });
  try {
    const { uid, organizationId } = seedManager(fakes);
    const { usersHandler } = loadFreshHandlers();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'pw-emp@example.com', name: 'Employee Password Test', field: { enabled: false }, lands: { enabled: true, role: 'lands_employee' }, password: 'Br7$Munic1pal' } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.mustChangePassword, true);
    assert.equal(res.body.lands.role, 'lands_employee');
    const createdUid = res.body.uid;
    assert.equal(fakes.auth._users.get(createdUid).password, 'Br7$Munic1pal');
    const stored = fakes.store.docs.get(`users/${createdUid}`);
    assert.equal(stored.mustChangePassword, true);
    assert.equal(stored.landsAccess.role, 'lands_employee');
  } finally { fakes.restore(); }
});

test('temporary password creation still enforces the existing password policy', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const { usersHandler } = loadFreshHandlers();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'weakpw@example.com', name: 'Weak', field: { enabled: true, role: 'inspector' }, password: 'password' } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'password_policy_failed');
  } finally { fakes.restore(); }
});

test('4. Field + Lands user: disabling Lands leaves Field completely unchanged', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: true, bridged: true, eventId: 'lands_evt_4' }] });
  try {
    const { uid: managerUid, organizationId } = seedManager(fakes);
    fakes.store.seed('users/emp-both-1', {
      uid: 'emp-both-1', role: 'contractor', active: true, organizationId, email: 'both@example.com',
      landsAccess: { enabled: true, role: 'lands_employee', syncStatus: 'synced' },
    });
    const { usersHandler } = loadFreshHandlers();

    const req = fakeRequest({ uid: managerUid, body: { action: 'setServices', uid: 'emp-both-1', lands: { enabled: false } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(fakes.bridgeCalls[0].operation, 'entitlement.disable');
    const stored = fakes.store.docs.get('users/emp-both-1');
    assert.equal(stored.role, 'contractor', 'Field role untouched by disabling Lands');
    assert.equal(stored.active, true);
    assert.equal(stored.landsAccess, undefined, 'landsAccess removed, account/Field untouched');
  } finally { fakes.restore(); }
});

test('5. Lands role change (employee -> department manager): trusted change_role operation', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: true, bridged: true, eventId: 'lands_evt_5' }] });
  try {
    const { uid: managerUid, organizationId } = seedManager(fakes);
    fakes.store.seed('users/emp-role-change', {
      uid: 'emp-role-change', role: null, active: true, organizationId, email: 'rc@example.com',
      landsAccess: { enabled: true, role: 'lands_employee', syncStatus: 'synced' },
    });
    const { usersHandler } = loadFreshHandlers();

    const req = fakeRequest({ uid: managerUid, body: { action: 'setServices', uid: 'emp-role-change', lands: { enabled: true, role: 'lands_department_manager' } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(fakes.bridgeCalls[0].operation, 'entitlement.change_role');
    assert.equal(fakes.bridgeCalls[0].recordChanges.lands_role, 'lands_department_manager');
    assert.equal(fakes.store.docs.get('users/emp-role-change').landsAccess.role, 'lands_department_manager');
  } finally { fakes.restore(); }
});

test('6. Disabling the Lands service revokes the entitlement through the trusted path', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: true, bridged: true, eventId: 'lands_evt_6' }] });
  try {
    const { uid: managerUid, organizationId } = seedManager(fakes);
    fakes.store.seed('users/emp-revoke', {
      uid: 'emp-revoke', role: null, active: true, organizationId, email: 'rv@example.com',
      landsAccess: { enabled: true, role: 'lands_employee', syncStatus: 'synced' },
    });
    const { usersHandler } = loadFreshHandlers();

    const req = fakeRequest({ uid: managerUid, body: { action: 'setServices', uid: 'emp-revoke', lands: { enabled: false } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(fakes.bridgeCalls[0].operation, 'entitlement.disable');
    assert.equal(fakes.store.docs.get('users/emp-revoke').landsAccess, undefined);
  } finally { fakes.restore(); }
});

test('7. Invalid Lands role is denied before any bridge call is made', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const { usersHandler } = loadFreshHandlers();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'x@example.com', name: 'X', field: { enabled: false }, lands: { enabled: true, role: 'lands_municipal_manager' } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'invalid_lands_role');
    assert.equal(fakes.bridgeCalls.length, 0);
  } finally { fakes.restore(); }
});

test('8. Employee (non-manager, non-owner) cannot administer users', async () => {
  const fakes = installFakes();
  try {
    // No managers/{uid} or owners/{uid} record at all — an unrecognized caller.
    const { usersHandler } = loadFreshHandlers();
    const req = fakeRequest({ uid: 'plain-employee', body: { action: 'create', organizationId: 'org-alpha', email: 'x@example.com', name: 'X', field: { enabled: true, role: 'inspector' } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'owner_or_manager_required');
  } finally { fakes.restore(); }
});

test('institution manager bootstrap end-to-end: creates the real municipal_manager membership + exactly one bootstrap audit event', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const { bootstrapHandler } = loadFreshHandlers();
    const req = fakeRequest({ uid, body: {} });
    const res = fakeResponse();
    await bootstrapHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.alreadyBootstrapped, false);
    const access = fakes.store.docs.get(`landsMunicipalities/${organizationId}/userAccess/${uid}`);
    assert.equal(access.enabled, true);
    assert.equal(access.lands_role, 'municipal_manager');
    assert.equal(access.firebase_uid, uid);
    assert.equal(access.municipality_id, organizationId);

    const auditEntries = [...fakes.store.docs.entries()].filter(([path]) => path.includes('/auditLogs/'));
    assert.equal(auditEntries.length, 1, 'exactly one bootstrap audit event');
    assert.equal(auditEntries[0][1].action, 'lands.manager_bootstrapped');
    assert.equal(auditEntries[0][1].safe_metadata.reason_code, 'initial_municipality_lands_authority');
  } finally { fakes.restore(); }
});

test('second bootstrap call: safe no-op, no additional audit event, membership unchanged', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const { bootstrapHandler } = loadFreshHandlers();

    const res1 = fakeResponse();
    await bootstrapHandler(fakeRequest({ uid, body: {} }), res1);
    assert.equal(res1.body.alreadyBootstrapped, false);

    const res2 = fakeResponse();
    await bootstrapHandler(fakeRequest({ uid, body: {} }), res2);
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.body.alreadyBootstrapped, true);

    const auditEntries = [...fakes.store.docs.entries()].filter(([path]) => path.includes('/auditLogs/'));
    assert.equal(auditEntries.length, 1, 'still exactly one audit event after a second call');
  } finally { fakes.restore(); }
});

test('employee cannot call bootstrap', async () => {
  const fakes = installFakes();
  try {
    const { bootstrapHandler } = loadFreshHandlers();
    const res = fakeResponse();
    await bootstrapHandler(fakeRequest({ uid: 'plain-employee', body: {} }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'manager_required');
    const access = [...fakes.store.docs.keys()].some((p) => p.includes('userAccess'));
    assert.equal(access, false, 'no membership document created for a denied caller');
  } finally { fakes.restore(); }
});

test('another municipality cannot be targeted: two managers bootstrap into two separate municipalities only', async () => {
  const fakes = installFakes();
  try {
    const managerA = seedManager(fakes, { uid: 'mgr-a', organizationId: 'org-a' });
    const managerB = seedManager(fakes, { uid: 'mgr-b', organizationId: 'org-b' });
    const { bootstrapHandler } = loadFreshHandlers();

    await bootstrapHandler(fakeRequest({ uid: managerA.uid, body: {} }), fakeResponse());
    await bootstrapHandler(fakeRequest({ uid: managerB.uid, body: {} }), fakeResponse());

    assert.ok(fakes.store.docs.get(`landsMunicipalities/org-a/userAccess/mgr-a`));
    assert.ok(fakes.store.docs.get(`landsMunicipalities/org-b/userAccess/mgr-b`));
    assert.equal(fakes.store.docs.get(`landsMunicipalities/org-a/userAccess/mgr-b`), undefined);
    assert.equal(fakes.store.docs.get(`landsMunicipalities/org-b/userAccess/mgr-a`), undefined);
  } finally { fakes.restore(); }
});

test('arbitrary uid/role/municipality/path input in the bootstrap request body is ignored, not honored', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const { bootstrapHandler } = loadFreshHandlers();
    // The handler never reads req.body for this endpoint at all — prove it
    // by sending a body full of attacker-controlled targeting fields.
    const req = fakeRequest({
      uid, body: {
        uid: 'attacker-uid', organizationId: 'org-victim', municipalityId: 'org-victim',
        lands_role: 'lands_department_manager', role: 'lands_department_manager',
        path: `landsMunicipalities/org-victim/userAccess/attacker-uid`,
      },
    });
    const res = fakeResponse();
    await bootstrapHandler(req, res);

    assert.equal(res.body.municipalityId, organizationId);
    assert.ok(fakes.store.docs.get(`landsMunicipalities/${organizationId}/userAccess/${uid}`));
    assert.equal(fakes.store.docs.get('landsMunicipalities/org-victim/userAccess/attacker-uid'), undefined);
  } finally { fakes.restore(); }
});
