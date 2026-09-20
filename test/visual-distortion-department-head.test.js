'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
const usersApi = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');
const contractorPage = fs.readFileSync(path.join(root, 'mobile-map.html'), 'utf8');

test('visual distortion command separates inspectors from external contractors', () => {
  assert.match(page, /مراقبو القسم/);
  assert.match(page, /المقاولون/);
  assert.match(page, /المقاول طرف تنفيذي خارجي وليس موظفًا/);
  assert.match(page, /data-visual-kpi="pending"/);
  assert.match(page, /data-visual-kpi="progress"/);
  assert.match(page, /data-visual-kpi="review"/);
  assert.match(page, /data-visual-kpi="closed"/);
});

test('field department head receives tenant-scoped observations and active contractor identities', () => {
  assert.match(usersApi, /action === 'getFieldVisualDistortionCommand'/);
  assert.match(usersApi, /requireFieldDepartmentHead\(decoded\.uid\)/);
  assert.match(usersApi, /collection\('observations'\)\.where\('organizationId', '==', caller\.organizationId\)/);
  assert.match(usersApi, /collection\('users'\)\.where\('organizationId', '==', caller\.organizationId\)/);
  assert.match(usersApi, /data\.role !== 'contractor'/);
});

test('department head contractor assignment is same-organization and PENDING-only', () => {
  assert.match(usersApi, /action === 'assignFieldObservation'/);
  assert.match(usersApi, /observation\.organizationId !== caller\.organizationId/);
  assert.match(usersApi, /contractor\.organizationId !== caller\.organizationId/);
  assert.match(usersApi, /contractor\.active === false \|\| contractor\.role !== 'contractor'/);
  assert.match(usersApi, /observation\.status !== 'PENDING'/);
  assert.match(usersApi, /assignedContractorUid: contractorUid/);
  assert.match(usersApi, /action: 'assign_contractor'/);
});

test('contractor keeps its own restricted board and reads only assigned observations', () => {
  assert.match(contractorPage, /where\('assignedContractorUid','==', contractorContext\.uid\)/);
  assert.match(contractorPage, /role === 'contractor'/);
  assert.match(contractorPage, /assignedContractorUid/);
});

test('department-head UI uses trusted API for visual command and assignment', () => {
  assert.match(page, /action:"getFieldVisualDistortionCommand"/);
  assert.match(page, /action:"assignFieldObservation"/);
  assert.match(page, /data-assign-observation/);
  assert.match(page, /سيظهر البلاغ في لوحة المقاول الخاصة/);
});

test('contractor registry is separate from employee registry and gates assignment by active contract', () => {
  assert.match(page, /سجل المقاولين/);
  assert.match(page, /الملف التعاقدي للمقاول/);
  assert.match(page, /action:"upsertFieldContractorProfile"/);
  assert.match(usersApi, /collection\('contractorProfiles'\)/);
  assert.match(usersApi, /CONTRACTOR_PROFILE_STATUSES/);
  assert.match(usersApi, /contractor_profile_required/);
  assert.match(usersApi, /active_contract_required/);
  assert.match(usersApi, /contractorProfileState\(profile\) !== 'ACTIVE'/);
  assert.match(page, /contractors\.filter\(x=>x\.contractState==="ACTIVE"/);
});

test('contractor profile mutation is field-head and tenant scoped', () => {
  assert.match(usersApi, /action === 'upsertFieldContractorProfile'/);
  assert.match(usersApi, /requireFieldDepartmentHead\(decoded\.uid\)/);
  assert.match(usersApi, /contractor\.organizationId !== caller\.organizationId/);
  assert.match(usersApi, /resourceType: 'contractorProfile'/);
  assert.match(usersApi, /action: 'upsert_contractor_profile'/);
  assert.match(usersApi, /contract_date_range_invalid/);
});


test('inspector verification is required before department-head closure', () => {
  const inspectorPage = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(usersApi, /action === 'verifyFieldObservation'/);
  assert.match(usersApi, /reporting_inspector_required/);
  assert.match(usersApi, /observation\.status !== 'PENDING_REVIEW'/);
  assert.match(usersApi, /action: 'verify_contractor_work'/);
  assert.match(usersApi, /action: 'return_to_contractor'/);
  assert.match(usersApi, /action === 'closeFieldObservation'/);
  assert.match(usersApi, /inspector_verification_required/);
  assert.match(usersApi, /action: 'close_visual_distortion_case'/);
  assert.match(inspectorPage, /id="inspectorVerificationPanel"/);
  assert.match(inspectorPage, /action:'verifyFieldObservation'/);
  assert.match(page, /data-close-observation/);
  assert.match(page, /action:"closeFieldObservation"/);
});

test('contractor workflow remains the execution owner until PENDING_REVIEW', () => {
  assert.match(contractorPage, /if \(currentStatus === 'PENDING'\) return 'IN_PROGRESS'/);
  assert.match(contractorPage, /if \(currentStatus === 'IN_PROGRESS'\) return 'PENDING_REVIEW'/);
  assert.match(contractorPage, /AFTER_IMAGE_REQUIRED/);
  assert.match(contractorPage, /NOTE_REQUIRED/);
  assert.match(contractorPage, /assignedContractorUid !== auth\.currentUser\.uid/);
});


test('inspector cannot close visual distortion directly after contractor execution', () => {
  const inspectorPage = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(inspectorPage, /toggleHidden\('completeObservationBtn', true\)/);
  assert.match(inspectorPage, /الإغلاق النهائي يتم من رئيس قسم الحصر الميداني/);
  assert.doesNotMatch(inspectorPage, /currentSelectedObservation\.status = 'COMPLETED'/);
});
