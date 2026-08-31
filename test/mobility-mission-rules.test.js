'use strict';
// ============================================================================
// Firestore Rules unit tests for missions/{missionId} — run ONLY against the
// local Firestore Emulator. Mirrors test/firestore.rules.test.js's harness.
//
// Run: node test/run-mobility-mission-rules.js
// ============================================================================
const { before, after, beforeEach, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');

const PROJECT_ID = 'demo-smart-hsr-mobility-tests';
const RULES_PATH = path.resolve(__dirname, '..', 'firestore.rules');

const ORG_A = 'orgA';
const ORG_B = 'orgB';
const DEPT_TRAFFIC = 'الرقابة البلدية';
const DEPT_ROADS = 'إدارة الطرق';

const UID = {
  mgrA: 'mgr-a-uid',
  deptHeadA: 'dept-head-a-uid',
  deptHeadA_roads: 'dept-head-a-roads-uid',
  deptHeadB: 'dept-head-b-uid',
  adminAffairsA: 'admin-affairs-a-uid',
  mobilityHeadA: 'mobility-head-a-uid',
  employeeA: 'employee-a-uid',
  employeeA2: 'employee-a2-uid',
  inactiveMobilityHeadA: 'inactive-mobility-head-a-uid',
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

    await setDoc(doc(db, 'managers', UID.mgrA), { role: 'manager', active: true, organizationId: ORG_A });

    await setDoc(doc(db, 'users', UID.deptHeadA), { role: 'department_head', active: true, organizationId: ORG_A, department: DEPT_TRAFFIC });
    await setDoc(doc(db, 'users', UID.deptHeadA_roads), { role: 'department_head', active: true, organizationId: ORG_A, department: DEPT_ROADS });
    await setDoc(doc(db, 'users', UID.deptHeadB), { role: 'department_head', active: true, organizationId: ORG_B, department: DEPT_TRAFFIC });
    await setDoc(doc(db, 'users', UID.adminAffairsA), { role: 'administrative_affairs', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.mobilityHeadA), { role: 'mobility_head', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.employeeA), { role: 'employee', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.employeeA2), { role: 'employee', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.inactiveMobilityHeadA), { role: 'mobility_head', active: false, organizationId: ORG_A });

    await setDoc(doc(db, 'missions', 'draftA'), {
      organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'DRAFT',
    });
    await setDoc(doc(db, 'missions', 'pendingA'), {
      organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'PENDING_APPROVAL',
    });
    await setDoc(doc(db, 'missions', 'approvedA'), {
      organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'APPROVED',
    });
    await setDoc(doc(db, 'missions', 'allocatedA'), {
      organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'VEHICLE_ALLOCATED',
      vehicleId: 'V101', assignedEmployeeUid: UID.employeeA,
    });
    await setDoc(doc(db, 'missions', 'handedOverA'), {
      organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'HANDED_OVER',
      vehicleId: 'V101', assignedEmployeeUid: UID.employeeA,
    });
    await setDoc(doc(db, 'missions', 'inProgressA'), {
      organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'IN_PROGRESS',
      vehicleId: 'V101', assignedEmployeeUid: UID.employeeA,
    });
    await setDoc(doc(db, 'missions', 'awaitingReturnA'), {
      organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'AWAITING_RETURN',
      vehicleId: 'V101', assignedEmployeeUid: UID.employeeA,
    });
    await setDoc(doc(db, 'missions', 'pendingB'), {
      organizationId: ORG_B, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadB, status: 'PENDING_APPROVAL',
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

// ============================================================
// Read scoping
// ============================================================
test('R1 same-org manager may read a mission', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.mgrA), 'missions', 'pendingA')));
});

test('R2 cross-org manager may not read a mission', async () => {
  await assertFails(getDoc(doc(ctx(UID.mgrA), 'missions', 'pendingB')));
});

test('R3 department head may read a mission in their own department', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.deptHeadA), 'missions', 'pendingA')));
});

test('R4 department head may NOT read a mission in a different department, same org', async () => {
  await assertFails(getDoc(doc(ctx(UID.deptHeadA_roads), 'missions', 'pendingA')));
});

test('R5 employee may read a mission assigned to them', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.employeeA), 'missions', 'allocatedA')));
});

test('R6 employee may NOT read a mission assigned to someone else', async () => {
  await assertFails(getDoc(doc(ctx(UID.employeeA2), 'missions', 'allocatedA')));
});

test('R7 administrative_affairs and mobility_head read org-wide, not department-scoped', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.adminAffairsA), 'missions', 'pendingA')));
  await assertSucceeds(getDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'pendingA')));
});

test('R8 a deactivated mobility_head account is denied entirely', async () => {
  await assertFails(getDoc(doc(ctx(UID.inactiveMobilityHeadA), 'missions', 'pendingA')));
});

// ============================================================
// Create
// ============================================================
test('C1 department head may create a DRAFT mission in their own department', async () => {
  await assertSucceeds(setDoc(doc(ctx(UID.deptHeadA), 'missions', 'newDraftA'), {
    organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'DRAFT',
  }));
});

test('C2 department head may not create a mission for a department that is not theirs', async () => {
  await assertFails(setDoc(doc(ctx(UID.deptHeadA), 'missions', 'spoofedDeptA'), {
    organizationId: ORG_A, department: DEPT_ROADS, createdByUid: UID.deptHeadA, status: 'DRAFT',
  }));
});

test('C3 department head may not create a mission already PENDING_APPROVAL', async () => {
  await assertFails(setDoc(doc(ctx(UID.deptHeadA), 'missions', 'skipDraftA'), {
    organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'PENDING_APPROVAL',
  }));
});

test('C4 mobility_head may not create a mission at all (not their authority)', async () => {
  await assertFails(setDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'notAllowedA'), {
    organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.mobilityHeadA, status: 'DRAFT',
  }));
});

// ============================================================
// Transitions
// ============================================================
test('T1 department head submits their own draft for approval', async () => {
  await assertSucceeds(updateDoc(doc(ctx(UID.deptHeadA), 'missions', 'draftA'), {
    status: 'PENDING_APPROVAL', updatedByUid: UID.deptHeadA, updatedAt: 1,
  }));
});

test('T2 a different department head cannot submit someone else\'s draft', async () => {
  await assertFails(updateDoc(doc(ctx(UID.deptHeadA_roads), 'missions', 'draftA'), {
    status: 'PENDING_APPROVAL', updatedByUid: UID.deptHeadA_roads, updatedAt: 1,
  }));
});

test('T3 administrative_affairs approves a pending request', async () => {
  await assertSucceeds(updateDoc(doc(ctx(UID.adminAffairsA), 'missions', 'pendingA'), {
    status: 'APPROVED', updatedByUid: UID.adminAffairsA, updatedAt: 1,
  }));
});

test('T4 mobility_head cannot approve a pending request (not their authority)', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'pendingA'), {
    status: 'APPROVED', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('T5 mobility_head allocates a vehicle with the required fields', async () => {
  await assertSucceeds(updateDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'approvedA'), {
    status: 'VEHICLE_ALLOCATED', vehicleId: 'V102', assignedEmployeeUid: UID.employeeA,
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('T6 mobility_head allocating without vehicleId/assignedEmployeeUid is denied', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'approvedA'), {
    status: 'VEHICLE_ALLOCATED', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('T7 mobility_head hands the vehicle over', async () => {
  await assertSucceeds(updateDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'allocatedA'), {
    status: 'HANDED_OVER', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('T8 the assigned employee receives the vehicle (HANDED_OVER -> READY)', async () => {
  await assertSucceeds(updateDoc(doc(ctx(UID.employeeA), 'missions', 'handedOverA'), {
    status: 'READY', updatedByUid: UID.employeeA, updatedAt: 1,
  }));
});

test('T9 a non-assigned employee cannot receive someone else\'s mission', async () => {
  await assertFails(updateDoc(doc(ctx(UID.employeeA2), 'missions', 'handedOverA'), {
    status: 'READY', updatedByUid: UID.employeeA2, updatedAt: 1,
  }));
});

test('T10 the assigned employee finishes an in-progress mission', async () => {
  await assertSucceeds(updateDoc(doc(ctx(UID.employeeA), 'missions', 'inProgressA'), {
    status: 'COMPLETED', updatedByUid: UID.employeeA, updatedAt: 1,
  }));
});

test('T11 the assigned employee cannot skip straight to CLOSED', async () => {
  await assertFails(updateDoc(doc(ctx(UID.employeeA), 'missions', 'inProgressA'), {
    status: 'CLOSED', updatedByUid: UID.employeeA, updatedAt: 1,
  }));
});

test('T12 mobility_head confirms the vehicle return, closing the mission', async () => {
  await assertSucceeds(updateDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'awaitingReturnA'), {
    status: 'CLOSED', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('T13 no one may change organizationId on an update', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'allocatedA'), {
    organizationId: 'orgC', status: 'HANDED_OVER', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('T14 updatedByUid must equal the actor\'s own uid, not a spoofed value', async () => {
  await assertFails(updateDoc(doc(ctx(UID.adminAffairsA), 'missions', 'pendingA'), {
    status: 'APPROVED', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('T15 a cross-organization actor cannot transition a mission that is not theirs', async () => {
  await assertFails(updateDoc(doc(ctx(UID.deptHeadB), 'missions', 'pendingA'), {
    status: 'APPROVED', updatedByUid: UID.deptHeadB, updatedAt: 1,
  }));
});

// ============================================================
// Delete
// ============================================================
test('D1 missions are never deleted, by anyone', async () => {
  const { deleteDoc } = require('firebase/firestore');
  await assertFails(deleteDoc(doc(ctx(UID.mgrA), 'missions', 'draftA')));
  await assertFails(deleteDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'draftA')));
});

console.log('mobility mission Firestore rules OK');
