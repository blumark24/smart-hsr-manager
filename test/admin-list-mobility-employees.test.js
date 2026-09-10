'use strict';
// ============================================================================
// PHASE 06A.2 Blocker 1 — trusted server-side Mobility employee discovery.
//
// api/admin/users.js action 'listMobilityEmployees' replaces the PHASE
// 06A.1 client-side two-Firestore-query design, which security review
// rejected: raw same-org users/{uid} documents (including a stale legacy
// role:'employee' explicitly disabled via mobilityAccess, and any inactive
// employee) could reach the browser before JavaScript filtered them,
// making client-side filtering the de facto authorization boundary. This
// endpoint verifies the caller server-side (Firebase bearer token), derives
// organizationId ONLY from the verified caller's own Firestore record
// (never from the request body), reads same-org users via the Admin SDK
// (which bypasses Firestore Rules entirely — a fully trusted context), and
// returns ONLY a minimal {uid, name} projection for canonically-resolved,
// active, same-org Mobility employees. See api/_lib/authz.js's
// resolveMobilityRole()/getMobilityHeadCallerContext() for the exact
// dual-read this mirrors from firestore.rules' mobilityRoleValue().
//
// Uses the same real-handler-against-in-memory-Firestore harness as
// test/lands-manager-auto-bootstrap.test.js — no real Firebase project, no
// network, but the REAL authorization + handler code runs unmodified.
// ============================================================================

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

test('A: a legacy active employee (role:employee, no mobilityAccess) is returned', async () => {
  const head = { uid: 'head-a', organizationId: 'org-a' };
  const fakes = installFakes();
  try {
    fakes.store.seed(`users/${head.uid}`, { uid: head.uid, role: 'mobility_head', active: true, organizationId: head.organizationId });
    fakes.store.seed('users/emp-legacy', { uid: 'emp-legacy', role: 'employee', active: true, organizationId: head.organizationId, name: 'Legacy Employee' });
    const handler = loadFreshUsersHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid: head.uid, body: { action: 'listMobilityEmployees' } }), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.employees.map(e => e.uid).sort(), ['emp-legacy']);
    assert.equal(res.body.employees[0].name, 'Legacy Employee');
  } finally { fakes.restore(); }
});

test('B: a mobilityAccess-only active employee (legacy role null) is returned', async () => {
  const head = { uid: 'head-b', organizationId: 'org-b' };
  const fakes = installFakes();
  try {
    fakes.store.seed(`users/${head.uid}`, { uid: head.uid, role: 'mobility_head', active: true, organizationId: head.organizationId });
    fakes.store.seed('users/emp-mobility-only', {
      uid: 'emp-mobility-only', role: null, active: true, organizationId: head.organizationId,
      mobilityAccess: { enabled: true, role: 'employee' }, name: 'Mobility Only',
    });
    const handler = loadFreshUsersHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid: head.uid, body: { action: 'listMobilityEmployees' } }), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.employees.map(e => e.uid).sort(), ['emp-mobility-only']);
  } finally { fakes.restore(); }
});

test('C: a Field supervisor who also holds an independent mobilityAccess employee entitlement is returned', async () => {
  const head = { uid: 'head-c', organizationId: 'org-c' };
  const fakes = installFakes();
  try {
    fakes.store.seed(`users/${head.uid}`, { uid: head.uid, role: 'mobility_head', active: true, organizationId: head.organizationId });
    fakes.store.seed('users/field-plus-mobility', {
      uid: 'field-plus-mobility', role: 'supervisor', active: true, organizationId: head.organizationId,
      mobilityAccess: { enabled: true, role: 'employee' }, name: 'Field Plus Mobility',
    });
    const handler = loadFreshUsersHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid: head.uid, body: { action: 'listMobilityEmployees' } }), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.employees.map(e => e.uid).sort(), ['field-plus-mobility']);
  } finally { fakes.restore(); }
});

test('D: mobilityAccess.enabled:false excludes a stale legacy role:employee record SERVER-SIDE', async () => {
  const head = { uid: 'head-d', organizationId: 'org-d' };
  const fakes = installFakes();
  try {
    fakes.store.seed(`users/${head.uid}`, { uid: head.uid, role: 'mobility_head', active: true, organizationId: head.organizationId });
    fakes.store.seed('users/stale-disabled', {
      uid: 'stale-disabled', role: 'employee', active: true, organizationId: head.organizationId,
      mobilityAccess: { enabled: false, role: null }, name: 'Stale Disabled',
    });
    const handler = loadFreshUsersHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid: head.uid, body: { action: 'listMobilityEmployees' } }), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.employees, [], 'the disabled record must never reach the response body at all');
  } finally { fakes.restore(); }
});

test('E: an inactive employee is excluded SERVER-SIDE, legacy and independent alike', async () => {
  const head = { uid: 'head-e', organizationId: 'org-e' };
  const fakes = installFakes();
  try {
    fakes.store.seed(`users/${head.uid}`, { uid: head.uid, role: 'mobility_head', active: true, organizationId: head.organizationId });
    fakes.store.seed('users/inactive-legacy', { uid: 'inactive-legacy', role: 'employee', active: false, organizationId: head.organizationId, name: 'Inactive Legacy' });
    fakes.store.seed('users/inactive-mobility', {
      uid: 'inactive-mobility', role: null, active: false, organizationId: head.organizationId,
      mobilityAccess: { enabled: true, role: 'employee' }, name: 'Inactive Mobility',
    });
    const handler = loadFreshUsersHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid: head.uid, body: { action: 'listMobilityEmployees' } }), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.employees, []);
  } finally { fakes.restore(); }
});

test('F: a same-uid employee in a DIFFERENT organization is excluded SERVER-SIDE (cross-tenant impossible)', async () => {
  const head = { uid: 'head-f', organizationId: 'org-f' };
  const fakes = installFakes();
  try {
    fakes.store.seed(`users/${head.uid}`, { uid: head.uid, role: 'mobility_head', active: true, organizationId: head.organizationId });
    fakes.store.seed('users/other-org-employee', { uid: 'other-org-employee', role: 'employee', active: true, organizationId: 'org-g', name: 'Other Org' });
    const handler = loadFreshUsersHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid: head.uid, body: { action: 'listMobilityEmployees' } }), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.employees, []);
  } finally { fakes.restore(); }
});

test('F2: organizationId is derived ONLY from the verified caller context — a request-body organizationId is ignored entirely', async () => {
  const head = { uid: 'head-f2', organizationId: 'org-f2-real' };
  const fakes = installFakes();
  try {
    fakes.store.seed(`users/${head.uid}`, { uid: head.uid, role: 'mobility_head', active: true, organizationId: head.organizationId });
    fakes.store.seed('users/target-org-employee', { uid: 'target-org-employee', role: 'employee', active: true, organizationId: 'org-f2-attacker-target', name: 'Target' });
    const handler = loadFreshUsersHandler();
    const res = fakeResponse();
    // Attempts to smuggle a different organizationId into the request body —
    // the handler must never read it for this action.
    await handler(fakeRequest({ uid: head.uid, body: { action: 'listMobilityEmployees', organizationId: 'org-f2-attacker-target' } }), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.employees, [], 'a body-supplied organizationId must never be honored');
  } finally { fakes.restore(); }
});

test('G: an unauthorized role cannot call the discovery action — owner, manager, department_head, plain employee, Field supervisor all denied', async () => {
  const fakes = installFakes();
  try {
    fakes.store.seed('owners/owner-1', { role: 'owner', active: true });
    fakes.store.seed('managers/manager-1', { uid: 'manager-1', role: 'manager', active: true, organizationId: 'org-h' });
    fakes.store.seed('users/depthead-1', { uid: 'depthead-1', role: 'department_head', active: true, organizationId: 'org-h', department: 'x' });
    fakes.store.seed('users/employee-1', { uid: 'employee-1', role: 'employee', active: true, organizationId: 'org-h' });
    fakes.store.seed('users/mobility-employee-1', {
      uid: 'mobility-employee-1', role: null, active: true, organizationId: 'org-h',
      mobilityAccess: { enabled: true, role: 'employee' },
    });
    fakes.store.seed('users/supervisor-1', { uid: 'supervisor-1', role: 'supervisor', active: true, organizationId: 'org-h' });
    // A mobility_head record that is explicitly disabled via the independent
    // field must still be denied, even though the legacy role is untouched.
    fakes.store.seed('users/disabled-mobility-head-1', {
      uid: 'disabled-mobility-head-1', role: 'mobility_head', active: true, organizationId: 'org-h',
      mobilityAccess: { enabled: false, role: null },
    });

    const handler = loadFreshUsersHandler();
    for (const uid of ['owner-1', 'manager-1', 'depthead-1', 'employee-1', 'mobility-employee-1', 'supervisor-1', 'disabled-mobility-head-1']) {
      const res = fakeResponse();
      await handler(fakeRequest({ uid, body: { action: 'listMobilityEmployees' } }), res);
      assert.equal(res.statusCode, 403, `${uid} should be denied, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.reason, 'mobility_head_required');
    }
  } finally { fakes.restore(); }
});

test('H: an unauthenticated request (no bearer token) is denied before any Firestore read', async () => {
  const fakes = installFakes();
  try {
    const handler = loadFreshUsersHandler();
    const req = { method: 'POST', headers: {}, body: { action: 'listMobilityEmployees' } };
    const res = fakeResponse();
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'unauthenticated');
  } finally { fakes.restore(); }
});

test('I: only the minimal {uid, name} projection is ever returned — no email, role, mobilityAccess, active, or organizationId leaked', async () => {
  const head = { uid: 'head-i', organizationId: 'org-i' };
  const fakes = installFakes();
  try {
    fakes.store.seed(`users/${head.uid}`, { uid: head.uid, role: 'mobility_head', active: true, organizationId: head.organizationId });
    fakes.store.seed('users/emp-i', {
      uid: 'emp-i', role: 'employee', active: true, organizationId: head.organizationId,
      name: 'Employee I', email: 'employee-i@example.com', vehicleEligible: true,
    });
    const handler = loadFreshUsersHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid: head.uid, body: { action: 'listMobilityEmployees' } }), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.employees.length, 1);
    const projected = res.body.employees[0];
    assert.deepEqual(Object.keys(projected).sort(), ['name', 'uid']);
    assert.equal(projected.uid, 'emp-i');
    assert.equal(projected.name, 'Employee I');
  } finally { fakes.restore(); }
});

test('a mobility_head whose own role lives only in mobilityAccess (post-06A migration) can still call the action', async () => {
  const head = { uid: 'head-migrated', organizationId: 'org-j' };
  const fakes = installFakes();
  try {
    fakes.store.seed(`users/${head.uid}`, {
      uid: head.uid, role: null, active: true, organizationId: head.organizationId,
      mobilityAccess: { enabled: true, role: 'mobility_head' },
    });
    fakes.store.seed('users/emp-j', { uid: 'emp-j', role: 'employee', active: true, organizationId: head.organizationId, name: 'Employee J' });
    const handler = loadFreshUsersHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid: head.uid, body: { action: 'listMobilityEmployees' } }), res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.employees.map(e => e.uid), ['emp-j']);
  } finally { fakes.restore(); }
});

test('an inactive mobility_head cannot call the discovery action even with a real employee to find', async () => {
  const fakes = installFakes();
  try {
    fakes.store.seed('users/head-inactive', { uid: 'head-inactive', role: 'mobility_head', active: false, organizationId: 'org-k' });
    fakes.store.seed('users/emp-k', { uid: 'emp-k', role: 'employee', active: true, organizationId: 'org-k', name: 'Employee K' });
    const handler = loadFreshUsersHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid: 'head-inactive', body: { action: 'listMobilityEmployees' } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'mobility_head_required');
  } finally { fakes.restore(); }
});

test('existing owner/manager actions on this same endpoint are completely unaffected by the new action branch', async () => {
  const fakes = installFakes();
  try {
    fakes.store.seed('managers/mgr-unaffected', { uid: 'mgr-unaffected', role: 'manager', active: true, organizationId: 'org-l' });
    const handler = loadFreshUsersHandler();
    const res = fakeResponse();
    await handler(fakeRequest({ uid: 'mgr-unaffected', body: { action: 'list', organizationId: 'org-l' } }), res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.users));
  } finally { fakes.restore(); }
});

console.log('admin listMobilityEmployees (Blocker 1) OK');
