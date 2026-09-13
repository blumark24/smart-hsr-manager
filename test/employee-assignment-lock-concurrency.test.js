'use strict';
// ============================================================================
// FINAL HARDENING ADDENDUM — REAL FIRESTORE EMULATOR CONCURRENCY GATE.
//
// The fakeFirebaseAdmin in-memory double used by
// test/employee-assignment-admin.test.js resolves every `await` on Node's
// single-threaded event loop in strict program order — it can prove the
// LOGIC of the lock-acquisition transaction is correct, but it cannot prove
// the transaction is actually safe under real concurrent writers, because
// its "transaction" never truly contends: two calls into
// db.runTransaction() there just run their callbacks one after the other.
//
// This file runs the REAL, unmodified createAssignment handler twice
// CONCURRENTLY (Promise.allSettled) against a real local Firestore Emulator,
// for the exact same (organizationId, productId, scope.type, scope.id)
// tuple, and proves Firestore's own transaction retry/serialization — not
// the fake's sequential resolution — is what makes exactly one winner.
//
// api/_lib/firebaseAdmin.js already auto-detects FIRESTORE_EMULATOR_HOST and
// initializes a real firebase-admin app against it with no credentials
// needed, so getDb() below is genuinely the emulator's Firestore. Only
// getAuth() is swapped for a lightweight deterministic stub (matching the
// same "Bearer token-for-<uid>" convention used everywhere else in this
// test suite) — this test is about proving the REAL Firestore transaction
// is race-safe, not about re-testing Firebase Auth token verification.
//
// Run: node --test test/employee-assignment-lock-concurrency.test.js
// against an already-running Firestore Emulator (127.0.0.1:8080 by
// firebase.json's convention), OR via the self-hosting wrapper:
//   node test/run-employee-assignment-lock-concurrency.js
// which launches its own emulator via `firebase emulators:exec`.
//
// If no Firestore Emulator can be reached at all, this test throws loudly
// in `before()` rather than skipping — per the addendum, a foundation that
// cannot run this gate must be reported BLOCKED, never PASS.
// ============================================================================
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const PROJECT_ID = `demo-smart-hsr-lock-concurrency-${Date.now()}`;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const { computeSectionHeadLockId } = require('../platform/contracts/employee-assignment-lock-contract');

const FIREBASE_ADMIN_LIB_PATH = require.resolve('../api/_lib/firebaseAdmin.js');
const AUTHZ_PATH = require.resolve('../api/_lib/authz.js');
const EMPLOYEES_HANDLER_PATH = require.resolve('../api/admin/employees.js');

let realApp = null;
let realDb = null;

function fakeAuth() {
  return {
    async verifyIdToken(token) {
      const m = /^token-for-(.+)$/.exec(token);
      if (!m) { const e = new Error('invalid-token'); e.code = 'auth/argument-error'; throw e; }
      return { uid: m[1], auth_time: Math.floor(Date.now() / 1000) };
    },
    async revokeRefreshTokens() {},
  };
}

before(async () => {
  // A real firebase-admin app, pointed at the emulator by
  // FIRESTORE_EMULATOR_HOST — no credentials, no mocking of Firestore
  // itself. If the emulator is unreachable this throws here, failing the
  // whole file loudly rather than silently skipping.
  realApp = admin.initializeApp({ projectId: PROJECT_ID }, `lock-concurrency-${PROJECT_ID}`);
  realDb = realApp.firestore();
  // Prove connectivity before relying on it for the actual test.
  await realDb.collection('lockConcurrencyConnectivityCheck').doc('ping').set({ at: Date.now() });

  require.cache[FIREBASE_ADMIN_LIB_PATH] = {
    id: FIREBASE_ADMIN_LIB_PATH,
    filename: FIREBASE_ADMIN_LIB_PATH,
    loaded: true,
    exports: { getAuth: fakeAuth, getDb: () => realDb, FieldValue: admin.firestore.FieldValue },
  };
});

after(async () => {
  delete require.cache[FIREBASE_ADMIN_LIB_PATH];
  delete require.cache[AUTHZ_PATH];
  delete require.cache[EMPLOYEES_HANDLER_PATH];
  if (realApp) await realApp.delete();
});

function loadFreshHandler() {
  delete require.cache[AUTHZ_PATH];
  delete require.cache[EMPLOYEES_HANDLER_PATH];
  return require(EMPLOYEES_HANDLER_PATH);
}

function fakeRequest({ uid, body }) {
  return { method: 'POST', headers: { authorization: `Bearer token-for-${uid}` }, body };
}

function fakeResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { res.headers[k] = v; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

test('REAL EMULATOR CONCURRENCY: two concurrent SECTION_HEAD creates for the exact same tuple — exactly one wins, exactly one lock, no orphans', async () => {
  // A fresh, randomized tuple per run so this test is independently
  // repeatable against a persistent emulator instance with no manual
  // cleanup between runs.
  const organizationId = `org-lock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const productId = 'mobility';
  const scope = { type: 'PRODUCT', id: 'mobility' };
  const mgrUid = 'mgr-lock-1';

  await realDb.collection('managers').doc(mgrUid).set({ uid: mgrUid, role: 'manager', active: true, organizationId });
  await realDb.collection('employees').doc('emp-lock-1').set({ organizationId, name: 'أ', accountStatus: 'NO_ACCOUNT' });
  await realDb.collection('employees').doc('emp-lock-2').set({ organizationId, name: 'ب', accountStatus: 'NO_ACCOUNT' });

  const handler = loadFreshHandler();

  const bodyFor = (employeeId) => ({
    action: 'createAssignment',
    employeeId,
    organizationId,
    productId,
    scope,
    assignmentType: 'SECTION_HEAD',
    startAt: '2026-01-01',
    issuedBy: mgrUid,
  });

  const res1 = fakeResponse();
  const res2 = fakeResponse();

  const results = await Promise.allSettled([
    handler(fakeRequest({ uid: mgrUid, body: bodyFor('emp-lock-1') }), res1),
    handler(fakeRequest({ uid: mgrUid, body: bodyFor('emp-lock-2') }), res2),
  ]);

  // Neither call should throw out of the handler itself — every outcome is
  // expressed through the response object (200 or 409), not a rejection.
  for (const r of results) {
    assert.equal(r.status, 'fulfilled', r.status === 'rejected' ? String(r.reason) : undefined);
  }

  const statuses = [res1.statusCode, res2.statusCode].sort();
  assert.deepEqual(statuses, [200, 409], `expected exactly one 200 and one 409, got ${JSON.stringify({ res1: res1.body, res2: res2.body })}`);

  const winnerRes = res1.statusCode === 200 ? res1 : res2;
  const loserRes = res1.statusCode === 200 ? res2 : res1;
  assert.equal(loserRes.body.reason, 'section_head_already_active', JSON.stringify(loserRes.body));
  const winningAssignmentId = winnerRes.body.assignment.assignmentId;

  // Exactly one ACTIVE SECTION_HEAD assignment exists for this tuple — no
  // orphan assignment from the loser's attempt.
  const assignmentsSnap = await realDb.collection('employeeAssignments')
    .where('organizationId', '==', organizationId)
    .where('productId', '==', productId)
    .where('scope.id', '==', scope.id)
    .where('assignmentType', '==', 'SECTION_HEAD')
    .where('status', '==', 'ACTIVE')
    .get();
  assert.equal(assignmentsSnap.size, 1, 'exactly one ACTIVE SECTION_HEAD assignment must exist for this tuple');
  assert.equal(assignmentsSnap.docs[0].id, winningAssignmentId);

  // Exactly one ACTIVE lock exists, at the deterministic SHA-256 id, and it
  // points at the winner — no orphan lock.
  const lockId = computeSectionHeadLockId({ organizationId, productId, scope });
  const lockSnap = await realDb.collection('employeeAssignmentLocks').doc(lockId).get();
  assert.equal(lockSnap.exists, true);
  const lockData = lockSnap.data();
  assert.equal(lockData.status, 'ACTIVE');
  assert.equal(lockData.assignmentId, winningAssignmentId);

  const locksForTupleSnap = await realDb.collection('employeeAssignmentLocks')
    .where('organizationId', '==', organizationId)
    .where('productId', '==', productId)
    .where('scopeType', '==', scope.type)
    .where('scopeId', '==', scope.id)
    .get();
  assert.equal(locksForTupleSnap.size, 1, 'no orphan lock — exactly one lock document for this tuple');
});
