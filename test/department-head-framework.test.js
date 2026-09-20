'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'field-head-runtime.js'), 'utf8');
const fieldHead = page + '\n' + runtime;

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
  assert.match(fieldHead, /Object\.prototype\.hasOwnProperty\.call\(data,"mobilityAccess"\)/);
  assert.match(fieldHead, /mobilityRole!=="department_head"/);
  assert.match(fieldHead, /data\.active===false/);
  assert.match(fieldHead, /!org\|\|!department/);
  assert.match(fieldHead, /location\.replace\("login\.html"\)/);
});

test('department head framework reads only the existing department-scoped employee registry list action', () => {
  assert.match(fieldHead, /fetch\("\/api\/admin\/employees"/);
  assert.match(fieldHead, /action:"list",organizationId:state\.context\.organizationId/);
  assert.doesNotMatch(fieldHead, /action:"(?:create|activateAccount|setAccountStatus|assignProducts|transfer|updateProfile|changeLoginEmail)"/);
  assert.doesNotMatch(fieldHead, /\b(?:setDoc|addDoc|updateDoc|deleteDoc)\s*\(/);
});

test('field survey starts with visual distortion as the first dynamic product', () => {
  assert.match(fieldHead, /department:"إدارة الحصر الميداني"/);
  assert.match(fieldHead, /product:"التشوه البصري"/);
  assert.match(fieldHead, /["']الرصد["']/);
  assert.match(fieldHead, /["']التوثيق["']/);
  assert.match(fieldHead, /["']المعالجة["']/);
  assert.match(fieldHead, /["']التحقق["']/);
});

test('department head command center is field-survey specific and does not impersonate Mobility ownership', () => {
  assert.match(fieldHead, /function isFieldSurveyDepartment\(department\)/);
  assert.match(fieldHead, /if\(!state\.profile\)/);
  assert.doesNotMatch(fieldHead, /id:"traffic"/);
  assert.doesNotMatch(fieldHead, /product:"عمليات القسم"/);
  assert.match(fieldHead, /الحركة الميدانية لموظفي القسم/);
  assert.match(fieldHead, /إدارة الأسطول والصلاحيات التنفيذية لدى الجهات المختصة/);
  assert.match(fieldHead, /إدارة حركة السير/);
  assert.match(fieldHead, /اختيار المركبة وتخصيصها للموظف والمهمة/);
  assert.match(fieldHead, /لا توجد مركبات أو طلبات وهمية/);
  assert.match(fieldHead, /اعتماد وإرسال للشؤون الإدارية/);
  assert.match(fieldHead, /action:"submitMissionForApproval"/);
});

test('operational observation counts come only from the trusted visual-distortion command', () => {
  assert.match(fieldHead, /action:"getFieldVisualDistortionCommand"/);
  assert.match(fieldHead, /const visualCounts=/);
  assert.match(fieldHead, /observations\.filter\(x=>x\.status==="PENDING"\)/);
  assert.doesNotMatch(fieldHead, /fake|demo data|بيانات تجريبية/i);
});


test('department head framework includes a real basemap and observation-backed operational markers only', () => {
  assert.match(fieldHead, /id="departmentMapFull"/);
  assert.match(fieldHead, /tile\.openstreetmap\.org/);
  assert.match(fieldHead, /server\.arcgisonline\.com/);
  assert.match(fieldHead, /لا توجد نقاط تجريبية أو بيانات مكانية مصطنعة/);
  assert.match(fieldHead, /trustedOperationalObservations\(\)/);
  assert.match(fieldHead, /new maplibregl\.Marker/);
  assert.match(fieldHead, /showOperationalObservation\(obs\.observationId\)/);
});


test('preview runtime keeps the approved MapLibre visual baseline without escaped script artifacts', () => {
  const preview = fs.readFileSync(path.join(root, 'department-head-preview.html'), 'utf8');
  assert.doesNotMatch(preview, /\\ninitializePreviewMaps\(\);/);
  assert.match(preview, /new maplibregl\.Map/);
  assert.match(preview, /server\.arcgisonline\.com/);
});
