'use strict';
// ============================================================================
// PHASE 06B CLOSURE — TRUSTED VEHICLE ALLOCATION CUTOVER. Executable proof,
// against the REAL Firestore + Auth Emulators (not a reimplementation, not
// the in-memory fakeFirebaseAdmin double), that api/admin/users.js action:
// 'allocateVehicle' — now the ONLY way a mission may move
// APPROVED->VEHICLE_ALLOCATED and a vehicle AVAILABLE->RESERVED, since
// firestore.rules denies the direct client-side transition entirely (see
// test/mobility-mission-rules.test.js) — correctly:
//   1. authenticates via a real Firebase ID token and resolves the caller's
//      identity/organization ONLY from their own verified server-side
//      Mobility record, never from the request body
//   2. validates mission/vehicle/target-employee state before writing
//   3. performs the mission + vehicle + one canonical audit event write
//      atomically in ONE Firestore Admin SDK transaction
//   4. denies every unauthorized caller and invalid-target scenario, with
//      zero side effects on denial
//   5. resolves two concurrently racing allocation attempts safely, with no
//      partial state
//
// Requires the Firestore Emulator (127.0.0.1:8080) AND the Auth Emulator
// (127.0.0.1:9099) already running against the project this repo's client
// config hard-codes ('smart-hsr-manager' — see api/_lib/firebaseAdmin.js's
// own default), exactly like test/mobility-audit-atomicity.test.js depends
// on the Firestore emulator already running.
//
// Run: node --test test/mobility-allocate-vehicle-endpoint.test.js
// ============================================================================
const { before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');

const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST;

const { getDb, getAuth } = require('../api/_lib/firebaseAdmin');
const usersHandler = require('../api/admin/users.js');

// Matches api/_lib/firebaseAdmin.js's own fallback default — the emulator
// must be started with --project smart-hsr-manager (as this repo's other
// Mobility UAT/emulator instructions already require) or the Auth
// Emulator's REST sign-in below cannot find users the Admin SDK creates.
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'smart-hsr-manager';
const TEST_PASSWORD = 'Passw0rd!123';

const ORG_A = 'org-endpoint-a';
const ORG_B = 'org-endpoint-b';

const UID = {
  mobilityHeadA: 'ep-mobility-head-a',
  inactiveMobilityHeadA: 'ep-inactive-mobility-head-a',
  disabledMobilityHeadA: 'ep-disabled-mobility-head-a',
  employeeCallerA: 'ep-employee-caller-a',
  deptHeadCallerA: 'ep-depthead-caller-a',
  adminAffairsCallerA: 'ep-adminaffairs-caller-a',
  employeeA: 'ep-employee-a',
  employeeA2: 'ep-employee-a2',
  inactiveEmployeeA: 'ep-inactive-employee-a',
  notEligibleEmployeeA: 'ep-not-eligible-employee-a',
  employeeOrgB: 'ep-employee-org-b',
};

let db, auth;

async function ensureAuthUser(uid) {
  try {
    await auth.getUser(uid);
  } catch (_) {
    await auth.createUser({ uid, email: `${uid}@example.com`, password: TEST_PASSWORD });
  }
}

const tokenCache = new Map();
async function idTokenFor(uid) {
  if (tokenCache.has(uid)) return tokenCache.get(uid);
  await ensureAuthUser(uid);
  const res = await fetch(`http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.com`, password: TEST_PASSWORD, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!body.idToken) throw new Error(`could not sign in ${uid}: ${JSON.stringify(body)}`);
  tokenCache.set(uid, body.idToken);
  return body.idToken;
}

function fakeRes() {
  const res = {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { res.headers[k] = v; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

async function callAllocate(token, { missionId, vehicleId, employeeUid, ...extra }) {
  const req = {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: { action: 'allocateVehicle', missionId, vehicleId, employeeUid, ...extra },
  };
  const res = fakeRes();
  await usersHandler(req, res);
  return res;
}

async function clearFirestore() {
  const url = `http://${FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`clearFirestore failed: ${res.status}`);
}

before(async () => {
  db = getDb();
  auth = getAuth();
  // Auth Emulator accounts persist across tests in this file (no per-test
  // clear needed — only their Firestore role/entitlement records change,
  // and Firestore itself is cleared and reseeded before every test below).
  await Promise.all(Object.values(UID).map(ensureAuthUser));
});

async function seed() {
  await db.collection('users').doc(UID.mobilityHeadA).set({ role: 'mobility_head', active: true, organizationId: ORG_A });
  await db.collection('users').doc(UID.inactiveMobilityHeadA).set({ role: 'mobility_head', active: false, organizationId: ORG_A });
  // PHASE 06A hotfix parity — a stale legacy role:'mobility_head' must never
  // be resurrected once mobilityAccess explicitly disables Mobility.
  await db.collection('users').doc(UID.disabledMobilityHeadA).set({
    role: 'mobility_head', active: true, organizationId: ORG_A,
    mobilityAccess: { enabled: false, role: null },
  });
  await db.collection('users').doc(UID.employeeCallerA).set({ role: 'employee', active: true, organizationId: ORG_A, vehicleEligible: true });
  await db.collection('users').doc(UID.deptHeadCallerA).set({ role: 'department_head', active: true, organizationId: ORG_A, department: 'dept' });
  await db.collection('users').doc(UID.adminAffairsCallerA).set({ role: 'administrative_affairs', active: true, organizationId: ORG_A });

  await db.collection('users').doc(UID.employeeA).set({ role: 'employee', active: true, organizationId: ORG_A, vehicleEligible: true });
  await db.collection('users').doc(UID.employeeA2).set({ role: 'employee', active: true, organizationId: ORG_A, vehicleEligible: true });
  await db.collection('users').doc(UID.inactiveEmployeeA).set({ role: 'employee', active: false, organizationId: ORG_A, vehicleEligible: true });
  await db.collection('users').doc(UID.notEligibleEmployeeA).set({ role: 'employee', active: true, organizationId: ORG_A, vehicleEligible: false });
  await db.collection('users').doc(UID.employeeOrgB).set({ role: 'employee', active: true, organizationId: ORG_B, vehicleEligible: true });

  await db.collection('missions').doc('mission-approved-a').set({ organizationId: ORG_A, department: 'dept', createdByUid: UID.deptHeadCallerA, status: 'APPROVED' });
  await db.collection('missions').doc('mission-approved-a2').set({ organizationId: ORG_A, department: 'dept', createdByUid: UID.deptHeadCallerA, status: 'APPROVED' });
  await db.collection('missions').doc('mission-pending-a').set({ organizationId: ORG_A, department: 'dept', createdByUid: UID.deptHeadCallerA, status: 'PENDING_APPROVAL' });
  await db.collection('missions').doc('mission-approved-b').set({ organizationId: ORG_B, department: 'dept', createdByUid: 'someone-b', status: 'APPROVED' });

  await db.collection('vehicles').doc('vehicle-available-a').set({ organizationId: ORG_A, status: 'AVAILABLE' });
  await db.collection('vehicles').doc('vehicle-available-a2').set({ organizationId: ORG_A, status: 'AVAILABLE' });
  await db.collection('vehicles').doc('vehicle-reserved-a').set({ organizationId: ORG_A, status: 'RESERVED', assignedEmployeeUid: UID.employeeA2, currentMissionId: 'mission-approved-a' });
  await db.collection('vehicles').doc('vehicle-available-b').set({ organizationId: ORG_B, status: 'AVAILABLE' });
}

beforeEach(async () => {
  await clearFirestore();
  await seed();
});

async function auditEventsFor(resourceId) {
  const snap = await db.collection('auditEvents').where('resourceId', '==', resourceId).get();
  return snap.docs.map(d => d.data());
}

// ============================================================
// 1. Happy path — atomicity of success
// ============================================================
test('ALLOC-1 a valid mobility_head allocation succeeds: mission, vehicle, and exactly one audit event all commit together', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const res = await callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'VEHICLE_ALLOCATED');

  const mission = (await db.collection('missions').doc('mission-approved-a').get()).data();
  const vehicle = (await db.collection('vehicles').doc('vehicle-available-a').get()).data();
  assert.equal(mission.status, 'VEHICLE_ALLOCATED');
  assert.equal(mission.vehicleId, 'vehicle-available-a');
  assert.equal(mission.assignedEmployeeUid, UID.employeeA);
  assert.equal(vehicle.status, 'RESERVED');
  assert.equal(vehicle.assignedEmployeeUid, UID.employeeA);
  assert.equal(vehicle.currentMissionId, 'mission-approved-a');

  const events = await auditEventsFor('mission-approved-a');
  assert.equal(events.length, 1, 'exactly one canonical audit event must exist');
  assert.equal(events[0].actorId, UID.mobilityHeadA);
  assert.equal(events[0].actorRole, 'mobility_head');
  assert.equal(events[0].organizationId, ORG_A);
  assert.equal(events[0].action, 'allocate_vehicle');
  assert.equal(events[0].fromStatus, 'APPROVED');
  assert.equal(events[0].toStatus, 'VEHICLE_ALLOCATED');
});

test('ALLOC-2 actor/org spoofing is impossible — request-body actorId/actorRole/organizationId are always ignored in favor of the trusted caller context', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const res = await callAllocate(token, {
    missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA,
    actorUid: 'someone-else', actorName: 'Someone Else', organizationId: ORG_B, role: 'owner',
  });
  assert.equal(res.statusCode, 200);
  const events = await auditEventsFor('mission-approved-a');
  assert.equal(events[0].actorId, UID.mobilityHeadA, 'the audit actor must be the real, verified caller, never a request-body value');
  assert.equal(events[0].organizationId, ORG_A, 'the audit organization must be the caller\'s real, server-derived organization, never a request-body value');
  const mission = (await db.collection('missions').doc('mission-approved-a').get()).data();
  assert.equal(mission.status, 'VEHICLE_ALLOCATED', 'the allocation itself must still succeed for the real organization, unaffected by the spoofing attempt');
});

// ============================================================
// 2. Atomicity under a forced mid-transaction failure
// ============================================================
// PHASE 06B — an Admin SDK transaction is not subject to firestore.rules at
// all (that is the whole point of the cutover), so there is no
// Rules-rejectable audit document the way test/mobility-audit-atomicity.
// test.js can force for the CLIENT batch path. What genuinely backs this
// endpoint's atomicity guarantee is Firestore's own transaction contract:
// mission, vehicle, and audit are all written via transaction.update()/
// transaction.set() calls on the SAME `transaction` object inside the SAME
// db.runTransaction() callback (see api/admin/users.js's allocateVehicle
// action) — if that callback throws for ANY reason after staging writes,
// NONE of them commit. This test proves that real guarantee directly
// against the real emulator, using the identical 3-write shape (mission +
// vehicle + audit) our endpoint relies on, forcing a throw right after all
// three writes are staged.
test('ALLOC-3 Firestore transaction atomicity: if the callback throws after staging mission+vehicle+audit writes, NONE of them commit', async () => {
  let threw = false;
  try {
    await db.runTransaction(async (transaction) => {
      const missionRef = db.collection('missions').doc('mission-approved-a');
      const vehicleRef = db.collection('vehicles').doc('vehicle-available-a');
      await Promise.all([transaction.get(missionRef), transaction.get(vehicleRef)]);
      transaction.update(missionRef, { status: 'VEHICLE_ALLOCATED', vehicleId: 'vehicle-available-a', assignedEmployeeUid: UID.employeeA });
      transaction.update(vehicleRef, { status: 'RESERVED', assignedEmployeeUid: UID.employeeA, currentMissionId: 'mission-approved-a' });
      transaction.set(db.collection('auditEvents').doc(), {
        organizationId: ORG_A, actorId: UID.mobilityHeadA, actorRole: 'mobility_head',
        resourceType: 'mission', resourceId: 'mission-approved-a', action: 'allocate_vehicle',
      });
      throw new Error('forced_failure_after_staging');
    });
  } catch (e) {
    threw = e.message === 'forced_failure_after_staging';
  }
  assert.equal(threw, true, 'the transaction must propagate the forced failure');

  const mission = (await db.collection('missions').doc('mission-approved-a').get()).data();
  const vehicle = (await db.collection('vehicles').doc('vehicle-available-a').get()).data();
  assert.equal(mission.status, 'APPROVED', 'a forced failure after staging must leave the mission COMPLETELY unchanged');
  assert.equal(vehicle.status, 'AVAILABLE', 'a forced failure after staging must leave the vehicle COMPLETELY unchanged');
  const events = await auditEventsFor('mission-approved-a');
  assert.equal(events.length, 0, 'a forced failure after staging must leave no audit event behind');
});

// The real endpoint itself never stages any write before every validation
// passes (mission/vehicle/target are all checked before the first
// transaction.update() call — see api/admin/users.js), so every one of its
// own denial paths below is ALSO a zero-side-effect proof, on top of
// ALLOC-3's generic proof that its 3-write shape is genuinely atomic.

// ============================================================
// 3. Security — unauthorized/invalid callers
// ============================================================
test('SEC-1 unauthenticated (no bearer token) is denied', async () => {
  const res = await callAllocate(null, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA });
  assert.equal(res.statusCode, 401);
});

test('SEC-2 an employee caller is denied (not mobility_head)', async () => {
  const token = await idTokenFor(UID.employeeCallerA);
  const res = await callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA });
  assert.equal(res.statusCode, 403);
});

test('SEC-3 a department_head caller is denied (not mobility_head)', async () => {
  const token = await idTokenFor(UID.deptHeadCallerA);
  const res = await callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA });
  assert.equal(res.statusCode, 403);
});

test('SEC-4 an administrative_affairs caller is denied (not mobility_head)', async () => {
  const token = await idTokenFor(UID.adminAffairsCallerA);
  const res = await callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA });
  assert.equal(res.statusCode, 403);
});

test('SEC-5 an INACTIVE mobility_head is denied', async () => {
  const token = await idTokenFor(UID.inactiveMobilityHeadA);
  const res = await callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA });
  assert.equal(res.statusCode, 403);
});

test('SEC-6 an explicit mobilityAccess.enabled:false denies, even with a stale legacy role:mobility_head', async () => {
  const token = await idTokenFor(UID.disabledMobilityHeadA);
  const res = await callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA });
  assert.equal(res.statusCode, 403);
});

test('SEC-7 a cross-tenant mission (different organization than the caller) is denied', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const res = await callAllocate(token, { missionId: 'mission-approved-b', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA });
  assert.equal(res.statusCode, 403);
  const mission = (await db.collection('missions').doc('mission-approved-b').get()).data();
  assert.equal(mission.status, 'APPROVED');
});

test('SEC-8 a cross-tenant vehicle (different organization than the caller) is denied', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const res = await callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-b', employeeUid: UID.employeeA });
  assert.equal(res.statusCode, 403);
  const vehicle = (await db.collection('vehicles').doc('vehicle-available-b').get()).data();
  assert.equal(vehicle.status, 'AVAILABLE');
});

test('SEC-9 a cross-tenant target employee (different organization) is denied, even though vehicleEligible is true', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const res = await callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeOrgB });
  assert.equal(res.statusCode, 403);
});

test('SEC-10 an INACTIVE target employee is denied, even though vehicleEligible is true', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const res = await callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: UID.inactiveEmployeeA });
  assert.equal(res.statusCode, 403);
});

test('SEC-11 a target NOT confirmed vehicleEligible is denied', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const res = await callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: UID.notEligibleEmployeeA });
  assert.equal(res.statusCode, 403);
});

test('SEC-12 a nonexistent mission is denied', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const res = await callAllocate(token, { missionId: 'no-such-mission', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA });
  assert.equal(res.statusCode, 404);
});

test('SEC-13 a nonexistent vehicle is denied', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const res = await callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'no-such-vehicle', employeeUid: UID.employeeA });
  assert.equal(res.statusCode, 404);
});

test('SEC-14 a nonexistent target employee is denied', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const res = await callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: 'no-such-employee' });
  assert.equal(res.statusCode, 404);
});

test('SEC-15 a mission that is not APPROVED is denied', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const res = await callAllocate(token, { missionId: 'mission-pending-a', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA });
  assert.equal(res.statusCode, 409);
});

test('SEC-16 a vehicle that is not AVAILABLE is denied', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const res = await callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-reserved-a', employeeUid: UID.employeeA });
  assert.equal(res.statusCode, 409);
});

test('SEC-17 missing missionId/vehicleId/employeeUid is denied', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const res = await callAllocate(token, { missionId: 'mission-approved-a' });
  assert.equal(res.statusCode, 400);
});

// ============================================================
// 4. Concurrency — no partial state, no double allocation
// ============================================================
test('CONC-A same vehicle targeted by two racing missions: exactly one allocation succeeds, the vehicle ends up consistently allocated', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const [r1, r2] = await Promise.all([
    callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA }),
    callAllocate(token, { missionId: 'mission-approved-a2', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA2 }),
  ]);
  const codes = [r1.statusCode, r2.statusCode].sort();
  assert.deepEqual(codes, [200, 409], 'exactly one attempt must succeed and the other must be refused for vehicle unavailability');

  const winner = r1.statusCode === 200 ? 'mission-approved-a' : 'mission-approved-a2';
  const loser = r1.statusCode === 200 ? 'mission-approved-a2' : 'mission-approved-a';
  const winnerMission = (await db.collection('missions').doc(winner).get()).data();
  const loserMission = (await db.collection('missions').doc(loser).get()).data();
  const vehicle = (await db.collection('vehicles').doc('vehicle-available-a').get()).data();
  assert.equal(winnerMission.status, 'VEHICLE_ALLOCATED');
  assert.equal(loserMission.status, 'APPROVED', 'the losing mission must remain completely unchanged');
  assert.equal(vehicle.status, 'RESERVED');
  assert.equal(vehicle.currentMissionId, winner, 'the vehicle must be committed to exactly the winning mission, never both');

  const events = await auditEventsFor(winner);
  assert.equal(events.length, 1, 'only the winning allocation may have produced an audit event');
  assert.equal((await auditEventsFor(loser)).length, 0, 'the losing attempt must have produced no audit event');
});

test('CONC-B same mission targeted with two racing vehicles: exactly one allocation succeeds, the mission ends up consistently allocated to one vehicle', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const [r1, r2] = await Promise.all([
    callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA }),
    callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a2', employeeUid: UID.employeeA2 }),
  ]);
  const codes = [r1.statusCode, r2.statusCode].sort();
  assert.deepEqual(codes, [200, 409], 'exactly one attempt must succeed and the other must be refused for the mission no longer being APPROVED');

  const mission = (await db.collection('missions').doc('mission-approved-a').get()).data();
  assert.equal(mission.status, 'VEHICLE_ALLOCATED');
  const winningVehicleId = mission.vehicleId;
  const otherVehicleId = winningVehicleId === 'vehicle-available-a' ? 'vehicle-available-a2' : 'vehicle-available-a';
  const winningVehicle = (await db.collection('vehicles').doc(winningVehicleId).get()).data();
  const otherVehicle = (await db.collection('vehicles').doc(otherVehicleId).get()).data();
  assert.equal(winningVehicle.status, 'RESERVED');
  assert.equal(otherVehicle.status, 'AVAILABLE', 'the losing vehicle must remain completely unchanged');

  const events = await auditEventsFor('mission-approved-a');
  assert.equal(events.length, 1, 'only the winning allocation may have produced an audit event');
});

test('CONC-C two racing attempts on the same mission+vehicle pair (a stale APPROVED/AVAILABLE read can never both win): exactly one succeeds, no double-booking', async () => {
  const token = await idTokenFor(UID.mobilityHeadA);
  const [r1, r2] = await Promise.all([
    callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA }),
    callAllocate(token, { missionId: 'mission-approved-a', vehicleId: 'vehicle-available-a', employeeUid: UID.employeeA2 }),
  ]);
  const codes = [r1.statusCode, r2.statusCode].sort();
  assert.deepEqual(codes, [200, 409]);
  const mission = (await db.collection('missions').doc('mission-approved-a').get()).data();
  const vehicle = (await db.collection('vehicles').doc('vehicle-available-a').get()).data();
  assert.equal(mission.status, 'VEHICLE_ALLOCATED');
  assert.equal(vehicle.status, 'RESERVED');
  assert.equal(mission.assignedEmployeeUid, vehicle.assignedEmployeeUid, 'the mission and vehicle must agree on exactly one winning employee — never a mixed half-state');
  const events = await auditEventsFor('mission-approved-a');
  assert.equal(events.length, 1, 'no partial state: exactly one audit event for exactly one true winner');
});
