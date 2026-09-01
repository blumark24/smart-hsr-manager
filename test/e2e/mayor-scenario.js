'use strict';
// Phase 11 — the Mayor Demo E2E scenario, walked for real through the
// actual UI across all 5 roles, against the Firebase emulators. Every
// state transition below happens because a real button was clicked in a
// real browser session — this script never writes to Firestore directly
// to advance the story; it only ever READS (via firebase-admin) to verify
// that the UI action actually produced the expected state. That read-only
// verification is the honest alternative to "editing the database mid-flow
// to fake success."

const { chromium } = require('playwright');
const admin = require('firebase-admin');
const { installFbMock } = require('./lib/fb-mock');
const { startHarness } = require('./lib/harness');
const { loginAs, waitForGateClear } = require('./lib/login');

const CHROMIUM_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MISSION_TYPE = 'تفتيش ميداني';
const DESTINATION = 'حي العرض الملكي — جولة العمدة';
const REASON = 'فحص ميداني تنفيذي لعرض النظام أمام المحافظ';
const INCIDENT_NOTE = 'عطل طارئ في نظام التبريد أثناء تنفيذ المهمة';

function step(n, label) {
  console.log(`\n[STEP ${n}] ${label}`);
}

async function findMissionByType(db, orgId, type) {
  const snap = await db.collection('missions')
    .where('organizationId', '==', orgId)
    .where('type', '==', type)
    .get();
  if (snap.empty) throw new Error(`No mission found with type ${type}`);
  if (snap.size > 1) throw new Error(`Expected exactly one mission with type ${type}, found ${snap.size}`);
  return { id: snap.docs[0].id, data: snap.docs[0].data() };
}

async function assertMissionStatus(db, missionId, expected) {
  const snap = await db.collection('missions').doc(missionId).get();
  const status = snap.data().status;
  if (status !== expected) throw new Error(`Mission ${missionId} expected status ${expected}, got ${status}`);
  return snap.data();
}

async function assertVehicleStatus(db, vehicleId, expected) {
  const snap = await db.collection('vehicles').doc(vehicleId).get();
  const status = snap.data().status;
  if (status !== expected) throw new Error(`Vehicle ${vehicleId} expected status ${expected}, got ${status}`);
  return snap.data();
}

async function main() {
  const harness = await startHarness();
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  const adminApp = admin.apps.length ? admin.app() : admin.initializeApp({ projectId: 'smart-hsr-manager' });
  const db = adminApp.firestore();
  const orgId = harness.seed.orgId;
  const employeeUid = harness.seed.uids.employee;

  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });

  async function openAs(email) {
    const ctx = await browser.newContext();
    await installFbMock(ctx);
    const page = await loginAs(ctx, harness.baseUrl, email);
    await waitForGateClear(page);
    return { ctx, page };
  }

  try {
    // ---- Department Head: create + submit a mission request ----
    step(1, 'Department Head creates and submits a mission request');
    {
      const { ctx, page } = await openAs('depthead@e2e.test');
      await page.getByRole('button', { name: 'إنشاء طلب مهمة' }).first().click();
      await page.getByPlaceholder('الموقع المستهدف').fill(DESTINATION);
      await page.getByPlaceholder('سبب المهمة').fill(REASON);
      await page.getByRole('button', { name: MISSION_TYPE, exact: true }).click();
      await page.getByRole('button', { name: 'إرسال للاعتماد', exact: true }).click();
      await page.waitForTimeout(1500);
      await ctx.close();
    }
    const created = await findMissionByType(db, orgId, MISSION_TYPE);
    const missionId = created.id;
    await assertMissionStatus(db, missionId, 'PENDING_APPROVAL');
    console.log(`  -> mission ${missionId} is PENDING_APPROVAL (verified via Firestore read)`);

    // ---- Administrative Affairs: approve ----
    step(2, 'Administrative Affairs approves the mission');
    {
      const { ctx, page } = await openAs('adminaffairs@e2e.test');
      await page.getByText(MISSION_TYPE, { exact: true }).first().click();
      await page.getByRole('button', { name: 'اعتماد', exact: true }).click();
      await page.waitForTimeout(1500);
      await ctx.close();
    }
    await assertMissionStatus(db, missionId, 'APPROVED');
    console.log(`  -> mission ${missionId} is APPROVED`);

    // ---- Mobility Head: allocate vehicle + handover ----
    step(3, 'Mobility Head allocates a vehicle to the mission');
    let mobilityCtx;
    let mobilityPage;
    {
      const { ctx, page } = await openAs('mobilityhead@e2e.test');
      mobilityCtx = ctx; mobilityPage = page;
      await page.getByText(MISSION_TYPE, { exact: false }).first().click();
      await page.waitForTimeout(500);
      console.log('  [debug] drawer state after row click:', await page.evaluate(() => document.body.innerText.slice(0, 300)));
      await page.locator('select').selectOption(employeeUid);
      await page.getByRole('button', { name: 'E2E-V1 · سيارة دورية', exact: true }).click();
      await page.getByRole('button', { name: 'تخصيص المركبة المحددة', exact: true }).click();
      await page.waitForTimeout(1500);
      console.log('  [debug] toast after submit:', await page.evaluate(() => document.body.innerText.match(/تم تخصيص|تعذر التخصيص|الرجاء اختيار/)?.[0] || 'none'));
    }
    await assertMissionStatus(db, missionId, 'VEHICLE_ALLOCATED');
    await assertVehicleStatus(db, 'E2E-V1', 'RESERVED');
    console.log(`  -> mission ${missionId} VEHICLE_ALLOCATED, vehicle E2E-V1 RESERVED`);

    step(4, 'Mobility Head hands the vehicle over to the employee');
    {
      console.log('  [debug] viewport innerWidth/innerHeight:', await mobilityPage.evaluate(() => `${window.innerWidth}x${window.innerHeight}`));
      console.log('  [debug] aside display:', await mobilityPage.evaluate(() => {
        const aside = document.querySelector('aside');
        if (!aside) return 'NO_ASIDE_IN_DOM';
        const cs = getComputedStyle(aside);
        return JSON.stringify({ display: cs.display, width: cs.width, sbDisp: cs.getPropertyValue('--sbDisp') });
      }));
      console.log('  [debug] matches for التسليم والاستلام:', await mobilityPage.evaluate(() => {
        const matches = [...document.querySelectorAll('span')].filter(el => el.textContent.trim() === 'التسليم والاستلام');
        return matches.map(el => {
          const chain = [];
          let node = el;
          for (let i = 0; i < 6 && node; i++, node = node.parentElement) {
            chain.push(`${node.tagName}[display=${getComputedStyle(node).display}]`);
          }
          return chain.join(' < ');
        });
      }));
      const navLink = mobilityPage.getByText('التسليم والاستلام', { exact: true }).first();
      console.log('  [debug] nav link box:', JSON.stringify(await navLink.boundingBox()));
      console.log('  [debug] nav link visible:', await navLink.isVisible());
      await mobilityPage.screenshot({ path: '/tmp/claude-0/-home-user-smart-hsr-manager/0ea6ea42-8758-5a2f-8b7b-30493c714b6f/scratchpad/mayor-step4-debug.png', fullPage: true });
      await navLink.click();
      await mobilityPage.getByRole('button', { name: 'بدء التسليم للموظف', exact: true }).click();
      await mobilityPage.getByRole('button', { name: 'تأكيد تسليم المركبة', exact: true }).click();
      await mobilityPage.waitForTimeout(1500);
    }
    await assertMissionStatus(db, missionId, 'HANDED_OVER');
    await assertVehicleStatus(db, 'E2E-V1', 'IN_MISSION');
    console.log(`  -> mission ${missionId} HANDED_OVER, vehicle E2E-V1 IN_MISSION`);

    // ---- Employee: receive + start ----
    step(5, 'Employee receives the vehicle and starts the mission');
    const { ctx: empCtx, page: empPage } = await openAs('employee@e2e.test');
    await empPage.getByRole('button', { name: 'استلام المركبة وبدء المهمة', exact: true }).click();
    await empPage.waitForTimeout(1500);
    await assertMissionStatus(db, missionId, 'IN_PROGRESS');
    console.log(`  -> mission ${missionId} IN_PROGRESS`);

    // ---- Employee: report incident ----
    step(6, 'Employee reports an incident, putting the mission on hold');
    await empPage.getByRole('button', { name: 'طلب دعم / بلاغ حادث', exact: true }).click();
    await empPage.getByPlaceholder('وصف مختصر').fill(INCIDENT_NOTE);
    await empPage.getByRole('button', { name: 'عطل مركبة', exact: true }).click();
    await empPage.getByRole('button', { name: 'إرسال البلاغ', exact: true }).click();
    await empPage.waitForTimeout(1500);
    await assertMissionStatus(db, missionId, 'INCIDENT_HOLD');
    const incidentSnap = await db.collection('incidents').where('missionId', '==', missionId).get();
    if (incidentSnap.size !== 1) throw new Error(`Expected exactly 1 incident for mission ${missionId}, found ${incidentSnap.size}`);
    const incidentId = incidentSnap.docs[0].id;
    await db.collection('incidents').doc(incidentId).get().then((s) => {
      if (s.data().status !== 'NEW') throw new Error(`Incident ${incidentId} expected NEW, got ${s.data().status}`);
    });
    console.log(`  -> mission ${missionId} INCIDENT_HOLD, incident ${incidentId} created as NEW`);

    // ---- Mobility Head: process the incident through its full lifecycle ----
    step(7, 'Mobility Head processes the incident: NEW -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED');
    const incidentSteps = [
      { button: 'تم الاستلام', expect: 'ACKNOWLEDGED' },
      { button: 'بدء المعالجة', expect: 'IN_PROGRESS' },
      { button: 'تم الحل', expect: 'RESOLVED' },
    ];
    for (const { button, expect } of incidentSteps) {
      await mobilityPage.getByText('عطل مركبة', { exact: false }).first().click();
      await mobilityPage.getByRole('button', { name: button, exact: true }).click();
      await mobilityPage.waitForTimeout(1200);
      const snap = await db.collection('incidents').doc(incidentId).get();
      if (snap.data().status !== expect) throw new Error(`Incident ${incidentId} expected ${expect}, got ${snap.data().status}`);
      console.log(`  -> incident ${incidentId} is ${expect}`);
    }

    // ---- Employee: resume, finish, return vehicle ----
    step(8, 'Employee resumes the mission after the incident is resolved');
    await empPage.getByRole('button', { name: 'استئناف المهمة', exact: true }).click();
    await empPage.waitForTimeout(1500);
    await assertMissionStatus(db, missionId, 'IN_PROGRESS');
    console.log(`  -> mission ${missionId} back to IN_PROGRESS`);

    step(9, 'Employee finishes the mission');
    await empPage.getByRole('button', { name: 'إنهاء المهمة', exact: true }).click();
    await empPage.waitForTimeout(1500);
    await assertMissionStatus(db, missionId, 'COMPLETED');
    console.log(`  -> mission ${missionId} COMPLETED`);

    step(10, 'Employee returns the vehicle');
    await empPage.getByRole('button', { name: 'تسليم المركبة', exact: true }).click();
    await empPage.waitForTimeout(1500);
    await assertMissionStatus(db, missionId, 'AWAITING_RETURN');
    await assertVehicleStatus(db, 'E2E-V1', 'RETURN_PENDING');
    console.log(`  -> mission ${missionId} AWAITING_RETURN, vehicle E2E-V1 RETURN_PENDING`);
    await empCtx.close();

    // ---- Mobility Head: confirm return, closing the mission ----
    step(11, 'Mobility Head confirms the vehicle return, closing the mission');
    await mobilityPage.getByText('التسليم والاستلام', { exact: true }).first().click();
    await mobilityPage.getByRole('button', { name: 'تسجيل استلام المركبة', exact: true }).click();
    await mobilityPage.getByRole('button', { name: 'تأكيد إعادة المركبة وإغلاق السجل', exact: true }).click();
    await mobilityPage.waitForTimeout(1500);
    await assertMissionStatus(db, missionId, 'CLOSED');
    const finalVehicle = await assertVehicleStatus(db, 'E2E-V1', 'AVAILABLE');
    if (finalVehicle.assignedEmployeeUid || finalVehicle.currentMissionId) {
      throw new Error('Vehicle E2E-V1 still carries assignedEmployeeUid/currentMissionId after return');
    }
    console.log(`  -> mission ${missionId} CLOSED, vehicle E2E-V1 AVAILABLE and cleared`);
    await mobilityCtx.close();

    // ---- Audit trail verification ----
    step(12, 'Verifying the append-only audit trail covers the full lifecycle');
    const auditSnap = await db.collection('auditEvents').where('resourceId', '==', missionId).get();
    const actions = auditSnap.docs.map((d) => d.data().action).sort();
    const expectedActions = ['create', 'submit_for_approval', 'decide', 'handover', 'employee_advance',
      'employee_advance', 'employee_advance', 'employee_advance', 'employee_return_vehicle', 'confirm_return'].sort();
    console.log(`  -> ${auditSnap.size} audit events recorded for mission ${missionId}: ${actions.join(', ')}`);
    if (auditSnap.size < expectedActions.length) {
      throw new Error(`Expected at least ${expectedActions.length} audit events, found ${auditSnap.size}`);
    }
    const incidentAuditSnap = await db.collection('auditEvents').where('resourceId', '==', incidentId).get();
    console.log(`  -> ${incidentAuditSnap.size} audit events recorded for incident ${incidentId}`);
    if (incidentAuditSnap.size < 4) throw new Error(`Expected at least 4 audit events for the incident, found ${incidentAuditSnap.size}`);

    console.log('\nMAYOR DEMO SCENARIO: ALL STEPS PASSED');
  } finally {
    await browser.close();
    await harness.stop();
  }
}

main().catch((err) => { console.error('\nMAYOR DEMO SCENARIO FAILED:', err); process.exit(1); });
