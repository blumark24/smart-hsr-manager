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

test('field survey department head remains a first-class login destination', () => {
  assert.match(login, /const hasDepartmentHeadRole = mobilityRole === 'department_head';/);
  assert.match(login, /const hasFieldDepartmentHeadRole = hasDepartmentHeadRole/);
  assert.match(login, /\/الحصر\|ميداني\|field\/i\.test\(department\)/);
  assert.match(login, /window\.location\.href = 'department-head\.html'/);
  assert.match(login, /window\.location\.href = 'mobile-map\.html'/);
  assert.match(login, /window\.location\.href = 'manager\.html'/);
  assert.match(login, /window\.location\.href = 'dashboard\.html'/);
});

test('canonical premium board delegates authentication to a fail-closed field runtime', () => {
  assert.match(page, /field-head-runtime\.js/);
  assert.match(runtime, /data\.active === false/);
  assert.match(runtime, /role !== 'department_head'/);
  assert.match(runtime, /!\/الحصر\|ميداني\|field\/i\.test\(dept\)/);
  assert.match(runtime, /!data\.organizationId/);
  assert.match(runtime, /location\.replace\('login\.html'\)/);
});

test('field runtime reads employee registry and visual command only through trusted APIs', () => {
  assert.match(runtime, /fetch\('\/api\/admin\/employees'/);
  assert.match(runtime, /action:'list'/);
  assert.match(runtime, /api\('getFieldVisualDistortionCommand'\)/);
  assert.match(runtime, /api\('listDepartmentMissions'\)/);
  assert.doesNotMatch(fieldHead, /\b(?:setDoc|addDoc|updateDoc|deleteDoc)\s*\(/);
});

test('approved command board is now the canonical department-head UI', () => {
  assert.match(page, /class="dh-command-bar"/);
  assert.match(page, /class="dh-sidebar"/);
  assert.match(page, /class="dh-operational-grid"/);
  assert.match(page, /id="deptRealMap"/);
  assert.match(page, /SMART HSR · FIELD SURVEY/);
  assert.match(page, /مركز قيادة القسم/);
  assert.match(page, /التشوه البصري/);
});

test('field command center derives KPIs from live canonical observations', () => {
  assert.match(runtime, /liveObservations/);
  assert.match(runtime, /function workflowPhase\(o\)/);
  assert.match(runtime, /countPhase\('assigned'\)/);
  assert.match(runtime, /countPhase\('progress'\)/);
  assert.match(runtime, /countPhase\('review'\)/);
  assert.match(runtime, /countPhase\('completed'\)/);
  assert.match(runtime, /getFieldVisualDistortionCommand/);
  assert.doesNotMatch(fieldHead, /fakeObservation|mockObservation|demoObservation/i);
});

test('canonical board keeps a real satellite basemap and trusted observation markers', () => {
  assert.match(page, /server\.arcgisonline\.com/);
  assert.match(runtime, /trustedObservations\(instance\)/);
  assert.match(runtime, /o\.locationVerified === true/);
  assert.match(runtime, /new maplibregl\.Marker/);
  assert.match(runtime, /openFieldObservation\(o\.observationId\)/);
  assert.match(runtime, /liveObservations \|\| \[\]/);
});

test('preview reference remains available as the approved visual baseline', () => {
  const preview = fs.readFileSync(path.join(root, 'department-head-preview.html'), 'utf8');
  assert.match(preview, /class="dh-command-bar"/);
  assert.match(preview, /id="deptRealMap"/);
  assert.match(preview, /server\.arcgisonline\.com/);
});
