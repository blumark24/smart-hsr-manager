'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakes, fakeRequest, fakeResponse } = require('./helpers/fakeFirebaseAdmin');

const CONTEXT_HANDLER_PATH = require.resolve('../api/organization/context.js');
const AUTHZ_PATH = require.resolve('../api/_lib/authz.js');
const USER_CENTER_ACTIONS_PATH = require.resolve('../api/_lib/userCenterActions.js');

function loadFreshHandler() {
  delete require.cache[AUTHZ_PATH];
  delete require.cache[USER_CENTER_ACTIONS_PATH];
  delete require.cache[CONTEXT_HANDLER_PATH];
  return require(CONTEXT_HANDLER_PATH);
}

function seedManager(fakes, uid = 'manager-a', organizationId = 'org-a') {
  fakes.store.seed(`managers/${uid}`, { role: 'manager', active: true, organizationId });
}

function seedEmployee(fakes, {
  employeeId = 'emp-1',
  organizationId = 'org-a',
  authUid = 'employee-auth-1',
  email = 'old@example.gov.sa',
} = {}) {
  fakes.store.seed(`employees/${employeeId}`, {
    organizationId,
    name: 'موظف اختبار',
    email,
    authUid,
    accountStatus: 'ACTIVE',
    employmentStatus: 'active',
  });
  if (authUid) {
    fakes.store.seed(`users/${authUid}`, {
      organizationId,
      role: 'inspector',
      active: true,
      email,
    });
    fakes.auth._users.set(authUid, {
      uid: authUid,
      email,
      displayName: 'موظف اختبار',
      disabled: false,
    });
  }
}

async function call(handler, { uid = 'manager-a', body }) {
  const req = fakeRequest({ uid, body });
  const res = fakeResponse();
  await handler(req, res);
  return res;
}

test('user center: non-manager cannot change a linked login email', async () => {
  const fakes = installFakes();
  try {
    fakes.store.seed('users/sup-a', { role: 'supervisor', active: true, organizationId: 'org-a' });
    seedEmployee(fakes);
    const handler = loadFreshHandler();
    const res = await call(handler, { uid: 'sup-a', body: {
      action: 'userCenter.changeLoginEmail', employeeId: 'emp-1', email: 'new@example.gov.sa', confirmEmail: 'new@example.gov.sa',
    }});
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'manager_required');
  } finally { fakes.restore(); }
});

test('user center: cross-organization employee access is denied before email mutation', async () => {
  const fakes = installFakes();
  try {
    seedManager(fakes);
    seedEmployee(fakes, { organizationId: 'org-b' });
    const handler = loadFreshHandler();
    const res = await call(handler, { body: {
      action: 'userCenter.changeLoginEmail', employeeId: 'emp-1', email: 'new@example.gov.sa', confirmEmail: 'new@example.gov.sa',
    }});
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_organization_denied');
  } finally { fakes.restore(); }
});

test('user center: change email rejects unknown/protected input fields', async () => {
  const fakes = installFakes();
  try {
    seedManager(fakes); seedEmployee(fakes);
    const handler = loadFreshHandler();
    const res = await call(handler, { body: {
      action: 'userCenter.changeLoginEmail', employeeId: 'emp-1', email: 'new@example.gov.sa', confirmEmail: 'new@example.gov.sa', role: 'manager',
    }});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'protected_or_unknown_field');
  } finally { fakes.restore(); }
});

test('user center: change email requires matching confirmation', async () => {
  const fakes = installFakes();
  try {
    seedManager(fakes); seedEmployee(fakes);
    const handler = loadFreshHandler();
    const res = await call(handler, { body: {
      action: 'userCenter.changeLoginEmail', employeeId: 'emp-1', email: 'new@example.gov.sa', confirmEmail: 'other@example.gov.sa',
    }});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'email_confirmation_mismatch');
  } finally { fakes.restore(); }
});

test('user center: change email requires a linked auth account', async () => {
  const fakes = installFakes();
  try {
    seedManager(fakes); seedEmployee(fakes, { authUid: null });
    const handler = loadFreshHandler();
    const res = await call(handler, { body: {
      action: 'userCenter.changeLoginEmail', employeeId: 'emp-1', email: 'new@example.gov.sa', confirmEmail: 'new@example.gov.sa',
    }});
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.reason, 'no_linked_account');
  } finally { fakes.restore(); }
});

test('user center: successful email change keeps Auth/users/employees aligned and records audit', async () => {
  const fakes = installFakes();
  try {
    seedManager(fakes); seedEmployee(fakes);
    const handler = loadFreshHandler();
    const res = await call(handler, { body: {
      action: 'userCenter.changeLoginEmail', employeeId: 'emp-1', email: 'NEW@EXAMPLE.GOV.SA', confirmEmail: 'new@example.gov.sa',
    }});
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.email, 'new@example.gov.sa');
    assert.equal(fakes.auth._users.get('employee-auth-1').email, 'new@example.gov.sa');

    const employee = await fakes.store.doc('employees/emp-1').get();
    const user = await fakes.store.doc('users/employee-auth-1').get();
    assert.equal(employee.data().email, 'new@example.gov.sa');
    assert.equal(user.data().email, 'new@example.gov.sa');
    assert.ok(user.data().sessionsRevokedAt);

    const audits = await fakes.store.collection('adminAuditEvents').where('targetEmployeeId', '==', 'emp-1').get();
    const event = audits.docs.map(doc => doc.data()).find(item => item.action === 'employee_login_email_change');
    assert.ok(event);
    assert.equal(event.organizationId, 'org-a');
    assert.equal(event.actorId, 'manager-a');
    assert.equal(event.detail.newEmail, 'new@example.gov.sa');
    assert.equal(event.detail.sessionsRevoked, true);
  } finally { fakes.restore(); }
});

test('user center: history combines employee and uid audit events and strips sensitive details', async () => {
  const fakes = installFakes();
  try {
    seedManager(fakes); seedEmployee(fakes);
    fakes.store.seed('adminAuditEvents/a1', {
      organizationId: 'org-a', targetEmployeeId: 'emp-1', actorId: 'manager-a', actorRole: 'manager', action: 'employee_transfer',
      createdAt: '2026-09-14T12:00:00.000Z', detail: { before: { department: 'A' }, after: { department: 'B' } },
    });
    fakes.store.seed('adminAuditEvents/a2', {
      organizationId: 'org-a', targetUid: 'employee-auth-1', actorId: 'manager-a', actorRole: 'manager', action: 'password_reset',
      createdAt: '2026-09-14T13:00:00.000Z', detail: { password: 'MUST_NOT_LEAK', token: 'SECRET', safe: 'ok' },
    });
    fakes.store.seed('adminAuditEvents/a3', {
      organizationId: 'org-b', targetEmployeeId: 'emp-1', actorId: 'manager-b', actorRole: 'manager', action: 'foreign_event',
      createdAt: '2026-09-14T14:00:00.000Z', detail: { safe: 'wrong tenant' },
    });

    const handler = loadFreshHandler();
    const res = await call(handler, { body: { action: 'userCenter.listHistory', employeeId: 'emp-1' } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.events.length, 2);
    assert.equal(res.body.events[0].action, 'password_reset');
    assert.equal(res.body.events[0].detail.safe, 'ok');
    assert.equal('password' in res.body.events[0].detail, false);
    assert.equal('token' in res.body.events[0].detail, false);
    assert.equal(res.body.events.some(item => item.action === 'foreign_event'), false);
  } finally { fakes.restore(); }
});

test('user center: history rejects unknown fields and remains manager-only', async () => {
  const fakes = installFakes();
  try {
    seedManager(fakes); seedEmployee(fakes);
    const handler = loadFreshHandler();
    const bad = await call(handler, { body: { action: 'userCenter.listHistory', employeeId: 'emp-1', organizationId: 'org-b' } });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.body.reason, 'protected_or_unknown_field');

    fakes.store.seed('users/sup-a', { role: 'supervisor', active: true, organizationId: 'org-a' });
    const denied = await call(handler, { uid: 'sup-a', body: { action: 'userCenter.listHistory', employeeId: 'emp-1' } });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.body.reason, 'manager_required');
  } finally { fakes.restore(); }
});
