'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'field-head-runtime.js'), 'utf8');
const usersApi = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');
const contractorPage = fs.readFileSync(path.join(root, 'mobile-map.html'), 'utf8');

test('approved command board separates inspectors from external contractors', () => {
  assert.match(page, /مراقبو القسم/);
  assert.match(runtime, /liveContractors/);
  assert.match(runtime, /contractState === 'ACTIVE'/);
  assert.match(runtime, /إسناد للمقاول/);
});

test('field department head receives tenant-scoped observations and contractor identities', () => {
  assert.match(runtime, /getFieldVisualDistortionCommand/);
  assert.match(runtime, /liveObservations/);
  assert.match(runtime, /liveContractors/);
  assert.match(usersApi, /action === 'getFieldVisualDistortionCommand'/);
  assert.match(usersApi, /requireFieldDepartmentHead\(decoded\.uid\)/);
  assert.match(usersApi, /collection\('observations'\)\.where\('organizationId', '==', caller\.organizationId\)/);
});

test('department head contractor assignment remains same-organization and PENDING-only', () => {
  assert.match(runtime, /assignFieldObservation/);
  assert.match(runtime, /observationAssign/);
  assert.match(runtime, /contractState === 'ACTIVE'/);
  assert.match(usersApi, /action === 'assignFieldObservation'/);
  assert.match(usersApi, /observation\.organizationId !== caller\.organizationId/);
  assert.match(usersApi, /contractor\.organizationId !== caller\.organizationId/);
  assert.match(usersApi, /observation\.status !== 'PENDING'/);
  assert.match(usersApi, /assignedContractorUid: contractorUid/);
});

test('contractor keeps its own restricted assigned-only board', () => {
  assert.match(contractorPage, /where\('assignedContractorUid','==', contractorContext\.uid\)/);
  assert.match(contractorPage, /role === 'contractor'/);
  assert.match(contractorPage, /assignedContractorUid/);
});

test('contractor registry remains separate and assignment is gated by an active contract', () => {
  assert.match(usersApi, /collection\('contractorProfiles'\)/);
  assert.match(usersApi, /CONTRACTOR_PROFILE_STATUSES/);
  assert.match(usersApi, /contractor_profile_required/);
  assert.match(usersApi, /active_contract_required/);
  assert.match(usersApi, /contractorProfileState\(profile\) !== 'ACTIVE'/);
  assert.match(runtime, /upsertFieldContractorProfile/);
});

test('inspector verification is required before department-head closure', () => {
  const inspectorPage = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(usersApi, /action === 'verifyFieldObservation'/);
  assert.match(usersApi, /reporting_inspector_required/);
  assert.match(usersApi, /action: 'verify_contractor_work'/);
  assert.match(usersApi, /action: 'return_to_contractor'/);
  assert.match(usersApi, /action === 'closeFieldObservation'/);
  assert.match(usersApi, /inspector_verification_required/);
  assert.match(inspectorPage, /id="inspectorVerificationPanel"/);
  assert.match(inspectorPage, /action:'verifyFieldObservation'/);
  assert.match(runtime, /o\.inspectorVerification\?\.status === 'VERIFIED'/);
  assert.match(runtime, /closeFieldObservation/);
});

test('contractor workflow remains execution owner until PENDING_REVIEW', () => {
  assert.match(contractorPage, /if \(currentStatus === 'PENDING'\) return 'IN_PROGRESS'/);
  assert.match(contractorPage, /if \(currentStatus === 'IN_PROGRESS'\) return 'PENDING_REVIEW'/);
  assert.match(contractorPage, /AFTER_IMAGE_REQUIRED/);
  assert.match(contractorPage, /NOTE_REQUIRED/);
});

test('inspector still cannot close visual distortion directly', () => {
  const inspectorPage = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.match(inspectorPage, /toggleHidden\('completeObservationBtn', true\)/);
  assert.match(inspectorPage, /الإغلاق النهائي يتم من رئيس قسم الحصر الميداني/);
  assert.doesNotMatch(inspectorPage, /currentSelectedObservation\.status = 'COMPLETED'/);
});
