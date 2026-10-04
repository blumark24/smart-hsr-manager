'use strict';

const test = require('node:test');
const { before, after, beforeEach } = test;
const fs = require('node:fs');
const path = require('node:path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp,
} = require('firebase/firestore');
const {
  ref, uploadBytes, getBytes, deleteObject,
} = require('firebase/storage');

const PROJECT_ID = 'demo-smart-hsr-lands-candidate';
const FIRESTORE_RULES = path.resolve(__dirname, '..', 'firestore.rules.lands-candidate');
const STORAGE_RULES = path.resolve(__dirname, '..', 'storage.rules.lands-candidate');
const MUNICIPALITY_A = 'municipality-a';
const MUNICIPALITY_B = 'municipality-b';

const UID = {
  managerA: 'lands-manager-a',
  headA: 'lands-head-a',
  employeeA: 'lands-employee-a',
  disabledA: 'lands-disabled-a',
  employeeB: 'lands-employee-b',
};

let testEnv;

function firestore(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}
function storage(uid) {
  return testEnv.authenticatedContext(uid).storage();
}
function membership(uid, municipalityId, role, enabled = true) {
  return {
    firebase_uid: uid,
    municipality_id: municipalityId,
    lands_role: role,
    enabled,
  };
}
function grant(ownerUid, municipalityId = MUNICIPALITY_A, overrides = {}) {
  return {
    municipality_id: municipalityId,
    beneficiary: { name: 'مستفيد تجريبي', national_id: null },
    royal_order: { number: null, date: null },
    allocation_decision: null,
    status: 'draft',
    created_by: ownerUid,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    ...overrides,
  };
}
function domainEntity(uid, municipalityId = MUNICIPALITY_A, overrides = {}) {
  return {
    municipality_id: municipalityId,
    created_by: uid,
    name: 'سجل تجريبي',
    reference_id: 'R-1',
    updated_at: serverTimestamp(),
    ...overrides,
  };
}
function documentMeta(uid, docId, municipalityId = MUNICIPALITY_A, overrides = {}) {
  const recordDomain = 'landGrants';
  const recordId = 'grant-a';
  return {
    municipality_id: municipalityId,
    created_by: uid,
    record_domain: recordDomain,
    record_id: recordId,
    file_id: docId,
    filename: 'document-' + docId,
    mime_type: 'application/pdf',
    size_bytes: 3,
    storage_path: `landsMunicipalities/${municipalityId}/documents/${recordDomain}/${recordId}/${docId}`,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    ...overrides,
  };
}
function uploadMetadata(municipalityId, recordDomain, recordId, fileId) {
  return {
    contentType: 'application/pdf',
    customMetadata: {
      document_id: fileId,
      municipality_id: municipalityId,
      record_domain: recordDomain,
      record_id: recordId,
    },
  };
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(FIRESTORE_RULES, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: fs.readFileSync(STORAGE_RULES, 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'userAccess', UID.managerA),
      membership(UID.managerA, MUNICIPALITY_A, 'municipal_manager'));
    await setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'userAccess', UID.headA),
      membership(UID.headA, MUNICIPALITY_A, 'lands_department_manager'));
    await setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'userAccess', UID.employeeA),
      membership(UID.employeeA, MUNICIPALITY_A, 'lands_employee'));
    await setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'userAccess', UID.disabledA),
      membership(UID.disabledA, MUNICIPALITY_A, 'lands_employee', false));
    await setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_B, 'userAccess', UID.employeeB),
      membership(UID.employeeB, MUNICIPALITY_B, 'lands_employee'));

    await setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'landGrants', 'grant-a'), {
      municipality_id: MUNICIPALITY_A, created_by: UID.employeeA, status: 'draft', updated_at: new Date(),
    });
    await setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_B, 'landGrants', 'grant-b'), {
      municipality_id: MUNICIPALITY_B, created_by: UID.employeeB, status: 'draft', updated_at: new Date(),
    });
    await setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'plans', 'plan-a'), {
      municipality_id: MUNICIPALITY_A, created_by: UID.employeeA, name: 'Plan A', updated_at: new Date(),
    });
    await setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'auditLogs', 'audit-a'), {
      municipality_id: MUNICIPALITY_A, action: 'land_grant.updated', occurred_at: new Date(),
    });
  });
});

test('membership self-read is allowed, disabled membership can only read itself, cross-tenant is denied', async () => {
  await assertSucceeds(getDoc(doc(firestore(UID.employeeA), 'landsMunicipalities', MUNICIPALITY_A, 'userAccess', UID.employeeA)));
  await assertSucceeds(getDoc(doc(firestore(UID.disabledA), 'landsMunicipalities', MUNICIPALITY_A, 'userAccess', UID.disabledA)));
  await assertFails(getDoc(doc(firestore(UID.employeeB), 'landsMunicipalities', MUNICIPALITY_A, 'userAccess', UID.employeeA)));
  await assertFails(getDoc(doc(firestore(UID.disabledA), 'landsMunicipalities', MUNICIPALITY_A, 'landGrants', 'grant-a')));
});

test('only municipal_manager can list Lands memberships', async () => {
  await assertSucceeds(getDocs(collection(firestore(UID.managerA), 'landsMunicipalities', MUNICIPALITY_A, 'userAccess')));
  await assertFails(getDocs(collection(firestore(UID.headA), 'landsMunicipalities', MUNICIPALITY_A, 'userAccess')));
  await assertFails(getDocs(collection(firestore(UID.employeeA), 'landsMunicipalities', MUNICIPALITY_A, 'userAccess')));
});

test('active Lands roles read only their own municipality', async () => {
  for (const uid of [UID.managerA, UID.headA, UID.employeeA]) {
    await assertSucceeds(getDoc(doc(firestore(uid), 'landsMunicipalities', MUNICIPALITY_A, 'landGrants', 'grant-a')));
    await assertSucceeds(getDoc(doc(firestore(uid), 'landsMunicipalities', MUNICIPALITY_A, 'plans', 'plan-a')));
  }
  await assertFails(getDoc(doc(firestore(UID.employeeA), 'landsMunicipalities', MUNICIPALITY_B, 'landGrants', 'grant-b')));
});

test('grant create is tenant-bound, creator-bound, draft-only and browser updates/deletes stay denied', async () => {
  const db = firestore(UID.employeeA);
  const ownRef = doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'landGrants', 'new-grant');
  await assertSucceeds(setDoc(ownRef, grant(UID.employeeA)));
  await assertFails(setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'landGrants', 'spoof-owner'), grant(UID.managerA)));
  await assertFails(setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'landGrants', 'bad-status'), grant(UID.employeeA, MUNICIPALITY_A, { status: 'approved' })));
  await assertFails(setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'landGrants', 'cross-tenant'), grant(UID.employeeA, MUNICIPALITY_B)));
  await assertFails(updateDoc(ownRef, { status: 'under_review' }));
  await assertFails(deleteDoc(ownRef));
});

test('regular Lands domain records are create-only for active Lands roles and tenant-bound', async () => {
  const db = firestore(UID.employeeA);
  const ownRef = doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'plans', 'new-plan');
  await assertSucceeds(setDoc(ownRef, domainEntity(UID.employeeA)));
  await assertFails(setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'plans', 'spoof-plan'), domainEntity(UID.managerA)));
  await assertFails(setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'plans', 'bad-extra'), domainEntity(UID.employeeA, MUNICIPALITY_A, { role: 'municipal_manager' })));
  await assertFails(updateDoc(ownRef, { name: 'changed in browser' }));
  await assertFails(deleteDoc(ownRef));
});

test('document metadata create enforces path, MIME, size and browser immutability', async () => {
  const db = firestore(UID.employeeA);
  const good = doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'documents', 'doc-a');
  await assertSucceeds(setDoc(good, documentMeta(UID.employeeA, 'doc-a')));
  await assertFails(setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'documents', 'doc-b'),
    documentMeta(UID.employeeA, 'wrong-id')));
  await assertFails(setDoc(doc(db, 'landsMunicipalities', MUNICIPALITY_A, 'documents', 'doc-c'),
    documentMeta(UID.employeeA, 'doc-c', MUNICIPALITY_A, { mime_type: 'text/plain' })));
  await assertFails(updateDoc(good, { filename: 'changed.pdf' }));
  await assertFails(deleteDoc(good));
});

test('audit log is reviewer-only and all browser audit writes are denied', async () => {
  await assertSucceeds(getDocs(query(collection(firestore(UID.managerA), 'landsMunicipalities', MUNICIPALITY_A, 'auditLogs'), orderBy('occurred_at', 'desc'))));
  await assertSucceeds(getDocs(query(collection(firestore(UID.headA), 'landsMunicipalities', MUNICIPALITY_A, 'auditLogs'), orderBy('occurred_at', 'desc'))));
  await assertFails(getDocs(query(collection(firestore(UID.employeeA), 'landsMunicipalities', MUNICIPALITY_A, 'auditLogs'), orderBy('occurred_at', 'desc'))));
  await assertFails(setDoc(doc(firestore(UID.managerA), 'landsMunicipalities', MUNICIPALITY_A, 'auditLogs', 'forged'), {
    municipality_id: MUNICIPALITY_A, action: 'forged',
  }));
});

test('unknown Lands subcollections and top-level paths fail closed', async () => {
  await assertFails(getDoc(doc(firestore(UID.managerA), 'landsMunicipalities', MUNICIPALITY_A, 'unknown', 'x')));
  await assertFails(getDoc(doc(firestore(UID.managerA), 'unapprovedCollection', 'x')));
});

test('storage upload/read is same-tenant, metadata-bound and create-only', async () => {
  const recordDomain = 'landGrants';
  const recordId = 'grant-a';
  const fileId = 'file-a';
  const path = `landsMunicipalities/${MUNICIPALITY_A}/documents/${recordDomain}/${recordId}/${fileId}`;
  const fileRef = ref(storage(UID.employeeA), path);
  await assertSucceeds(uploadBytes(fileRef, new Uint8Array([1, 2, 3]), uploadMetadata(MUNICIPALITY_A, recordDomain, recordId, fileId)));
  await assertSucceeds(getBytes(fileRef));
  await assertFails(getBytes(ref(storage(UID.employeeB), path)));
  await assertFails(uploadBytes(fileRef, new Uint8Array([4, 5]), uploadMetadata(MUNICIPALITY_A, recordDomain, recordId, fileId)));
  await assertFails(deleteObject(fileRef));
});

test('storage rejects bad MIME, metadata spoofing, oversized objects and unrelated paths', async () => {
  const base = `landsMunicipalities/${MUNICIPALITY_A}/documents/landGrants/grant-a`;
  await assertFails(uploadBytes(
    ref(storage(UID.employeeA), base + '/bad-mime'),
    new Uint8Array([1]),
    { contentType: 'text/plain', customMetadata: { document_id:'bad-mime', municipality_id:MUNICIPALITY_A, record_domain:'landGrants', record_id:'grant-a' } }
  ));
  await assertFails(uploadBytes(
    ref(storage(UID.employeeA), base + '/spoof-meta'),
    new Uint8Array([1]),
    uploadMetadata(MUNICIPALITY_B, 'landGrants', 'grant-a', 'spoof-meta')
  ));
  await assertFails(uploadBytes(
    ref(storage(UID.employeeA), base + '/too-large'),
    new Uint8Array((10 * 1024 * 1024) + 1),
    uploadMetadata(MUNICIPALITY_A, 'landGrants', 'grant-a', 'too-large')
  ));
  await assertFails(uploadBytes(
    ref(storage(UID.employeeA), 'unapproved/path.bin'),
    new Uint8Array([1]),
    { contentType: 'application/pdf' }
  ));
});
