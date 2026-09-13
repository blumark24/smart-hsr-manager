'use strict';
// ============================================================================
// PHASE 09 SECURITY MICRO-CLOSURE — regression coverage for Manager's
// embedded copy of the Lands landGrants direct draft-update rule. Before
// this fix, `allow update` on
// landsMunicipalities/{municipalityId}/landGrants/{grantId} checked
// authorship/tenant/status/diff but never re-verified the caller's current
// Lands membership is still enabled, unlike every other rule in this file
// (read/create both require enabledMember()). A user whose membership was
// disabled/revoked after authoring a draft could still edit that old draft
// directly as long as they kept a valid Firebase Auth session and the
// document id. This file proves the closed behavior against Manager's own
// firestore.rules (the file this app actually deploys), matching the
// equivalent coverage added to smart-hsr-lands' own firebase/firestore.rules.
//
// Run: npm run test:security (or test:release) — emulator-only, never
// touches Staging or Production Firebase.
// ============================================================================
const { before, after, beforeEach, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc } = require('firebase/firestore');

const PROJECT_ID = 'demo-smart-hsr-tests';
const RULES_PATH = path.resolve(__dirname, '..', 'firestore.rules');
const MUNI_A = 'municipality-a';
const MUNI_B = 'municipality-b';

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

const membership = (uid, municipalityId, lands_role = 'lands_employee', enabled = true) => ({
  firebase_uid: uid, municipality_id: municipalityId, lands_role, enabled,
});
const grant = (uid, municipalityId) => ({
  municipality_id: municipalityId,
  beneficiary: { name: 'Test beneficiary' },
  royal_order: { number: 'RO-1' },
  allocation_decision: null,
  status: 'draft',
  created_by: uid,
  created_at: new Date(),
  updated_at: new Date(),
});
const db = (uid, claims) => testEnv.authenticatedContext(uid, claims).firestore();

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const seeded = context.firestore();
    await setDoc(doc(seeded, 'landsMunicipalities', MUNI_A, 'userAccess', 'employee-a'), membership('employee-a', MUNI_A));
    await setDoc(doc(seeded, 'landsMunicipalities', MUNI_A, 'userAccess', 'revoked-a'), membership('revoked-a', MUNI_A, 'lands_employee', false));
    await setDoc(doc(seeded, 'landsMunicipalities', MUNI_B, 'userAccess', 'employee-b'), membership('employee-b', MUNI_B));
    await setDoc(doc(seeded, 'landsMunicipalities', MUNI_A, 'landGrants', 'revoked-draft'), grant('revoked-a', MUNI_A));
    await setDoc(doc(seeded, 'landsMunicipalities', MUNI_A, 'landGrants', 'enabled-draft'), grant('employee-a', MUNI_A));
  });
});

test('an enabled draft author CAN update allowed draft content', async () => {
  await assertSucceeds(updateDoc(doc(db('employee-a'), 'landsMunicipalities', MUNI_A, 'landGrants', 'enabled-draft'), {
    beneficiary: { name: 'Updated beneficiary' },
    updated_at: new Date(),
  }));
});

test('a disabled/revoked draft author CANNOT update their own old draft', async () => {
  await assertFails(updateDoc(doc(db('revoked-a'), 'landsMunicipalities', MUNI_A, 'landGrants', 'revoked-draft'), {
    beneficiary: { name: 'Should not be allowed' },
    updated_at: new Date(),
  }));
});

test('a wrong-tenant enabled member CANNOT update a draft in another municipality', async () => {
  await assertFails(updateDoc(doc(db('employee-b'), 'landsMunicipalities', MUNI_A, 'landGrants', 'enabled-draft'), {
    beneficiary: { name: 'Cross-tenant write' },
    updated_at: new Date(),
  }));
});

test("a different (non-author) enabled member of the SAME tenant CANNOT update someone else's draft", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'landsMunicipalities', MUNI_A, 'userAccess', 'other-a'), membership('other-a', MUNI_A));
  });
  await assertFails(updateDoc(doc(db('other-a'), 'landsMunicipalities', MUNI_A, 'landGrants', 'enabled-draft'), {
    beneficiary: { name: 'Not my draft' },
    updated_at: new Date(),
  }));
});

test('a status transition remains denied client-side even for the enabled draft author', async () => {
  await assertFails(updateDoc(doc(db('employee-a'), 'landsMunicipalities', MUNI_A, 'landGrants', 'enabled-draft'), {
    status: 'under_review',
    updated_at: new Date(),
  }));
});
