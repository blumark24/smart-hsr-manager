'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');

test('department head is a first-class login destination without changing manager/lands/field routes', () => {
  assert.match(login, /const hasDepartmentHeadRole = mobilityRole === 'department_head';/);
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

test('framework stays generic for future departments while preserving traffic compatibility', () => {
  assert.match(page, /id:"traffic"/);
  assert.match(page, /department:"إدارة حركة السير"/);
  assert.match(page, /id:"generic"/);
  assert.match(page, /product:"عمليات القسم"/);
});

test('no fabricated operational observation counts are rendered', () => {
  assert.match(page, /مؤشرات البلاغات\/الملاحظات الميدانية لن تُعرض كأرقام/);
  assert.doesNotMatch(page, /fake|demo data|بيانات تجريبية/i);
});


test('department head framework includes a real basemap map surface without fabricated operational markers', () => {
  assert.match(page, /id="departmentMapMini"/);
  assert.match(page, /id="departmentMapFull"/);
  assert.match(page, /tile\.openstreetmap\.org/);
  assert.match(page, /server\.arcgisonline\.com/);
  assert.match(page, /لا توجد نقاط أو مواقع تجريبية/);
  assert.doesNotMatch(page, /new maplibregl\.Marker/);
});
