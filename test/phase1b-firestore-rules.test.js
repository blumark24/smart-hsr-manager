'use strict';

const { before, after, beforeEach, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');

const PROJECT_ID = 'demo-smart-hsr-tests';
const RULES_PATH = path.resolve(__dirname, '..', 'firestore.rules');
const ORG_A = 'orgA';
const ORG_B = 'orgB';
const UID = Object.freeze({
  managerA: 'manager-a',
  supervisorA: 'supervisor-a',
  assistantA: 'assistant-a',
  inspectorA: 'inspector-a',
  inspectorA2: 'inspector-a2',
  inspectorB: 'inspector-b',
  contractorA: 'contractor-a',
  contractorA2: 'contractor-a2',
  contractorB: 'contractor-b',
  contractorNoOrg: 'contractor-no-org',
});

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
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'managers', UID.managerA), { role: 'manager', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.supervisorA), { role: 'supervisor', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.assistantA), { role: 'assistant', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.inspectorA), { role: 'inspector', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.inspectorA2), { role: 'inspector', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.inspectorB), { role: 'inspector', active: true, organizationId: ORG_B });
    await setDoc(doc(db, 'users', UID.contractorA), { role: 'contractor', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.contractorA2), { role: 'contractor', active: true, organizationId: ORG_A });
    await setDoc(doc(db, 'users', UID.contractorB), { role: 'contractor', active: true, organizationId: ORG_B });
    await setDoc(doc(db, 'users', UID.contractorNoOrg), { role: 'contractor', active: true });

    const base = { organizationId: ORG_A, createdByUid: UID.inspectorA, title: 'Observation' };
    await setDoc(doc(db, 'observations', 'pendingOwn'), { ...base, status: 'PENDING', assignedContractorUid: UID.contractorA });
    await setDoc(doc(db, 'observations', 'pendingOther'), { ...base, status: 'PENDING', assignedContractorUid: UID.contractorA2 });
    await setDoc(doc(db, 'observations', 'progressOther'), { ...base, status: 'IN_PROGRESS', assignedContractorUid: UID.contractorA2 });
    await setDoc(doc(db, 'observations', 'ownUnassigned'), { ...base, status: 'PENDING' });
    await setDoc(doc(db, 'observations', 'otherInspector'), { ...base, createdByUid: UID.inspectorA2, status: 'PENDING' });
    await setDoc(doc(db, 'observations', 'review'), { ...base, status: 'PENDING_REVIEW', assignedContractorUid: UID.contractorA });
    await setDoc(doc(db, 'observations', 'completed'), { ...base, status: 'COMPLETED', assignedContractorUid: UID.contractorA });
    await setDoc(doc(db, 'observations', 'orgB'), { organizationId: ORG_B, createdByUid: UID.inspectorB, status: 'PENDING', title: 'B' });
  });
}

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

function db(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

test('PASS: contractor starts own assigned PENDING observation', async () => {
  await assertSucceeds(updateDoc(doc(db(UID.contractorA), 'observations', 'pendingOwn'), {
    status: 'IN_PROGRESS', updatedByUid: UID.contractorA,
  }));
});

test('RULE GAP: contractor starts another contractor observation', async () => {
  await assertSucceeds(updateDoc(doc(db(UID.contractorA), 'observations', 'pendingOther'), {
    status: 'IN_PROGRESS', updatedByUid: UID.contractorA,
  }));
});

test('RULE GAP: contractor submits evidence for another assignment', async () => {
  await assertSucceeds(updateDoc(doc(db(UID.contractorA), 'observations', 'progressOther'), {
    status: 'PENDING_REVIEW', afterImagePath: 'observations/orgA/after/example.webp',
    resolutionNote: 'done', updatedByUid: UID.contractorA,
  }));
});

test('PASS: inspector updates own unassigned observation', async () => {
  await assertSucceeds(updateDoc(doc(db(UID.inspectorA), 'observations', 'ownUnassigned'), {
    resolutionNote: 'creator update',
  }));
});

test('RULE GAP: inspector updates another inspector observation', async () => {
  await assertSucceeds(updateDoc(doc(db(UID.inspectorA), 'observations', 'otherInspector'), {
    resolutionNote: 'not the creator',
  }));
});

test('PASS: real supervisor role returns review to IN_PROGRESS', async () => {
  await assertSucceeds(updateDoc(doc(db(UID.supervisorA), 'observations', 'review'), {
    status: 'IN_PROGRESS', supervisorNote: 'return', updatedByUid: UID.supervisorA,
  }));
});

test('PASS: real supervisor role cannot approve COMPLETED', async () => {
  await assertFails(updateDoc(doc(db(UID.supervisorA), 'observations', 'review'), {
    status: 'COMPLETED', updatedByUid: UID.supervisorA,
  }));
});

test('PASS: real manager role approves review as COMPLETED', async () => {
  await assertSucceeds(updateDoc(doc(db(UID.managerA), 'observations', 'review'), {
    status: 'COMPLETED', closedAt: 1, updatedByUid: UID.managerA,
  }));
});

test('PASS: invented assistant role has no review access', async () => {
  await assertFails(updateDoc(doc(db(UID.assistantA), 'observations', 'review'), {
    status: 'IN_PROGRESS', updatedByUid: UID.assistantA,
  }));
});

test('PASS: cross-organization read is denied', async () => {
  await assertFails(getDoc(doc(db(UID.contractorA), 'observations', 'orgB')));
});

test('PASS: cross-organization write is denied', async () => {
  await assertFails(updateDoc(doc(db(UID.contractorA), 'observations', 'orgB'), {
    status: 'IN_PROGRESS', updatedByUid: UID.contractorA,
  }));
});

test('RULE GAP: manager can reopen COMPLETED under current rules', async () => {
  await assertSucceeds(updateDoc(doc(db(UID.managerA), 'observations', 'completed'), {
    status: 'PENDING', updatedByUid: UID.managerA,
  }));
});

test('RULE GAP: assigned contractor can reopen COMPLETED under current rules', async () => {
  await assertSucceeds(updateDoc(doc(db(UID.contractorA), 'observations', 'completed'), {
    status: 'PENDING', updatedByUid: UID.contractorA,
  }));
});

test('PASS: missing organization context is denied', async () => {
  await assertFails(getDoc(doc(db(UID.contractorNoOrg), 'observations', 'pendingOwn')));
  await assertFails(updateDoc(doc(db(UID.contractorNoOrg), 'observations', 'pendingOwn'), {
    status: 'IN_PROGRESS', updatedByUid: UID.contractorNoOrg,
  }));
});
