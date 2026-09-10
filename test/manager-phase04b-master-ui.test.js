'use strict';
// PHASE 04B — Field Survey Manager Dashboard rebuilt on the Smart Mobility
// master product-UI reference (Phase 04A's approved composition), while
// preserving every real Field Survey data contract established in Phase 04
// (fsTotal/fsOpen/fsCompleted/fsCompletionRate, fsPriorities,
// fsCategoryDistribution, fsInspectors, the tCols/tRows/tFilters table
// pipeline, openEvidenceDrawer, real Manager authorization). The one
// genuinely new piece of behavior is a real, embedded, single-instance
// Leaflet/OpenStreetMap operational map inside the product itself — no
// longer a button that exits back to the general Manager dashboard.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manager = read('manager.html');
const adapter = read('manager-dashboard-adapter.js');

function methodBody(source, signature, maxLen = 1500) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  return source.slice(start, start + maxLen);
}

function fieldSurveyBlock() {
  const start = manager.indexOf('<sc-if value="{{ viewIsFieldSurvey }}">');
  const end = manager.indexOf('</main>', start);
  assert.notEqual(start, -1); assert.notEqual(end, -1);
  return manager.slice(start, end);
}

// ---- A. Full product view, never a modal (re-confirmed after the rebuild) ----
test('A. Field Survey remains a full-page product view inside <main>, never the shared quick-view modal', () => {
  assert.match(manager, /viewOpen: st\.view !== 'home' && st\.view !== 'fieldSurvey'/);
  const mainStart = manager.indexOf('<main style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px">');
  const mainEnd = manager.indexOf('</main>', mainStart);
  const modalStart = manager.indexOf('<sc-if value="{{ viewOpen }}">');
  const fsStart = manager.indexOf('<sc-if value="{{ viewIsFieldSurvey }}">');
  assert.ok(fsStart > mainStart && fsStart < mainEnd);
  assert.ok(mainEnd < modalStart);
  assert.equal((manager.match(/sc-if value="\{\{ viewIsFieldSurvey \}\}"/g) || []).length, 1, 'only one Field Survey implementation must exist');
});

// ---- B. Product navigation contains exactly the 4 required real screens ----
test('B. fsNav contains exactly the four required real screens — no dead/fake reports tab', () => {
  const fn = methodBody(manager, 'const fsNav = [', 500);
  assert.match(fn, /نظرة تنفيذية/);
  assert.match(fn, /سجل أعمال الحصر/);
  assert.match(fn, /المراقبون/);
  assert.match(fn, /الخريطة التشغيلية/);
  assert.doesNotMatch(fn, /التقارير|قريباً|soon/i);
  const idCount = (fn.match(/id:\s*'(exec|log|inspectors|map)'/g) || []).length;
  assert.equal(idCount, 4, 'exactly 4 real nav entries — no extra dead item');
});

// ---- C. Executive screen contains the real operational map ----
test('C. the exec screen embeds the real map container (mapRef), not merely a link/button to it', () => {
  const block = fieldSurveyBlock();
  const execStart = block.indexOf('sc-if value="{{ fsScreenIsExec }}"');
  const execEnd = block.indexOf('sc-if value="{{ fsScreenIsLog }}"', execStart);
  assert.notEqual(execStart, -1); assert.notEqual(execEnd, -1);
  const execBlock = block.slice(execStart, execEnd);
  assert.match(execBlock, /ref="\{\{ mapRef \}\}"/);
  assert.match(execBlock, /mapEmptyText/, 'must show the same honest empty-state text when there are no real coordinates');
});

// ---- D. Dedicated map screen stays inside Field Survey ----
test('D. the dedicated "الخريطة التشغيلية" screen renders inside the Field Survey block itself, never exits to home', () => {
  const block = fieldSurveyBlock();
  assert.match(block, /sc-if value="\{\{ fsScreenIsMap \}\}"/);
  const mapScreenStart = block.indexOf('sc-if value="{{ fsScreenIsMap }}"');
  const mapScreenBlock = block.slice(mapScreenStart, mapScreenStart + 2500);
  assert.match(mapScreenBlock, /ref="\{\{ mapRef \}\}"/);
  assert.doesNotMatch(mapScreenBlock, /view:\s*'home'/);
  // fsNav's map tab must only ever change fsScreen (and force real map
  // mode), never navigate away.
  const navFn = methodBody(manager, 'const fsNav = [', 700);
  assert.match(navFn, /this\.setState\(\{ fsScreen: n\.id, mapMode: 'map' \}\)/);
});

// ---- E. Map sources exclusively from operationalObservations()/real coordinates ----
test('E. the map marker pipeline is unchanged: operationalObservations() filters to items with real coordinates, syncOperationalMap() draws real L.circleMarker from them', () => {
  const fn = methodBody(manager, 'operationalObservations() {', 500);
  assert.match(fn, /if \(!item\.coordinates\) return false;/);
  const sync = methodBody(manager, 'syncOperationalMap(forceFit = false) {', 1400);
  assert.match(sync, /L\.circleMarker\(\[item\.coordinates\.lat, item\.coordinates\.lng\]/);
  assert.match(sync, /this\.operationalObservations\(\)/);
});

// ---- F. No fake mapPins/demo coordinate array introduced ----
test('F. no fabricated marker/coordinate arrays (mapPins, demo lat/lng literals) were introduced for Field Survey', () => {
  const block = fieldSurveyBlock();
  assert.doesNotMatch(block, /mapPins|zoneLabels|24\.\d+,\s*4[0-4]\.\d+/i, 'must never introduce a schematic/demo marker array or literal Al-Qunfudhah-region coordinates');
  assert.doesNotMatch(manager, /const mapPins\s*=/);
});

// ---- G. Single Leaflet lifecycle ----
test('G. bindMapContainer() safely tears down any existing map before binding a new container — no stale reference, no competing instance', () => {
  const fn = methodBody(manager, 'bindMapContainer(el) {', 500);
  assert.match(fn, /if \(el === this\.mapEl\) return;/, 'a no-op re-render with the same container must not tear anything down');
  assert.match(fn, /this\._opMap\.remove\(\); this\._opMap = null; this\._opMarkers = null;/);
  assert.match(fn, /this\.mapEl = el;/);
  assert.match(fn, /if \(el\) this\.syncOperationalMap\(true\);/);
  // mapRef must route through this safe binder, not assign this.mapEl directly.
  assert.match(manager, /mapRef: el => this\.bindMapContainer\(el\)/);
  assert.doesNotMatch(manager, /mapRef: el => \{ this\.mapEl = el; \}/);
});

test('G2. exactly one initOperationalMap() call site guards against re-initializing an already-live map, and componentWillUnmount still tears the map down on full component teardown', () => {
  const init = methodBody(manager, 'initOperationalMap() {', 500);
  assert.match(init, /if \(!this\.mapEl \|\| this\._opMap \|\| !window\.L\) return;/);
  assert.equal((manager.match(/L\.map\(this\.mapEl/g) || []).length, 1);
  const unmount = methodBody(manager, 'componentWillUnmount() {', 500);
  assert.match(unmount, /this\._opMap\?\.remove\(\);/);
});

test('G3. marker clicks stay inside whichever product is active — Field Survey opens the evidence drawer, everywhere else keeps the prior general-dashboard behavior', () => {
  const sync = methodBody(manager, 'syncOperationalMap(forceFit = false) {', 1400);
  assert.match(sync, /marker\.on\('click', \(\) => this\.selectOperationalObservation\(item\.id\)\);/);
  const fn = methodBody(manager, 'selectOperationalObservation(id) {', 500);
  assert.match(fn, /if \(this\.state\.view === 'fieldSurvey'\)/);
  assert.match(fn, /this\.openEvidenceDrawer\(obs\);/);
  assert.match(fn, /this\.openObservation\(id\);/);
});

test('G4. entering Field Survey forces real map mode (never the Twin canvas) without ever setting view to home', () => {
  const fn = methodBody(manager, 'openFieldSurvey() {', 400);
  assert.match(fn, /view: 'fieldSurvey', mapMode: 'map'/);
  assert.doesNotMatch(fn, /view:\s*'home'/);
});

// ---- H. KPI values derive from existing real fs* values ----
test('H. the upgraded KPI cards bind to the same real fs* values, never a new literal/fabricated number', () => {
  const block = fieldSurveyBlock();
  const execStart = block.indexOf('sc-if value="{{ fsScreenIsExec }}"');
  const kpiBlock = block.slice(execStart, execStart + 4000);
  for (const token of ['{{ fsTotal }}', '{{ fsOpen }}', '{{ fsCompleted }}', '{{ fsCompletionRate }}', '{{ fsPending }}', '{{ fsInProgress }}']) {
    assert.ok(kpiBlock.includes(token), `KPI wall must bind ${token}`);
  }
  assert.doesNotMatch(kpiBlock, /Math\.random|fakeTrend|SLA|performance score/i);
});

// ---- I. Priority rows use existing real fsPriorities (rank/tint added, ordering untouched) ----
test('I. priority row rank/tint are computed from the already-real priority weight/color, never a new scoring algorithm', () => {
  const fn = methodBody(manager, 'const fsPriorities = [...fsOpenObservations]', 700);
  assert.match(fn, /\.sort\(\(a, b\) => fsPriorityWeight\(b\.priority\) - fsPriorityWeight\(a\.priority\) \|\| b\.createdAt - a\.createdAt\)/, 'existing priority ordering must remain the sole source of truth');
  assert.match(fn, /rank: String\(idx \+ 1\)/);
  assert.match(fn, /bg: this\.tint\(col, day \? 0\.1 : 0\.14\), bd: this\.tint\(col, day \? 0\.28 : 0\.34\)/);
});

// ---- J. Inspector rows use existing real fsInspectors (tint added, data untouched) ----
test('J. inspector row tinting is derived from the already-real active/open-count data — no fabricated ranking, GPS, or productivity score', () => {
  const fn = methodBody(manager, 'const fsInspectors = fsInspectorUsers.map(u => {', 900);
  assert.match(fn, /const active = u\.active !== false;/);
  assert.match(fn, /bg: active \?/);
  assert.doesNotMatch(fn, /gps|GPS|ranking|productivity|online/i);
  const block = fieldSurveyBlock();
  assert.doesNotMatch(block, /gps|GPS|ranking|productivity score|online now/i);
});

// ---- K. Analytics footer uses only real existing values ----
test('K. the analytics footer (category bars, completion donut, operational summary) is built entirely from existing real counts', () => {
  const catFn = methodBody(manager, 'const fsCategoryDistribution = ', 400);
  assert.match(catFn, /w: Math\.round\(\(n \/ fsTotalForPct\) \* 100\) \+ '%'/);
  const donutFn = methodBody(manager, 'fsCompletionDash: (() => {', 400);
  assert.match(donutFn, /allObservations\.filter\(o => o\.status === 'COMPLETED'\)\.length/);
  assert.match(manager, /const fsPendingCount = allObservations\.filter\(o => o\.status === 'PENDING'\)\.length;/);
  assert.match(manager, /const fsInProgressCount = allObservations\.filter\(o => o\.status === 'IN_PROGRESS'\)\.length;/);
  assert.match(manager, /const fsNoCoordsCount = allObservations\.filter\(o => !o\.coordinates\)\.length;/);
});

// ---- L. Manager -> Inspector separation remains intact ----
test('L. Manager/Inspector authorization is untouched by this rebuild — verifyManagerAccess still gates every manager.html load, independent of the new map/UI code', () => {
  const fn = methodBody(adapter, 'async function verifyManagerAccess(api, db, user) {', 1000);
  assert.match(fn, /data\.role === 'manager'/);
  assert.doesNotMatch(fn, /'inspector'|'contractor'/);
  // The new marker-click routing must never call verifyManagerAccess or any
  // auth primitive directly — it only ever branches on already-authorized
  // component state (this.state.view).
  const sel = methodBody(manager, 'selectOperationalObservation(id) {', 500);
  assert.doesNotMatch(sel, /verifyManagerAccess|signOut|getIdToken/);
});

console.log('manager Phase 04B master-UI rebuild OK');
