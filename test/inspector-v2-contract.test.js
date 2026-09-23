'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'inspector-v2.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'inspector-v2.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'inspector-v2.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'inspector-v2-runtime.js'), 'utf8');

test('Inspector V2 stays isolated from legacy dashboard', () => {
  assert.match(html, /inspector-v2\.css/);
  assert.match(html, /inspector-v2-runtime\.js/);
  assert.doesNotMatch(html, /dashboard\.html[^"']*stylesheet/);
});

test('Inspector V2 has dual themes and two map experiences', () => {
  assert.match(html, /data-map-view="operational"/);
  assert.match(html, /data-map-view="twin"/);
  assert.match(html, /id="themeToggleBtn"/);
  assert.match(css, /:root\[data-theme="light"\]/);
  assert.match(js, /smartHSRInspectorTheme/);
});

test('Inspector V2 runtime is fail-closed and read-only', () => {
  assert.match(runtime, /data\.role !== 'inspector'/);
  assert.match(runtime, /data\.active === false/);
  assert.match(runtime, /where\('organizationId', '==', verified\.organizationId\)/);
  assert.match(runtime, /where\('createdByUid', '==', verified\.uid\)/);
  assert.match(runtime, /snapshot\.metadata\.fromCache/);
  assert.doesNotMatch(runtime, /setDoc\(|updateDoc\(|addDoc\(|deleteDoc\(/);
});

test('Inspector V2 renders only verified map coordinates and evidence', () => {
  assert.match(runtime, /observationCoordinates\(item, organizationId\)/);
  assert.match(runtime, /resolveObservationImage/);
  assert.match(runtime, /statusMarkerIcon/);
  assert.match(runtime, /openVerifiedMap/);
});


test('Inspector V2 reference composition keeps map tools on the edge and twin stats real', () => {
  assert.match(html, /class="employee-card"/);
  assert.match(html, /id="routeMissionBtn"/);
  assert.match(html, /id="twinOpenCount"/);
  assert.match(html, /id="twinProgressCount"/);
  assert.match(html, /id="twinClosedCount"/);
  assert.match(js, /setTwinStats/);
  assert.match(runtime, /ui\?\.setTwinStats\(observations\)/);
});

test('Inspector V2 exposes four compact field quick actions', () => {
  assert.match(html, /إضافة صورة/);
  assert.match(html, /ملاحظة/);
  assert.match(html, /رصد سريع/);
  assert.match(html, /مسح الموقع/);
});
