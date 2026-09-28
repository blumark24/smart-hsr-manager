'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const enhancements = read('manager-phase11d-user-center-enhancements.js');
const skin = read('manager-phase11g-user-center-approved-skin.js');

test('Phase 23 User Center presentation layers remain valid JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(enhancements, { filename: 'manager-phase11d-user-center-enhancements.js' }));
  assert.doesNotThrow(() => new vm.Script(skin, { filename: 'manager-phase11g-user-center-approved-skin.js' }));
});

test('KPI cards use the compact contractor-dashboard visual language', () => {
  assert.match(skin, /PHASE23 — USER CENTER VISUAL REFINEMENT/);
  assert.match(skin, /grid-template-columns:repeat\(6,minmax\(132px,156px\)\)/);
  assert.match(skin, /aspect-ratio:1\.38\/1/);
  assert.match(skin, /\.ucv2-kpi\[aria-pressed="true"\]/);
  assert.match(skin, /@media\(max-width:620px\)[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('filters expose visible labels without changing their data hooks', () => {
  for (const label of ['البحث', 'الحالة', 'الدور', 'الخدمة', 'القسم', 'أهلية المركبة']) {
    assert.match(enhancements, new RegExp(`<span>${label}<\\/span>`));
  }
  for (const filter of ['search', 'status', 'role', 'product', 'department', 'vehicle']) {
    assert.match(enhancements, new RegExp(`data-filter="${filter}"`));
  }
  assert.match(enhancements, /data-reset-filters/);
  assert.match(enhancements, /data-quick/);
});

test('table polish preserves RTL actions and Day/Night parity', () => {
  assert.match(skin, /\.ucv2-table thead th\{[^}]*text-align:start/);
  assert.match(skin, /\.ucv2-table tbody tr:nth-child\(even\)/);
  assert.match(skin, /\[data-theme="light"\] \.ucv2-kpi\{[^}]*background:linear-gradient\(135deg,var\(--kpi-start\),var\(--kpi-end\)\)/);
  assert.match(skin, /\[data-theme="light"\] \.ucv2-kpi-icon\{[^}]*background:rgba\(255,255,255,\.14\)/);
  assert.match(skin, /\[data-theme="light"\] \.ucv2-table thead th/);
  assert.match(skin, /\[data-theme="light"\] \.ucv2-mobile-card/);
  assert.match(skin, /@media\(max-width:1050px\)[\s\S]*nth-child\(8\)/);
  assert.doesNotMatch(skin.slice(skin.indexOf('PHASE23 — USER CENTER VISUAL REFINEMENT')), /\/api\/|firebase|firestore|fetch\s*\(/i);
});
