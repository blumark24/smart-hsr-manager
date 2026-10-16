'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { syncManagerLoginEmail } = require('../api/_lib/ownerManagerEmailSync');

function fixture(options = {}) {
  const orgId = 'municipality-official';
  const managerUid = 'faiz-auth-uid';
  const org = {
    status: options.archived ? 'archived' : 'active',
    managerUid: options.unlinked ? '' : managerUid,
    email: options.orgEmail ?? 'faiz@gmail.com',
  };
  const manager = {
    organizationId: options.wrongTenant ? 'other-municipality' : orgId,
    role: 'manager',
    active: true,
    email: options.recordEmail ?? 'faiz1@gmail.com',
  };
  let authEmail = options.authEmail ?? 'faiz1@gmail.com';
  const authUpdates = [], audits = [], revoked = [];
  let txFails = Boolean(options.txFails);
  const db = {
    collection(kind) {
      return {
        doc(id) {
          return {
            kind, id,
            async get() {
              const data = kind === 'organizations' ? org : manager;
              return { exists: true, data: () => ({ ...data }) };
            }
          };
        }
      };
    },
    async runTransaction(callback) {
      const pending = [];
      const tx = {
        get: ref => ref.get(),
        update: (ref, values) => pending.push({ type: 'update', ref, values }),
        create: (ref, values) => pending.push({ type: 'audit', ref, values }),
      };
      await callback(tx);
      if (txFails) throw new Error('firestore_write_failure');
      for (const change of pending) {
        if (change.type === 'audit') audits.push(change.values);
        else Object.assign(change.ref.kind === 'organizations' ? org : manager, change.values);
      }
    }
  };
  const auth = {
    async getUser(uid) {
      assert.equal(uid, managerUid);
      return { uid, email: authEmail, disabled: Boolean(options.disabled) };
    },
    async getUserByEmail(email) {
      if (email === options.otherAccountEmail) return { uid: 'someone-else', email };
      const error = new Error('user-not-found');
      error.code = 'auth/user-not-found';
      throw error;
    },
    async updateUser(uid, values) {
      assert.equal(uid, managerUid);
      if (options.rollbackFails && values.email === 'faiz1@gmail.com') throw new Error('rollback_failed');
      authUpdates.push({ ...values });
      authEmail = values.email;
    },
    async revokeRefreshTokens(uid) {
      revoked.push(uid);
      if (options.revokeFails) throw new Error('revoke_failed');
    }
  };
  const input = {
    db, auth, FieldValue: { serverTimestamp: () => 'TIMESTAMP' },
    ownerUid: 'verified-owner', organizationId: orgId,
    requestedEmail: options.requestedEmail ?? 'faiz@gmail.com',
  };
  return {
    input, org, manager, authUpdates, audits, revoked,
    get authEmail() { return authEmail; },
    set txFails(value) { txFails = value; }
  };
}

test('owner sync updates ONLY the linked manager UID, metadata and audit', async () => {
  const f = fixture();
  const result = await syncManagerLoginEmail(f.input);
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.sessionsRevoked, true);
  assert.equal(f.authEmail, 'faiz@gmail.com');
  assert.equal(f.org.email, 'faiz@gmail.com');
  assert.equal(f.manager.email, 'faiz@gmail.com');
  assert.equal(f.authUpdates.length, 1);
  assert.deepEqual(f.revoked, ['faiz-auth-uid']);
  assert.equal(f.audits.length, 1);
  assert.equal(f.audits[0].actorUid, 'verified-owner');
  assert.equal(f.audits[0].organizationId, 'municipality-official');
  assert.equal(f.audits[0].targetUid, 'faiz-auth-uid');
  assert.equal(f.audits[0].action, 'manager_login_email_change');
});

test('account email already owned by another UID never mutates identity', async () => {
  const f = fixture({ otherAccountEmail: 'faiz@gmail.com' });
  await assert.rejects(syncManagerLoginEmail(f.input), e => e.reason === 'login_email_already_in_use' && e.status === 409);
  assert.equal(f.authEmail, 'faiz1@gmail.com');
  assert.equal(f.audits.length, 0);
});

test('missing manager UID, wrong municipality, disabled manager and archived org are blocked', async () => {
  for (const condition of [{ unlinked: true }, { wrongTenant: true }, { disabled: true }, { archived: true }]) {
    const f = fixture(condition);
    await assert.rejects(syncManagerLoginEmail(f.input));
    assert.equal(f.authUpdates.length, 0);
    assert.equal(f.audits.length, 0);
  }
});

test('metadata-only reconciliation does not unnecessarily change Auth or revoke sessions', async () => {
  const f = fixture({ authEmail: 'faiz@gmail.com', recordEmail: 'faiz1@gmail.com' });
  const result = await syncManagerLoginEmail(f.input);
  assert.equal(result.changed, true);
  assert.equal(result.sessionsRevoked, false);
  assert.equal(f.authUpdates.length, 0);
  assert.equal(f.manager.email, 'faiz@gmail.com');
  assert.equal(f.audits.length, 1);
});

test('idempotent same email is read-only', async () => {
  const f = fixture({ authEmail: 'faiz@gmail.com', recordEmail: 'faiz@gmail.com' });
  const result = await syncManagerLoginEmail(f.input);
  assert.equal(result.changed, false);
  assert.equal(f.audits.length, 0);
});

test('Firestore transaction failure attempts Auth rollback', async () => {
  const f = fixture({ txFails: true });
  await assert.rejects(syncManagerLoginEmail(f.input), /firestore_write_failure/);
  assert.equal(f.authEmail, 'faiz1@gmail.com');
  assert.equal(f.org.email, 'faiz@gmail.com');
  assert.equal(f.manager.email, 'faiz1@gmail.com');
  assert.deepEqual(f.authUpdates.map(u => u.email), ['faiz@gmail.com', 'faiz1@gmail.com']);
});

test('failed rollback is reported as partial failure rather than success', async () => {
  const f = fixture({ txFails: true, rollbackFails: true });
  await assert.rejects(syncManagerLoginEmail(f.input),
    e => e.reason === 'reconciliation_required_after_partial_failure' && e.status === 503);
});

test('session revoke warning preserves successful identity change', async () => {
  const f = fixture({ revokeFails: true });
  const result = await syncManagerLoginEmail(f.input);
  assert.equal(result.ok, true);
  assert.equal(result.warning, 'session_revocation_pending');
  assert.equal(f.org.email, 'faiz@gmail.com');
});

test('invalid emails never reach Auth or Firestore writes', async () => {
  const f = fixture({ requestedEmail: 'bad-no-at-sign' });
  await assert.rejects(syncManagerLoginEmail(f.input), e => e.status === 400);
  assert.equal(f.authUpdates.length, 0);
});

test('owner UI sends email to trusted API BEFORE other metadata updates', () => {
  const code = fs.readFileSync('owner-organizations.js', 'utf8');
  const helper = fs.readFileSync('api/_lib/ownerOpsSupport.js', 'utf8');
  const apiCall = code.indexOf("action: 'ownerUpdateManagerLoginEmail'");
  const firestoreUpdate = code.indexOf("await updateDoc(doc(db,'organizations', id)");
  assert.ok(apiCall > 0 && firestoreUpdate > apiCall);
  assert.doesNotMatch(code.slice(firestoreUpdate, firestoreUpdate + 190), /email:\s*manager\.email/);
  assert.match(helper, /const owner = await requireOwner\(decoded/);
  assert.match(helper, /syncManagerLoginEmail\(/);
});
