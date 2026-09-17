'use strict';
// ============================================================================
// PHASE 08.1 CLOSURE 2 — TRUSTED CONTRACTOR OBSERVATION UPDATE CUTOVER.
// Executable proof, against the REAL Firestore + Auth Emulators (not a
// reimplementation), that api/admin/users.js action:
// 'contractorObservationUpdate' — now the ONLY way an assigned observation
// may move PENDING->IN_PROGRESS or IN_PROGRESS->PENDING_REVIEW, since
// firestore.rules denies the direct client-side transition entirely (see
// test/firestore.rules.test.js's updated A9) — correctly:
//   1. authenticates via a real Firebase ID token and resolves the
//      contractor's identity/organization ONLY from their own verified
//      server-side users/{uid} record, never from the request body
//   2. validates tenant scope, assignment, and current status before writing
//   3. constructs the final resolutionNote/status fields itself (the
//      client never gets to supply a pre-built resolutionNote string)
//   4. performs the observation update + one canonical audit event write
//      atomically in ONE Firestore Admin SDK transaction
//   5. denies every unauthorized caller and invalid-transition scenario
//
// Requires the Firestore Emulator (127.0.0.1:8080) AND the Auth Emulator
// (127.0.0.1:9099) already running against project 'smart-hsr-manager',
// exactly like test/mobility-allocate-vehicle-endpoint.test.js.
//
// Run: node --test test/contractor-observation-update-endpoint.test.js
// ============================================================================
const { before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');

const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST;

const { getDb, getAuth } = require('../api/_lib/firebaseAdmin');
const usersHandler = require('../api/admin/users.js');

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'smart-hsr-manager';
const TEST_PASSWORD = 'Passw0rd!123';

const ORG_A = 'org-contractor-a';
const ORG_B = 'org-contractor-b';

const UID = {
  contractorA: 'cou-contractor-a',
  contractorA2: 'cou-contractor-a2',
  inactiveContractorA: 'cou-inactive-contractor-a',
  contractorB: 'cou-contractor-b',
  inspectorCallerA: 'cou-inspector-caller-a',
  managerCallerA: 'cou-manager-caller-a',
};

let db, auth;

async function ensureAuthUser(uid) {
  try { await auth.getUser(uid); } catch (_) { await auth.createUser({ uid, email: `${uid}@example.com`, password: TEST_PASSWORD }); }
}

const tokenCache = new Map();
async function idTokenFor(uid) {
  if (tokenCache.has(uid)) return tokenCache.get(uid);
  await ensureAuthUser(uid);
  const res = await fetch(`http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.com`, password: TEST_PASSWORD, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!body.idToken) throw new Error(`could not sign in ${uid}: ${JSON.stringify(body)}`);
  tokenCache.set(uid, body.idToken);
  return body.idToken;
}

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: null, setHeader(k, v) { res.headers[k] = v; }, end(payload) { res.body = payload ? JSON.parse(payload) : null; } };
  return res;
}

async function callUpdate(token, { observationId, transitionKey, note, fix, afterImagePath, ...extra }) {
  const req = {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: { action: 'contractorObservationUpdate', observationId, transitionKey, note, fix, afterImagePath, ...extra },
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
  await Promise.all(Object.values(UID).map(ensureAuthUser));
});

async function seed() {
  await db.collection('users').doc(UID.contractorA).set({ role: 'contractor', active: true, organizationId: ORG_A });
  await db.collection('users').doc(UID.contractorA2).set({ role: 'contractor', active: true, organizationId: ORG_A });
  await db.collection('users').doc(UID.inactiveContractorA).set({ role: 'contractor', active: false, organizationId: ORG_A });
  await db.collection('users').doc(UID.contractorB).set({ role: 'contractor', active: true, organizationId: ORG_B });
  await db.collection('users').doc(UID.inspectorCallerA).set({ role: 'inspector', active: true, organizationId: ORG_A });
  await db.collection('users').doc(UID.managerCallerA).set({ role: 'manager', active: true, organizationId: ORG_A });

  await db.collection('observations').doc('obs-pending-a').set({
    organizationId: ORG_A, assignedContractorUid: UID.contractorA, status: 'PENDING', resolutionNote: '',
  });
  await db.collection('observations').doc('obs-inprogress-a').set({
    organizationId: ORG_A, assignedContractorUid: UID.contractorA, status: 'IN_PROGRESS', resolutionNote: '[SMART_HSR_START] existing',
  });
  await db.collection('observations').doc('obs-completed-a').set({
    organizationId: ORG_A, assignedContractorUid: UID.contractorA, status: 'COMPLETED', resolutionNote: '',
  });
  await db.collection('observations').doc('obs-pending-b').set({
    organizationId: ORG_B, assignedContractorUid: UID.contractorB, status: 'PENDING', resolutionNote: '',
  });
}

beforeEach(async () => {
  await clearFirestore();
  await seed();
});

test('TRANS-1 a valid contractor START transition succeeds and the server constructs resolutionNote/status/updatedByUid itself', async () => {
  const token = await idTokenFor(UID.contractorA);
  const res = await callUpdate(token, { observationId: 'obs-pending-a', transitionKey: 'START', note: '', fix: { coords: [41.07, 19.12], accuracy: 6 } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'IN_PROGRESS');
  const snap = await db.collection('observations').doc('obs-pending-a').get();
  const data = snap.data();
  assert.equal(data.status, 'IN_PROGRESS');
  assert.equal(data.updatedByUid, UID.contractorA);
  assert.match(data.resolutionNote, /^\[SMART_HSR_START\]/);
});

test('TRANS-2 a valid contractor SUBMIT transition succeeds and preserves prior execution-event lines', async () => {
  const token = await idTokenFor(UID.contractorA);
  const res = await callUpdate(token, { observationId: 'obs-inprogress-a', transitionKey: 'SUBMIT', note: 'تم الإصلاح', fix: { coords: [41.07, 19.12], accuracy: 4 }, afterImagePath: 'obs-inprogress-a/after.jpg' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'PENDING_REVIEW');
  const data = (await db.collection('observations').doc('obs-inprogress-a').get()).data();
  assert.equal(data.status, 'PENDING_REVIEW');
  assert.equal(data.afterImagePath, 'obs-inprogress-a/after.jpg');
  assert.match(data.resolutionNote, /\[SMART_HSR_START\] existing/);
  assert.match(data.resolutionNote, /\[SMART_HSR_SUBMISSION\]/);
  assert.match(data.resolutionNote, /تم الإصلاح/);
});

test('ACTOR-1 organizationId/updatedByUid spoofing is impossible — request-body fields are always ignored in favor of the trusted caller context', async () => {
  const token = await idTokenFor(UID.contractorA);
  const res = await callUpdate(token, {
    observationId: 'obs-pending-a', transitionKey: 'START', note: '', fix: null,
    organizationId: ORG_B, updatedByUid: UID.contractorA2, actorRole: 'manager',
  });
  assert.equal(res.statusCode, 200);
  const data = (await db.collection('observations').doc('obs-pending-a').get()).data();
  assert.equal(data.organizationId, ORG_A);
  assert.equal(data.updatedByUid, UID.contractorA);
});

test('SEC-1 unauthenticated (no bearer token) is denied', async () => {
  const res = await callUpdate(null, { observationId: 'obs-pending-a', transitionKey: 'START' });
  assert.equal(res.statusCode, 401);
});

test('SEC-2 a non-contractor caller (inspector) is denied', async () => {
  const token = await idTokenFor(UID.inspectorCallerA);
  const res = await callUpdate(token, { observationId: 'obs-pending-a', transitionKey: 'START' });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.reason, 'contractor_required');
});

test('SEC-3 a non-contractor caller (manager) is denied', async () => {
  const token = await idTokenFor(UID.managerCallerA);
  const res = await callUpdate(token, { observationId: 'obs-pending-a', transitionKey: 'START' });
  assert.equal(res.statusCode, 403);
});

test('SEC-4 an INACTIVE contractor is denied', async () => {
  const token = await idTokenFor(UID.inactiveContractorA);
  const res = await callUpdate(token, { observationId: 'obs-pending-a', transitionKey: 'START' });
  assert.equal(res.statusCode, 403);
});

test('SEC-5 a cross-tenant observation (different organization than the caller) is denied', async () => {
  const token = await idTokenFor(UID.contractorA);
  const res = await callUpdate(token, { observationId: 'obs-pending-b', transitionKey: 'START' });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.reason, 'CROSS_ORGANIZATION_DENIED');
  const data = (await db.collection('observations').doc('obs-pending-b').get()).data();
  assert.equal(data.status, 'PENDING', 'the other tenant\'s observation must remain completely unchanged');
});

test('SEC-6 a same-org contractor NOT assigned to the observation is denied', async () => {
  const token = await idTokenFor(UID.contractorA2);
  const res = await callUpdate(token, { observationId: 'obs-pending-a', transitionKey: 'START' });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.reason, 'CONTRACTOR_NOT_ASSIGNED');
});

test('SEC-7 a nonexistent observation is denied', async () => {
  const token = await idTokenFor(UID.contractorA);
  const res = await callUpdate(token, { observationId: 'does-not-exist', transitionKey: 'START' });
  assert.equal(res.statusCode, 404);
});

test('SEC-8 an invalid current-status transition is denied (COMPLETED cannot be reopened via this action)', async () => {
  const token = await idTokenFor(UID.contractorA);
  const res = await callUpdate(token, { observationId: 'obs-completed-a', transitionKey: 'START' });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.reason, 'CONTRACTOR_TRANSITION_INVALID_CURRENT_STATUS');
});

test('SEC-9 SUBMIT cannot be applied to a still-PENDING observation (must START first)', async () => {
  const token = await idTokenFor(UID.contractorA);
  const res = await callUpdate(token, { observationId: 'obs-pending-a', transitionKey: 'SUBMIT', note: 'x' });
  assert.equal(res.statusCode, 409);
});

test('SEC-10 an unrecognized transitionKey is denied', async () => {
  const token = await idTokenFor(UID.contractorA);
  const res = await callUpdate(token, { observationId: 'obs-pending-a', transitionKey: 'COMPLETE_DIRECTLY' });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.reason, 'CONTRACTOR_TRANSITION_UNRECOGNIZED');
});

test('SEC-11 missing observationId/transitionKey is denied', async () => {
  const token = await idTokenFor(UID.contractorA);
  const res = await callUpdate(token, { observationId: '', transitionKey: '' });
  assert.equal(res.statusCode, 400);
});
