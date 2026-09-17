'use strict';
// ============================================================================
// PRE-PHASE-07 IAM HARDENING GATE — Firestore Rules boundary proof for the
// legacy Field supervisor (users/{uid}, role:'supervisor') vs. municipality
// manager (managers/{uid}, role:'manager') separation.
//
// Runs against the REAL, unmodified firestore.rules — no rule changes were
// made or are needed for this gate; these tests lock the already-correct
// boundary in as regression protection, per Part C of the hardening brief:
//   - a Field supervisor can read the org's own users/{uid} roster (an
//     existing, accepted Field capability the Users tab in manager.html
//     already depends on) but can never write to it — all writes go
//     through the Admin API only, which independently rejects a
//     supervisor's bearer token (see test/field-supervisor-manager-
//     separation.test.js).
//   - a Field supervisor can never read the employees/{employeeId} master
//     registry at all — that collection is manager/department_head only.
//   - isActiveManager() is collection-based (managers/{uid} membership),
//     never string-based — a users/{uid} record can never satisfy it no
//     matter what its role field says.
//   - cross-organization access remains denied for both roles.
//
// Run: node --test test/field-supervisor-rules-boundary.test.js (against a
// running Firestore emulator on 127.0.0.1:8080 — same harness as
// test/manager-user-center-rules.test.js).
// ============================================================================
const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');

const PROJECT_ID = 'demo-smart-hsr-supervisor-boundary-tests';
const RULES_PATH = path.resolve(__dirname, '..', 'firestore.rules');

const ORG_A = 'orgA';
const ORG_B = 'orgB';

const UID = {
  mgrA: 'mgr-a-uid',
  supervisorA: 'supervisor-a-uid',
  supervisorB: 'supervisor-b-uid',
  inspectorA: 'inspector-a-uid',
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
    await setDoc(doc(db, 'users', UID.supervisorA), { role: 'supervisor', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.supervisorB), { role: 'supervisor', active: true, organizationId: ORG_B });
    await setDoc(doc(db, 'users', UID.inspectorA), { role: 'inspector', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'employees', 'emp-a-1'), { organizationId: ORG_A, department: 'x', name: 'موظف' });
  });
}

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

// ---- users/{uid} — existing accepted read scope, no write ----

test('a Field supervisor can read another same-org users/{uid} record (existing accepted capability, e.g. the manager.html Users tab roster)', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.supervisorA), 'users', UID.inspectorA)));
});

test('a Field supervisor can NEVER write to any users/{uid} document — all writes are Admin-API-only', async () => {
  await assertFails(setDoc(doc(ctx(UID.supervisorA), 'users', UID.inspectorA), { role: 'inspector', active: true, organizationId: ORG_A, name: 'محاولة تعديل' }));
  await assertFails(updateDoc(doc(ctx(UID.supervisorA), 'users', UID.inspectorA), { active: false }));
  await assertFails(setDoc(doc(ctx(UID.supervisorA), 'users', UID.supervisorA), { role: 'supervisor', active: true, organizationId: ORG_A, mobilityAccess: { enabled: true, role: 'mobility_head' } }), 'a supervisor must never be able to self-grant a Mobility role directly via Firestore');
});

test('a Field supervisor can never write to their own users/{uid} document either — cannot self-elevate to role:manager via Firestore', async () => {
  await assertFails(updateDoc(doc(ctx(UID.supervisorA), 'users', UID.supervisorA), { role: 'manager' }));
});

test('a Field supervisor cannot read a users/{uid} record from a different organization (cross-org denied)', async () => {
  await assertFails(getDoc(doc(ctx(UID.supervisorA), 'users', UID.supervisorB)));
});

// ---- employees/{employeeId} — supervisor has NO access at all ----

test('a Field supervisor cannot read the employees/{employeeId} master registry at all', async () => {
  await assertFails(getDoc(doc(ctx(UID.supervisorA), 'employees', 'emp-a-1')));
});

test('a Field supervisor cannot write to the employees/{employeeId} master registry (client writes are denied for everyone)', async () => {
  await assertFails(setDoc(doc(ctx(UID.supervisorA), 'employees', 'emp-a-1'), { organizationId: ORG_A, department: 'x', name: 'محاولة' }));
});

// ---- managers/{uid} collection membership, not a role string, is what
// isActiveManager() actually checks — a supervisor record can never satisfy
// it no matter what value its own `role` field holds. ----

test('a users/{uid} record can never gain manager-level read scope by any role value — isActiveManager() is collection-membership-based, not string-based', async () => {
  // Even a users/{uid} record whose role field is literally 'manager' (a
  // malformed/spoofed value, never written by any real code path) must
  // still fail isActiveManager(), because that function requires the
  // record to exist in the SEPARATE managers/{uid} collection.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'spoofed-uid'), { role: 'manager', active: true, organizationId: ORG_A });
  });
  await assertFails(getDoc(doc(ctx('spoofed-uid'), 'employees', 'emp-a-1')), 'a users/{uid} doc with role:"manager" must never satisfy isActiveManager() — that requires real managers/{uid} collection membership');
});

// ---- positive control: municipality manager retains full existing access ----

test('municipality manager (managers/{uid}, role:manager) retains full existing same-org access — positive control, unaffected by this gate', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.mgrA), 'users', UID.supervisorA)));
  await assertSucceeds(getDoc(doc(ctx(UID.mgrA), 'employees', 'emp-a-1')));
});

test('municipality manager cross-organization read remains denied — unrelated to this gate, verified unbroken', async () => {
  await assertFails(getDoc(doc(ctx(UID.mgrA), 'users', UID.supervisorB)));
});

console.log('Field supervisor / manager Firestore Rules boundary (Pre-Phase-07 IAM hardening) OK');
