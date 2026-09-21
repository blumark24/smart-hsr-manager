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
  assert.match(runtime, /إسناد لشركة مقاول/);
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


test('department head navigation keeps visual distortion on missions and no contractor nav', () => {
  assert.match(runtime, /id:'missions', label:'التشوه البصري'/);
  assert.doesNotMatch(runtime, /id:'contractors', label:'المقاولون والعقود'/);
  assert.match(runtime, /id:'fieldmobility', label:'الحركة الميدانية'/);
  assert.match(runtime, /id:'employees', label:'موظفو القسم'/);
  assert.match(runtime, /id:'incidents', label:'البلاغات والملاحظات'/);
  assert.match(runtime, /id:'audit', label:'سجل القسم'/);
});

test('missions is the canonical visual distortion table with no mobility creation CTA', () => {
  assert.match(runtime, /screen === 'missions'/);
  assert.match(runtime, /title:'التشوه البصري'/);
  assert.match(runtime, /actions:\[\]/);
  assert.match(runtime, /instance\.state\.liveObservations/);
  assert.match(runtime, /instance\.openFieldObservation\(o\.observationId\)/);
  assert.match(runtime, /tCount:observations\.length\+' بلاغ معروض'/);
});

test('contractor appears only contextually during visual distortion assignment', () => {
  assert.doesNotMatch(runtime, /screen === 'contractors'/);
  assert.match(runtime, /contractState === 'ACTIVE'/);
  assert.match(runtime, /شركة التنفيذ المتعاقدة — العقود النشطة فقط/);
  assert.match(runtime, /شركة المقاول \(عقد نشط\)/);
  assert.match(runtime, /contractNumber/);
  assert.match(runtime, /endDate/);
});

test('department audit timeline is tenant and department scoped through trusted API', () => {
  assert.match(usersApi, /action === 'listFieldDepartmentAudit'/);
  assert.match(usersApi, /requireFieldDepartmentHead\(decoded\.uid\)/);
  assert.match(usersApi, /collection\('auditEvents'\)/);
  assert.match(usersApi, /where\('organizationId', '==', caller\.organizationId\)/);
  assert.match(usersApi, /eventDepartment !== cleanString\(caller\.department\)/);
  assert.match(runtime, /api\('listFieldDepartmentAudit'\)/);
  assert.match(runtime, /liveDepartmentAudit/);
});


test('department head can maintain contractor contract profile from the approved board', () => {
  assert.match(runtime, /drawer:'contractorEdit'/);
  assert.match(runtime, /تعديل الملف التعاقدي/);
  assert.match(runtime, /upsertFieldContractorProfile/);
  assert.match(runtime, /contractorUid:x\.uid/);
  assert.match(runtime, /حفظ الملف التعاقدي/);
});

test('visual audit screen filters to observation and contractor profile events', () => {
  assert.match(runtime, /e\.resourceType==='observation'\|\|e\.resourceType==='contractorProfile'/);
});

test('legacy incidents remain explicitly separate from visual distortion', () => {
  assert.match(runtime, /screen === 'incidents'/);
  assert.match(runtime, /وحدة تشغيلية مستقلة عن التشوه البصري/);
});


test('contractor portal uses runtime Firebase config so Preview session survives redirect', () => {
  assert.match(contractorPage, /import \{ resolveFirebaseConfig \} from '\.\/firebase-runtime-config\.js'/);
  assert.match(contractorPage, /const firebaseConfig = await resolveFirebaseConfig\(\)/);
  assert.doesNotMatch(contractorPage, /projectId:\s*"smart-hsr-manager"/);
});

test('contractor portal loads safe company contract context through existing users API', () => {
  assert.match(usersApi, /action === 'getContractorPortalContext'/);
  assert.match(usersApi, /getContractorCallerContext\(decoded\.uid\)/);
  assert.match(usersApi, /companyName:/);
  assert.match(usersApi, /contractNumber:/);
  assert.match(usersApi, /administration:/);
  assert.match(usersApi, /section:/);
  assert.match(contractorPage, /getContractorPortalContext/);
  assert.match(contractorPage, /portalCompanyName/);
  assert.match(contractorPage, /portalContractNumber/);
  assert.match(contractorPage, /portalAdministration/);
  assert.match(contractorPage, /portalSection/);
  assert.match(contractorPage, /portalContractState/);
});

test('contractor mobile command workspace exposes operational KPIs without changing workflow states', () => {
  for (const id of ['taskTotal','taskPending','taskInProgress','taskReview','taskCompleted','taskActive']) {
    assert.match(contractorPage, new RegExp(id));
  }
  assert.match(contractorPage, /class="contractor-command-card"/);
  assert.match(contractorPage, /شركة تنفيذ خارجية معتمدة|جهة تنفيذ خارجية معتمدة/);
  assert.match(contractorPage, /ممثل شركة متعاقدة/);
  assert.match(contractorPage, /PENDING:\{label:'مسندة',action:'بدء التنفيذ'\}/);
  assert.match(contractorPage, /IN_PROGRESS:\{label:'قيد العمل',action:'رفع إثبات المعالجة'\}/);
});


test('day mode has complete green chrome and light table surface tokens', () => {
  const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
  assert.match(page, /--command-bg': 'linear-gradient\(145deg,#0b6849/);
  assert.match(page, /--sbBg': 'linear-gradient\(180deg,#0a5f44/);
  assert.match(page, /--l3': 'rgba\(255,255,255,0\.985\)'/);
  assert.match(page, /--l3Bd': 'rgba\(20,91,65,0\.12\)'/);
  assert.match(page, /dh-table-shell/);
  assert.match(page, /dh-empty-table/);
});

test('contractor-linked identities cannot surface as municipality employees', () => {
  const employeesApi = fs.readFileSync(path.join(root, 'api/admin/employees.js'), 'utf8');
  assert.match(employeesApi, /linkedUser\.role === 'contractor'/);
  assert.match(runtime, /e\?\.role!=='contractor'/);
  assert.match(runtime, /موظف داخلي/);
  assert.match(runtime, /مراقب ميداني/);
});

test('department audit corrections are append-only and preserve original event', () => {
  assert.match(usersApi, /action === 'appendFieldDepartmentAuditNote'/);
  assert.match(usersApi, /resourceType: 'auditNote'/);
  assert.match(usersApi, /parentAuditId/);
  assert.doesNotMatch(usersApi, /parentRef\.update/);
  assert.match(runtime, /إضافة ملاحظة \/ تصحيح/);
  assert.match(runtime, /appendFieldDepartmentAuditNote/);
  assert.match(runtime, /لن يتغير الحدث الأصلي/);
});

test('visual case drawer separates contractor company from representative and contract', () => {
  assert.match(runtime, /الشركة المتعاقدة/);
  assert.match(runtime, /ممثل الشركة/);
  assert.match(runtime, /assignedProfile\.companyName/);
  assert.match(runtime, /assignedProfile\.contractNumber/);
  assert.match(runtime, /verificationLabel/);
  assert.match(runtime, /typeLabel/);
});


test('smart glass modal system is centered and responsive', () => {
  const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
  assert.match(page, /dh-smart-modal-scrim/);
  assert.match(page, /dh-smart-modal/);
  assert.match(page, /align-items:center;justify-content:center/);
  assert.match(page, /backdrop-filter:blur\(34px\) saturate\(145%\)/);
  assert.match(page, /dhGlassModalIn/);
  assert.match(page, /role="dialog" aria-modal="true"/);
  assert.match(page, /@media\(max-width:760px\)/);
});


test('department head command API exposes only authorized evidence references for case viewing', () => {
  assert.match(usersApi, /imageObjectKey: data\.imageObjectKey \|\| null/);
  assert.match(usersApi, /imagePath: data\.imagePath \|\| null/);
  assert.match(usersApi, /imageUrl: data\.imageUrl \|\| null/);
  assert.match(usersApi, /beforeImagePath: data\.beforeImagePath \|\| null/);
  assert.match(usersApi, /afterImagePath: data\.afterImagePath \|\| null/);
  assert.match(usersApi, /afterImageUrl: data\.afterImageUrl \|\| null/);
});

test('department head case viewer renders authorized before-after evidence professionally', () => {
  const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
  assert.match(runtime, /firstEvidenceReference\(o\.imageObjectKey,o\.imagePath,o\.imageUrl,o\.beforeImagePath\)/);
  assert.match(runtime, /firstEvidenceReference\(o\.afterImagePath,o\.afterImageUrl\)/);
  assert.match(runtime, /kind:'before'/);
  assert.match(runtime, /kind:'after'/);
  assert.match(runtime, /evidenceCompare:true/);
  assert.match(page, /dh-evidence-compare/);
  assert.match(page, /مقارنة موثقة بين حالة البلاغ قبل التنفيذ وبعده/);
  assert.match(page, /بانتظار رفع المقاول لصورة المعالجة/);
});

test('visual distortion grid humanizes technical type and coordinate presentation', () => {
  assert.match(runtime, /MAINTENANCE:'صيانة'/);
  assert.match(runtime, /cell\(typeLabel\(o\.type\|\|o\.title\)/);
  assert.match(runtime, /cell\(locationLabel\(o\)/);
  assert.match(runtime, /موقع GPS موثّق/);
});
