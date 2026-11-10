'use strict';
// Phase 25 — Full Final Delivery Audit: multi-organization tenant isolation
// characterization across 7 distinct municipalities (local Firestore emulator
// only; no live Firebase project is touched). Extends the existing
// firestore.rules.test.js two-organization pattern (ORG_A/ORG_B) to prove the
// same boundary holds at the scale the platform actually markets: many
// independent municipal tenants sharing one project.
//
// Also covers the presence/{presenceId} cross-organization read gap
// identified during this audit (see firestore.rules `match /presence/...`):
// before this test suite existed, no case proved a manager from one
// organization could not read another organization's manager presence
// document — the read rule allowed any active manager, unscoped by
// organizationId, matching the exact concern raised in
// SMART-HSR-PLATFORM-AUDIT.md section 4.3 ("presence isolation concern").

const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');

const PROJECT_ID = 'demo-smart-hsr-tests';
const RULES_PATH = path.resolve(__dirname, '..', 'firestore.rules');

// Seven distinct municipal organizations — deliberately more than the task's
// "at least 7" requirement's floor, using realistic Saudi municipality names.
const ORGS = [
  'org-qunfudhah', 'org-jeddah', 'org-taif', 'org-abha',
  'org-tabuk', 'org-hail', 'org-najran',
];

function orgUid(role, org) { return `${role}-${org}`; }
function orgEmail(role, org) { return `${role}-${org}@hsr.test`; }

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync(RULES_PATH, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => { await testEnv.cleanup(); });

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const org of ORGS) {
      await setDoc(doc(db, 'managers', orgUid('mgr', org)), {
        role: 'manager', active: true, organizationId: org,
      });
      await setDoc(doc(db, 'users', orgUid('insp', org)), {
        role: 'inspector', active: true, organizationId: org,
      });
      await setDoc(doc(db, 'users', orgUid('cont', org)), {
        role: 'contractor', active: true, organizationId: org,
      });
      await setDoc(doc(db, 'observations', `obs-${org}`), {
        organizationId: org, createdByUid: orgUid('insp', org), status: 'PENDING', title: `Case in ${org}`,
      });
      await setDoc(doc(db, 'presence', orgEmail('mgr', org)), {
        organizationId: org, role: 'manager', lat: 24.5, lng: 46.7,
      });
    }
  });
}

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

function ctxFor(uid, opts) {
  return testEnv.authenticatedContext(uid, opts).firestore();
}

// ---------------------------------------------------------------------------
// Cross-organization denial: every organization must be blind to every OTHER
// organization's managers/users/observations, for all 7×6=42 ordered pairs.
// ---------------------------------------------------------------------------
test('7-organization matrix: manager cannot read users of any other organization', async () => {
  let checks = 0;
  for (const home of ORGS) {
    const db = ctxFor(orgUid('mgr', home));
    for (const other of ORGS) {
      if (other === home) continue;
      await assertFails(getDoc(doc(db, 'users', orgUid('insp', other))));
      checks++;
    }
  }
  assert.equal(checks, ORGS.length * (ORGS.length - 1));
});

test('7-organization matrix: manager can read only its own organization users', async () => {
  for (const home of ORGS) {
    const db = ctxFor(orgUid('mgr', home));
    await assertSucceeds(getDoc(doc(db, 'users', orgUid('insp', home))));
    await assertSucceeds(getDoc(doc(db, 'users', orgUid('cont', home))));
  }
});

test('7-organization matrix: manager cannot read or delete observations of any other organization', async () => {
  for (const home of ORGS) {
    const db = ctxFor(orgUid('mgr', home));
    for (const other of ORGS) {
      if (other === home) continue;
      await assertFails(getDoc(doc(db, 'observations', `obs-${other}`)));
      await assertFails(deleteDoc(doc(db, 'observations', `obs-${other}`)));
    }
  }
});

test('7-organization matrix: inspector cannot read another organization observation, and cross-org create is denied', async () => {
  for (const home of ORGS) {
    const db = ctxFor(orgUid('insp', home));
    for (const other of ORGS) {
      if (other === home) continue;
      await assertFails(getDoc(doc(db, 'observations', `obs-${other}`)));
      await assertFails(setDoc(doc(db, 'observations', `forged-${other}`), {
        clientRequestId: `forged-${other}`, organizationId: other, createdByUid: orgUid('insp', home),
        status: 'PENDING', displayId: 1, type: 'x', date: 'x', title: 'x', details: 'x',
        imagePath: 'x', isComparative: false, actionPlan: 'x',
        riskAssessment: { priority: 'Low', timeframe: '1' }, location: 'x',
        locationSource: 'gps', locationVerified: true, createdAt: null,
      }));
    }
  }
});

test('7-organization matrix: contractor cannot update an observation belonging to another organization', async () => {
  for (const home of ORGS) {
    const db = ctxFor(orgUid('cont', home));
    for (const other of ORGS) {
      if (other === home) continue;
      await assertFails(updateDoc(doc(db, 'observations', `obs-${other}`), {
        status: 'IN_PROGRESS', updatedByUid: orgUid('cont', home),
      }));
    }
  }
});

// ---------------------------------------------------------------------------
// presence/{presenceId} — the audit-identified gap. Confirms the FIX (rules
// now scope presence reads to resource.data.organizationId == managerOrgId())
// closes cross-tenant visibility across all 7 organizations, not just 2.
// ---------------------------------------------------------------------------
test('7-organization matrix: manager cannot read presence of any other organization (fixed)', async () => {
  let checks = 0;
  for (const home of ORGS) {
    const db = ctxFor(orgUid('mgr', home), { email: orgEmail('mgr', home) });
    for (const other of ORGS) {
      if (other === home) continue;
      await assertFails(getDoc(doc(db, 'presence', orgEmail('mgr', other))));
      checks++;
    }
  }
  assert.equal(checks, ORGS.length * (ORGS.length - 1));
});

test('7-organization matrix: manager can still read its own organization presence document', async () => {
  for (const home of ORGS) {
    const db = ctxFor(orgUid('mgr', home), { email: orgEmail('mgr', home) });
    await assertSucceeds(getDoc(doc(db, 'presence', orgEmail('mgr', home))));
  }
});

test('7-organization matrix: manager cannot write a presence document claiming a different organizationId than its own', async () => {
  for (const home of ORGS) {
    const other = ORGS.find((o) => o !== home);
    const db = ctxFor(orgUid('mgr', home), { email: orgEmail('mgr', home) });
    await assertFails(setDoc(doc(db, 'presence', orgEmail('mgr', home)), {
      organizationId: other, role: 'manager', lat: 1, lng: 1,
    }));
  }
});

test('owner has no cross-collection access to any of the 7 organizations users/observations (owner bypass intentionally removed)', async () => {
  const owner = 'owner-active';
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'owners', owner), { active: true });
  });
  const db = ctxFor(owner);
  for (const org of ORGS) {
    await assertFails(getDoc(doc(db, 'users', orgUid('insp', org))));
    await assertFails(getDoc(doc(db, 'observations', `obs-${org}`)));
  }
});
