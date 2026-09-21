'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakes, fakeRequest, fakeResponse } = require('./helpers/fakeFirebaseAdmin');

function installTransactionalUpdate(store) {
  store.runTransaction = async fn => fn({
    get: ref => ref.get(),
    set: (ref, data, options) => ref.set(data, options),
    update: (ref, data) => ref.set(data, { merge: true }),
    delete: ref => ref.delete(),
  });
}

async function call(handler, uid, body) {
  const req = fakeRequest({ uid, body });
  const res = fakeResponse();
  await handler(req, res);
  return res;
}

test('visual distortion full trusted lifecycle closes and is fully visible in same-department audit', async () => {
  const { store, restore } = installFakes();
  installTransactionalUpdate(store);

  const authzPath = require.resolve('../api/_lib/authz.js');
  const usersPath = require.resolve('../api/admin/users.js');
  delete require.cache[authzPath];
  delete require.cache[usersPath];
  const handler = require('../api/admin/users.js');

  const ORG = 'org-visual-uat';
  const DEPT = 'إدارة الحصر الميداني';
  const HEAD = 'head-1';
  const INSPECTOR = 'inspector-1';
  const OTHER_INSPECTOR = 'inspector-2';
  const CONTRACTOR = 'contractor-1';
  const OBS = 'obs-visual-001';

  try {
    store.seed('users/' + HEAD, {
      uid: HEAD, name: 'رئيس قسم التشوه البصري', role: 'department_head',
      active: true, organizationId: ORG, department: DEPT,
    });
    store.seed('users/' + INSPECTOR, {
      uid: INSPECTOR, name: 'المراقب الأصلي', role: 'inspector',
      active: true, organizationId: ORG, department: DEPT,
    });
    store.seed('users/' + OTHER_INSPECTOR, {
      uid: OTHER_INSPECTOR, name: 'مراقب آخر', role: 'inspector',
      active: true, organizationId: ORG, department: DEPT,
    });
    store.seed('users/' + CONTRACTOR, {
      uid: CONTRACTOR, name: 'ممثل شركة التنفيذ', role: 'contractor',
      active: true, organizationId: ORG,
    });
    store.seed('contractorProfiles/' + CONTRACTOR, {
      contractorUid: CONTRACTOR,
      organizationId: ORG,
      department: DEPT,
      companyName: 'شركة التنفيذ التجريبية',
      contractNumber: 'CTR-UAT-001',
      contractScope: 'معالجة التشوه البصري',
      contactName: 'مسؤول المقاول',
      contactPhone: '0500000000',
      startDate: '2026-01-01',
      endDate: '2027-12-31',
      status: 'ACTIVE',
    });
    store.seed('observations/' + OBS, {
      organizationId: ORG,
      createdByUid: INSPECTOR,
      status: 'PENDING',
      title: 'تشوه بصري UAT',
      type: 'VISUAL_DISTORTION',
      correctedLat: 21.543333,
      correctedLng: 39.172778,
      locationVerified: true,
      imagePath: 'evidence/' + OBS + '/before.webp',
      createdAt: '2026-09-21T08:00:00.000Z',
    });

    const command = await call(handler, HEAD, { action: 'getFieldVisualDistortionCommand' });
    assert.equal(command.statusCode, 200);
    assert.equal(command.body.product, 'visual_distortion');
    assert.equal(command.body.observations.some(x => x.observationId === OBS), true);
    const company = command.body.contractors.find(x => x.uid === CONTRACTOR);
    assert.ok(company);
    assert.equal(company.contractState, 'ACTIVE');
    assert.equal(company.profile.contractNumber, 'CTR-UAT-001');

    const assign = await call(handler, HEAD, {
      action: 'assignFieldObservation',
      observationId: OBS,
      contractorUid: CONTRACTOR,
      supervisorNote: 'تنفيذ المعالجة حسب العقد النشط',
    });
    assert.equal(assign.statusCode, 200);
    assert.equal(assign.body.contractorUid, CONTRACTOR);

    const afterAssign = await store.doc('observations/' + OBS).get();
    assert.equal(afterAssign.data().assignedContractorUid, CONTRACTOR);
    assert.equal(afterAssign.data().status, 'PENDING');

    const start = await call(handler, CONTRACTOR, {
      action: 'contractorObservationUpdate',
      observationId: OBS,
      transitionKey: 'START',
      note: 'بدأ التنفيذ',
      fix: { coords: [21.543333, 39.172778], accuracy: 7 },
    });
    assert.equal(start.statusCode, 200);
    assert.equal(start.body.status, 'IN_PROGRESS');

    const submit = await call(handler, CONTRACTOR, {
      action: 'contractorObservationUpdate',
      observationId: OBS,
      transitionKey: 'SUBMIT',
      note: 'تمت المعالجة ميدانياً',
      afterImagePath: 'evidence/' + OBS + '/after.webp',
      fix: { coords: [21.543333, 39.172778], accuracy: 6 },
    });
    assert.equal(submit.statusCode, 200);
    assert.equal(submit.body.status, 'PENDING_REVIEW');

    const wrongInspector = await call(handler, OTHER_INSPECTOR, {
      action: 'verifyFieldObservation',
      observationId: OBS,
      decision: 'ACCEPT',
      note: 'محاولة من مراقب آخر',
    });
    assert.equal(wrongInspector.statusCode, 403);
    assert.equal(wrongInspector.body.reason, 'reporting_inspector_required');

    const verify = await call(handler, INSPECTOR, {
      action: 'verifyFieldObservation',
      observationId: OBS,
      decision: 'ACCEPT',
      note: 'تم التحقق من المعالجة',
    });
    assert.equal(verify.statusCode, 200);
    assert.equal(verify.body.verificationStatus, 'VERIFIED');

    const close = await call(handler, HEAD, {
      action: 'closeFieldObservation',
      observationId: OBS,
      closureNote: 'إغلاق بعد تحقق المراقب الأصلي',
    });
    assert.equal(close.statusCode, 200);
    assert.equal(close.body.status, 'COMPLETED');

    const closed = await store.doc('observations/' + OBS).get();
    assert.equal(closed.data().status, 'COMPLETED');
    assert.equal(closed.data().inspectorVerification.verifiedByUid, INSPECTOR);

    const audit = await call(handler, HEAD, { action: 'listFieldDepartmentAudit' });
    assert.equal(audit.statusCode, 200);
    const visualEvents = audit.body.events.filter(e => e.resourceId === OBS);
    const actions = visualEvents.map(e => e.action);
    assert.equal(actions.includes('assign_contractor'), true);
    assert.equal(actions.filter(x => x === 'contractor_transition').length, 2);
    assert.equal(actions.includes('verify_contractor_work'), true);
    assert.equal(actions.includes('close_visual_distortion_case'), true);
    assert.equal(visualEvents.every(e => [
      'auditId','resourceType','resourceId','action','actorRole',
      'fromStatus','toStatus','contractorUid','timestamp'
    ].every(k => Object.prototype.hasOwnProperty.call(e, k))), true);
  } finally {
    restore();
    delete require.cache[authzPath];
    delete require.cache[usersPath];
  }
});
