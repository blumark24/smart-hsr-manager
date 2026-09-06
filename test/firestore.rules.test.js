'use strict';
// ============================================================================
// Firestore Rules unit tests — run ONLY against the local Firestore Emulator.
// Never touches production Firebase. Project id is a "demo-" id, which the
// emulator treats specially (no real GCP project required, no credentials).
//
// Run: npm run test:rules
// (wraps: firebase emulators:exec --project demo-smart-hsr-tests --only
//  firestore "node --test test/firestore.rules.test.js")
// ============================================================================
const { before, after, beforeEach, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

const {
  doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp,
} = require('firebase/firestore');

const PROJECT_ID = 'demo-smart-hsr-tests';
const RULES_PATH = path.resolve(__dirname, '..', 'firestore.rules');

const ORG_A = 'orgA';
const ORG_B = 'orgB';

const UID = {
  mgrA: 'mgr-a-uid',
  mgrA2: 'mgr-a2-uid',
  mgrAInactive: 'mgr-a-inactive-uid',
  mgrNoOrg: 'mgr-noorg-uid',
  mgrBlankOrg: 'mgr-blankorg-uid',
  mgrB: 'mgr-b-uid',
  insA: 'ins-a-uid',
  insA2: 'ins-a2-uid',
  insAInactive: 'ins-a-inactive-uid',
  insB: 'ins-b-uid',
  conA: 'con-a-uid',
  conA2: 'con-a2-uid',
  conAInactive: 'con-a-inactive-uid',
  conB: 'con-b-uid',
  supA: 'sup-a-uid',
  supAInactive: 'sup-a-inactive-uid',
  ownerActive: 'owner-active-uid',
  ownerInactive: 'owner-inactive-uid',
};

const EMAIL = {
  mgrA: 'mgr-a@example.com',
  mgrB: 'mgr-b@example.com',
};

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // managers
    await setDoc(doc(db, 'managers', UID.mgrA), { role: 'manager', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'managers', UID.mgrA2), { role: 'manager', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'managers', UID.mgrAInactive), { role: 'manager', active: false, organizationId: ORG_A });
    await setDoc(doc(db, 'managers', UID.mgrNoOrg), { role: 'manager', active: true });
    await setDoc(doc(db, 'managers', UID.mgrBlankOrg), { role: 'manager', active: true, organizationId: '' });
    await setDoc(doc(db, 'managers', UID.mgrB), { role: 'manager', active: true, organizationId: ORG_B });

    // users (supervisor / inspector / contractor)
    await setDoc(doc(db, 'users', UID.insA), { role: 'inspector', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.insA2), { role: 'inspector', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.insAInactive), { role: 'inspector', active: false, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.insB), { role: 'inspector', active: true, organizationId: ORG_B });
    await setDoc(doc(db, 'users', UID.conA), { role: 'contractor', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.conA2), { role: 'contractor', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.conAInactive), { role: 'contractor', active: false, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.conB), { role: 'contractor', active: true, organizationId: ORG_B });
    await setDoc(doc(db, 'users', UID.supA), { role: 'supervisor', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.supAInactive), { role: 'supervisor', active: false, organizationId: ORG_A });

    // owners
    await setDoc(doc(db, 'owners', UID.ownerActive), { active: true });
    await setDoc(doc(db, 'owners', UID.ownerInactive), { active: false });

    // observations
    await setDoc(doc(db, 'observations', 'obsA'), {
      organizationId: ORG_A, createdByUid: UID.insA, status: 'PENDING', title: 'A',
    });
    await setDoc(doc(db, 'observations', 'obsB'), {
      organizationId: ORG_B, createdByUid: UID.insB, status: 'PENDING', title: 'B',
    });
    await setDoc(doc(db, 'observations', 'obsNoOrg'), {
      createdByUid: UID.insA, status: 'PENDING', title: 'NoOrg',
    });
    await setDoc(doc(db, 'observations', 'obsAReview'), {
      organizationId: ORG_A, createdByUid: UID.insA, status: 'PENDING_REVIEW', title: 'AReview',
    });
    await setDoc(doc(db, 'observations', 'obsAssignedConA'), {
      organizationId: ORG_A, createdByUid: UID.insA, assignedContractorUid: UID.conA,
      status: 'IN_PROGRESS', title: 'Assigned to contractor A',
    });
    await setDoc(doc(db, 'observations', 'obsAssignedConA2'), {
      organizationId: ORG_A, createdByUid: UID.insA2, assignedContractorUid: UID.conA2,
      status: 'IN_PROGRESS', title: 'Assigned to contractor A2',
    });
    await setDoc(doc(db, 'observations', 'obsUnassigned'), {
      organizationId: ORG_A, createdByUid: UID.insA, status: 'PENDING', title: 'Unassigned',
    });

    // presence
    await setDoc(doc(db, 'presence', EMAIL.mgrA), {
      organizationId: ORG_A, role: 'manager', lat: 0, lng: 0,
    });

    // organizations / invoices
    await setDoc(doc(db, 'organizations', 'org1'), { name: 'Org One', createdAt: 1 });
    await setDoc(doc(db, 'invoices', 'inv1'), { amount: 100, createdAt: 1 });
  });
}

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

function ctx(uid, claims) {
  return testEnv.authenticatedContext(uid, claims).firestore();
}

// ============================================================
// A. observations
// ============================================================

test('A1 same-org manager read: allow', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.mgrA), 'observations', 'obsA')));
});

test('A2 cross-org manager read: deny', async () => {
  await assertFails(getDoc(doc(ctx(UID.mgrA), 'observations', 'obsB')));
});

test('A3 same-org inspector read: allow', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.insA), 'observations', 'obsA')));
});

function validInspectorCreate(overrides = {}) {
  return {
    clientRequestId: 'obsNewA', organizationId: ORG_A, createdByUid: UID.insA,
    status: 'PENDING', displayId: 1, type: 'MAINTENANCE', date: '2026-08-12',
    title: 'Road issue', details: 'Observed damage', imagePath: 'observations/orgA/obsNewA/before/a.jpg',
    imageObjectKey: 'observations/orgA/obsNewA/before/a.jpg', isComparative: false,
    actionPlan: 'Inspect', riskAssessment: { priority: 'High', timeframe: '48 hours' },
    location: '1, 2', originalLat: 1, originalLng: 2, correctedLat: 1,
    correctedLng: 2, locationAccuracyMeters: 5, locationCapturedAt: 1,
    locationSource: 'gps', locationVerified: true, createdAt: serverTimestamp(), ...overrides,
  };
}

test('A3 same-org inspector create with canonical schema: allow', async () => {
  const db = ctx(UID.insA);
  await assertSucceeds(setDoc(doc(db, 'observations', 'obsNewA'), validInspectorCreate()));
});

test('A4 cross-org inspector read: deny', async () => {
  await assertFails(getDoc(doc(ctx(UID.insA), 'observations', 'obsB')));
});

test('A4 cross-org inspector create: deny', async () => {
  const db = ctx(UID.insA);
  await assertFails(setDoc(doc(db, 'observations', 'obsBadOrg'), validInspectorCreate({ clientRequestId: 'obsBadOrg', organizationId: ORG_B })));
});

test('A5 createdByUid spoofing: deny', async () => {
  const db = ctx(UID.insA);
  await assertFails(setDoc(doc(db, 'observations', 'obsSpoof'), validInspectorCreate({ clientRequestId: 'obsSpoof', createdByUid: UID.insA2 })));
});

test('A5.1 forged workflow and server-owned fields at create: deny', async () => {
  const db = ctx(UID.insA);
  for (const forged of [
    { status: 'COMPLETED' }, { assignedContractorUid: UID.conA },
    { resolutionNote: 'forged' }, { afterImagePath: 'forged' },
    { aiAnalysis: { reviewed: true } }, { updatedAt: new Date() },
  ]) {
    const field = Object.keys(forged)[0];
    await assertFails(setDoc(doc(db, 'observations', `forged-${field}`),
      validInspectorCreate({ clientRequestId: `forged-${field}`, ...forged })));
  }
});

test('A5.2 forged createdAt and mismatched document id: deny', async () => {
  const db = ctx(UID.insA);
  await assertFails(setDoc(doc(db, 'observations', 'forged-time'), validInspectorCreate({ clientRequestId: 'forged-time', createdAt: new Date(0) })));
  await assertFails(setDoc(doc(db, 'observations', 'different-id'), validInspectorCreate()));
});

test('A6 organizationId change on update: deny', async () => {
  const db = ctx(UID.mgrA);
  await assertFails(updateDoc(doc(db, 'observations', 'obsA'), {
    organizationId: ORG_B, updatedByUid: UID.mgrA,
  }));
});

test('A7 manager allowed-field update: allow', async () => {
  const db = ctx(UID.mgrA);
  await assertSucceeds(updateDoc(doc(db, 'observations', 'obsA'), {
    status: 'IN_PROGRESS', updatedByUid: UID.mgrA,
  }));
});

test('A8 manager updatedByUid set to another uid: deny', async () => {
  const db = ctx(UID.mgrA);
  await assertFails(updateDoc(doc(db, 'observations', 'obsA'), {
    status: 'IN_PROGRESS', updatedByUid: UID.mgrA2,
  }));
});

test('A9 assigned contractor allowed-field update: allow', async () => {
  const db = ctx(UID.conA);
  await assertSucceeds(updateDoc(doc(db, 'observations', 'obsAssignedConA'), {
    status: 'PENDING_REVIEW', resolutionNote: 'done', afterImagePath: 'key', updatedByUid: UID.conA,
  }));
});

test('A9.1 non-assigned same-org contractor update: deny', async () => {
  const db = ctx(UID.conA2);
  await assertFails(updateDoc(doc(db, 'observations', 'obsAssignedConA'), {
    status: 'PENDING_REVIEW', resolutionNote: 'not my assignment', updatedByUid: UID.conA2,
  }));
});

test('A9.2 unassigned observation contractor update: deny', async () => {
  const db = ctx(UID.conA);
  await assertFails(updateDoc(doc(db, 'observations', 'obsUnassigned'), {
    status: 'PENDING_REVIEW', resolutionNote: 'claimed without assignment', updatedByUid: UID.conA,
  }));
});

test('A10 contractor cross-org update: deny', async () => {
  const db = ctx(UID.conA);
  await assertFails(updateDoc(doc(db, 'observations', 'obsB'), {
    status: 'PENDING_REVIEW', updatedByUid: UID.conA,
  }));
});

test('A11 contractor updates extra fields: deny', async () => {
  const db = ctx(UID.conA);
  await assertFails(updateDoc(doc(db, 'observations', 'obsA'), {
    status: 'PENDING_REVIEW', updatedByUid: UID.conA, title: 'hacked',
  }));
});

test('A12 contractor updatedByUid != request.auth.uid: deny', async () => {
  const db = ctx(UID.conA);
  await assertFails(updateDoc(doc(db, 'observations', 'obsA'), {
    status: 'PENDING_REVIEW', updatedByUid: UID.conA2,
  }));
});

test('A13 same-org manager delete: allow', async () => {
  await assertSucceeds(deleteDoc(doc(ctx(UID.mgrA), 'observations', 'obsA')));
});

test('A13 cross-org manager delete: deny', async () => {
  await assertFails(deleteDoc(doc(ctx(UID.mgrA), 'observations', 'obsB')));
});

test('A13 delete denied for every non-manager role: deny', async () => {
  const roles = [UID.ownerActive, UID.insA, UID.conA, UID.supA];
  for (const uid of roles) {
    await assertFails(deleteDoc(doc(ctx(uid), 'observations', 'obsA')));
  }
});

// ============================================================
// B. users
// ============================================================

test('B1 self-read: allow', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.insA), 'users', UID.insA)));
});

test('B2 same-org manager read: allow', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.mgrA), 'users', UID.insA)));
});

test('B3 cross-org manager read: deny', async () => {
  await assertFails(getDoc(doc(ctx(UID.mgrA), 'users', UID.insB)));
});

test('B4 owner read: deny', async () => {
  await assertFails(getDoc(doc(ctx(UID.ownerActive), 'users', UID.insA)));
});

test('B5 client writes by all roles: deny', async () => {
  const roles = [UID.ownerActive, UID.mgrA, UID.insA, UID.conA, UID.supA];
  for (const uid of roles) {
    await assertFails(updateDoc(doc(ctx(uid), 'users', UID.insA), { active: false }));
  }
});

// ============================================================
// C. presence
// ============================================================

test('C1 active manager read: allow', async () => {
  const db = ctx(UID.mgrA, { email: EMAIL.mgrA });
  await assertSucceeds(getDoc(doc(db, 'presence', EMAIL.mgrA)));
});

test('C2 inspector/contractor/supervisor/owner read: deny', async () => {
  const roles = [UID.insA, UID.conA, UID.supA, UID.ownerActive];
  for (const uid of roles) {
    await assertFails(getDoc(doc(ctx(uid), 'presence', EMAIL.mgrA)));
  }
});

test('C3 manager writing own email document: allow', async () => {
  const db = ctx(UID.mgrA, { email: EMAIL.mgrA });
  await assertSucceeds(setDoc(doc(db, 'presence', EMAIL.mgrA), {
    organizationId: ORG_A, role: 'manager', lat: 1, lng: 1,
  }));
});

test('C4 manager writing another email document: deny', async () => {
  const db = ctx(UID.mgrA, { email: EMAIL.mgrA });
  await assertFails(setDoc(doc(db, 'presence', EMAIL.mgrB), {
    organizationId: ORG_A, role: 'manager', lat: 1, lng: 1,
  }));
});

// ============================================================
// D. owner
// ============================================================

test('D1 active owner access to organizations and invoices: allow', async () => {
  const db = ctx(UID.ownerActive);
  await assertSucceeds(getDoc(doc(db, 'organizations', 'org1')));
  await assertSucceeds(getDoc(doc(db, 'invoices', 'inv1')));
  await assertSucceeds(setDoc(doc(db, 'organizations', 'org2'), { name: 'Org Two' }));
  await assertSucceeds(setDoc(doc(db, 'invoices', 'inv2'), { amount: 5 }));
});

test('D2 inactive owner access: deny', async () => {
  const db = ctx(UID.ownerInactive);
  await assertFails(getDoc(doc(db, 'organizations', 'org1')));
  await assertFails(getDoc(doc(db, 'invoices', 'inv1')));
});

test('D3 owner access to users and observations: deny', async () => {
  const db = ctx(UID.ownerActive);
  await assertFails(getDoc(doc(db, 'users', UID.insA)));
  await assertFails(getDoc(doc(db, 'observations', 'obsA')));
});

// ============================================================
// E. fail-closed cases
// ============================================================

test('E1 missing organizationId in caller role document: deny', async () => {
  await assertFails(getDoc(doc(ctx(UID.mgrNoOrg), 'observations', 'obsA')));
  await assertFails(getDoc(doc(ctx(UID.mgrNoOrg), 'users', UID.insA)));
});

test('E2 blank organizationId in caller role document: deny', async () => {
  await assertFails(getDoc(doc(ctx(UID.mgrBlankOrg), 'observations', 'obsA')));
});

test('E3 missing organizationId in target document: deny', async () => {
  await assertFails(getDoc(doc(ctx(UID.mgrA), 'observations', 'obsNoOrg')));
});

test('E4 inactive manager/inspector/contractor: deny', async () => {
  await assertFails(getDoc(doc(ctx(UID.mgrAInactive), 'observations', 'obsA')));
  await assertFails(getDoc(doc(ctx(UID.insAInactive), 'observations', 'obsA')));
  await assertFails(updateDoc(doc(ctx(UID.conAInactive), 'observations', 'obsA'), {
    status: 'PENDING_REVIEW', updatedByUid: UID.conAInactive,
  }));
});

// ============================================================
// F. supervisor
// ============================================================

test('F1 same-org supervisor observation read: allow', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.supA), 'observations', 'obsA')));
});

test('F2 cross-org supervisor read: deny', async () => {
  await assertFails(getDoc(doc(ctx(UID.supA), 'observations', 'obsB')));
});

test('F3 supervisor assignment update: allow', async () => {
  const db = ctx(UID.supA);
  await assertSucceeds(updateDoc(doc(db, 'observations', 'obsA'), {
    assignedContractorUid: UID.conA,
    assignedByUid: UID.supA,
    assignedAt: 1,
    supervisorNote: 'assigned to contractor A',
    updatedByUid: UID.supA,
    updatedAt: 1,
  }));
});

test('F4 supervisor supervisorNote update: allow', async () => {
  const db = ctx(UID.supA);
  await assertSucceeds(updateDoc(doc(db, 'observations', 'obsA'), {
    supervisorNote: 'note only', updatedByUid: UID.supA,
  }));
});

test('F5 supervisor return for correction: allow', async () => {
  const db = ctx(UID.supA);
  await assertSucceeds(updateDoc(doc(db, 'observations', 'obsAReview'), {
    status: 'IN_PROGRESS', supervisorNote: 'please redo the after-photo', updatedByUid: UID.supA,
  }));
});

test('F6 supervisor COMPLETED update: deny', async () => {
  const db = ctx(UID.supA);
  await assertFails(updateDoc(doc(db, 'observations', 'obsA'), {
    status: 'COMPLETED', updatedByUid: UID.supA,
  }));
});

test('F7 supervisor extra field update: deny', async () => {
  const db = ctx(UID.supA);
  await assertFails(updateDoc(doc(db, 'observations', 'obsA'), {
    status: 'IN_PROGRESS', updatedByUid: UID.supA, title: 'hacked',
  }));
});

test('F8 supervisor updatedByUid spoof: deny', async () => {
  const db = ctx(UID.supA);
  await assertFails(updateDoc(doc(db, 'observations', 'obsA'), {
    supervisorNote: 'note', updatedByUid: 'someone-else-uid',
  }));
});

test('F9 supervisor organizationId change: deny', async () => {
  const db = ctx(UID.supA);
  await assertFails(updateDoc(doc(db, 'observations', 'obsA'), {
    organizationId: ORG_B, updatedByUid: UID.supA,
  }));
});

test('F10 supervisor delete: deny', async () => {
  await assertFails(deleteDoc(doc(ctx(UID.supA), 'observations', 'obsA')));
});

test('F11 supervisor users read same org: allow', async () => {
  await assertSucceeds(getDoc(doc(ctx(UID.supA), 'users', UID.insA)));
});

test('F12 supervisor users cross org: deny', async () => {
  await assertFails(getDoc(doc(ctx(UID.supA), 'users', UID.insB)));
});

test('F13 supervisor users write: deny', async () => {
  await assertFails(updateDoc(doc(ctx(UID.supA), 'users', UID.insA), { active: false }));
});

test('F14 supervisor organizations/invoices: deny', async () => {
  await assertFails(getDoc(doc(ctx(UID.supA), 'organizations', 'org1')));
  await assertFails(getDoc(doc(ctx(UID.supA), 'invoices', 'inv1')));
});

test('F15 inactive supervisor: deny', async () => {
  await assertFails(getDoc(doc(ctx(UID.supAInactive), 'observations', 'obsA')));
});

// ============================================================
// G. authorization closure regressions
// ============================================================

test('G1 inspector cannot update another inspector observation', async () => {
  const db = ctx(UID.insA2);
  await assertFails(updateDoc(doc(db, 'observations', 'obsA'), {
    status: 'PENDING_REVIEW', resolutionNote: 'updated by another inspector',
  }));
});

test('G2 inspector can update own observation using the current allowed fields', async () => {
  const db = ctx(UID.insA);
  await assertSucceeds(updateDoc(doc(db, 'observations', 'obsA'), {
    isComparative: true, resolutionNote: 'owner update',
  }));
});

test('G3 manager status transitions are fail-closed and COMPLETED is terminal', async () => {
  const db = ctx(UID.mgrA);
  await assertFails(updateDoc(doc(db, 'observations', 'obsA'), {
    status: 'NOT_A_REAL_STATUS', updatedByUid: UID.mgrA,
  }));
  await assertSucceeds(updateDoc(doc(db, 'observations', 'obsAReview'), {
    status: 'COMPLETED', closedAt: 1, updatedByUid: UID.mgrA,
  }));
  await assertFails(updateDoc(doc(db, 'observations', 'obsAReview'), {
    status: 'PENDING', updatedByUid: UID.mgrA,
  }));
});

test('G4 contractor backward and completion transitions are denied', async () => {
  const db = ctx(UID.conA);
  await assertFails(updateDoc(doc(db, 'observations', 'obsAssignedConA'), {
    status: 'PENDING', updatedByUid: UID.conA,
  }));
  await assertFails(updateDoc(doc(db, 'observations', 'obsAssignedConA'), {
    status: 'COMPLETED', updatedByUid: UID.conA,
  }));
});

test('G5 inspector has no workflow status authority', async () => {
  const db = ctx(UID.insA);
  await assertFails(updateDoc(doc(db, 'observations', 'obsA'), {
    status: 'NOT_A_REAL_STATUS',
  }));
  await assertFails(updateDoc(doc(db, 'observations', 'obsA'), {
    status: 'COMPLETED',
  }));
});
