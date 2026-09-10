'use strict';
// Seeds the Firebase emulators (Auth + Firestore) with one real
// organization and its five Smart Mobility accounts, plus two vehicles,
// for the Mayor demo E2E scenario.
//
// SAFETY: this uses the app's real projectId ("smart-hsr-manager", matching
// smart-mobility-adapter.js / login.html's hardcoded FIREBASE_CONFIG, which
// this script does not and must not modify) rather than a demo- id, because
// the Auth emulator partitions users by project id and the browser client
// must land in the same partition this script seeds. Safety instead comes
// from refusing to run at all unless FIRESTORE_EMULATOR_HOST and
// FIREBASE_AUTH_EMULATOR_HOST are set — those env vars unconditionally
// redirect the Admin SDK to the local emulator regardless of project id, so
// this can never reach real Firebase even by mistake.

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Refusing to seed: FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST are not set.');
}

const admin = require('firebase-admin');

const PROJECT_ID = 'smart-hsr-manager';
admin.initializeApp({ projectId: PROJECT_ID });
const auth = admin.auth();
const db = admin.firestore();

const ORG_ID = 'e2e-org';
const ORG_NAME = 'بلدية العرض التجريبي';
const DEPARTMENT = 'الرقابة البلدية';
const PASSWORD = 'MayorDemo!2026Pass';

const ACCOUNTS = [
  { key: 'manager', email: 'manager@e2e.test', name: 'مدير البلدية', collection: 'managers', role: 'manager' },
  { key: 'deptHead', email: 'depthead@e2e.test', name: 'رئيس القسم', collection: 'users', role: 'department_head' },
  { key: 'adminAffairs', email: 'adminaffairs@e2e.test', name: 'الشؤون الإدارية', collection: 'users', role: 'administrative_affairs' },
  { key: 'mobilityHead', email: 'mobilityhead@e2e.test', name: 'رئيس حركة السير', collection: 'users', role: 'mobility_head' },
  { key: 'employee', email: 'employee@e2e.test', name: 'الموظف الميداني', collection: 'users', role: 'employee' },
];

async function upsertUser(email, displayName) {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password: PASSWORD, displayName, disabled: false });
    return existing.uid;
  } catch (e) {
    const created = await auth.createUser({ email, password: PASSWORD, displayName, emailVerified: true });
    return created.uid;
  }
}

// Wipes prior runs' mission/vehicle/incident/audit state for the e2e orgs so
// each seed starts from a clean slate — otherwise a mission created by a
// previous (possibly partial, e.g. crashed mid-scenario) run would collide
// with the one this run's Department Head is about to create for real.
async function wipeOrgData(orgId) {
  for (const collection of ['missions', 'vehicles', 'incidents', 'auditEvents']) {
    const snap = await db.collection(collection).where('organizationId', '==', orgId).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (!snap.empty) await batch.commit();
  }
}

async function main() {
  await wipeOrgData(ORG_ID);
  await wipeOrgData('e2e-org-b');

  const uids = {};
  for (const account of ACCOUNTS) {
    const uid = await upsertUser(account.email, account.name);
    uids[account.key] = uid;
    const doc = {
      role: account.role, active: true, organizationId: ORG_ID,
      organizationName: ORG_NAME, name: account.name, email: account.email,
    };
    if (account.role === 'department_head') doc.department = DEPARTMENT;
    await db.collection(account.collection).doc(uid).set(doc, { merge: true });
  }

  await db.collection('vehicles').doc('E2E-V1').set({
    organizationId: ORG_ID, status: 'AVAILABLE', plate: '1234 أ ب ج', type: 'سيارة دورية',
  });
  await db.collection('vehicles').doc('E2E-V2').set({
    organizationId: ORG_ID, status: 'AVAILABLE', plate: '5678 د هـ و', type: 'شاحنة خفيفة',
  });

  // A second organization + manager, used only for cross-tenant negative
  // tests (Phase 11) — proves org isolation, never touched by the happy path.
  const otherOrgManagerUid = await upsertUser('manager-org-b@e2e.test', 'مدير مؤسسة أخرى');
  await db.collection('managers').doc(otherOrgManagerUid).set({
    role: 'manager', active: true, organizationId: 'e2e-org-b', organizationName: 'مؤسسة أخرى',
  }, { merge: true });
  await db.collection('vehicles').doc('E2E-ORGB-V1').set({
    organizationId: 'e2e-org-b', status: 'AVAILABLE', plate: '0000 س ص ع', type: 'سيارة دورية',
  });

  // Fixture missions for negative security tests ONLY (test/e2e/negative-security.js).
  // These are seeded directly, unlike the Mayor scenario mission itself, which
  // negative-security.js and mayor-scenario.js never fabricate: the happy-path
  // mission must be created for real through the UI by depthead@e2e.test.
  // A fixture in a fixed, known state lets negative tests assert a SPECIFIC
  // denial (e.g. "dept head cannot self-approve PENDING_APPROVAL") without
  // depending on timing or on another script having already run first.
  await db.collection('missions').doc('E2E-FIXTURE-PENDING').set({
    organizationId: ORG_ID, department: DEPARTMENT, createdByUid: uids.deptHead,
    requesterName: 'رئيس القسم', status: 'PENDING_APPROVAL',
    type: 'فحص ميداني', destination: 'حي تجريبي', reason: 'اختبار أمني',
    scope: 'داخل النطاق', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    updatedByUid: uids.deptHead,
  });
  await db.collection('missions').doc('E2E-FIXTURE-ORGB').set({
    organizationId: 'e2e-org-b', department: 'قسم آخر', createdByUid: otherOrgManagerUid,
    status: 'PENDING_APPROVAL', type: 'فحص ميداني', destination: 'حي آخر', reason: 'اختبار أمني',
    scope: 'داخل النطاق', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    updatedByUid: otherOrgManagerUid,
  });

  console.log(JSON.stringify({ uids, otherOrgManagerUid, orgId: ORG_ID, password: PASSWORD }, null, 2));
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
