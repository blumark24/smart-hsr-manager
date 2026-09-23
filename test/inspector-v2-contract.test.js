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
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

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


test('Inspector V2 mission evidence remains lazy and user initiated', () => {
  assert.match(html, /id="missionSheet"/);
  assert.match(html, /id="missionBeforeImage"/);
  assert.match(html, /id="missionAfterImage"/);
  assert.match(js, /smart-hsr:mission-open/);
  assert.match(runtime, /loadMissionEvidence/);
  assert.match(runtime, /Evidence stays lazy/);
  assert.doesNotMatch(runtime, /resolveMissionImage\(user, verified, active\)/);
});

test('Inspector V2 real AI uses the existing authenticated advisory endpoint', () => {
  assert.match(html, /id="runVisionAnalysisBtn"/);
  assert.match(html, /id="missionRunAiBtn"/);
  assert.match(runtime, /fetchWithFirebaseAuth/);
  assert.match(runtime, /input: '\/api\/ai\/analyze'/);
  assert.match(runtime, /observationId: observation\.docId/);
  assert.match(js, /requires.*review|يتطلب مراجعة|مراجعة واعتماد/);
});


test('Inspector V2 full-screen map has honest marker interaction surfaces', () => {
  assert.match(html, /id="closeExpandedMapBtn"/);
  assert.match(html, /id="mapMarkerSheet"/);
  assert.match(html, /id="openMapMarkerDetailBtn"/);
  assert.match(html, /id="focusMapMarkerBtn"/);
  assert.match(css, /body\.map-expanded \.expanded-map-chrome\{display:flex\}/);
  assert.match(js, /setSelectedMapObservation/);
  assert.match(runtime, /smart-hsr:map-observation-select/);
});

test('Map marker details are observation-backed and do not fabricate road routing', () => {
  assert.match(js, /observation\.coords/);
  assert.match(js, /focusSelectedMapObservation/);
  assert.doesNotMatch(js, /routeGeometry|fakeRoute|mockRoute/);
});


test('Inspector V2 motion polish is accessibility-aware', () => {
  assert.match(css, /--motion-base:/);
  assert.match(css, /@keyframes smartHsrMapExpand/);
  assert.match(css, /@keyframes smartHsrSheetIn/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /animation:none!important/);
});


test('Inspector V2 capture routes into the protected legacy capture engine', () => {
  assert.match(html, /id="quickCaptureBtn"/);
  assert.match(html, /id="quickObservationBtn"/);
  assert.match(html, /id="dockCaptureBtn"/);
  assert.match(js, /dashboard\.html\?capture=v2&theme=/);
  assert.match(dashboard, /V2_CAPTURE_MODE/);
  assert.match(dashboard, /window\.openModal\('smartInputModal'\)/);
  assert.match(dashboard, /window\.getLocation\(\)/);
  assert.match(dashboard, /uploadImageToStorage/);
  assert.match(dashboard, /window\.processSmartInput = async function/);
});

test('Inspector V2 does not duplicate protected camera upload or GPS capture logic', () => {
  assert.doesNotMatch(js, /uploadImageToStorage|navigator\.mediaDevices|getUserMedia/);
  assert.doesNotMatch(runtime, /uploadImageToStorage|navigator\.mediaDevices|getUserMedia/);
  assert.match(dashboard, /body\.v2-capture-shell/);
});


test('Mission detail actions stay bound to the exact map-selected observation', () => {
  assert.match(js, /detailObservation: null/);
  assert.match(js, /state\.detailObservation = observation/);
  assert.match(js, /routeDetailObservation/);
  assert.match(js, /const observation = state\.detailObservation \|\| state\.activeMission/);
  assert.doesNotMatch(js, /missionSheetRouteBtn'\)\?\.addEventListener\('click', routeToMission/);
});


test('Mission route reveals the full-screen map before routing', () => {
  assert.match(js, /function routeDetailObservation\(\)/);
  assert.match(js, /closeMissionDetail\(\)/);
  assert.match(js, /if \(!document\.body\.classList\.contains\('map-expanded'\)\) toggleMapExpanded\(\)/);
  assert.match(js, /setSelectedMapObservation\(observation\)/);
  assert.match(js, /routeObservation\(observation\)/);
});


test('Inspector V2 GPS watcher is single-instance and cleaned up', () => {
  assert.match(js, /locationWatchId: null/);
  assert.match(js, /if \(state\.locationWatchId !== null\) return/);
  assert.match(js, /navigator\.geolocation\.clearWatch\(state\.locationWatchId\)/);
  assert.match(js, /pagehide', clearLiveLocationWatch/);
});

test('Inspector V2 overlays share one body scroll-lock authority and Escape closes one layer at a time', () => {
  assert.match(js, /function syncBodyScrollLock\(\)/);
  assert.match(js, /document\.body\.style\.overflow = locked \? 'hidden' : ''/);
  assert.match(js, /closeMissionDetail\(\); return;/);
  assert.match(js, /closeAnalysis\(\); return;/);
  assert.match(js, /closeMapMarkerSheet\(\); return;/);
});
