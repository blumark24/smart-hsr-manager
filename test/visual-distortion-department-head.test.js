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
