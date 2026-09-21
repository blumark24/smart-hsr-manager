'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'manager-lands-adapter.js'), 'utf8');

test('Lands GIS uses verified geometry only', () => {
  assert.match(adapter, /geometryPositions\(parcel\.spatial\.geometry\)/);
  assert.match(adapter, /validLngLat/);
  assert.match(adapter, /buildGisFeatures/);
  assert.doesNotMatch(adapter, /fake|fabricated.*marker/i);
});

test('Lands GIS rejects out-of-Saudi coordinate envelopes', () => {
  assert.match(adapter, /lng >= 34 && lng <= 56\.5/);
  assert.match(adapter, /lat >= 16 && lat <= 33\.5/);
});

test('Manager renders trusted GIS state and honest no-geometry fallback', () => {
  assert.ok(manager.includes('GIS · بيانات موثّقة فقط'));
  assert.ok(manager.includes('لا توجد هندسة مكانية موثّقة للقطع الحالية'));
  assert.ok(manager.includes('لن يعرض SMART HSR أي نقطة أو قطعة تقديرية'));
  assert.match(manager, /landsHasGisFeatures/);
  assert.match(manager, /landsNoGisFeatures/);
});

test('GIS selection links back to the exact digital record', () => {
  assert.match(manager, /landsSelectedId: f\.grantId, landsScreen: 'file'/);
});
