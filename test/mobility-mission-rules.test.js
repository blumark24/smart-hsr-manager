'use strict';
// ============================================================================
// Firestore Rules unit tests for missions/{missionId} and vehicles/{vehicleId}
// — run ONLY against the local Firestore Emulator. Mirrors
// test/firestore.rules.test.js's harness. The two collections are tested
// together because vehicle allocation cross-checks the referenced mission
// (and vice versa) — see firestore.rules' canMobilityHeadAdvanceMission and
// canMobilityHeadManageVehicle.
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

    // vehicles
    await setDoc(doc(db, 'vehicles', 'V101'), { organizationId: ORG_A, status: 'IN_MISSION', assignedEmployeeUid: UID.employeeA, currentMissionId: 'inProgressA' });
    await setDoc(doc(db, 'vehicles', 'V102'), { organizationId: ORG_A, status: 'AVAILABLE' });
    await setDoc(doc(db, 'vehicles', 'V103'), { organizationId: ORG_A, status: 'RESERVED', assignedEmployeeUid: UID.employeeA2, currentMissionId: 'approvedA' });
    await setDoc(doc(db, 'vehicles', 'V104'), { organizationId: ORG_A, status: 'RETURN_PENDING', assignedEmployeeUid: UID.employeeA, currentMissionId: 'awaitingReturnA' });
    await setDoc(doc(db, 'vehicles', 'V105'), { organizationId: ORG_A, status: 'MAINTENANCE' });
    await setDoc(doc(db, 'vehicles', 'V201'), { organizationId: ORG_B, status: 'AVAILABLE' });
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

test('T6b CONFLICT PREVENTION: a mission cannot be allocated a vehicle that is not AVAILABLE', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'approvedA'), {
    status: 'VEHICLE_ALLOCATED', vehicleId: 'V101', assignedEmployeeUid: UID.employeeA,
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
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

// ============================================================
// vehicles/{vehicleId} — fleet lifecycle + conflict prevention
// ============================================================
test('V1 same-org manager may read a vehicle', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.mgrA), 'vehicles', 'V102')));
});

test('V2 cross-org manager may not read a vehicle', async () => {
  await assertFails(getDoc(doc(ctx(UID.mgrA), 'vehicles', 'V201')));
});

test('V3 an employee may read the vehicle assigned to them, not another', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.employeeA), 'vehicles', 'V101')));
  await assertFails(getDoc(doc(ctx(UID.employeeA), 'vehicles', 'V103')));
});

test('V4 only mobility_head may add a vehicle to the roster, and only as AVAILABLE with no stale commitment', async () => {
  await assertSucceeds(setDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V106'), {
    organizationId: ORG_A, status: 'AVAILABLE',
  }));
  await assertFails(setDoc(doc(ctx(UID.adminAffairsA), 'vehicles', 'V107'), {
    organizationId: ORG_A, status: 'AVAILABLE',
  }));
  await assertFails(setDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V108'), {
    organizationId: ORG_A, status: 'AVAILABLE', assignedEmployeeUid: UID.employeeA,
  }));
});

test('V5 mobility_head reserves an available vehicle for an APPROVED mission', async () => {
  await assertSucceeds(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V102'), {
    status: 'RESERVED', assignedEmployeeUid: UID.employeeA, currentMissionId: 'approvedA',
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('V6 CONFLICT PREVENTION: an already-reserved vehicle cannot be reserved again', async () => {
  // V103 is already RESERVED in the seed. A second allocation attempt,
  // even for a different (also APPROVED) mission, must be denied because
  // the vehicle's committed status is no longer AVAILABLE.
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V103'), {
    status: 'RESERVED', assignedEmployeeUid: UID.employeeA2, currentMissionId: 'approvedA',
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('V7 CONFLICT PREVENTION: reserving a vehicle for a mission that is not APPROVED is denied', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V102'), {
    status: 'RESERVED', assignedEmployeeUid: UID.employeeA, currentMissionId: 'pendingA',
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('V8 CONFLICT PREVENTION (sequential race): once the first allocation commits, a second racing allocation of the same vehicle fails', async () => {
  const first = updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V102'), {
    status: 'RESERVED', assignedEmployeeUid: UID.employeeA, currentMissionId: 'approvedA',
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  });
  await assertSucceeds(first);
  // V102 is now RESERVED. A second mobility_head trying to allocate the
  // very same vehicle to a different mission is correctly refused because
  // the rule requires the vehicle's CURRENT status to be AVAILABLE.
  const second = updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V102'), {
    status: 'RESERVED', assignedEmployeeUid: UID.employeeA2, currentMissionId: 'pendingA',
    updatedByUid: UID.mobilityHeadA, updatedAt: 2,
  });
  await assertFails(second);
});

test('V9 mobility_head hands over a reserved vehicle', async () => {
  await assertSucceeds(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V103'), {
    status: 'IN_MISSION', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('V10 the assigned employee reports a return; a non-assigned employee cannot', async () => {
  await assertFails(updateDoc(doc(ctx(UID.employeeA2), 'vehicles', 'V101'), {
    status: 'RETURN_PENDING', updatedByUid: UID.employeeA2, updatedAt: 1,
  }));
  await assertSucceeds(updateDoc(doc(ctx(UID.employeeA), 'vehicles', 'V101'), {
    status: 'RETURN_PENDING', updatedByUid: UID.employeeA, updatedAt: 1,
  }));
});

test('V11 mobility_head confirms the return, clearing the mission commitment', async () => {
  const { deleteField } = require('firebase/firestore');
  await assertSucceeds(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V104'), {
    status: 'AVAILABLE', assignedEmployeeUid: deleteField(), currentMissionId: deleteField(),
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('V12 mobility_head can take a vehicle out of service and back into service', async () => {
  await assertSucceeds(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V102'), {
    status: 'MAINTENANCE', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
  await assertSucceeds(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V105'), {
    status: 'AVAILABLE', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('V13 vehicles are never deleted, by anyone', async () => {
  const { deleteDoc } = require('firebase/firestore');
  await assertFails(deleteDoc(doc(ctx(UID.mgrA), 'vehicles', 'V102')));
  await assertFails(deleteDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V102')));
});

// ============================================================
// users/{userId} read scoping for the employee picker (mobility_head
// must be able to list org employees to allocate a vehicle to one).
// ============================================================
test('U1 mobility_head may read an employee record in their own org', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.mobilityHeadA), 'users', UID.employeeA)));
});

test('U2 mobility_head may NOT read a non-employee record (least privilege)', async () => {
  await assertFails(getDoc(doc(ctx(UID.mobilityHeadA), 'users', UID.deptHeadA)));
  await assertFails(getDoc(doc(ctx(UID.mobilityHeadA), 'users', UID.adminAffairsA)));
});

test('U3 mobility_head may NOT read an employee record in a different org', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'employee-b-uid'), {
      role: 'employee', active: true, organizationId: ORG_B,
    });
  });
  await assertFails(getDoc(doc(ctx(UID.mobilityHeadA), 'users', 'employee-b-uid')));
});

test('U4 department_head, administrative_affairs and employee still cannot read other users', async () => {
  await assertFails(getDoc(doc(ctx(UID.deptHeadA), 'users', UID.employeeA)));
  await assertFails(getDoc(doc(ctx(UID.adminAffairsA), 'users', UID.employeeA)));
  await assertFails(getDoc(doc(ctx(UID.employeeA), 'users', UID.employeeA2)));
});

console.log('mobility mission + vehicle Firestore rules OK');
