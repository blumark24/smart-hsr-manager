'use strict';
// Negative security coverage for the User Center's real backend
// (api/admin/users.js + api/_lib/authz.js), run against the same
// in-memory Firestore/Auth double as manager-lands-bridge-integration.test.js
// — real handler code, real authorization logic, no real Firebase project.
//
// These prove the properties the Phase-2 remediation asked for directly:
// no illegal manager/owner promotion, no cross-organization access, no
// unauthorized caller, no role/service escalation outside the allowed
// scope, no forged organizationId, no forged actor identity in the audit
// trail, and no unauthenticated mutation.

const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakes, fakeRequest, fakeResponse } = require('./helpers/fakeFirebaseAdmin');

const USERS_HANDLER_PATH = require.resolve('../api/admin/users.js');
const AUTHZ_PATH = require.resolve('../api/_lib/authz.js');

function loadFreshUsersHandler() {
  delete require.cache[AUTHZ_PATH];
  delete require.cache[USERS_HANDLER_PATH];
  return require(USERS_HANDLER_PATH);
}

function seedManager(fakes, { uid = 'manager-1', organizationId = 'org-alpha' } = {}) {
  fakes.store.seed(`managers/${uid}`, { uid, role: 'manager', active: true, organizationId, email: 'manager@example.com' });
  return { uid, organizationId };
}

test('N1. manager cannot create/promote a target to manager (illegal promotion denied)', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const handler = loadFreshUsersHandler();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, role: 'manager', email: 'new-manager@example.com' } });
    const res = fakeResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'manager_cannot_manage_managers');
  } finally { fakes.restore(); }
});

test('N2. manager cannot create/promote a target to owner (illegal escalation denied)', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    const handler = loadFreshUsersHandler();
    const req = fakeRequest({ uid, body: { action: 'create', organizationId, role: 'owner', email: 'new-owner@example.com' } });
    const res = fakeResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'invalid_role');
    assert.ok(!res.body.allowed || !res.body.allowed.includes('owner'), 'owner must never appear in the allowed-roles list');
  } finally { fakes.restore(); }
});

test('N3. manager cannot setActive a user in another organization (cross-organization denied)', async () => {
  const fakes = installFakes();
  try {
    const { uid } = seedManager(fakes, { uid: 'manager-1', organizationId: 'org-alpha' });
    fakes.store.seed('users/emp-beta', { uid: 'emp-beta', role: 'employee', active: true, organizationId: 'org-beta' });
    const handler = loadFreshUsersHandler();
    const req = fakeRequest({ uid, body: { action: 'setActive', uid: 'emp-beta', active: false } });
    const res = fakeResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_organization_denied');
    // and the target's record must be untouched
    assert.equal(fakes.store.docs.get('users/emp-beta').active, true);
  } finally { fakes.restore(); }
});

test('N4. manager cannot list another organization\'s users (forged organizationId denied)', async () => {
  const fakes = installFakes();
  try {
    const { uid } = seedManager(fakes, { uid: 'manager-1', organizationId: 'org-alpha' });
    const handler = loadFreshUsersHandler();
    const req = fakeRequest({ uid, body: { action: 'list', organizationId: 'org-beta' } });
    const res = fakeResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_organization_denied');
  } finally { fakes.restore(); }
});

test('N5. an employee (non-owner, non-manager caller) cannot manage users at all', async () => {
  const fakes = installFakes();
  try {
    const { organizationId } = seedManager(fakes);
    fakes.store.seed('users/emp-1', { uid: 'emp-1', role: 'employee', active: true, organizationId });
    const handler = loadFreshUsersHandler();
    const req = fakeRequest({ uid: 'emp-1', body: { action: 'list', organizationId } });
    const res = fakeResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'owner_or_manager_required');
  } finally { fakes.restore(); }
});

test('N6. a caller with no manager/owner record at all cannot manage users', async () => {
  const fakes = installFakes();
  try {
    const handler = loadFreshUsersHandler();
    const req = fakeRequest({ uid: 'nobody', body: { action: 'list', organizationId: 'org-alpha' } });
    const res = fakeResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'owner_or_manager_required');
  } finally { fakes.restore(); }
});

test('N7. manager cannot assign a Field role outside MANAGER_SCOPED_ROLES via setServices (role escalation denied)', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    fakes.store.seed('users/emp-1', { uid: 'emp-1', role: 'employee', active: true, organizationId });
    const handler = loadFreshUsersHandler();
    const req = fakeRequest({ uid, body: { action: 'setServices', uid: 'emp-1', field: { enabled: true, role: 'manager' } } });
    const res = fakeResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'invalid_field_role');
    assert.equal(fakes.store.docs.get('users/emp-1').role, 'employee', 'the target record must be unchanged');
  } finally { fakes.restore(); }
});

test('N8. manager cannot assign an institutional Lands role via setServices (Lands role escalation denied)', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    fakes.store.seed('users/emp-1', { uid: 'emp-1', role: 'employee', active: true, organizationId });
    const handler = loadFreshUsersHandler();
    const req = fakeRequest({ uid, body: { action: 'setServices', uid: 'emp-1', lands: { enabled: true, role: 'lands_municipal_manager' } } });
    const res = fakeResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'invalid_lands_role');
  } finally { fakes.restore(); }
});

test('N9. adminAuditEvents always records the real authenticated caller, never a client-supplied actorId/actorRole', async () => {
  const fakes = installFakes();
  try {
    const { uid, organizationId } = seedManager(fakes);
    fakes.store.seed('users/emp-1', { uid: 'emp-1', role: 'employee', active: true, organizationId });
    const handler = loadFreshUsersHandler();
    // Body attempts to spoof a different actor entirely — the handler
    // never reads these fields for audit purposes at all.
    const req = fakeRequest({ uid, body: {
      action: 'setActive', uid: 'emp-1', active: false,
      actorId: 'someone-else-uid', actorRole: 'owner', organizationId: 'org-beta',
    } });
    const res = fakeResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));

    const auditEntry = [...fakes.store.docs.entries()].find(([path]) => path.startsWith('adminAuditEvents/'));
    assert.ok(auditEntry, 'an audit entry was written');
    const [, data] = auditEntry;
    assert.equal(data.actorId, uid, 'actorId must be the real caller, not the spoofed body field');
    assert.equal(data.actorRole, 'manager', 'actorRole must be the real, server-verified role');
    assert.equal(data.organizationId, organizationId, 'organizationId must be the target\'s real org, not the spoofed body field');
    assert.equal(data.targetUid, 'emp-1');
    assert.equal(data.action, 'disable');
  } finally { fakes.restore(); }
});

test('N10. an unauthenticated request (missing bearer token) is denied before any authorization or mutation', async () => {
  const fakes = installFakes();
  try {
    const handler = loadFreshUsersHandler();
    const req = { method: 'POST', headers: {}, body: { action: 'setActive', uid: 'anyone', active: false } };
    const res = fakeResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'unauthenticated');
  } finally { fakes.restore(); }
});

test('N11. an unauthenticated request (garbage bearer token) is denied', async () => {
  const fakes = installFakes();
  try {
    const handler = loadFreshUsersHandler();
    const req = { method: 'POST', headers: { authorization: 'Bearer not-a-real-token' }, body: { action: 'setActive', uid: 'anyone', active: false } };
    const res = fakeResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'unauthenticated');
  } finally { fakes.restore(); }
});

test('N12. no adminAuditEvents document is ever written for a denied/failed mutation', async () => {
  const fakes = installFakes();
  try {
    const { uid } = seedManager(fakes, { uid: 'manager-1', organizationId: 'org-alpha' });
    fakes.store.seed('users/emp-beta', { uid: 'emp-beta', role: 'employee', active: true, organizationId: 'org-beta' });
    const handler = loadFreshUsersHandler();
    const req = fakeRequest({ uid, body: { action: 'setActive', uid: 'emp-beta', active: false } });
    const res = fakeResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 403);
    const auditEntries = [...fakes.store.docs.keys()].filter(path => path.startsWith('adminAuditEvents/'));
    assert.equal(auditEntries.length, 0, 'a denied request must never produce an audit entry');
  } finally { fakes.restore(); }
});
