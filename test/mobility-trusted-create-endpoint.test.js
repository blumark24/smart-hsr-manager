'use strict';
// Phase 10 release-integrity micro-closure.  Real Firebase Auth + Firestore
// emulator proof for the two trusted create actions on api/admin/users.js.
const { before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');

const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR_HOST;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST;

const { getDb, getAuth, FieldValue } = require('../api/_lib/firebaseAdmin');
const usersHandler = require('../api/admin/users.js');
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'smart-hsr-manager';
const PASSWORD = 'Passw0rd!123';
const ORG_A = 'trusted-create-org-a';
const ORG_B = 'trusted-create-org-b';
const DEPT_A = 'الحركة';
const UID = {
  dept: 'tc-dept-a', inactiveDept: 'tc-inactive-dept-a', mobility: 'tc-mobility-a',
  employee: 'tc-employee-a', otherEmployee: 'tc-other-employee-a', inactiveEmployee: 'tc-inactive-employee-a',
  employeeB: 'tc-employee-b',
};
let db;
let auth;
const tokenCache = new Map();

async function ensureUser(uid) {
  try { await auth.getUser(uid); }
  catch (_) { await auth.createUser({ uid, email: `${uid}@example.com`, password: PASSWORD }); }
}

async function tokenFor(uid) {
  if (tokenCache.has(uid)) return tokenCache.get(uid);
  const response = await fetch(`http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.com`, password: PASSWORD, returnSecureToken: true }),
  });
  const body = await response.json();
  if (!body.idToken) throw new Error(`sign-in failed for ${uid}: ${JSON.stringify(body)}`);
  tokenCache.set(uid, body.idToken);
  return body.idToken;
}

function fakeRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(key, value) { this.headers[key] = value; },
    end(payload) { this.body = payload ? JSON.parse(payload) : null; },
  };
}

async function call(uid, body) {
  const res = fakeRes();
  await usersHandler({
    method: 'POST',
    headers: uid ? { authorization: `Bearer ${await tokenFor(uid)}` } : {},
    body,
  }, res);
  return res;
}

async function clearFirestore() {
  const response = await fetch(`http://${FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`clear Firestore failed: ${response.status}`);
}

async function seed() {
  await Promise.all([
    db.collection('users').doc(UID.dept).set({ role: 'department_head', active: true, organizationId: ORG_A, department: DEPT_A, name: 'رئيس القسم الحقيقي' }),
    db.collection('users').doc(UID.inactiveDept).set({ role: 'department_head', active: false, organizationId: ORG_A, department: DEPT_A }),
    db.collection('users').doc(UID.mobility).set({ role: 'mobility_head', active: true, organizationId: ORG_A }),
    db.collection('users').doc(UID.employee).set({ role: 'employee', active: true, organizationId: ORG_A, department: DEPT_A, name: 'الموظف الحقيقي' }),
    db.collection('users').doc(UID.otherEmployee).set({ role: 'employee', active: true, organizationId: ORG_A, department: DEPT_A }),
    db.collection('users').doc(UID.inactiveEmployee).set({ role: 'employee', active: false, organizationId: ORG_A, department: DEPT_A }),
    db.collection('users').doc(UID.employeeB).set({ role: 'employee', active: true, organizationId: ORG_B, department: DEPT_A }),
  ]);
  await Promise.all([
    db.collection('missions').doc('mission-progress-a').set({ organizationId: ORG_A, department: DEPT_A, status: 'IN_PROGRESS', assignedEmployeeUid: UID.employee, vehicleId: 'vehicle-a' }),
    db.collection('missions').doc('mission-ready-a').set({ organizationId: ORG_A, department: DEPT_A, status: 'READY', assignedEmployeeUid: UID.employee, vehicleId: 'vehicle-a' }),
    db.collection('missions').doc('mission-other-employee').set({ organizationId: ORG_A, department: DEPT_A, status: 'IN_PROGRESS', assignedEmployeeUid: UID.otherEmployee, vehicleId: 'vehicle-other' }),
    db.collection('missions').doc('mission-progress-b').set({ organizationId: ORG_B, department: DEPT_A, status: 'IN_PROGRESS', assignedEmployeeUid: UID.employeeB, vehicleId: 'vehicle-b' }),
    db.collection('vehicles').doc('vehicle-a').set({ organizationId: ORG_A, status: 'IN_MISSION', assignedEmployeeUid: UID.employee, currentMissionId: 'mission-progress-a' }),
    db.collection('vehicles').doc('vehicle-wrong').set({ organizationId: ORG_A, status: 'IN_MISSION', assignedEmployeeUid: UID.otherEmployee, currentMissionId: 'mission-other-employee' }),
  ]);
}

before(async () => {
  db = getDb();
  auth = getAuth();
  await Promise.all(Object.values(UID).map(ensureUser));
});
beforeEach(async () => { await clearFirestore(); await seed(); });

function missionBody(overrides = {}) {
  return { action: 'createMissionRequest', clientRequestId: 'mission-request-0001', type: 'تفتيش', destination: 'القنفذة', reason: 'متابعة', ...overrides };
}
function incidentBody(overrides = {}) {
  return { action: 'createIncident', clientRequestId: 'incident-request-0001', missionId: 'mission-progress-a', vehicleId: 'vehicle-a', category: 'عطل مركبة', severity: 'MEDIUM', note: 'بلاغ', ...overrides };
}

async function docsFor(collection, field, value) {
  return db.collection(collection).where(field, '==', value).get();
}

test('TC-M1 mission trusted API derives actor/role/org/department and atomically writes one canonical audit', async () => {
  const res = await call(UID.dept, missionBody());
  assert.equal(res.statusCode, 200);
  const mission = (await db.collection('missions').doc(res.body.missionId).get()).data();
  assert.equal(mission.status, 'DRAFT');
  assert.equal(mission.organizationId, ORG_A);
  assert.equal(mission.department, DEPT_A);
  assert.equal(mission.createdByUid, UID.dept);
  assert.equal(mission.requesterName, 'رئيس القسم الحقيقي');
  const audits = await docsFor('auditEvents', 'resourceId', res.body.missionId);
  assert.equal(audits.size, 1);
  assert.deepEqual({ actorId: audits.docs[0].data().actorId, actorRole: audits.docs[0].data().actorRole, organizationId: audits.docs[0].data().organizationId },
    { actorId: UID.dept, actorRole: 'department_head', organizationId: ORG_A });
});

test('TC-M2 mission retry is idempotent; changed payload under the same request id fails', async () => {
  const first = await call(UID.dept, missionBody());
  const retry = await call(UID.dept, missionBody());
  const mismatch = await call(UID.dept, missionBody({ destination: 'موقع مختلف' }));
  assert.equal(first.statusCode, 200);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.idempotent, true);
  assert.equal(retry.body.missionId, first.body.missionId);
  assert.equal(mismatch.statusCode, 409);
  assert.equal(mismatch.body.reason, 'idempotency_payload_mismatch');
  assert.equal((await docsFor('missions', 'clientRequestId', 'mission-request-0001')).size, 1);
  assert.equal((await docsFor('auditEvents', 'clientRequestId', 'mission-request-0001')).size, 1);
});

test('TC-M3 unauthenticated, wrong-role and inactive department-head mission creates are denied with no write', async () => {
  assert.equal((await call(null, missionBody())).statusCode, 401);
  assert.equal((await call(UID.mobility, missionBody())).statusCode, 403);
  assert.equal((await call(UID.inactiveDept, missionBody())).statusCode, 403);
  assert.equal((await docsFor('missions', 'clientRequestId', 'mission-request-0001')).size, 0);
});

test('TC-I1 incident trusted API validates mission+vehicle and atomically derives canonical NEW incident/audit', async () => {
  const res = await call(UID.employee, incidentBody());
  assert.equal(res.statusCode, 200);
  const incident = (await db.collection('incidents').doc(res.body.incidentId).get()).data();
  assert.equal(incident.status, 'NEW');
  assert.equal(incident.organizationId, ORG_A);
  assert.equal(incident.department, DEPT_A);
  assert.equal(incident.createdByUid, UID.employee);
  assert.equal(incident.employeeName, 'الموظف الحقيقي');
  const audits = await docsFor('auditEvents', 'resourceId', res.body.incidentId);
  assert.equal(audits.size, 1);
  assert.deepEqual({ actorId: audits.docs[0].data().actorId, actorRole: audits.docs[0].data().actorRole, organizationId: audits.docs[0].data().organizationId },
    { actorId: UID.employee, actorRole: 'employee', organizationId: ORG_A });
});

test('TC-I2 incident retry is idempotent; changed payload under the same request id fails', async () => {
  const first = await call(UID.employee, incidentBody());
  const retry = await call(UID.employee, incidentBody());
  const mismatch = await call(UID.employee, incidentBody({ note: 'حمولة مختلفة' }));
  assert.equal(first.statusCode, 200);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.idempotent, true);
  assert.equal(retry.body.incidentId, first.body.incidentId);
  assert.equal(mismatch.statusCode, 409);
  assert.equal(mismatch.body.reason, 'idempotency_payload_mismatch');
  assert.equal((await docsFor('incidents', 'clientRequestId', 'incident-request-0001')).size, 1);
  assert.equal((await docsFor('auditEvents', 'clientRequestId', 'incident-request-0001')).size, 1);
});

test('TC-I3 inactive or wrong-role callers are denied', async () => {
  assert.equal((await call(UID.inactiveEmployee, incidentBody())).statusCode, 403);
  assert.equal((await call(UID.mobility, incidentBody())).statusCode, 403);
  assert.equal((await docsFor('incidents', 'clientRequestId', 'incident-request-0001')).size, 0);
});

test('TC-I4 mission must exist, be same-org, assigned to caller, and IN_PROGRESS', async () => {
  assert.equal((await call(UID.employee, incidentBody({ clientRequestId: 'incident-request-missing', missionId: 'missing' }))).statusCode, 404);
  assert.equal((await call(UID.employee, incidentBody({ clientRequestId: 'incident-request-crossorg', missionId: 'mission-progress-b', vehicleId: 'vehicle-b' }))).statusCode, 403);
  assert.equal((await call(UID.employee, incidentBody({ clientRequestId: 'incident-request-unassigned', missionId: 'mission-other-employee', vehicleId: 'vehicle-other' }))).statusCode, 403);
  assert.equal((await call(UID.employee, incidentBody({ clientRequestId: 'incident-request-status', missionId: 'mission-ready-a' }))).statusCode, 409);
  assert.equal((await db.collection('incidents').get()).size, 0);
});

test('TC-I5 vehicle relationship is fully validated when vehicleId is present', async () => {
  const wrong = await call(UID.employee, incidentBody({ vehicleId: 'vehicle-wrong' }));
  const missing = await call(UID.employee, incidentBody({ clientRequestId: 'incident-request-no-vehicle', vehicleId: 'missing-vehicle' }));
  assert.equal(wrong.statusCode, 409);
  assert.equal(wrong.body.reason, 'vehicle_relationship_invalid');
  assert.equal(missing.statusCode, 404);
  assert.equal((await db.collection('incidents').get()).size, 0);
});

test('TC-A1 Firestore transaction rollback leaves neither resource nor audit after a forced post-stage failure', async () => {
  const resource = db.collection('missions').doc('forced-atomic-resource');
  const audit = db.collection('auditEvents').doc('forced-atomic-audit');
  await assert.rejects(db.runTransaction(async (transaction) => {
    await transaction.get(db.collection('users').doc(UID.dept));
    transaction.set(resource, { organizationId: ORG_A, status: 'DRAFT', createdAt: FieldValue.serverTimestamp() });
    transaction.set(audit, { organizationId: ORG_A, resourceType: 'mission', resourceId: resource.id, action: 'create' });
    throw new Error('forced_failure_after_all_writes_staged');
  }), /forced_failure_after_all_writes_staged/);
  assert.equal((await resource.get()).exists, false);
  assert.equal((await audit.get()).exists, false);
});

for (const kind of ['mission', 'incident']) {
  test(`TC-S ${kind} rejects every protected field before resource/audit/receipt writes, including on retry`, async () => {
    const uid = kind === 'mission' ? UID.dept : UID.employee;
    const payload = kind === 'mission' ? missionBody() : incidentBody();
    const collection = kind === 'mission' ? 'missions' : 'incidents';
    const protectedFields = ['uid', 'actorId', 'actorUid', 'actorRole', 'role', 'mobilityAccess',
      'organizationId', 'department', 'status', 'createdByUid', 'updatedByUid',
      'requesterName', 'employeeName', 'createdAt', 'updatedAt', 'timestamp',
      'resourceId', 'resourceType', 'toStatus', 'audit', 'auditEvents', 'payloadHash',
      'assignedEmployeeUid', 'unknownField'];
    for (const key of protectedFields) {
      for (const value of ['spoofed', null, false, '']) {
        const res = await call(uid, { ...payload, [key]: value });
        assert.equal(res.statusCode, 400, `${kind}: ${key}=${JSON.stringify(value)}`);
        assert.deepEqual(res.body, { error: 'invalid_request', reason: 'protected_or_unknown_field' });
      }
    }
    for (const name of [collection, 'auditEvents', 'mobilityCreateRequests']) {
      assert.equal((await docsFor(name, 'clientRequestId', payload.clientRequestId)).size, 0);
    }
    const first = await call(uid, payload);
    assert.equal(first.statusCode, 200);
    const spoofedRetry = await call(uid, { ...payload, organizationId: ORG_B });
    assert.equal(spoofedRetry.statusCode, 400);
    const retry = await call(uid, payload);
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.body.idempotent, true);
    assert.equal(retry.body[`${kind}Id`], first.body[`${kind}Id`]);
    for (const name of [collection, 'auditEvents', 'mobilityCreateRequests']) {
      assert.equal((await docsFor(name, 'clientRequestId', payload.clientRequestId)).size, 1);
    }
  });
}

test('SUP incident retry remains canonical after persisted mission/vehicle/incident lifecycle changes', async () => {
  const first = await call(UID.employee, incidentBody());
  assert.equal(first.statusCode, 200);
  await db.collection('missions').doc('mission-progress-a').update({ status: 'CLOSED' });
  await db.collection('vehicles').doc('vehicle-a').update({ status: 'AVAILABLE', assignedEmployeeUid: null, currentMissionId: null });
  await db.collection('incidents').doc(first.body.incidentId).update({ status: 'RESOLVED' });
  const retry = await call(UID.employee, incidentBody());
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.incidentId, first.body.incidentId);
  assert.equal(retry.body.idempotent, true);
  assert.equal((await db.collection('incidents').doc(first.body.incidentId).get()).data().status, 'RESOLVED');
  assert.equal((await call(UID.employee, incidentBody({ note: 'changed after lifecycle' }))).statusCode, 409);
  assert.equal((await docsFor('incidents', 'clientRequestId', 'incident-request-0001')).size, 1);
  assert.equal((await docsFor('auditEvents', 'clientRequestId', 'incident-request-0001')).size, 1);
});

for (const kind of ['mission', 'incident']) {
  test(`SUP actual ${kind} endpoint rolls back resource and receipt when mandatory audit staging fails`, async () => {
    const original = db.runTransaction;
    db.runTransaction = (callback, ...args) => original.call(db, async transaction => {
      const stage = transaction.set.bind(transaction);
      transaction.set = (ref, ...values) => {
        if (ref.parent.id === 'auditEvents') throw new Error('injected audit staging failure');
        return stage(ref, ...values);
      };
      return callback(transaction);
    }, ...args);
    const payload = kind === 'mission' ? missionBody() : incidentBody();
    try {
      const response = await call(kind === 'mission' ? UID.dept : UID.employee, payload);
      assert.equal(response.statusCode, 500);
      for (const name of [kind === 'mission' ? 'missions' : 'incidents', 'auditEvents', 'mobilityCreateRequests']) {
        assert.equal((await docsFor(name, 'clientRequestId', payload.clientRequestId)).size, 0);
      }
    } finally {
      db.runTransaction = original;
    }
  });
}
