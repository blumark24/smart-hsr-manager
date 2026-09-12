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

// PHASE 06B CLOSURE — TRUSTED VEHICLE ALLOCATION CUTOVER. Vehicle
// allocation (missions/{id}: APPROVED->VEHICLE_ALLOCATED paired with
// vehicles/{id}: AVAILABLE->RESERVED) is no longer performed by the client
// SDK AT ALL — not mission-only, not vehicle-only, and not even a
// correctly-paired atomic batch. Only the trusted server-side Admin SDK
// transaction (api/admin/users.js action:'allocateVehicle', tested against
// the real emulator in test/mobility-allocate-vehicle-endpoint.test.js) can
// perform it now, since Admin SDK writes bypass these Rules entirely. This
// closes the exact gap the prior Phase 06 closure accepted and documented
// as its one remaining limitation: a privileged mobility_head could still
// perform a direct client-side vehicle-only write (AVAILABLE->RESERVED)
// while the referenced mission stayed APPROVED. `atomicAllocationBatch`
// below is kept ONLY to prove that even a correctly-shaped, fully-paired
// client batch (mirroring what smart-mobility-adapter.js's allocateVehicle
// used to write directly, before the Phase 06B cutover moved it server-
// side) is now denied — see T5b/V8/V8b below.
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

// PHASE 06B CLOSURE — the APPROVED->VEHICLE_ALLOCATED transition is now
// absent from canMobilityHeadAdvanceMission() entirely: a mission-only
// write can never succeed, for any target, any vehicle, any reason.
test('T5 mission-only vehicle allocation is denied outright — the client SDK can no longer perform this transition at all', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'approvedA'), {
    status: 'VEHICLE_ALLOCATED', vehicleId: 'V102', assignedEmployeeUid: UID.employeeA,
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
  const missionData = await readMissionUnfiltered('approvedA');
  assert.equal(missionData.status, 'APPROVED', 'the mission must remain unchanged after the denied write');
});

// PHASE 06B CLOSURE — this is the exact scenario the prior Phase 06 closure
// accepted as its one remaining gap: a correctly-shaped, fully-paired
// atomic client batch (mirroring smart-mobility-adapter.js's real,
// pre-cutover allocateVehicle() shape) used to succeed. It must now be
// denied unconditionally — allocation is only ever performed by the
// trusted server-side Admin SDK transaction (see
// test/mobility-allocate-vehicle-endpoint.test.js for the proof that path
// still succeeds).
test('T5b even a correctly-paired direct Firestore client batch (mission + vehicle together) is now denied — allocation is server-only', async () => {
  await assertFails(atomicAllocationBatch(UID.mobilityHeadA, { missionId: 'approvedA', vehicleId: 'V102', employeeUid: UID.employeeA }));
  const missionData = await readMissionUnfiltered('approvedA');
  assert.equal(missionData.status, 'APPROVED', 'the mission must remain unchanged — the paired client batch must not partially or fully apply');
  const vehicleSnap = await getDoc(doc(ctx(UID.mgrA), 'vehicles', 'V102'));
  assert.equal(vehicleSnap.data().status, 'AVAILABLE', 'the vehicle must remain unchanged — the paired client batch must not partially or fully apply');
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

// PHASE 06B CLOSURE — this is the FINAL 4% gap the prior Phase 06 closure
// named and accepted: a vehicle-only client write used to still succeed on
// its own existing merits even with no paired mission change, leaving the
// mission claiming APPROVED while the vehicle silently became RESERVED — a
// real half-allocation a privileged mobility_head could trigger directly.
// "V5 vehicle-only allocation still succeeds" MUST NO LONGER BE TRUE: the
// AVAILABLE->RESERVED transition is now entirely absent from
// canMobilityHeadManageVehicle(), so this write is denied outright,
// regardless of how valid every other condition (vehicle availability,
// mission approval, target eligibility) would otherwise be. See
// test/mobility-allocate-vehicle-endpoint.test.js for the trusted
// server-side path that performs this transition atomically instead.
test('V5 vehicle-only allocation is now denied outright — the client SDK can no longer perform this transition at all', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V102'), {
    status: 'RESERVED', assignedEmployeeUid: UID.employeeA, currentMissionId: 'approvedA',
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
  const vehicleSnap = await getDoc(doc(ctx(UID.mgrA), 'vehicles', 'V102'));
  assert.equal(vehicleSnap.data().status, 'AVAILABLE', 'the vehicle must remain unchanged after the denied write');
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

// PHASE 06B CLOSURE — concurrency/conflict-prevention for a REAL allocation
// is no longer a Rules-level concern at all: since the client can never
// perform this transition (paired or not), there is no racing client write
// to arbitrate here. Both attempts below fail for that same fundamental
// reason. The actual concurrency guarantee for the real allocation path
// (two racing calls to the trusted server endpoint for the same vehicle) is
// proven against the Admin SDK transaction in
// test/mobility-allocate-vehicle-endpoint.test.js, not here.
test('V8 a client-side "sequential race" is moot — every direct allocation attempt is denied outright, so nothing ever gets to race', async () => {
  await assertFails(atomicAllocationBatch(UID.mobilityHeadA, { missionId: 'approvedA', vehicleId: 'V102', employeeUid: UID.employeeA }));
  await assertFails(atomicAllocationBatch(UID.mobilityHeadA, { missionId: 'approvedA2', vehicleId: 'V102', employeeUid: UID.employeeA2 }));
  const vehicleSnap = await getDoc(doc(ctx(UID.mgrA), 'vehicles', 'V102'));
  assert.equal(vehicleSnap.data().status, 'AVAILABLE', 'neither denied attempt may have changed the vehicle');
});

// ---- PHASE 06A hotfix (target-eligibility rules) is still enforced at the
// TRUSTED SERVER layer — see test/mobility-allocate-vehicle-endpoint.test.js
// for the equivalent proofs against api/admin/users.js action:
// 'allocateVehicle'. At the client-Rules layer these now all deny for the
// more fundamental reason that the transition itself does not exist. ----

test('V8b PHASE 06B: even a valid, correctly-paired allocation to an eligible SAME-organization employee is denied at the client-Rules layer', async () => {
  await assertFails(atomicAllocationBatch(UID.mobilityHeadA, { missionId: 'approvedA', vehicleId: 'V102', employeeUid: UID.employeeA }));
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

// ---- PHASE 06A.1 target-eligibility cases G/H (an employee discovered only
// via the independent mobilityAccess field; a stale legacy role that must
// never resurrect a disabled Mobility account) are still enforced — now at
// the TRUSTED SERVER layer only (isValidMobilityAllocationTarget() in
// api/_lib/authz.js). At the client-Rules layer both now deny for the more
// fundamental reason that the transition does not exist at all. ----

test('V8g PHASE 06B: even a target whose role lives ONLY in the independent mobilityAccess field is denied at the client-Rules layer', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V102'), {
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

// PHASE 06B CLOSURE — the mission-side APPROVED->VEHICLE_ALLOCATED
// transition is now absent from canMobilityHeadAdvanceMission() entirely,
// so a mission-only write denies for every target (invalid or otherwise),
// and even a fully valid target paired with its matching vehicle write (the
// exact atomic shape smart-mobility-adapter.js used to write directly,
// before the Phase 06B cutover moved allocation server-side) is now denied
// too — see test/mobility-allocate-vehicle-endpoint.test.js for the proof
// that the trusted server-side transaction still succeeds for that same
// valid target.
test('V8i PHASE 06B: the mission-side write is denied for every target, invalid or valid, paired or not — allocation is server-only', async () => {
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'approvedA'), {
    status: 'VEHICLE_ALLOCATED', vehicleId: 'V102', assignedEmployeeUid: UID.employeeB,
    assignedEmployeeName: 'x', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
  await assertFails(updateDoc(doc(ctx(UID.mobilityHeadA), 'missions', 'approvedA'), {
    status: 'VEHICLE_ALLOCATED', vehicleId: 'V102', assignedEmployeeUid: 'no-such-user-uid',
    assignedEmployeeName: 'x', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
  await assertFails(atomicAllocationBatch(UID.mobilityHeadA, { missionId: 'approvedA', vehicleId: 'V102', employeeUid: UID.employeeA }));
});

test('V8j a direct Firestore bypass attempt (no mobility_head role at all) is denied regardless of target validity', async () => {
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
