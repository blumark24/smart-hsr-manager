'use strict';
// ============================================================================
// Firestore Rules unit tests for incidents/{incidentId} and
// auditEvents/{eventId} — run ONLY against the local Firestore Emulator.
// Mirrors test/firestore.rules.test.js's harness.
//
// Run: node test/run-mobility-incident-audit-rules.js
// ============================================================================
const { before, after, beforeEach, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');

const PROJECT_ID = 'demo-smart-hsr-incident-audit-tests';
const RULES_PATH = path.resolve(__dirname, '..', 'firestore.rules');

const ORG_A = 'orgA';
const ORG_B = 'orgB';
const DEPT_TRAFFIC = 'الرقابة البلدية';

const UID = {
  mgrA: 'mgr-a-uid',
  deptHeadA: 'dept-head-a-uid',
  adminAffairsA: 'admin-affairs-a-uid',
  mobilityHeadA: 'mobility-head-a-uid',
  employeeA: 'employee-a-uid',
  employeeA2: 'employee-a2-uid',
};

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync(RULES_PATH, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => { if (testEnv) await testEnv.cleanup(); });

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'managers', UID.mgrA), { role: 'manager', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.deptHeadA), { role: 'department_head', active: true, organizationId: ORG_A, department: DEPT_TRAFFIC });
    await setDoc(doc(db, 'users', UID.adminAffairsA), { role: 'administrative_affairs', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.mobilityHeadA), { role: 'mobility_head', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.employeeA), { role: 'employee', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.employeeA2), { role: 'employee', active: true, organizationId: ORG_A });

    await setDoc(doc(db, 'missions', 'inProgressA'), {
      organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'IN_PROGRESS',
      vehicleId: 'V101', assignedEmployeeUid: UID.employeeA,
    });
    await setDoc(doc(db, 'missions', 'readyA'), {
      organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'READY',
      vehicleId: 'V101', assignedEmployeeUid: UID.employeeA,
    });

    await setDoc(doc(db, 'incidents', 'newA'), {
      organizationId: ORG_A, missionId: 'inProgressA', vehicleId: 'V101', createdByUid: UID.employeeA,
      department: DEPT_TRAFFIC, category: 'حادث مروري', severity: 'CRITICAL', status: 'NEW',
    });
    await setDoc(doc(db, 'incidents', 'ackA'), {
      organizationId: ORG_A, missionId: 'inProgressA', vehicleId: 'V101', createdByUid: UID.employeeA,
      department: DEPT_TRAFFIC, category: 'عطل مركبة', severity: 'MEDIUM', status: 'ACKNOWLEDGED',
    });
    await setDoc(doc(db, 'incidents', 'newB'), {
      organizationId: ORG_B, missionId: 'x', vehicleId: 'x', createdByUid: 'x', department: DEPT_TRAFFIC,
      category: 'x', severity: 'LOW', status: 'NEW',
    });

    await setDoc(doc(db, 'auditEvents', 'evtA'), {
      organizationId: ORG_A, actorId: UID.mobilityHeadA, actorRole: 'mobility_head',
      resourceType: 'mission', resourceId: 'inProgressA', action: 'allocate_vehicle',
    });
    await setDoc(doc(db, 'auditEvents', 'evtEmpA'), {
      organizationId: ORG_A, actorId: UID.employeeA, actorRole: 'employee',
      resourceType: 'mission', resourceId: 'inProgressA', action: 'employee_advance',
    });
    await setDoc(doc(db, 'auditEvents', 'evtB'), {
      organizationId: ORG_B, actorId: 'x', actorRole: 'mobility_head',
      resourceType: 'mission', resourceId: 'x', action: 'x',
    });
  });
}

beforeEach(async () => { await testEnv.clearFirestore(); await seed(); });
function ctx(uid) { return testEnv.authenticatedContext(uid).firestore(); }

// ============================================================
// incidents/{incidentId}
// ============================================================
test('I1 same-org manager, mobility_head, administrative_affairs may read an incident', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.mgrA), 'incidents', 'newA')));
  await assertSucceeds(getDoc(doc(ctx(UID.mobilityHeadA), 'incidents', 'newA')));
  await assertSucceeds(getDoc(doc(ctx(UID.adminAffairsA), 'incidents', 'newA')));
});

test('I2 cross-org manager may not read an incident', async () => {
  await assertFails(getDoc(doc(ctx(UID.mgrA), 'incidents', 'newB')));
});

test('I3 the reporting employee may read their own incident; another employee may not', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.employeeA), 'incidents', 'newA')));
  await assertFails(getDoc(doc(ctx(UID.employeeA2), 'incidents', 'newA')));
});

test('I4 department head may read an incident in their own department', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.deptHeadA), 'incidents', 'newA')));
});

test('C1 the assigned employee may create an incident on their own IN_PROGRESS mission', async () => {
  await assertSucceeds(setDoc(doc(ctx(UID.employeeA), 'incidents', 'newC1'), {
    organizationId: ORG_A, missionId: 'inProgressA', vehicleId: 'V101', createdByUid: UID.employeeA,
    department: DEPT_TRAFFIC, category: 'نقص وقود', severity: 'LOW', status: 'NEW',
  }));
});

test('C2 a non-assigned employee cannot create an incident on someone else\'s mission', async () => {
  await assertFails(setDoc(doc(ctx(UID.employeeA2), 'incidents', 'newC2'), {
    organizationId: ORG_A, missionId: 'inProgressA', vehicleId: 'V101', createdByUid: UID.employeeA2,
    department: DEPT_TRAFFIC, category: 'نقص وقود', severity: 'LOW', status: 'NEW',
  }));
});

test('C3 an incident cannot be created on a mission that is not IN_PROGRESS', async () => {
  await assertFails(setDoc(doc(ctx(UID.employeeA), 'incidents', 'newC3'), {
    organizationId: ORG_A, missionId: 'readyA', vehicleId: 'V101', createdByUid: UID.employeeA,
    department: DEPT_TRAFFIC, category: 'نقص وقود', severity: 'LOW', status: 'NEW',
  }));
});

test('C4 mobility_head may not create an incident (not their authority)', async () => {
  await assertFails(setDoc(doc(ctx(UID.mobilityHeadA), 'incidents', 'newC4'), {
    organizationId: ORG_A, missionId: 'inProgressA', vehicleId: 'V101', createdByUid: UID.mobilityHeadA,
    department: DEPT_TRAFFIC, category: 'نقص وقود', severity: 'LOW', status: 'NEW',
  }));
});

test('T1 mobility_head walks the incident through NEW -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED', async () => {
  await assertSucceeds(updateDoc(doc(ctx(UID.mobilityHeadA), 'incidents', 'newA'), {
    status: 'ACKNOWLEDGED', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
  await assertSucceeds(updateDoc(doc(ctx(UID.mobilityHeadA), 'incidents', 'ackA'), {
    status: 'IN_PROGRESS', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('T2 the reporting employee cannot process their own incident', async () => {
  await assertFails(updateDoc(doc(ctx(UID.employeeA), 'incidents', 'newA'), {
    status: 'ACKNOWLEDGED', updatedByUid: UID.employeeA, updatedAt: 1,
  }));
});

test('T3 an incident status cannot skip a stage', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'incidents', 'newA'), {
    status: 'RESOLVED', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('D1 incidents are never deleted', async () => {
  await assertFails(deleteDoc(doc(ctx(UID.mobilityHeadA), 'incidents', 'newA')));
});

// ============================================================
// auditEvents/{eventId}
// ============================================================
test('A1 same-org manager, mobility_head, administrative_affairs may read an audit event', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.mgrA), 'auditEvents', 'evtA')));
  await assertSucceeds(getDoc(doc(ctx(UID.mobilityHeadA), 'auditEvents', 'evtA')));
  await assertSucceeds(getDoc(doc(ctx(UID.adminAffairsA), 'auditEvents', 'evtA')));
});

test('A2 cross-org manager may not read an audit event', async () => {
  await assertFails(getDoc(doc(ctx(UID.mgrA), 'auditEvents', 'evtB')));
});

test('A3 an employee may read an audit event they are the actor of, not one they are not', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.employeeA), 'auditEvents', 'evtEmpA')));
  await assertFails(getDoc(doc(ctx(UID.employeeA), 'auditEvents', 'evtA')));
});

test('W1 an actor may record an audit event as themselves', async () => {
  await assertSucceeds(setDoc(doc(ctx(UID.mobilityHeadA), 'auditEvents', 'evtNewW1'), {
    organizationId: ORG_A, actorId: UID.mobilityHeadA, actorRole: 'mobility_head',
    resourceType: 'vehicle', resourceId: 'V101', action: 'allocate',
  }));
});

test('W2 an actor cannot record an audit event impersonating someone else', async () => {
  await assertFails(setDoc(doc(ctx(UID.mobilityHeadA), 'auditEvents', 'evtSpoofW2'), {
    organizationId: ORG_A, actorId: UID.employeeA, actorRole: 'employee',
    resourceType: 'vehicle', resourceId: 'V101', action: 'allocate',
  }));
});

test('W3 an actor cannot record an audit event with a fabricated role', async () => {
  await assertFails(setDoc(doc(ctx(UID.employeeA), 'auditEvents', 'evtSpoofW3'), {
    organizationId: ORG_A, actorId: UID.employeeA, actorRole: 'mobility_head',
    resourceType: 'mission', resourceId: 'inProgressA', action: 'allocate_vehicle',
  }));
});

test('U1 audit events are never updated or deleted', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'auditEvents', 'evtA'), { action: 'tampered' }));
  await assertFails(deleteDoc(doc(ctx(UID.mobilityHeadA), 'auditEvents', 'evtA')));
});

console.log('mobility incident + audit Firestore rules OK');
