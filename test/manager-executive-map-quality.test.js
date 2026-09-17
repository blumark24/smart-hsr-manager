'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'manager.html'), 'utf8');

test('Executive Map controls render above Leaflet panes instead of disappearing behind the basemap', () => {
  assert.match(source, /\.hsr-manager-map-overlay\{z-index:800!important\}/);
  assert.match(source, /class="hsr-manager-map-shell"/);
  assert.match(source, /class="hsr-manager-map-canvas"/);
  assert.match(source, /المشهد المكاني التنفيذي/);
});

test('Executive Map has honest Street/Satellite switching and a canonical Operational Map handoff', () => {
  assert.match(source, /mapBasemap: 'street'/);
  assert.match(source, /World_Imagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}/);
  assert.match(source, /setExecutiveBasemap\(next\)/);
  assert.match(source, /فتح الخريطة التشغيلية الكاملة/);
  assert.match(source, /openCanonicalOperationalMap\(\)/);
  assert.match(source, /openOperationalMapForObservation\(null\)/);
});

test('Executive Map uses professional pins and a city-scale camera for one verified point', () => {
  assert.match(source, /L\.divIcon\(/);
  assert.match(source, /className: 'hsr-exec-marker'/);
  assert.match(source, /if \(bounds\.length === 1\) this\._opMap\.setView\(bounds\[0\], 15/);
  assert.match(source, /else if \(bounds\.length > 1\) this\._opMap\.fitBounds/);
  assert.doesNotMatch(source, /employeeTracking|vehicleGpsMarkers|fabricatedMapPins/);
});

test('Executive Map remains lightweight and separate from the canonical MapLibre Operational Map and Digital Twin', () => {
  assert.match(source, /L\.map\(this\.mapEl/);
  assert.match(source, /buildContinuityUrl\('\/operational-map\.html'/);
  assert.match(source, /buildContinuityUrl\('\/twin\.html'/);
  assert.doesNotMatch(source, /new maplibregl\.Map\(/);
});
