'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'field-head-runtime.js'), 'utf8');
const fieldHead = page + '\n' + runtime;
const usersApi = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

test('02C map renders only supported visual-distortion lifecycle states', () => {
  assert.match(fieldHead, /OPERATIONAL_STATUSES=new Set\(\["PENDING","IN_PROGRESS","PENDING_REVIEW","COMPLETED"\]\)/);
  assert.match(fieldHead, /OPERATIONAL_STATUSES\.has\(obs\.status\)/);
});

test('02C map requires verified GPS and valid corrected coordinates', () => {
  assert.match(fieldHead, /obs\.locationVerified===true/);
  assert.match(fieldHead, /Number\(obs&&obs\.correctedLat\)/);
  assert.match(fieldHead, /Number\(obs&&obs\.correctedLng\)/);
  assert.match(fieldHead, /Math\.abs\(lat\)>90/);
  assert.match(fieldHead, /Math\.abs\(lng\)>180/);
  assert.match(usersApi, /locationVerified: data\.locationVerified === true/);
  assert.match(usersApi, /locationAccuracyMeters:/);
});

test('02C map never invents observations and uses the existing observationId', () => {
  assert.match(fieldHead, /state\.observations\.filter/);
  assert.match(fieldHead, /showOperationalObservation\(obs\.observationId\)/);
  assert.match(fieldHead, /data\.observations/);
  assert.doesNotMatch(fieldHead, /demoObservation|fakeObservation|mockObservation/i);
});

test('map detail exposes operational identity and workflow fields', () => {
  assert.match(fieldHead, /رقم الحالة/);
  assert.match(fieldHead, /obs\.displayId/);
  assert.match(fieldHead, /المراقب/);
  assert.match(fieldHead, /obs\.assignedContractorName/);
  assert.match(fieldHead, /obs\.inspectorVerification/);
  assert.match(fieldHead, /قبل المعالجة/);
  assert.match(fieldHead, /بعد المعالجة/);
});

test('private before and after evidence resolve through the existing storage adapter', () => {
  assert.match(fieldHead, /resolveObservationImage/);
  assert.match(fieldHead, /role:"department_head"/);
  assert.match(fieldHead, /resolveMapEvidence\(obs\.imagePath\)/);
  assert.match(fieldHead, /resolveMapEvidence\(obs\.afterImagePath\)/);
});

test('dashboard capture and AI baseline is still present and not replaced by map work', () => {
  assert.match(dashboard, /id="processSmartInputBtn"/);
  assert.match(dashboard, /تحليل الصورة وإنشاء مسودة/);
  assert.match(dashboard, /id="fileUploadInput"/);
  assert.match(dashboard, /processSmartInput\(\)/);
});
