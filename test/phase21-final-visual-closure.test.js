'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');
const operationalMap = fs.readFileSync(path.join(root, 'operational-map.html'), 'utf8');

test('Phase21.1 visual system keeps Government Day depth and Digital Blue Night', () => {
  assert.match(manager, /linear-gradient\(180deg,#e8efeb,#e4ece7\)/);
  const nightStart = manager.indexOf('NIGHT = {');
  const nightEnd = manager.indexOf('BP = {', nightStart);
  const night = manager.slice(nightStart, nightEnd);
  assert.match(night, /'--pgBg':[^\n]*#071a2f/);
  assert.match(night, /'--acc': '#34b7f1'/);
  assert.match(night, /'--btn': 'linear-gradient\(180deg,#1677ff,#0f5fce\)'/);
  assert.match(manager, /PHASE21\.1 EXECUTIVE VISUAL SYSTEM V2/);
  assert.match(manager, /id="phase21-final-visual-closure"/);
});

test('Manager map exposes real status-derived KPI filters and smart marker treatment', () => {
  assert.match(manager, /const mapStatusCounts = mappedSearchSet\.reduce/);
  assert.match(manager, /\{ id:'PENDING', label:'قيد الانتظار'/);
  assert.match(manager, /\{ id:'IN_PROGRESS', label:'قيد المعالجة'/);
  assert.match(manager, /\{ id:'COMPLETED', label:'مكتمل'/);
  assert.match(manager, /class="hsr-map-kpi-strip"/);
  assert.match(manager, /className:'hsr-map-kpi' \+ \(st\.mapFilter === k\.id \? ' is-active' : ''\)/);
  assert.match(manager, /hsr-exec-priority/);
  assert.match(manager, /priorityKey === 'CRITICAL'/);
});

test('Manager quick map popup uses theme-adaptive glass and keeps existing safe actions', () => {
  assert.match(manager, /className = 'hsr-map-popup-body'/);
  assert.match(manager, /hsr-map-popup-chip/);
  assert.match(manager, /hsr-map-popup-actions/);
  assert.match(manager, /this\.openEvidenceDrawer\(item\)/);
  assert.match(manager, /this\.openOperationalMapForObservation\(item\)/);
  assert.match(manager, /this\.openTwinForObservation\(item\)/);
  assert.doesNotMatch(manager, /innerHTML = .*item\.title/);
});

test('Canonical operational map uses the same glass popup language in Day and Night without touching clustering semantics', () => {
  assert.match(operationalMap, /backdrop-filter:blur\(22px\) saturate\(145%\)/);
  assert.match(operationalMap, /html\[data-theme="light"\] \.maplibregl-popup-content/);
  assert.match(operationalMap, /\.geo-marker\.selected:after/);
  assert.match(operationalMap, /clusterProperties: \{ severityMax: \['max', \['get', 'severityRank'\]\] \}/);
  assert.match(operationalMap, /getClusterExpansionZoom\(clusterId\)/);
  assert.match(operationalMap, /fitToLoadedData\(\)/);
});
