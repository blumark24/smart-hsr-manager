'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'manager.html'), 'utf8');

test('Phase21 keeps Administrative Affairs and Contracts inside the Municipality Manager shell', () => {
  assert.doesNotMatch(source, /href=["']admin-affairs\.html["']/);
  assert.doesNotMatch(source, /href=["']contractors-registry\.html["']/);
  assert.doesNotMatch(source, /window\.location\.href\s*=\s*["']admin-affairs\.html["']/);
  assert.doesNotMatch(source, /window\.location\.href\s*=\s*["']contractors-registry\.html["']/);
  assert.match(source, /data-manager-view="adminAffairs"/);
  assert.match(source, /data-manager-view="contracts"/);
  assert.match(source, /viewIsAdminAffairs: st\.view === 'adminAffairs'/);
  assert.match(source, /viewIsContracts: st\.view === 'contracts'/);
});

test('Phase21 renders Reports and Observations as first-class main views, not the shared modal', () => {
  assert.match(source, /<sc-if value="{{ viewIsObservations }}">[\s\S]*aria-label="سجل البلاغات"/);
  assert.match(source, /<sc-if value="{{ viewIsReports }}">[\s\S]*aria-label="التقارير التشغيلية"/);
  const viewOpenLine = source.match(/viewOpen:\s*[^\n]+/)?.[0] || '';
  assert.match(viewOpenLine, /st\.view !== 'observations'/);
  assert.match(viewOpenLine, /st\.view !== 'reports'/);
  assert.match(source, /viewIsHomeContent:[^\n]+st\.view !== 'observations'[^\n]+st\.view !== 'reports'/);
});

test('Phase21 Manager institutional views reuse existing trusted Admin API actions', () => {
  assert.match(source, /callAdminUsersApi\('getManagerAdministrativeAffairsOverview', \{\}\)/);
  assert.match(source, /callAdminUsersApi\('listFieldContractorCompanies', \{\}\)/);
  assert.match(source, /openAdminAffairs\(e\)/);
  assert.match(source, /openContracts\(e\)/);
  assert.match(source, /adminAffairs:\s*\(\) => this\.openAdminAffairs\(\)/);
  assert.match(source, /contracts:\s*\(\) => this\.openContracts\(\)/);
});

test('Phase21.1 contracts view keeps mutations inside the trusted Manager shell', () => {
  const start = source.indexOf('<sc-if value="{{ viewIsContracts }}">');
  const end = source.indexOf('<!-- PHASE13D.1 — User Center', start);
  const block = source.slice(start, end);
  assert.ok(block.length > 0);
  assert.match(block, /تعديل/);
  assert.match(block, /أرشفة/);
  assert.match(block, /حذف/);
  assert.match(source, /callAdminUsersApi\('updateFieldContractorCompany'/);
  assert.match(source, /archiveFieldContractorCompany/);
  assert.match(source, /deleteFieldContractorCompany/);
  assert.match(block, /سجل إشرافي داخل لوحة مدير البلدية/);
});
