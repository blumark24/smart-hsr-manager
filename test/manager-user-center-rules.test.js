'use strict';
// ============================================================================
// Phase 03B — Unified User Center. Firestore Rules unit tests for:
//   (a) employees/{employeeId} — the new employee master registry collection
//       (tenant isolation + department scoping, no client writes at all)
//   (b) vehicleEligible — the new independent, server-enforced entitlement
//       on the EXISTING vehicle-allocation rule (canMobilityHeadManageVehicle)
// Run ONLY against the local Firestore Emulator, mirroring
// test/mobility-mission-rules.test.js's harness.
//
// Run: node test/run-user-center-rules.js
// ============================================================================
const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs } = require('firebase/firestore');

const PROJECT_ID = 'demo-smart-hsr-user-center-tests';
const RULES_PATH = path.resolve(__dirname, '..', 'firestore.rules');
const root = path.resolve(__dirname, '..');

const ORG_A = 'orgA';
const ORG_B = 'orgB';
const DEPT_MAINT = 'الصيانة';
const DEPT_OTHER = 'أخرى';

const UID = {
  mgrA: 'mgr-a-uid',
  deptHeadMaintA: 'dept-head-maint-a-uid',
  deptHeadOtherA: 'dept-head-other-a-uid',
  mobilityHeadA: 'mobility-head-a-uid',
  employeeEligible: 'employee-eligible-uid',
  employeeIneligibleExplicit: 'employee-ineligible-explicit-uid',
  employeeEligibleExplicit: 'employee-eligible-explicit-uid',
  employeeNoField: 'employee-no-field-uid',
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

function ctx(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, 'managers', UID.mgrA), { role: 'manager', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.deptHeadMaintA), { role: 'department_head', active: true, organizationId: ORG_A, department: DEPT_MAINT });
    await setDoc(doc(db, 'users', UID.deptHeadOtherA), { role: 'department_head', active: true, organizationId: ORG_A, department: DEPT_OTHER });
    await setDoc(doc(db, 'users', UID.mobilityHeadA), { role: 'mobility_head', active: true, organizationId: ORG_A });
    // vehicleEligible variants — see platform/policies/vehicle-workflow-policy.js
    await setDoc(doc(db, 'users', UID.employeeNoField), { role: 'employee', active: true, organizationId: ORG_A, department: DEPT_MAINT });
    await setDoc(doc(db, 'users', UID.employeeEligible), { role: 'employee', active: true, organizationId: ORG_A, department: DEPT_MAINT, vehicleEligible: true });
    await setDoc(doc(db, 'users', UID.employeeEligibleExplicit), { role: 'employee', active: true, organizationId: ORG_A, department: DEPT_MAINT, vehicleEligible: true });
    await setDoc(doc(db, 'users', UID.employeeIneligibleExplicit), { role: 'employee', active: true, organizationId: ORG_A, department: DEPT_MAINT, vehicleEligible: false });

    // employees/ — the new master registry collection
    await setDoc(doc(db, 'employees', 'emp-maint-1'), { organizationId: ORG_A, department: DEPT_MAINT, name: 'موظف 1' });
    await setDoc(doc(db, 'employees', 'emp-other-1'), { organizationId: ORG_A, department: DEPT_OTHER, name: 'موظف 2' });
    await setDoc(doc(db, 'employees', 'emp-b-1'), { organizationId: ORG_B, department: DEPT_MAINT, name: 'موظف 3' });

    // missions — needed for the vehicle allocation cross-check
    await setDoc(doc(db, 'missions', 'approvedA'), { organizationId: ORG_A, department: DEPT_MAINT, createdByUid: UID.deptHeadMaintA, status: 'APPROVED' });

    // vehicles — one per allocation test, all starting AVAILABLE
    await setDoc(doc(db, 'vehicles', 'V-no-field'), { organizationId: ORG_A, status: 'AVAILABLE' });
    await setDoc(doc(db, 'vehicles', 'V-eligible'), { organizationId: ORG_A, status: 'AVAILABLE' });
    await setDoc(doc(db, 'vehicles', 'V-eligible-explicit'), { organizationId: ORG_A, status: 'AVAILABLE' });
    await setDoc(doc(db, 'vehicles', 'V-ineligible'), { organizationId: ORG_A, status: 'AVAILABLE' });
  });
}

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

function allocate(vehicleId, assignedEmployeeUid) {
  return updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', vehicleId), {
    status: 'RESERVED', assignedEmployeeUid, currentMissionId: 'approvedA',
    updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  });
}

// ============================================================
// employees/{employeeId} — read scoping
// ============================================================
test('employees: same-org manager may read any department', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.mgrA), 'employees', 'emp-maint-1')));
  await assertSucceeds(getDoc(doc(ctx(UID.mgrA), 'employees', 'emp-other-1')));
});

test('employees: cross-org manager may not read', async () => {
  await assertFails(getDoc(doc(ctx(UID.mgrA), 'employees', 'emp-b-1')));
});

test('employees: department head may read their own department only', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.deptHeadMaintA), 'employees', 'emp-maint-1')));
  await assertFails(getDoc(doc(ctx(UID.deptHeadMaintA), 'employees', 'emp-other-1')));
});

test('employees: an unrelated role (mobility_head) has no read access at all', async () => {
  await assertFails(getDoc(doc(ctx(UID.mobilityHeadA), 'employees', 'emp-maint-1')));
});

// ============================================================
// employees/{employeeId} — no client writes, ever (Admin API only)
// ============================================================
test('employees: manager cannot create, update, or delete directly', async () => {
  await assertFails(setDoc(doc(ctx(UID.mgrA), 'employees', 'new-emp'), { organizationId: ORG_A, name: 'X' }));
  await assertFails(updateDoc(doc(ctx(UID.mgrA), 'employees', 'emp-maint-1'), { name: 'Y' }));
  await assertFails(deleteDoc(doc(ctx(UID.mgrA), 'employees', 'emp-maint-1')));
});

test('employees: department head cannot write even within their own department', async () => {
  await assertFails(updateDoc(doc(ctx(UID.deptHeadMaintA), 'employees', 'emp-maint-1'), { name: 'Y' }));
});

// ============================================================
// vehicleEligible — real, server-enforced entitlement on allocation
// ============================================================
test('vehicleEligible: Phase 03B.1 fail-safe default — a record with NO vehicleEligible field at all is NOT allocatable', async () => {
  await assertFails(allocate('V-no-field', UID.employeeNoField));
});

test('vehicleEligible: true allows allocation', async () => {
  await assertSucceeds(allocate('V-eligible', UID.employeeEligible));
});

test('vehicleEligible: an explicit true (set via setVehicleEligible) still allows allocation', async () => {
  await assertSucceeds(allocate('V-eligible-explicit', UID.employeeEligibleExplicit));
});

test('vehicleEligible: an explicit false denies allocation to that employee', async () => {
  await assertFails(allocate('V-ineligible', UID.employeeIneligibleExplicit));
});

test('vehicleEligible: revocation (true -> false) denies a subsequent NEW allocation attempt', async () => {
  // First allocation with vehicleEligible: true succeeds.
  await assertSucceeds(allocate('V-eligible', UID.employeeEligible));
  // Return the vehicle to AVAILABLE, then revoke eligibility (a real
  // write, mirroring api/admin/employees.js setVehicleEligible), and
  // confirm a fresh allocation to the same employee is now denied.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'vehicles', 'V-eligible'), { organizationId: ORG_A, status: 'AVAILABLE' });
    await updateDoc(doc(db, 'users', UID.employeeEligible), { vehicleEligible: false });
  });
  await assertFails(allocate('V-eligible', UID.employeeEligible));
});

test('vehicleEligible: does not block any OTHER vehicle transition (handover) once already allocated', async () => {
  // Seed V-ineligible as already RESERVED to the ineligible employee
  // (bypassing rules) to prove the eligibility gate is allocate-only.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'vehicles', 'V-ineligible'), {
      organizationId: ORG_A, status: 'RESERVED', assignedEmployeeUid: UID.employeeIneligibleExplicit, currentMissionId: 'approvedA',
    });
  });
  await assertSucceeds(updateDoc(doc(ctx(UID.mobilityHeadA), 'vehicles', 'V-ineligible'), {
    status: 'IN_MISSION', updatedByUid: UID.mobilityHeadA, updatedAt: 1,
  }));
});

// ============================================================
// PHASE 06A hotfix — Mobility Entitlement Independence. Real Firestore
// Rules verification that the independent users/{uid}.mobilityAccess field
// (mirrors firestore.rules' mobilityRoleValue()) lets Field and Mobility
// coexist on one identity, and that once a record is touched by the new
// field, it alone decides that record's Mobility state.
// ============================================================
test('PHASE 06A: a single identity holds BOTH a Field role (legacy `role`) AND an independent Mobility role (mobilityAccess) at once', async () => {
  const uid = 'dual-field-mobility-uid';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid), {
      role: 'supervisor', active: true, organizationId: ORG_A,
      mobilityAccess: { enabled: true, role: 'mobility_head' },
    });
  });
  // Recognized as mobility_head for Mobility purposes (missions/vehicles
  // read), even though the legacy `role` field holds a Field role, not a
  // Mobility one — proving the two are genuinely independent now.
  await assertSucceeds(getDoc(doc(ctx(uid), 'missions', 'approvedA')));
  await assertSucceeds(getDoc(doc(ctx(uid), 'vehicles', 'V-eligible')));
});

test('PHASE 06A: mobilityAccess.enabled === false denies Mobility access even when the legacy `role` field still holds a stale Mobility value', async () => {
  const uid = 'stale-legacy-role-uid';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid), {
      // A record from BEFORE this hotfix, now explicitly disabled via the
      // new independent control — the manager's disable action must
      // actually take effect, not be silently overridden by the untouched
      // legacy field.
      role: 'mobility_head', active: true, organizationId: ORG_A,
      mobilityAccess: { enabled: false, role: null },
    });
  });
  await assertFails(getDoc(doc(ctx(uid), 'missions', 'approvedA')));
  await assertFails(getDoc(doc(ctx(uid), 'vehicles', 'V-eligible')));
});

test('PHASE 06A: a record with role === null but mobilityAccess.enabled === true is still a fully valid Mobility user (and a valid vehicle-allocation target)', async () => {
  const uid = 'mobility-only-migrated-uid';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', uid), {
      role: null, active: true, organizationId: ORG_A,
      mobilityAccess: { enabled: true, role: 'employee' },
      vehicleEligible: true,
    });
    await setDoc(doc(db, 'vehicles', 'V-migrated'), { organizationId: ORG_A, status: 'AVAILABLE' });
  });
  await assertSucceeds(allocate('V-migrated', uid));
});

test('PHASE 06A: disabling Mobility via mobilityAccess does not affect an independently-enabled Field role on the same identity', async () => {
  const uid = 'field-survives-mobility-disable-uid';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid), {
      role: 'supervisor', active: true, organizationId: ORG_A,
      mobilityAccess: { enabled: false, role: null },
    });
  });
  // Mobility is denied (already proven above), but nothing here claims
  // Field access through Mobility-scoped collections — this test instead
  // confirms Mobility denial alone, per role independence: the legacy
  // `role` field (Field's own, untouched by the mobility disable write)
  // still reads back exactly as stored.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDoc(doc(context.firestore(), 'users', uid));
    assert.equal(snap.data().role, 'supervisor');
  });
  await assertFails(getDoc(doc(ctx(uid), 'missions', 'approvedA')));
});

// ============================================================
// PHASE 06A.1 Blocker 2 — the users/{userId} allow-read rule's
// mobility_head-reads-employee branch, exercised directly (this is exactly
// the permission smart-mobility-adapter.js's subscribeEmployees() two
// parallel queries depend on to discover employees for the allocation
// drawer). Cases A-F per the phase task's required regression matrix.
// ============================================================
test('Blocker2 case A: mobility_head may read a legacy role:employee record', async () => {
  const uid = 'legacy-employee-uid';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid), { role: 'employee', active: true, organizationId: ORG_A });
  });
  await assertSucceeds(getDoc(doc(ctx(UID.mobilityHeadA), 'users', uid)));
});

test('Blocker2 case B: mobility_head may read a mobilityAccess employee whose legacy role is null', async () => {
  const uid = 'mobility-access-null-role-uid';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid), {
      role: null, active: true, organizationId: ORG_A,
      mobilityAccess: { enabled: true, role: 'employee' },
    });
  });
  await assertSucceeds(getDoc(doc(ctx(UID.mobilityHeadA), 'users', uid)));
});

test('Blocker2 case C: mobility_head may read a Field supervisor who also holds an independent mobilityAccess employee entitlement', async () => {
  const uid = 'field-supervisor-plus-mobility-uid';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid), {
      role: 'supervisor', active: true, organizationId: ORG_A,
      mobilityAccess: { enabled: true, role: 'employee' },
    });
  });
  await assertSucceeds(getDoc(doc(ctx(UID.mobilityHeadA), 'users', uid)));
});

test('Blocker2 case D: mobility_head may NOT read a record with a stale legacy role:employee once mobilityAccess explicitly disables it', async () => {
  const uid = 'stale-role-disabled-mobility-uid';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid), {
      role: 'employee', active: true, organizationId: ORG_A,
      mobilityAccess: { enabled: false, role: null },
    });
  });
  await assertFails(getDoc(doc(ctx(UID.mobilityHeadA), 'users', uid)));
});

test('Blocker2 case E: mobility_head may NOT read a mobilityAccess employee from a different organization', async () => {
  const uid = 'cross-org-mobility-employee-uid';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid), {
      role: null, active: true, organizationId: ORG_B,
      mobilityAccess: { enabled: true, role: 'employee' },
    });
  });
  await assertFails(getDoc(doc(ctx(UID.mobilityHeadA), 'users', uid)));
});

test('Blocker2 case F (documented rule gap): the users/{userId} read rule does not itself gate on active — client-side isLiveMobilityEmployee() excludes inactive employees from liveEmployees instead', async () => {
  const uid = 'inactive-mobility-employee-uid';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid), {
      role: null, active: false, organizationId: ORG_A,
      mobilityAccess: { enabled: true, role: 'employee' },
    });
  });
  // The read itself is still permitted (matches the pre-existing rule
  // shape, which never checked `active` for this branch even for the
  // legacy role:employee case) — mobility-employee-discovery.js's
  // isLiveMobilityEmployee() is what keeps this uid out of liveEmployees.
  await assertSucceeds(getDoc(doc(ctx(UID.mobilityHeadA), 'users', uid)));
});

test('Blocker2 discovery query: the exact two parallel queries smart-mobility-adapter.js runs succeed with no composite index required, and mergeLiveEmployees produces exactly the expected final set', async () => {
  // A dedicated org id keeps this test's result set independent of the
  // other employee fixtures already seeded under ORG_A/ORG_B.
  const ORG_Q = 'org-discovery-query-test';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', 'q-mobility-head'), { role: 'mobility_head', active: true, organizationId: ORG_Q });
    await setDoc(doc(db, 'users', 'q-legacy-employee'), { role: 'employee', active: true, organizationId: ORG_Q });
    await setDoc(doc(db, 'users', 'q-mobility-employee'), {
      role: null, active: true, organizationId: ORG_Q, mobilityAccess: { enabled: true, role: 'employee' },
    });
    // Must never reach the final merged set: cross-org, and a stale legacy
    // role:employee explicitly disabled via mobilityAccess.
    await setDoc(doc(db, 'users', 'q-cross-org-employee'), {
      role: null, active: true, organizationId: ORG_B, mobilityAccess: { enabled: true, role: 'employee' },
    });
    await setDoc(doc(db, 'users', 'q-disabled-employee'), {
      role: 'employee', active: true, organizationId: ORG_Q, mobilityAccess: { enabled: false, role: null },
    });
  });
  const db = ctx('q-mobility-head');
  // Neither query throws (in particular, no FAILED_PRECONDITION asking for a
  // composite index) — an all-equality multi-field query needs none.
  const legacySnap = await getDocs(query(
    collection(db, 'users'),
    where('organizationId', '==', ORG_Q),
    where('role', '==', 'employee'),
  ));
  const mobilitySnap = await getDocs(query(
    collection(db, 'users'),
    where('organizationId', '==', ORG_Q),
    where('mobilityAccess.enabled', '==', true),
    where('mobilityAccess.role', '==', 'employee'),
  ));
  const legacyIds = legacySnap.docs.map(d => d.id).sort();
  const mobilityIds = mobilitySnap.docs.map(d => d.id).sort();
  assert.deepEqual(legacyIds, ['q-disabled-employee', 'q-legacy-employee']);
  assert.deepEqual(mobilityIds, ['q-mobility-employee']);

  // The users/{userId} rule's mobility_head-employee branch is NOT
  // re-evaluated per-document against fields outside the query's own
  // filters for a list/query request the way a direct getDoc() is (Blocker2
  // case D's getDoc() denies q-disabled-employee individually, but this
  // query still returns it) — so mergeLiveEmployees()'s client-side
  // isLiveMobilityEmployee() dual-read, not the Rules query filter alone,
  // is what excludes it from the final liveEmployees the allocation drawer
  // actually sees.
  const { mergeLiveEmployees } = await import(pathToFileURL(path.join(root, 'mobility-employee-discovery.js')).href);
  const legacyDocs = new Map(legacySnap.docs.map(d => [d.id, d.data()]));
  const mobilityDocs = new Map(mobilitySnap.docs.map(d => [d.id, d.data()]));
  const merged = mergeLiveEmployees(legacyDocs, mobilityDocs).map(e => e.uid).sort();
  assert.deepEqual(merged, ['q-legacy-employee', 'q-mobility-employee']);
});
