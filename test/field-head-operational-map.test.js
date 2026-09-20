'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
const usersApi = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

test('02C map renders only supported visual-distortion lifecycle states', () => {
  assert.match(page, /OPERATIONAL_STATUSES=new Set\(\["PENDING","IN_PROGRESS","PENDING_REVIEW","COMPLETED"\]\)/);
  assert.match(page, /OPERATIONAL_STATUSES\.has\(obs\.status\)/);
});

test('02C map requires verified GPS and valid corrected coordinates', () => {
  assert.match(page, /obs\.locationVerified===true/);
  assert.match(page, /Number\(obs&&obs\.correctedLat\)/);
  assert.match(page, /Number\(obs&&obs\.correctedLng\)/);
  assert.match(page, /Math\.abs\(lat\)>90/);
  assert.match(page, /Math\.abs\(lng\)>180/);
  assert.match(usersApi, /locationVerified: data\.locationVerified === true/);
  assert.match(usersApi, /locationAccuracyMeters:/);
});

test('02C map never invents observations and uses the existing observationId', () => {
  assert.match(page, /state\.observations\.filter/);
  assert.match(page, /showOperationalObservation\(obs\.observationId\)/);
  assert.match(page, /data\.observations/);
  assert.doesNotMatch(page, /demoObservation|fakeObservation|mockObservation/i);
});

test('map detail exposes operational identity and workflow fields', () => {
  assert.match(page, /رقم الحالة/);
  assert.match(page, /obs\.displayId/);
  assert.match(page, /المراقب/);
  assert.match(page, /obs\.assignedContractorName/);
  assert.match(page, /obs\.inspectorVerification/);
  assert.match(page, /قبل المعالجة/);
  assert.match(page, /بعد المعالجة/);
});

test('private before and after evidence resolve through the existing storage adapter', () => {
  assert.match(page, /resolveObservationImage/);
  assert.match(page, /role:"department_head"/);
  assert.match(page, /resolveMapEvidence\(obs\.imagePath\)/);
  assert.match(page, /resolveMapEvidence\(obs\.afterImagePath\)/);
});

test('dashboard capture and AI baseline is still present and not replaced by map work', () => {
  assert.match(dashboard, /id="processSmartInputBtn"/);
  assert.match(dashboard, /تحليل الصورة وإنشاء مسودة/);
  assert.match(dashboard, /id="fileUploadInput"/);
  assert.match(dashboard, /processSmartInput\(\)/);
});
