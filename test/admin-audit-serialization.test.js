'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakes, fakeRequest, fakeResponse } = require('./helpers/fakeFirebaseAdmin');

const USERS_HANDLER_PATH = require.resolve('../api/admin/users.js');
const AUTHZ_PATH = require.resolve('../api/_lib/authz.js');
const RECONCILIATION_PATH = require.resolve('../api/_lib/landsSyncReconciliation.js');

function loadFreshUsersHandler() {
  delete require.cache[AUTHZ_PATH];
  delete require.cache[RECONCILIATION_PATH];
  delete require.cache[USERS_HANDLER_PATH];
  return require(USERS_HANDLER_PATH);
}

function seedManager(fakes) {
  fakes.store.seed('managers/manager-1', {
    uid: 'manager-1',
    role: 'manager',
    active: true,
    organizationId: 'org-alpha',
    email: 'manager@example.com',
  });
}

function rejectUndefinedRecursively(value, path = 'root') {
  if (value === undefined) throw new Error('Firestore rejects undefined at ' + path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectUndefinedRecursively(item, path + '[' + index + ']'));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    rejectUndefinedRecursively(item, path + '.' + key);
  }
}

function enforceAdminAuditUndefinedRejection(store) {
  const originalCollection = store.collection;
  store.collection = (name) => {
    const collection = originalCollection(name);
    if (name !== 'adminAuditEvents') return collection;
    return {
      ...collection,
      async add(data) {
        rejectUndefinedRecursively(data);
        return collection.add(data);
      },
    };
  };
}

test('setServices sanitizes undefined audit detail after successful Lands trusted sync', async () => {
  const fakes = installFakes({
    bridgeResponses: [{ ok: true, bridged: true, eventId: 'lands_evt_audit' }],
  });

  try {
    seedManager(fakes);
    fakes.store.seed('users/lands-pending-audit', {
      uid: 'lands-pending-audit',
      role: null,
      active: true,
      organizationId: 'org-alpha',
      email: 'lands-pending-audit@example.com',
      landsAccess: {
        enabled: true,
        role: 'lands_employee',
        syncStatus: 'pending_trusted_sync',
      },
    });

    enforceAdminAuditUndefinedRejection(fakes.store);
    const usersHandler = loadFreshUsersHandler();

    const req = fakeRequest({
      uid: 'manager-1',
      body: {
        action: 'setServices',
        uid: 'lands-pending-audit',
        lands: { enabled: true, role: 'lands_employee' },
      },
    });
    const res = fakeResponse();

    await usersHandler(req, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.lands.syncStatus, 'synced');
    assert.equal(fakes.bridgeCalls.length, 1);

    const stored = fakes.store.docs.get('users/lands-pending-audit');
    assert.equal(stored.landsAccess.syncStatus, 'synced');

    const auditEntries = [...fakes.store.docs.entries()]
      .filter(([path]) => path.startsWith('adminAuditEvents/'));

    assert.equal(auditEntries.length, 1);
    assert.equal(auditEntries[0][1].action, 'set_services');
    assert.deepEqual(auditEntries[0][1].detail, {
      lands: { enabled: true, role: 'lands_employee' },
    });
  } finally {
    fakes.restore();
  }
});
