'use strict';
// ============================================================================
// Regression coverage for the Phase 01 unified Firestore security contract:
// the reconciliation of this repo's Platform Core / Field Survey / Smart
// Mobility rules with the authoritative Smart Lands rules (sourced verbatim
// from blumark24/smart-hsr-lands, branch staging/lands-trusted-audit,
// firebase/firestore.rules — the same file that repo's own .firebaserc
// deploys to the shared smart-hsr-staging-blumark24 project).
//
// Root problem this closes: Firestore has exactly one active ruleset per
// project. Two application repos independently deploying firestore.rules to
// the same shared project replace each other's ruleset wholesale rather than
// merging — which is why Staging was observed with Lands rules present but
// Core Manager/User/Observation rules absent (Manager login: Auth succeeds,
// then the managers/{uid} authorization read is denied by the fallback
// deny-all). This file proves the merged, single ruleset restores both
// subsystems together, with neither weakening the other.
//
// Run: npm run test:rules (wraps this repo's existing firebase emulators:exec
// harness — see test/firestore.rules.test.js for the same pattern this file
// reuses). Emulator-only; never touches Staging or Production Firebase.
// ============================================================================
const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');

const PROJECT_ID = 'demo-smart-hsr-tests';
const RULES_PATH = path.resolve(__dirname, '..', 'firestore.rules');

const ORG_A = 'orgA';
const ORG_B = 'orgB';
const MUNI_A = 'municipality-a';
const MUNI_B = 'municipality-b';

const UID = {
  mgrA: 'mgr-a-uid',
  mgrB: 'mgr-b-uid',
  ownerActive: 'owner-active-uid',
  insA: 'ins-a-uid',
  employeeA: 'mobility-employee-a-uid',
  userB: 'plain-user-b-uid',
  landsUserA: 'lands-user-a-uid',
  landsUserB: 'lands-user-b-uid',
  landsManagerA: 'lands-manager-a-uid',
  plainUserA: 'plain-user-a-uid',
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

    // ---- Platform Core ----
    await setDoc(doc(db, 'managers', UID.mgrA), { role: 'manager', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'managers', UID.mgrB), { role: 'manager', active: true, organizationId: ORG_B });
    await setDoc(doc(db, 'owners', UID.ownerActive), { active: true });

    // ---- Field Survey ----
    await setDoc(doc(db, 'users', UID.insA), { role: 'inspector', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'observations', 'obsA'), { organizationId: ORG_A, createdByUid: UID.insA, status: 'PENDING', title: 'A' });

    // ---- Smart Mobility ----
    await setDoc(doc(db, 'users', UID.employeeA), { role: 'employee', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.userB), { role: 'employee', active: true, organizationId: ORG_B });
    await setDoc(doc(db, 'missions', 'missionA'), { organizationId: ORG_A, status: 'PENDING_APPROVAL', assignedEmployeeUid: UID.employeeA });

    // ---- Smart Lands (nested under landsMunicipalities/{municipalityId}) ----
    await setDoc(doc(db, 'landsMunicipalities', MUNI_A, 'userAccess', UID.landsUserA), {
      firebase_uid: UID.landsUserA, municipality_id: MUNI_A, lands_role: 'lands_employee', enabled: true,
    });
    await setDoc(doc(db, 'landsMunicipalities', MUNI_B, 'userAccess', UID.landsUserB), {
      firebase_uid: UID.landsUserB, municipality_id: MUNI_B, lands_role: 'lands_employee', enabled: true,
    });
    await setDoc(doc(db, 'landsMunicipalities', MUNI_A, 'userAccess', UID.landsManagerA), {
      firebase_uid: UID.landsManagerA, municipality_id: MUNI_A, lands_role: 'municipal_manager', enabled: true,
    });
    await setDoc(doc(db, 'landsMunicipalities', MUNI_A, 'landGrants', 'grantA'), {
      municipality_id: MUNI_A, status: 'draft', created_by: UID.landsUserA,
    });
    await setDoc(doc(db, 'landsMunicipalities', MUNI_B, 'landGrants', 'grantB'), {
      municipality_id: MUNI_B, status: 'draft', created_by: UID.landsUserB,
    });
    await setDoc(doc(db, 'landsMunicipalities', MUNI_A, 'auditLogs', 'auditA'), {
      action: 'grant_created', actorUid: UID.landsUserA,
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

// 1. Core Manager can self-read managers/{uid}.
test('1. Core Manager can self-read managers/{uid}', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.mgrA), 'managers', UID.mgrA)));
});

// 2. Different Manager cannot read another municipality's Manager data.
test("2. a different Manager cannot read another manager's record (managers/{uid} is self-read only)", async () => {
  await assertFails(getDoc(doc(ctx(UID.mgrB), 'managers', UID.mgrA)));
});

// 3. Lands access still works for a valid Lands user.
test('3. a valid, enabled Lands user can read their own municipality entitlement and its land grants', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.landsUserA), 'landsMunicipalities', MUNI_A, 'userAccess', UID.landsUserA)));
  await assertSucceeds(getDoc(doc(ctx(UID.landsUserA), 'landsMunicipalities', MUNI_A, 'landGrants', 'grantA')));
});

// 4. Non-Lands user cannot obtain Lands access.
test('4. a user with no Lands entitlement document cannot read any Lands data', async () => {
  await assertFails(getDoc(doc(ctx(UID.plainUserA), 'landsMunicipalities', MUNI_A, 'landGrants', 'grantA')));
});

// 5. Lands user cannot gain Core Manager authority.
test('5. a Lands user has no Core Manager authority (cannot read another manager record, and has no manager document of their own to become one)', async () => {
  await assertFails(getDoc(doc(ctx(UID.landsUserA), 'managers', UID.mgrA)));
  // managers/{managerId} only gates read on uid == managerId (the same
  // mechanism manager-login.html relies on: read, then check .exists()) —
  // reading your own would-be manager path is always permitted by the rule,
  // but since no document exists there, the real authority check is that it
  // resolves to "not found", never a manager record with role/org/active.
  const selfSnap = await assertSucceeds(getDoc(doc(ctx(UID.landsUserA), 'managers', UID.landsUserA)));
  assert.equal(selfSnap.exists(), false, 'a Lands user must not have a Core managers/ document of their own');
});

// 6. Mobility user cannot gain Lands authority.
test('6. a Smart Mobility user has no Lands authority merely by having an organizationId', async () => {
  await assertFails(getDoc(doc(ctx(UID.employeeA), 'landsMunicipalities', MUNI_A, 'landGrants', 'grantA')));
});

// 7. Field Survey user cannot gain Mobility authority.
test('7. a Field Survey inspector has no Smart Mobility workflow authority', async () => {
  await assertFails(updateDoc(doc(ctx(UID.insA), 'missions', 'missionA'), { status: 'APPROVED' }));
});

// 8. Cross-municipality Lands access denied.
test("8. a Lands user from one municipality cannot read another municipality's Lands data", async () => {
  await assertFails(getDoc(doc(ctx(UID.landsUserA), 'landsMunicipalities', MUNI_B, 'landGrants', 'grantB')));
});

// 9. Cross-municipality (cross-organization) Core access denied.
test("9. a Core Manager from one organization cannot read another organization's user data", async () => {
  await assertFails(getDoc(doc(ctx(UID.mgrA), 'users', UID.userB)));
});

// 10. Forged organizationId denied (Field Survey create path).
test('10. an inspector cannot create an observation with a forged organizationId belonging to another org', async () => {
  await assertFails(setDoc(doc(ctx(UID.insA), 'observations', 'forgedObs'), {
    organizationId: ORG_B, createdByUid: UID.insA, status: 'PENDING', title: 'forged',
  }));
});

// 11. Forged municipalityId denied (Lands create path).
test('11. a Lands user cannot create a land grant under a municipality they have no entitlement in', async () => {
  await assertFails(setDoc(doc(ctx(UID.landsUserA), 'landsMunicipalities', MUNI_B, 'landGrants', 'forgedGrant'), {
    municipality_id: MUNI_B, status: 'draft', created_by: UID.landsUserA,
  }));
});

// 12. Owner does not accidentally gain municipal operational access.
test("12. an active Platform Owner has no access to Lands data or another Manager's Core record", async () => {
  await assertFails(getDoc(doc(ctx(UID.ownerActive), 'landsMunicipalities', MUNI_A, 'landGrants', 'grantA')));
  await assertFails(getDoc(doc(ctx(UID.ownerActive), 'managers', UID.mgrA)));
});

// 13. Final catch-all denies unknown collections.
test('13. an unrecognized/unknown collection is denied by the final fallback', async () => {
  await assertFails(getDoc(doc(ctx(UID.mgrA), 'somethingRandomNotInAnyRule', 'doc1')));
  await assertFails(setDoc(doc(ctx(UID.mgrA), 'somethingRandomNotInAnyRule', 'doc1'), { x: 1 }));
});

// 14. Core + Lands coexist in the same ruleset without either becoming unreachable.
test('14. Core and Lands both remain reachable and correctly authorized within the single merged ruleset', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.mgrA), 'managers', UID.mgrA)));
  await assertSucceeds(getDoc(doc(ctx(UID.landsUserA), 'landsMunicipalities', MUNI_A, 'userAccess', UID.landsUserA)));
  await assertSucceeds(getDoc(doc(ctx(UID.landsManagerA), 'landsMunicipalities', MUNI_A, 'auditLogs', 'auditA')));
});
