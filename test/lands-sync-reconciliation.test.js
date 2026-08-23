'use strict';
// Coverage for the MUTATION_EXECUTION_FAILED reconciliation added to
// api/_lib/landsSyncReconciliation.js and wired into api/admin/users.js.
//
// THE BUG THIS FIXES: Lands' entitlement.enable/change_role/disable are
// single state transitions, not idempotent — a retry after a transient
// failure (or a manager re-saving because the UI didn't confirm success)
// returns 409 MUTATION_EXECUTION_FAILED even when the membership record is
// already in EXACTLY the requested state. Manager's own code used to treat
// any non-ok bridge result as a plain failure, leaving syncStatus stuck at
// 'pending_trusted_sync' forever — blocking the unified SSO login — even
// though Lands' own record was already correct.
//
// Part 1 (pure, isolated) exercises resolveLandsSyncOutcome directly against
// a mocked callLandsMembershipStatus. Part 2 (integration, via the real
// usersHandler + fakeFirebaseAdmin doubles) proves the full save -> mutation
// conflict -> reconciled syncStatus path end-to-end, the same shape as the
// real "عوض الحربي" (uid FCqLBB57SEU8zXFaiF0n021wTl62) incident.

const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakes, fakeRequest, fakeResponse } = require('./helpers/fakeFirebaseAdmin');

const RECONCILIATION_PATH = require.resolve('../api/_lib/landsSyncReconciliation.js');
const LANDS_BRIDGE_PATH = require.resolve('../api/_lib/landsBridge.js');
const USERS_HANDLER_PATH = require.resolve('../api/admin/users.js');
const AUTHZ_PATH = require.resolve('../api/_lib/authz.js');

function loadFreshUsersHandler() {
  delete require.cache[AUTHZ_PATH];
  delete require.cache[RECONCILIATION_PATH];
  delete require.cache[USERS_HANDLER_PATH];
  return require(USERS_HANDLER_PATH);
}

function seedManager(fakes, { uid = 'manager-1', organizationId = 'org-alpha' } = {}) {
  fakes.store.seed(`managers/${uid}`, { uid, role: 'manager', active: true, organizationId, email: 'manager@example.com' });
  return { uid, organizationId };
}

// ---------------------------------------------------------------------
// Part 1: resolveLandsSyncOutcome in isolation (mocked callLandsBridge)
// ---------------------------------------------------------------------

function loadReconciliationWithMembershipStatus(responder) {
  delete require.cache[RECONCILIATION_PATH];
  delete require.cache[LANDS_BRIDGE_PATH];
  const originalLandsBridge = require.cache[LANDS_BRIDGE_PATH];
  const calls = [];
  require.cache[LANDS_BRIDGE_PATH] = {
    id: LANDS_BRIDGE_PATH, filename: LANDS_BRIDGE_PATH, loaded: true,
    exports: {
      async callLandsMembershipStatus(args) { calls.push(args); return responder(args); },
      bridgeConfigured: () => true,
      async callLandsTrustedMutation() { throw new Error('must not be called by reconciliation'); },
    },
  };
  const { resolveLandsSyncOutcome } = require(RECONCILIATION_PATH);
  return { resolveLandsSyncOutcome, calls, restore() {
    if (originalLandsBridge) require.cache[LANDS_BRIDGE_PATH] = originalLandsBridge; else delete require.cache[LANDS_BRIDGE_PATH];
    delete require.cache[RECONCILIATION_PATH];
  } };
}

test('1. a genuinely new entitlement.enable (ok:true) is synced without ever reading membership status', async () => {
  const { resolveLandsSyncOutcome, calls, restore } = loadReconciliationWithMembershipStatus(() => { throw new Error('should not be called'); });
  try {
    const outcome = await resolveLandsSyncOutcome({
      landsSync: { ok: true, eventId: 'evt_1' },
      idToken: 't', municipalityId: 'org-alpha', uid: 'emp-1', desiredEnabled: true, desiredRole: 'lands_employee',
    });
    assert.equal(outcome.syncStatus, 'synced');
    assert.equal(outcome.syncError, null);
    assert.equal(outcome.eventId, 'evt_1');
    assert.equal(calls.length, 0, 'no reconciliation read needed for a plain success');
  } finally { restore(); }
});

test('2. retry conflict where membership already matches exactly: reconciles to synced', async () => {
  const { resolveLandsSyncOutcome, calls, restore } = loadReconciliationWithMembershipStatus(() => ({
    ok: true, exists: true, firebase_uid: 'emp-1', municipality_id: 'org-alpha', lands_role: 'lands_department_manager', enabled: true,
  }));
  try {
    const outcome = await resolveLandsSyncOutcome({
      landsSync: { ok: false, reason: 'MUTATION_EXECUTION_FAILED' },
      idToken: 't', municipalityId: 'org-alpha', uid: 'emp-1', desiredEnabled: true, desiredRole: 'lands_department_manager',
    });
    assert.equal(outcome.syncStatus, 'synced');
    assert.equal(outcome.syncError, null);
    assert.equal(outcome.reconciled, true);
    assert.equal(calls.length, 1);
  } finally { restore(); }
});

test('3. same uid but wrong municipality on the real record: stays failed', async () => {
  const { resolveLandsSyncOutcome, restore } = loadReconciliationWithMembershipStatus(() => ({
    ok: true, exists: true, firebase_uid: 'emp-1', municipality_id: 'org-OTHER', lands_role: 'lands_department_manager', enabled: true,
  }));
  try {
    const outcome = await resolveLandsSyncOutcome({
      landsSync: { ok: false, reason: 'MUTATION_EXECUTION_FAILED' },
      idToken: 't', municipalityId: 'org-alpha', uid: 'emp-1', desiredEnabled: true, desiredRole: 'lands_department_manager',
    });
    assert.equal(outcome.syncStatus, 'pending_trusted_sync');
    assert.equal(outcome.syncError, 'MUTATION_EXECUTION_FAILED');
  } finally { restore(); }
});

test('4. same uid/org but wrong role on the real record: stays failed', async () => {
  const { resolveLandsSyncOutcome, restore } = loadReconciliationWithMembershipStatus(() => ({
    ok: true, exists: true, firebase_uid: 'emp-1', municipality_id: 'org-alpha', lands_role: 'lands_employee', enabled: true,
  }));
  try {
    const outcome = await resolveLandsSyncOutcome({
      landsSync: { ok: false, reason: 'MUTATION_EXECUTION_FAILED' },
      idToken: 't', municipalityId: 'org-alpha', uid: 'emp-1', desiredEnabled: true, desiredRole: 'lands_department_manager',
    });
    assert.equal(outcome.syncStatus, 'pending_trusted_sync');
    assert.equal(outcome.syncError, 'MUTATION_EXECUTION_FAILED');
  } finally { restore(); }
});

test('5. same uid/org/role but enabled=false on the real record: stays failed', async () => {
  const { resolveLandsSyncOutcome, restore } = loadReconciliationWithMembershipStatus(() => ({
    ok: true, exists: true, firebase_uid: 'emp-1', municipality_id: 'org-alpha', lands_role: 'lands_department_manager', enabled: false,
  }));
  try {
    const outcome = await resolveLandsSyncOutcome({
      landsSync: { ok: false, reason: 'MUTATION_EXECUTION_FAILED' },
      idToken: 't', municipalityId: 'org-alpha', uid: 'emp-1', desiredEnabled: true, desiredRole: 'lands_department_manager',
    });
    assert.equal(outcome.syncStatus, 'pending_trusted_sync');
    assert.equal(outcome.syncError, 'MUTATION_EXECUTION_FAILED');
  } finally { restore(); }
});

test('6. missing membership entirely: stays failed, never fabricated as synced', async () => {
  const { resolveLandsSyncOutcome, restore } = loadReconciliationWithMembershipStatus(() => ({ ok: true, exists: false, firebase_uid: null, municipality_id: null, lands_role: null, enabled: false }));
  try {
    const outcome = await resolveLandsSyncOutcome({
      landsSync: { ok: false, reason: 'MUTATION_EXECUTION_FAILED' },
      idToken: 't', municipalityId: 'org-alpha', uid: 'emp-1', desiredEnabled: true, desiredRole: 'lands_department_manager',
    });
    assert.equal(outcome.syncStatus, 'pending_trusted_sync');
    assert.equal(outcome.syncError, 'MUTATION_EXECUTION_FAILED');
  } finally { restore(); }
});

test('7. a non-conflict failure (e.g. LANDS_ACCESS_DENIED) is never reconciled — no membership read attempted', async () => {
  const { resolveLandsSyncOutcome, calls, restore } = loadReconciliationWithMembershipStatus(() => { throw new Error('should not be called for a non-conflict failure'); });
  try {
    const outcome = await resolveLandsSyncOutcome({
      landsSync: { ok: false, reason: 'LANDS_ACCESS_DENIED' },
      idToken: 't', municipalityId: 'org-alpha', uid: 'emp-1', desiredEnabled: true, desiredRole: 'lands_department_manager',
    });
    assert.equal(outcome.syncStatus, 'pending_trusted_sync');
    assert.equal(outcome.syncError, 'LANDS_ACCESS_DENIED');
    assert.equal(calls.length, 0);
  } finally { restore(); }
});

// ---------------------------------------------------------------------
// Part 2: end-to-end through the real usersHandler + fake Firestore/Auth
// ---------------------------------------------------------------------

test('8. end-to-end (create): a conflict that matches the just-requested state reconciles the STORED record to synced', async () => {
  const fakes = installFakes({
    bridgeResponses: [{ ok: false, bridged: true, status: 409, reason: 'MUTATION_EXECUTION_FAILED' }],
    membershipStatusResponses: [],
  });
  try {
    const { uid, organizationId } = seedManager(fakes);
    // landsSyncReconciliation.js destructures callLandsMembershipStatus from
    // landsBridge.js at require time, so this MUST be set on the cached
    // exports object before loadFreshUsersHandler() re-requires it — the
    // exact-match desired-state case from the real incident
    // (firebase_uid/municipality_id/enabled/role all matching).
    require.cache[LANDS_BRIDGE_PATH].exports.callLandsMembershipStatus = async ({ targetUid }) => ({
      ok: true, exists: true, firebase_uid: targetUid, municipality_id: organizationId, lands_role: 'lands_department_manager', enabled: true,
    });
    const usersHandler = loadFreshUsersHandler();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'awad@example.com', name: 'عوض الحربي', field: { enabled: false }, lands: { enabled: true, role: 'lands_department_manager' } } });
    const res = fakeResponse();

    await usersHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.lands.syncStatus, 'synced');
    assert.equal(res.body.lands.syncError, null);
    const stored = fakes.store.docs.get(`users/${res.body.uid}`);
    assert.equal(stored.landsAccess.syncStatus, 'synced');
    assert.equal(stored.landsAccess.syncError, undefined);
  } finally { fakes.restore(); }
});

test('9. end-to-end (create): a conflict that does NOT match the requested state stays a visible failure', async () => {
  const fakes = installFakes({
    bridgeResponses: [{ ok: false, bridged: true, status: 409, reason: 'MUTATION_EXECUTION_FAILED' }],
  });
  try {
    const { uid, organizationId } = seedManager(fakes);
    require.cache[LANDS_BRIDGE_PATH].exports.callLandsMembershipStatus = async ({ targetUid }) => ({
      ok: true, exists: true, firebase_uid: targetUid, municipality_id: organizationId, lands_role: 'lands_employee', enabled: true, // wrong role
    });
    const usersHandler = loadFreshUsersHandler();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'mismatch@example.com', name: 'Mismatch', field: { enabled: false }, lands: { enabled: true, role: 'lands_department_manager' } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.lands.syncStatus, 'pending_trusted_sync');
    assert.equal(res.body.lands.syncError, 'MUTATION_EXECUTION_FAILED');
    const stored = fakes.store.docs.get(`users/${res.body.uid}`);
    assert.equal(stored.landsAccess.syncStatus, 'pending_trusted_sync');
    assert.equal(stored.landsAccess.syncError, 'MUTATION_EXECUTION_FAILED');
  } finally { fakes.restore(); }
});

test('10. existing already-synced state is unchanged: a normal success never triggers a reconciliation read', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: true, bridged: true, eventId: 'evt_ok' }] });
  try {
    const { uid, organizationId } = seedManager(fakes);
    let membershipStatusCallCount = 0;
    require.cache[LANDS_BRIDGE_PATH].exports.callLandsMembershipStatus = async () => { membershipStatusCallCount += 1; return { ok: true, exists: false }; };
    const usersHandler = loadFreshUsersHandler();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'ok@example.com', name: 'OK', field: { enabled: false }, lands: { enabled: true, role: 'lands_employee' } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.body.lands.syncStatus, 'synced');
    assert.equal(membershipStatusCallCount, 0, 'a plain success never needs to read membership status back');
  } finally { fakes.restore(); }
});

test('11. Field-only save is unaffected: no membership-status read, no reconciliation touched at all', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    let membershipStatusCallCount = 0;
    require.cache[LANDS_BRIDGE_PATH].exports.callLandsMembershipStatus = async () => { membershipStatusCallCount += 1; return { ok: true, exists: false }; };
    const usersHandler = loadFreshUsersHandler();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'field@example.com', name: 'Field Employee', field: { enabled: true, role: 'inspector' }, lands: { enabled: false } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(fakes.bridgeCalls.length, 0);
    assert.equal(membershipStatusCallCount, 0);
  } finally { fakes.restore(); }
});

test('12. end-to-end (setServices): a conflict on an existing employee reconciles the same way as create', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: false, bridged: true, status: 409, reason: 'MUTATION_EXECUTION_FAILED' }] });
  try {
    const { uid: managerUid, organizationId } = seedManager(fakes);
    fakes.store.seed('users/emp-existing', { uid: 'emp-existing', role: null, active: true, organizationId, email: 'existing@example.com' });
    require.cache[LANDS_BRIDGE_PATH].exports.callLandsMembershipStatus = async ({ targetUid }) => ({
      ok: true, exists: true, firebase_uid: targetUid, municipality_id: organizationId, lands_role: 'lands_department_manager', enabled: true,
    });
    const usersHandler = loadFreshUsersHandler();
    const req = fakeRequest({ uid: managerUid, body: { action: 'setServices', uid: 'emp-existing', lands: { enabled: true, role: 'lands_department_manager' } } });
    const res = fakeResponse();
    await usersHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.lands.syncStatus, 'synced');
    assert.equal(res.body.lands.syncError, null);
    assert.equal(fakes.store.docs.get('users/emp-existing').landsAccess.syncStatus, 'synced');
  } finally { fakes.restore(); }
});

test('13. reconciliation never creates any additional audit-shaped document — read-only by construction', async () => {
  const fakes = installFakes({ bridgeResponses: [{ ok: false, bridged: true, status: 409, reason: 'MUTATION_EXECUTION_FAILED' }] });
  try {
    const { uid, organizationId } = seedManager(fakes);
    // Pre-seed this manager as already bootstrapped so the doc-count below
    // isolates reconciliation's own effect, independent of the separate
    // (already-covered) auto-bootstrap write.
    fakes.store.seed(`landsMunicipalities/${organizationId}/userAccess/${uid}`, {
      firebase_uid: uid, municipality_id: organizationId, lands_role: 'municipal_manager', enabled: true, bootstrapped: true, bootstrapped_by: uid,
    });
    require.cache[LANDS_BRIDGE_PATH].exports.callLandsMembershipStatus = async ({ targetUid }) => ({
      ok: true, exists: true, firebase_uid: targetUid, municipality_id: organizationId, lands_role: 'lands_department_manager', enabled: true,
    });
    const usersHandler = loadFreshUsersHandler();
    const before = fakes.store.docs.size;
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, email: 'audit@example.com', name: 'Audit Check', field: { enabled: false }, lands: { enabled: true, role: 'lands_department_manager' } } });
    await usersHandler(req, fakeResponse());
    // Exactly one new document (the created users/{uid} record itself) —
    // reconciliation performed a read, not a write, so nothing else appears.
    assert.equal(fakes.store.docs.size, before + 1);
  } finally { fakes.restore(); }
});
