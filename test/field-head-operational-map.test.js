'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'field-head-runtime.js'), 'utf8');
const usersApi = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

test('02C approved map renders only supported visual-distortion lifecycle states', () => {
  assert.match(runtime, /new Set\(\['PENDING','IN_PROGRESS','PENDING_REVIEW','COMPLETED'\]\)/);
  assert.match(runtime, /allowed\.has\(o\.status\)/);
});

test('02C map requires verified GPS and valid corrected coordinates', () => {
  assert.match(runtime, /o\.locationVerified === true/);
  assert.match(runtime, /Number\(o\.correctedLat\)/);
  assert.match(runtime, /Number\(o\.correctedLng\)/);
  assert.match(runtime, /Math\.abs\(lat\) > 90/);
  assert.match(runtime, /Math\.abs\(lng\) > 180/);
  assert.match(usersApi, /locationVerified: data\.locationVerified === true/);
});

test('02C map uses the canonical observationId and never invents observation markers', () => {
  assert.match(runtime, /instance\.state\.liveObservations \|\| \[\]/);
  assert.match(runtime, /openFieldObservation\(o\.observationId\)/);
  assert.match(runtime, /liveObservations:/);
  assert.doesNotMatch(page + runtime, /demoObservation|fakeObservation|mockObservation/i);
});

test('observation detail exposes identity, workflow and before-after evidence', () => {
  assert.match(runtime, /رقم الحالة/);
  assert.match(runtime, /o\.displayId \|\| o\.observationId/);
  assert.match(runtime, /المراقب/);
  assert.match(runtime, /o\.assignedContractorName/);
  assert.match(runtime, /o\.inspectorVerification/);
  assert.match(runtime, /قبل المعالجة/);
  assert.match(runtime, /بعد المعالجة/);
});

test('private evidence resolves through the trusted storage adapter using department_head context', () => {
  assert.match(runtime, /resolveObservationEvidence/);
  assert.match(runtime, /import\('\.\/storage-adapter\.js'\)/);
  assert.match(runtime, /role:'department_head'/);
  assert.match(runtime, /organizationId:state\.organizationId/);
});

test('dashboard capture and AI baseline remains untouched by canonical map work', () => {
  assert.match(dashboard, /id="processSmartInputBtn"/);
  assert.match(dashboard, /تحليل الصورة وإنشاء مسودة/);
  assert.match(dashboard, /id="fileUploadInput"/);
  assert.match(dashboard, /processSmartInput\(\)/);
});
