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
  assert.match(runtime, /Number\(o\?\.correctedLat\)/);
  assert.match(runtime, /Number\(o\?\.correctedLng\)/);
  assert.match(runtime, /Math\.abs\(rawLat\) <= 90/);
  assert.match(runtime, /Math\.abs\(rawLng\) <= 180/);
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


test('02C map rejects coordinates outside the Saudi municipal service envelope', () => {
  assert.match(runtime, /lat >= 16 && lat <= 33\.5/);
  assert.match(runtime, /lng >= 34 && lng <= 56\.5/);
  assert.match(runtime, /inSaudiEnvelope/);
});

test('map empty state and legend derive from the same trusted observation set', () => {
  assert.match(runtime, /out\.showMapEmpty=trusted\.length===0/);
  assert.match(runtime, /const trusted=trustedObservations\(instance\)/);
  assert.match(runtime, /\{label:'جديدة',col:'#ef4444'\}/);
  assert.match(runtime, /\{label:'مغلقة',col:'#7d8ea6'\}/);
});

test('department map suppresses fleet schematic semantics and fake pins', () => {
  assert.match(runtime, /vals\.mapPins=\[\]/);
  assert.match(runtime, /vals\.zoneLabels=\[\]/);
  assert.match(runtime, /بلاغات التشوه البصري الموثقة/);
  assert.match(runtime, /vals\.layerCount='1\/1'/);
  assert.match(runtime, /بلاغ موثق على الخريطة/);
});


test('refresh repaints trusted markers after live command payload arrives', () => {
  assert.match(runtime, /requestAnimationFrame\(\(\) => renderObservationMarkers\(component\)\)/);
});

test('map supports read-only recovery for legacy swapped Saudi coordinates without mutating observations', () => {
  assert.match(runtime, /function observationMapPoint\(o\)/);
  assert.match(runtime, /swapped_read_recovery/);
  assert.match(runtime, /_mapLat:point\.lat/);
  assert.match(runtime, /_mapLng:point\.lng/);
  assert.match(runtime, /setLngLat\(\[Number\(o\._mapLng\),Number\(o\._mapLat\)\]\)/);
});


test('command-center map keeps municipal focus on newest trusted observation instead of fitting distant history', () => {
  assert.match(runtime, /const newest = observations\[0\]/);
  assert.match(runtime, /_fieldObservationFocusKey/);
  assert.match(runtime, /map\.jumpTo\(\{/);
  assert.match(runtime, /zoom:15/);
  assert.doesNotMatch(runtime, /map\.fitBounds\(bounds/);
});

test('command-center embedded map empty state follows the same trusted observation set', () => {
  assert.match(runtime, /screen === 'map' \|\| screen === 'deptops'/);
  assert.match(runtime, /vals\.showMapEmpty=trusted\.length===0/);
  assert.match(runtime, /instance\.state\.screen === 'map' \|\| instance\.state\.screen === 'deptops'/);
});


test('SMART HSR branded MAPS and TWIN modes are real map products', () => {
  assert.match(html, /SMART HSR MAPS/);
  assert.match(html, /الخريطة البلدية التشغيلية/);
  assert.match(html, /SMART HSR TWIN/);
  assert.match(html, /التوأم البلدي الرقمي/);
  assert.match(html, /data-map-mode="{{ mapMode }}"/);
});

test('MAPS uses street basemap while TWIN uses satellite with real 2.5D camera', () => {
  assert.match(html, /tile\.openstreetmap\.org/);
  assert.match(html, /server\.arcgisonline\.com/);
  assert.match(html, /map\.setLayoutProperty\('street', 'visibility'/);
  assert.match(html, /map\.setLayoutProperty\('satellite', 'visibility'/);
  assert.match(html, /pitch: twin \? 48 : 0/);
  assert.match(html, /bearing: twin \? -14 : 0/);
});

test('map chrome keeps controls on edges across desktop tablet and mobile', () => {
  assert.match(html, /@media\(min-width:1180px\)/);
  assert.match(html, /@media\(min-width:761px\) and \(max-width:1179px\)/);
  assert.match(html, /@media\(max-width:760px\)/);
  assert.match(html, /dh-map-product-btn/);
  assert.match(html, /dh-map-toolbar/);
  assert.match(html, /dh-map-search-stack/);
  assert.match(html, /dh-map-legend/);
});
