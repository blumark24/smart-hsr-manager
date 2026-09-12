'use strict';
// ============================================================================
// PHASE 06 CLOSURE — DEFECT 1 (Mobility audit atomicity/integrity) executable
// proof, run against the local Firestore Emulator. smart-mobility-adapter.js's
// single-document mutations (submitMissionForApproval, decideMission,
// employeeAdvanceMission, createIncident, mobilityProcessIncident,
// createMissionRequest) now commit their business write and their required
// auditEvents/{eventId} write inside ONE Firestore writeBatch() — a batch is
// atomic (all writes apply or none do), so this test proves, against the
// REAL rules engine (not a reimplementation), that:
//   1. a legitimate business write + a legitimate audit write commit together
//   2. a batch whose audit write firestore.rules would reject (spoofed actor,
//      wrong organization, forged role) fails ATOMICALLY — the business
//      document is left completely unchanged, never a partial success
//   3. the audit actor can never be spoofed to someone other than the caller
//   4. the audit organization scope is always the caller's own, trusted org
//
// Run: node --test test/mobility-audit-atomicity.test.js (requires the
// Firestore emulator on 127.0.0.1:8080 — see test/run-mobility-mission-rules.js
// for the same emulator dependency this repo's other Mobility rules tests use).
// ============================================================================
const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, getDoc, setDoc, writeBatch, serverTimestamp } = require('firebase/firestore');

const PROJECT_ID = 'demo-smart-hsr-mobility-audit-tests';
const RULES_PATH = path.resolve(__dirname, '..', 'firestore.rules');

const ORG_A = 'orgA';
const DEPT_TRAFFIC = 'الرقابة البلدية';

const UID = {
  adminAffairsA: 'admin-affairs-a-uid',
  mobilityHeadA: 'mobility-head-a-uid',
  deptHeadA: 'dept-head-a-uid',
  employeeA: 'employee-a-uid',
  employeeB: 'employee-b-uid',
};

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync(RULES_PATH, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', UID.adminAffairsA), { role: 'administrative_affairs', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.mobilityHeadA), { role: 'mobility_head', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.deptHeadA), { role: 'department_head', active: true, organizationId: ORG_A, department: DEPT_TRAFFIC });
    await setDoc(doc(db, 'users', UID.employeeA), { role: 'employee', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.employeeB), { role: 'employee', active: true, organizationId: ORG_A });

    await setDoc(doc(db, 'missions', 'pendingA'), {
      organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'PENDING_APPROVAL',
    });
    await setDoc(doc(db, 'missions', 'pendingA2'), {
      organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'PENDING_APPROVAL',
    });
    await setDoc(doc(db, 'missions', 'pendingA3'), {
      organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'PENDING_APPROVAL',
    });
  });
}

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

function ctx(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

// Mirrors smart-mobility-adapter.js's decideMission()'s exact batch shape:
// one mission update + one auditEvents create, committed together.
function decideMissionBatch(db, missionId, toStatus, actorUid, overrides = {}) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'missions', missionId), {
    status: toStatus, updatedAt: serverTimestamp(), updatedByUid: actorUid,
  });
  const auditRef = doc(collection(db, 'auditEvents'));
  batch.set(auditRef, Object.assign({
    organizationId: ORG_A, actorId: actorUid, actorRole: 'administrative_affairs',
    resourceType: 'mission', resourceId: missionId, action: 'decide',
    fromStatus: 'PENDING_APPROVAL', toStatus, timestamp: serverTimestamp(),
  }, overrides));
  return { batch, auditRef };
}

test('1. a legitimate batch commits the mission decision AND its audit event together', async () => {
  const db = ctx(UID.adminAffairsA);
  const { batch, auditRef } = decideMissionBatch(db, 'pendingA', 'APPROVED', UID.adminAffairsA);
  await assertSucceeds(batch.commit());

  const missionSnap = await getDoc(doc(db, 'missions', 'pendingA'));
  assert.equal(missionSnap.data().status, 'APPROVED', 'the business state must have changed');
  const auditSnap = await getDoc(auditRef);
  assert.equal(auditSnap.exists(), true, 'the paired audit event must exist');
  assert.equal(auditSnap.data().action, 'decide');
  assert.equal(auditSnap.data().resourceId, 'pendingA');
});

test('2. a forced audit failure (rules-rejected audit document) leaves the mission COMPLETELY unchanged — no partial success', async () => {
  const db = ctx(UID.adminAffairsA);
  // resourceType 'mission' with a resourceId naming a mission that does not
  // exist is rejected by auditReferencedResourceOk() — a deliberate,
  // rules-enforced audit-side failure paired with an otherwise-legitimate
  // mission update, to prove the WHOLE batch (not just the bad half) fails.
  const { batch } = decideMissionBatch(db, 'pendingA2', 'APPROVED', UID.adminAffairsA, { resourceId: 'no-such-mission-id' });
  await assertFails(batch.commit());

  const missionSnap = await getDoc(doc(db, 'missions', 'pendingA2'));
  assert.equal(missionSnap.data().status, 'PENDING_APPROVAL', 'the mission must remain at its ORIGINAL status — the rejected audit write must not have let the business write through either');
});

test('3. the audit actor can never be spoofed to a different uid — the whole batch is denied, mission stays unchanged', async () => {
  const db = ctx(UID.adminAffairsA);
  const { batch } = decideMissionBatch(db, 'pendingA3', 'APPROVED', UID.adminAffairsA, { actorId: UID.employeeA });
  await assertFails(batch.commit());

  const missionSnap = await getDoc(doc(db, 'missions', 'pendingA3'));
  assert.equal(missionSnap.data().status, 'PENDING_APPROVAL', 'a spoofed-actor audit write must deny the entire batch, including the mission update');
});

test('4. the audit organization scope is always the caller\'s own trusted org — a mismatched organizationId denies the whole batch', async () => {
  const db = ctx(UID.adminAffairsA);
  const { batch } = decideMissionBatch(db, 'pendingA', 'APPROVED', UID.adminAffairsA, { organizationId: 'orgB' });
  await assertFails(batch.commit());

  const missionSnap = await getDoc(doc(db, 'missions', 'pendingA'));
  assert.equal(missionSnap.data().status, 'PENDING_APPROVAL');
});

test('5. a forged actorRole (claiming a role the actor does not hold) denies the whole batch atomically', async () => {
  const db = ctx(UID.adminAffairsA);
  const { batch } = decideMissionBatch(db, 'pendingA', 'APPROVED', UID.adminAffairsA, { actorRole: 'mobility_head' });
  await assertFails(batch.commit());

  const missionSnap = await getDoc(doc(db, 'missions', 'pendingA'));
  assert.equal(missionSnap.data().status, 'PENDING_APPROVAL');
});
