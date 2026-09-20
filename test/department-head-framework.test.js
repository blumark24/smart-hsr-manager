'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');

test('field survey department head is a first-class login destination without changing manager/lands/field routes', () => {
  assert.match(login, /const hasDepartmentHeadRole = mobilityRole === 'department_head';/);
  assert.match(login, /const hasFieldDepartmentHeadRole = hasDepartmentHeadRole/);
  assert.match(login, /\/الحصر\|ميداني\|field\/i\.test\(department\)/);
  assert.match(login, /window\.location\.href = 'department-head\.html'/);
  assert.match(login, /window\.location\.href = 'mobile-map\.html'/);
  assert.match(login, /window\.location\.href = 'manager\.html'/);
  assert.match(login, /window\.location\.href = 'dashboard\.html'/);
  assert.match(login, /landsUrl\.searchParams\.set\('code', handoffCode\)/);
});

test('department head framework fails closed on the existing canonical department_head role', () => {
  assert.match(page, /Object\.prototype\.hasOwnProperty\.call\(data,"mobilityAccess"\)/);
  assert.match(page, /mobilityRole!=="department_head"/);
  assert.match(page, /data\.active===false/);
  assert.match(page, /!org\|\|!department/);
  assert.match(page, /location\.replace\("login\.html"\)/);
});

test('department head framework reads only the existing department-scoped employee registry list action', () => {
  assert.match(page, /fetch\("\/api\/admin\/employees"/);
  assert.match(page, /action:"list",organizationId:state\.context\.organizationId/);
  assert.doesNotMatch(page, /action:"(?:create|activateAccount|setAccountStatus|assignProducts|transfer|updateProfile|changeLoginEmail)"/);
  assert.doesNotMatch(page, /\b(?:setDoc|addDoc|updateDoc|deleteDoc)\s*\(/);
});

test('field survey starts with visual distortion as the first dynamic product', () => {
  assert.match(page, /department:"إدارة الحصر الميداني"/);
  assert.match(page, /product:"التشوه البصري"/);
  assert.match(page, /["']الرصد["']/);
  assert.match(page, /["']التوثيق["']/);
  assert.match(page, /["']المعالجة["']/);
  assert.match(page, /["']التحقق["']/);
});

test('department head command center is field-survey specific and does not impersonate Mobility ownership', () => {
  assert.match(page, /function isFieldSurveyDepartment\(department\)/);
  assert.match(page, /if\(!state\.profile\)/);
  assert.doesNotMatch(page, /id:"traffic"/);
  assert.doesNotMatch(page, /product:"عمليات القسم"/);
  assert.match(page, /الحركة الميدانية لموظفي القسم/);
  assert.match(page, /إدارة الأسطول والصلاحيات التنفيذية لدى الجهات المختصة/);
  assert.match(page, /إدارة حركة السير/);
  assert.match(page, /اختيار المركبة وتخصيصها للموظف والمهمة/);
  assert.match(page, /لا توجد مركبات أو طلبات وهمية/);
  assert.match(page, /اعتماد وإرسال للشؤون الإدارية/);
  assert.match(page, /action:"submitMissionForApproval"/);
});

test('operational observation counts come only from the trusted visual-distortion command', () => {
  assert.match(page, /action:"getFieldVisualDistortionCommand"/);
  assert.match(page, /const visualCounts=/);
  assert.match(page, /observations\.filter\(x=>x\.status==="PENDING"\)/);
  assert.doesNotMatch(page, /fake|demo data|بيانات تجريبية/i);
});


test('department head framework includes a real basemap and observation-backed operational markers only', () => {
  assert.match(page, /id="departmentMapFull"/);
  assert.match(page, /tile\.openstreetmap\.org/);
  assert.match(page, /server\.arcgisonline\.com/);
  assert.match(page, /لا توجد نقاط تجريبية أو بيانات مكانية مصطنعة/);
  assert.match(page, /trustedOperationalObservations\(\)/);
  assert.match(page, /new maplibregl\.Marker/);
  assert.match(page, /showOperationalObservation\(obs\.observationId\)/);
});


test('preview runtime keeps the approved MapLibre visual baseline without escaped script artifacts', () => {
  const preview = fs.readFileSync(path.join(root, 'department-head-preview.html'), 'utf8');
  assert.doesNotMatch(preview, /\\ninitializePreviewMaps\(\);/);
  assert.match(preview, /new maplibregl\.Map/);
  assert.match(preview, /server\.arcgisonline\.com/);
});
