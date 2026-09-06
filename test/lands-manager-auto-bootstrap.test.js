'use strict';
// Integration coverage for the automatic institution-manager Lands bootstrap
// (api/_lib/landsManagerBootstrap.js), wired inline into api/admin/users.js
// right before the FIRST trusted Lands entitlement mutation a manager ever
// triggers. See test/manager-lands-bridge-integration.test.js for the
// pre-existing manager -> Lands bridge coverage this extends; this file adds
// only the auto-bootstrap-specific scenarios.

const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakes, fakeRequest, fakeResponse } = require('./helpers/fakeFirebaseAdmin');
const { ensureManagerLandsBootstrap } = require('../api/_lib/landsManagerBootstrap');

const USERS_HANDLER_PATH = require.resolve('../api/admin/users.js');
const AUTHZ_PATH = require.resolve('../api/_lib/authz.js');
const RECONCILIATION_PATH = require.resolve('../api/_lib/landsSyncReconciliation.js');

function loadFreshUsersHandler() {
  delete require.cache[AUTHZ_PATH];
  delete require.cache[RECONCILIATION_PATH];
  delete require.cache[USERS_HANDLER_PATH];
  return require(USERS_HANDLER_PATH);
}

function seedManager(fakes, { uid = 'manager-1', organizationId = 'org-alpha', active = true } = {}) {
  fakes.store.seed(`managers/${uid}`, { uid, role: 'manager', active, organizationId, email: 'manager@example.com' });
  return { uid, organizationId };
}

function auditEntries(fakes) {
  return [...fakes.store.docs.entries()].filter(([path]) => path.includes('/auditLogs/'));
}

test('1. first Lands entitlement operation: manager auto-bootstrapped, then employee sync succeeds', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: true, bridged: true, eventId: 'evt_1' }] });
  try {
    const { uid, organizationId } = seedManager(fakes);
    const usersHandler = loadFreshUsersHandler();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'emp@example.com', name: 'Employee', field: { enabled: false }, lands: { enabled: true, role: 'lands_employee' } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.lands.syncStatus, 'synced');

    const managerAccess = fakes.store.docs.get(`landsMunicipalities/${organizationId}/userAccess/${uid}`);
    assert.ok(managerAccess, 'manager was auto-bootstrapped');
    assert.equal(managerAccess.lands_role, 'municipal_manager');
    assert.equal(managerAccess.firebase_uid, uid);
    assert.equal(managerAccess.municipality_id, organizationId);
    assert.equal(auditEntries(fakes).length, 1, 'exactly one bootstrap audit event');
    assert.equal(auditEntries(fakes)[0][1].action, 'lands.manager_bootstrapped');
  } finally { fakes.restore(); }
});

test('2. second Lands entitlement operation (same manager): no duplicate bootstrap, normal mutation succeeds', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: true, bridged: true, eventId: 'evt_a' }, { ok: true, bridged: true, eventId: 'evt_b' }] });
  try {
    const { uid, organizationId } = seedManager(fakes);
    const usersHandler = loadFreshUsersHandler();

    const req1 = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'emp1@example.com', name: 'Employee 1', field: { enabled: false }, lands: { enabled: true, role: 'lands_employee' } } });
    await usersHandler(req1, fakeResponse());
    assert.equal(auditEntries(fakes).length, 1);

    const req2 = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'emp2@example.com', name: 'Employee 2', field: { enabled: false }, lands: { enabled: true, role: 'lands_employee' } } });
    const res2 = fakeResponse();
    await usersHandler(req2, res2);

    assert.equal(res2.statusCode, 200, JSON.stringify(res2.body));
    assert.equal(res2.body.lands.syncStatus, 'synced');
    assert.equal(auditEntries(fakes).length, 1, 'still exactly one bootstrap audit event after a second entitlement operation');
    assert.equal(fakes.bridgeCalls.length, 2, 'both entitlement mutations still reached the Lands bridge');
  } finally { fakes.restore(); }
});

test('3. non-manager caller is denied before any bootstrap or mutation happens', async () => {
  const fakes = installFakes();
  try {
    const usersHandler = loadFreshUsersHandler();
    const req = fakeRequest({ uid: 'plain-employee', body: { action: 'create', organizationId: 'org-alpha', email: 'x@example.com', name: 'X', field: { enabled: false }, lands: { enabled: true, role: 'lands_employee' } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'owner_or_manager_required');
    assert.equal(fakes.bridgeCalls.length, 0);
    assert.equal([...fakes.store.docs.keys()].some((p) => p.includes('userAccess')), false);
  } finally { fakes.restore(); }
});

test('4. inactive manager is denied before any bootstrap or mutation happens', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes, { active: false });
    const usersHandler = loadFreshUsersHandler();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'x@example.com', name: 'X', field: { enabled: false }, lands: { enabled: true, role: 'lands_employee' } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'owner_or_manager_required');
    assert.equal(fakes.bridgeCalls.length, 0);
    assert.equal([...fakes.store.docs.keys()].some((p) => p.includes('userAccess')), false);
  } finally { fakes.restore(); }
});

test('5. cross-org impossible: two managers auto-bootstrap into two separate municipalities only', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: true, bridged: true, eventId: 'evt_a' }, { ok: true, bridged: true, eventId: 'evt_b' }] });
  try {
    const mgrA = seedManager(fakes, { uid: 'mgr-a', organizationId: 'org-a' });
    const mgrB = seedManager(fakes, { uid: 'mgr-b', organizationId: 'org-b' });
    const usersHandler = loadFreshUsersHandler();

    await usersHandler(fakeRequest({ uid: mgrA.uid, body: { action: 'create', organizationId: mgrA.organizationId, email: 'a@example.com', name: 'A', field: { enabled: false }, lands: { enabled: true, role: 'lands_employee' } } }), fakeResponse());
    await usersHandler(fakeRequest({ uid: mgrB.uid, body: { action: 'create', organizationId: mgrB.organizationId, email: 'b@example.com', name: 'B', field: { enabled: false }, lands: { enabled: true, role: 'lands_employee' } } }), fakeResponse());

    assert.ok(fakes.store.docs.get('landsMunicipalities/org-a/userAccess/mgr-a'));
    assert.ok(fakes.store.docs.get('landsMunicipalities/org-b/userAccess/mgr-b'));
    assert.equal(fakes.store.docs.get('landsMunicipalities/org-a/userAccess/mgr-b'), undefined);
    assert.equal(fakes.store.docs.get('landsMunicipalities/org-b/userAccess/mgr-a'), undefined);
  } finally { fakes.restore(); }
});

test('6. employee cannot bootstrap self: ensureManagerLandsBootstrap no-ops for a non-manager caller', async () => {
  const fakes = installFakes();
  try {
    const employee = { uid: 'employee-uid-1', isOwner: false, isManager: false, role: null, organizationId: null };
    const result = await ensureManagerLandsBootstrap(fakes.store, employee);
    assert.equal(result.attempted, false);
    assert.equal([...fakes.store.docs.keys()].some((p) => p.includes('userAccess')), false);
  } finally { fakes.restore(); }
});

test('7. audit bootstrap event created exactly once across multiple entitlement operations', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: true, bridged: true, eventId: 'evt_a' }, { ok: true, bridged: true, eventId: 'evt_b' }, { ok: true, bridged: true, eventId: 'evt_c' }] });
  try {
    const { uid, organizationId } = seedManager(fakes);
    const usersHandler = loadFreshUsersHandler();

    for (const email of ['e1@example.com', 'e2@example.com', 'e3@example.com']) {
      await usersHandler(fakeRequest({ uid, body: { action: 'create', organizationId, email, name: 'E', field: { enabled: false }, lands: { enabled: true, role: 'lands_employee' } } }), fakeResponse());
    }
    assert.equal(auditEntries(fakes).length, 1);
  } finally { fakes.restore(); }
});

test('8. existing already-bootstrapped manager (manual endpoint) unaffected by auto-bootstrap', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: true, bridged: true, eventId: 'evt_1' }] });
  try {
    const { uid, organizationId } = seedManager(fakes);
    // Simulate this manager already having gone through the manual
    // POST /api/admin/lands-bootstrap endpoint in the past.
    fakes.store.seed(`landsMunicipalities/${organizationId}/userAccess/${uid}`, {
      firebase_uid: uid, municipality_id: organizationId, lands_role: 'municipal_manager', enabled: true, bootstrapped: true, bootstrapped_by: uid,
    });
    fakes.store.seed(`landsMunicipalities/${organizationId}/auditLogs/lands_bootstrap_${organizationId}_${uid}`, { action: 'lands.manager_bootstrapped' });

    const usersHandler = loadFreshUsersHandler();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'emp@example.com', name: 'Employee', field: { enabled: false }, lands: { enabled: true, role: 'lands_employee' } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.lands.syncStatus, 'synced');
    assert.equal(auditEntries(fakes).length, 1, 'no duplicate audit event for an already-bootstrapped manager');
    const managerAccess = fakes.store.docs.get(`landsMunicipalities/${organizationId}/userAccess/${uid}`);
    assert.equal(managerAccess.bootstrapped_by, uid, 'existing membership document untouched');
  } finally { fakes.restore(); }
});

test('9. Field-only flows unchanged: no bootstrap attempted when Lands is never touched', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const usersHandler = loadFreshUsersHandler();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'field@example.com', name: 'Field Employee', field: { enabled: true, role: 'inspector' }, lands: { enabled: false } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(fakes.bridgeCalls.length, 0, 'Lands bridge never called for a Field-only account');
    assert.equal([...fakes.store.docs.keys()].some((p) => p.includes('userAccess')), false, 'manager was never bootstrapped for a Field-only operation');
  } finally { fakes.restore(); }
});
