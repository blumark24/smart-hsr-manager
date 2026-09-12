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
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, writeBatch } = require('firebase/firestore');

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
  // PHASE 06A hotfix — vehicle-allocation target-employee fixtures.
  employeeB: 'employee-b-uid',
  inactiveEmployeeA: 'inactive-employee-a-uid',
  noVehicleEligibleFieldA: 'field-supervisor-a-uid',
  // PHASE 06A.1 — independent mobilityAccess employee fixtures.
  mobilityAccessEmployeeA: 'mobility-access-employee-a-uid',
  staleDisabledEmployeeA: 'stale-disabled-employee-a-uid',
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
    // vehicleEligible: true — required for the V5/V8 vehicle-allocation
    // tests below under the Phase 03B.1 fail-safe default (missing means
    // NOT eligible); harmless for every other test, which never exercises
    // the allocate transition for these two employees.
    await setDoc(doc(db, 'users', UID.employeeA), { role: 'employee', active: true, organizationId: ORG_A, vehicleEligible: true });
    await setDoc(doc(db, 'users', UID.employeeA2), { role: 'employee', active: true, organizationId: ORG_A, vehicleEligible: true });
    await setDoc(doc(db, 'users', UID.inactiveMobilityHeadA), { role: 'mobility_head', active: false, organizationId: ORG_A });
    // PHASE 06A hotfix — vehicle-allocation target-employee fixtures: a
    // real employee in a DIFFERENT organization, a real but inactive
    // employee in ORG_A, and a real ORG_A user who is NOT a Mobility role
    // (a Field supervisor) — all vehicleEligible: true, so eligibility
    // alone must not be enough to let any of them be allocated a vehicle.
    await setDoc(doc(db, 'users', UID.employeeB), { role: 'employee', active: true, organizationId: ORG_B, vehicleEligible: true });
    await setDoc(doc(db, 'users', UID.inactiveEmployeeA), { role: 'employee', active: false, organizationId: ORG_A, vehicleEligible: true });
    await setDoc(doc(db, 'users', UID.noVehicleEligibleFieldA), { role: 'supervisor', active: true, organizationId: ORG_A, vehicleEligible: true });
    // PHASE 06A.1 — a real Mobility employee whose role lives ONLY in the
    // independent mobilityAccess field (legacy scalar role is null, exactly
    // like an account created post-06A), and a stale record where the
    // legacy scalar role is still 'employee' but mobilityAccess explicitly
    // disables Mobility — allocation must honor the independent field alone
    // in both directions, never falling back to the stale legacy role once
    // mobilityAccess exists.
    await setDoc(doc(db, 'users', UID.mobilityAccessEmployeeA), {
      role: null, active: true, organizationId: ORG_A, vehicleEligible: true,
      mobilityAccess: { enabled: true, role: 'employee' },
    });
    await setDoc(doc(db, 'users', UID.staleDisabledEmployeeA), {
      role: 'employee', active: true, organizationId: ORG_A, vehicleEligible: true,
      mobilityAccess: { enabled: false, role: null },
    });

    await setDoc(doc(db, 'missions', 'draftA'), {
      organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'DRAFT',
    });
    await setDoc(doc(db, 'missions', 'pendingA'), {
      organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'PENDING_APPROVAL',
    });
    await setDoc(doc(db, 'missions', 'approvedA'), {
      organizationId: ORG_A, department: DEPT_TRAFFIC, createdByUid: UID.deptHeadA, status: 'APPROVED',
    });
    // A second, independent APPROVED mission — needed so a racing second
    // allocation attempt (targeting the same now-RESERVED vehicle) is
    // denied purely for vehicle unavailability, not confounded with its own
    // mission not being APPROVED.
    await setDoc(doc(db, 'missions', 'approvedA2'), {
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

// PHASE 06 CLOSURE — DEFECT 2 fix helper: mirrors the exact real shape of
// smart-mobility-adapter.js's allocateVehicle() — one atomic commit writing
// BOTH the mission (APPROVED -> VEHICLE_ALLOCATED) and the vehicle
// (AVAILABLE -> RESERVED) together, plus their required audit events, so
// firestore.rules' getAfter() cross-checks (pairedVehicleAfterAllocation /
// pairedMissionAfterAllocation) can be satisfied. Returns the batch.commit()
// promise; callers decide assertSucceeds/assertFails.
// Verification-only read used after a denied write to confirm the
// document's true, unchanged state — via the seeded same-org manager, who
// already has an unconditional org-wide mission read (isActiveManager()).
async function readMissionUnfiltered(missionId) {
  const snap = await getDoc(doc(ctx(UID.mgrA), 'missions', missionId));
  return snap.data();
}

function atomicAllocationBatch(actorUid, { missionId, vehicleId, employeeUid }) {
  const db = ctx(actorUid);
  const batch = writeBatch(db);
  batch.update(doc(db, 'missions', missionId), {
    status: 'VEHICLE_ALLOCATED', vehicleId, assignedEmployeeUid: employeeUid,
    assignedEmployeeName: 'x', updatedByUid: actorUid, updatedAt: 1,
  });
  batch.update(doc(db, 'vehicles', vehicleId), {
    status: 'RESERVED', assignedEmployeeUid: employeeUid, currentMissionId: missionId,
    updatedByUid: actorUid, updatedAt: 1,
  });
  return batch.commit();
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

// PHASE 06 CLOSURE — DEFECT 2 fix: T5 previously proved only a MISSION-only
// single-document update to VEHICLE_ALLOCATED succeeded — exactly the
// unsafe behavior this closure fixes (the paired vehicle document was never
// required to change too, so a mission could claim a vehicle that stayed
// AVAILABLE). Rules now require getAfter() proof that the paired vehicle
// document is ALSO committing to RESERVED for this same mission/employee in
// the SAME atomic write — a mission-only write can never satisfy that, so
// it must fail. See 'T5b' below for the corrected atomic-pair success case.
test('T5 mission-only vehicle allocation (no paired vehicle write) now fails — a mission can never claim a vehicle without the vehicle document changing too', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'approvedA'), {
    status: 'VEHICLE_ALLOCATED', vehicleId: 'V102', assignedEmployeeUid: UID.employeeA,
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
  const missionData = await readMissionUnfiltered('approvedA');
  assert.equal(missionData.status, 'APPROVED', 'the mission must remain unchanged after the denied write');
});

test('T5b the proper atomic paired transition (mission + vehicle together, matching smart-mobility-adapter.js\'s real allocateVehicle()) succeeds', async () => {
  await assertSucceeds(atomicAllocationBatch(UID.mobilityHeadA, { missionId: 'approvedA', vehicleId: 'V102', employeeUid: UID.employeeA }));
  const missionSnap = await getDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'approvedA'));
  const vehicleSnap = await getDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V102'));
  assert.equal(missionSnap.data().status, 'VEHICLE_ALLOCATED');
  assert.equal(missionSnap.data().vehicleId, 'V102');
  assert.equal(vehicleSnap.data().status, 'RESERVED');
  assert.equal(vehicleSnap.data().currentMissionId, 'approvedA');
});

test('T5c cross-tenant paired allocation fails: an ORG_A mobility_head cannot pair an ORG_A mission with an ORG_B vehicle', async () => {
  // V201 is the seeded ORG_B vehicle. Denied at the vehicle write's own
  // organization check before the pairing check is even relevant — cross-
  // tenant isolation holds regardless of the write's atomic shape.
  await assertFails(atomicAllocationBatch(UID.mobilityHeadA, { missionId: 'approvedA', vehicleId: 'V201', employeeUid: UID.employeeA }));
  const missionData = await readMissionUnfiltered('approvedA');
  assert.equal(missionData.status, 'APPROVED');
});

test('T5d an employee cannot self-allocate a vehicle — only mobility_head may run the paired allocation', async () => {
  await assertFails(atomicAllocationBatch(UID.employeeA, { missionId: 'approvedA', vehicleId: 'V102', employeeUid: UID.employeeA }));
  const missionData = await readMissionUnfiltered('approvedA');
  assert.equal(missionData.status, 'APPROVED');
});

test('T5e an unauthorized role (department_head) cannot run the paired allocation either', async () => {
  await assertFails(atomicAllocationBatch(UID.deptHeadA, { missionId: 'approvedA', vehicleId: 'V102', employeeUid: UID.employeeA }));
  const missionData = await readMissionUnfiltered('approvedA');
  assert.equal(missionData.status, 'APPROVED');
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

// PHASE 06 CLOSURE — DEFECT 2 fix, MEASURED SCOPE: a mirror-image getAfter()
// check on the vehicle side (denying THIS exact vehicle-only write) was
// built and tested, but a genuine two-getAfter() batch (one per document)
// reproducibly exceeds this project's Firestore Emulator's (v1.19.8)
// per-write expression-evaluation ceiling for this rule graph — see
// pairedVehicleAfterAllocation()'s own comment in firestore.rules for the
// full empirical finding. The mission side (T5/T5b below) is the one
// closed unconditionally, since it directly matches this defect's named
// scenario (a mission FALSELY claiming an allocation). This vehicle-only
// write is therefore UNCHANGED from before this closure: it still succeeds
// on its own existing merits (a real, same-org, currently-AVAILABLE
// vehicle; a real, same-org, currently-APPROVED mission via
// allocationTargetMissionValid(); a verified, eligible target employee via
// validMobilityAllocationTarget()) — none of that protection was weakened.
// V6/V7 below independently confirm the pre-existing conflict-prevention
// (an already-RESERVED vehicle, or a not-yet-APPROVED mission) still holds.
test('V5 vehicle-only allocation still succeeds on its own existing merits — full bidirectional getAfter() protection was not achievable within this project\'s measured platform ceiling (see firestore.rules)', async () => {
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

test('V8 CONFLICT PREVENTION (sequential race): once the first REAL atomic allocation commits, a second racing allocation of the same vehicle fails', async () => {
  // The "first" allocation must now be the real atomic pair — a single
  // vehicle-only write can no longer succeed at all (see V5 above).
  await assertSucceeds(atomicAllocationBatch(UID.mobilityHeadA, { missionId: 'approvedA', vehicleId: 'V102', employeeUid: UID.employeeA }));
  // V102 is now RESERVED. A second mobility_head trying to allocate the
  // very same vehicle to a different mission is correctly refused because
  // the rule requires the vehicle's CURRENT status to be AVAILABLE — even
  // as a proper atomic pair.
  await assertFails(atomicAllocationBatch(UID.mobilityHeadA, { missionId: 'approvedA2', vehicleId: 'V102', employeeUid: UID.employeeA2 }));
});

// ---- PHASE 06A hotfix: a NEW vehicle allocation must independently verify
// the TARGET employee — not just vehicleEligible on whatever doc happens
// to sit at that uid — server/Rules-side, never merely UI-filtered. ----

test('V8b PHASE 06A: allocating to an eligible employee in the SAME organization still succeeds (as the real atomic pair)', async () => {
  await assertSucceeds(atomicAllocationBatch(UID.mobilityHeadA, { missionId: 'approvedA', vehicleId: 'V102', employeeUid: UID.employeeA }));
});

test('V8c PHASE 06A: allocating to an employee from a DIFFERENT organization is denied, even though vehicleEligible is true', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V102'), {
    status: 'RESERVED', assignedEmployeeUid: UID.employeeB, currentMissionId: 'approvedA',
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('V8d PHASE 06A: allocating to an INACTIVE employee is denied, even though vehicleEligible is true', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V102'), {
    status: 'RESERVED', assignedEmployeeUid: UID.inactiveEmployeeA, currentMissionId: 'approvedA',
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('V8e PHASE 06A: allocating to a user who does NOT hold a Mobility operational role (a Field supervisor) is denied, even though vehicleEligible is true', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V102'), {
    status: 'RESERVED', assignedEmployeeUid: UID.noVehicleEligibleFieldA, currentMissionId: 'approvedA',
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('V8f PHASE 06A: allocating to a NONEXISTENT employee uid is denied', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V102'), {
    status: 'RESERVED', assignedEmployeeUid: 'no-such-user-uid', currentMissionId: 'approvedA',
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

// ---- PHASE 06A.1 — Blocker 2 case G/H: allocation must honor an employee
// discovered ONLY via the independent mobilityAccess field, and must never
// resurrect a stale legacy role:'employee' once mobilityAccess explicitly
// disables Mobility for that account. ----

test('V8g PHASE 06A.1 case G: allocating to an employee whose role lives ONLY in the independent mobilityAccess field succeeds', async () => {
  await assertSucceeds(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V102'), {
    status: 'RESERVED', assignedEmployeeUid: UID.mobilityAccessEmployeeA, currentMissionId: 'approvedA',
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

test('V8h PHASE 06A.1 case H: allocating to a user with a stale legacy role:employee but explicit mobilityAccess.enabled:false is denied, even though vehicleEligible is true', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V102'), {
    status: 'RESERVED', assignedEmployeeUid: UID.staleDisabledEmployeeA, currentMissionId: 'approvedA',
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

// ---- PHASE 06A.2 — every V8* test above writes only ONE of the two
// documents a REAL allocation touches (see smart-mobility-adapter.js's
// allocateVehicle(), which updates missions/{id} AND vehicles/{id} together
// inside one runTransaction()). That gap in coverage hid a real defect,
// found via real-browser QA: canMobilityHeadAdvanceMission()/
// canMobilityHeadManageVehicle() each re-evaluated mobilityUserOrgId() up
// to four times and read the cross-referenced document twice — for a
// LEGACY role:'employee' target this stayed just under Firestore's
// 1000-expression-per-request budget, but the independent mobilityAccess
// dual-read's one extra property-access level tipped a real two-document
// allocation transaction over that ceiling and failed closed with
// PERMISSION_DENIED even though every actual authorization condition held.
// Fixed by binding mobilityUserOrgId() and the cross-referenced document
// once each via `let` (allocationTargetVehicleValid()/
// allocationTargetMissionValid()).
//
// A real runTransaction() against this specific rules-unit-testing harness
// (after dozens of prior tests' operations on shared emulator-backed
// contexts) hits an unrelated SDK harness quirk ("Firestore has already
// been started...") unrelated to Rules correctness — so the real
// two-document transaction shape is instead verified with the genuine
// production client SDK (exactly what smart-mobility-adapter.js itself
// uses) in a standalone script against this same emulator + these same
// rules, confirming BOTH a legacy role:'employee' target and an
// independent-mobilityAccess target succeed after this fix, and
// reproducing the pre-fix failure for the independent-field case before
// it — plus end-to-end in a real browser (see the phase report).

test('V8g PHASE 06A: the mission-side APPROVED -> VEHICLE_ALLOCATED write is independently gated the same way — a bad target denies even if the vehicle write is not attempted', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'approvedA'), {
    status: 'VEHICLE_ALLOCATED', vehicleId: 'V102', assignedEmployeeUid: UID.employeeB,
    assignedEmployeeName: 'x', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'approvedA'), {
    status: 'VEHICLE_ALLOCATED', vehicleId: 'V102', assignedEmployeeUid: 'no-such-user-uid',
    assignedEmployeeName: 'x', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
  // PHASE 06 CLOSURE DEFECT 2 — a valid target no longer succeeds as a
  // mission-only write either; it now requires the real atomic pair.
  await assertSucceeds(atomicAllocationBatch(UID.mobilityHeadA, { missionId: 'approvedA', vehicleId: 'V102', employeeUid: UID.employeeA }));
});

test('V8h PHASE 06A: a direct Firestore bypass attempt (no mobility_head role at all) is denied regardless of target validity', async () => {
  await assertFails(updateDoc(doc(ctx(UID.employeeA2), 'vehicles', 'V102'), {
    status: 'RESERVED', assignedEmployeeUid: UID.employeeA, currentMissionId: 'approvedA',
    updatedByUid: UID.employeeA2, updatedAt: 1,
  }));
  await assertFails(updateDoc(doc(testEnv.unauthenticatedContext().firestore(), 'vehicles', 'V102'), {
    status: 'RESERVED', assignedEmployeeUid: UID.employeeA, currentMissionId: 'approvedA',
    updatedByUid: 'anonymous',
  }));
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
