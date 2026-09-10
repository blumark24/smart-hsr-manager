'use strict';
// Regression coverage for Phase 03's Municipality Manager product-routing
// contract: the Manager must never be routed into an operational-role
// screen merely because that is the only existing product page, each
// product gateway must resolve to a dedicated Manager destination (reusing
// the Manager's existing authenticated session, never a fake/fabricated
// one), and the MAP/TWIN surfaces must stay clearly distinct labels.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// ---- 1/2. Field Survey: Manager is never sent to the Inspector screen ----
// Phase 04 note: this gateway now opens the dedicated Field Survey Manager
// Dashboard ('fieldSurvey') rather than the plain 'observations' drawer —
// see test/manager-phase04-field-survey.test.js for the full assertion of
// that richer, real-data-only dashboard. This test's own job stays the
// same: prove the Manager is never sent to dashboard.html.
test('1/2. Field Survey gateway never routes the Manager to dashboard.html (the Inspector screen) — it opens a real Manager dashboard view', () => {
  const manager = read('manager.html');
  const fn = manager.slice(manager.indexOf('goRoute(r) {'), manager.indexOf('goRoute(r) {') + 900);
  assert.doesNotMatch(fn, /r === 'survey'[\s\S]{0,60}dashboard\.html/, 'Field Survey must never navigate the Manager to dashboard.html');
  assert.match(fn, /r === 'survey'\s*\)\s*\{\s*this\.openFieldSurvey\(\)/, 'Field Survey must open the dedicated Field Survey Manager Dashboard view');
});

// ---- 3. Smart Mobility Manager executive integration (Phase 06) ----
// PHASE 06: the Manager gateway now opens the dedicated إدارة الحركة والسير
// Manager executive view ('view: mobility') natively inside this same
// authenticated session — following the exact same pattern
// goLandsGateway()/'view: lands' already established (see 2b. above) —
// rather than navigating the Manager away to smart-mobility.html. The
// Manager priming a shared Mobility named-app session at login is
// unrelated and still required (smart-mobility.html itself still supports
// a manager who opens it directly and still branches to its own exec
// screen for role==='manager' — see the test right below — this gateway
// change only affects where the MAIN Manager dashboard sends the manager
// when they click through from the sidebar).
test('3. Smart Mobility gateway opens the real, dedicated Mobility Manager executive view — not an external navigation, not a fabricated dashboard', () => {
  const manager = read('manager.html');
  assert.match(manager, /goMobilityGateway\(e\)\s*\{/);
  const fn = manager.slice(manager.indexOf('goMobilityGateway(e) {'), manager.indexOf('goMobilityGateway(e) {') + 400);
  assert.match(fn, /view: 'mobility'/, 'must open the dedicated Mobility executive view');
  assert.match(fn, /SmartHSRMobilityAdapter\?\.connect\(this\)/, 'must connect the real Mobility data adapter');
  assert.match(manager, /onClick="\{\{ goMobility \}\}"/, 'the sidebar Mobility link must still be wired');
  assert.match(manager, /goMobility: \(\) => this\.goRoute\('mobility'\)/);
  const routeFn = manager.slice(manager.indexOf('goRoute(r) {'), manager.indexOf('goRoute(r) {') + 900);
  assert.match(routeFn, /r === 'mobility'\s*\)\s*\{\s*this\.goMobilityGateway\(\)/, 'goRoute must dispatch to the real gateway, not navigate away');
  assert.doesNotMatch(routeFn, /r === 'mobility'[\s\S]{0,60}smart-mobility\.html/, 'the Manager dashboard must no longer navigate away for the mobility route');

  const managerLogin = read('manager-login.html');
  assert.match(managerLogin, /smart-hsr-mobility-session/, 'manager-login.html must silently prime the Mobility named-app session, matching login.html\'s existing behavior for the same product');
  assert.match(managerLogin, /signInWithEmailAndPassword\(managerMobilityAuth, email, password\)/);
  // Must never block the manager's own already-authorized sign-in if this
  // best-effort priming step fails.
  const primeBlock = managerLogin.slice(managerLogin.indexOf('managerMobilityApp'), managerLogin.indexOf('managerMobilityApp') + 700);
  assert.match(primeBlock, /catch \(mobilityPrimeErr\)/);
});

// ---- Smart Mobility: Manager still gets an executive screen, not an operational one ----
test('Smart Mobility itself still branches to a dedicated executive/manager screen, never an operational role screen, for role === manager', () => {
  const mobility = read('smart-mobility.html');
  assert.match(mobility, /st\.role === 'manager' && st\.screen === 'exec'/);
});

// ---- 2 (continued). Smart Lands gateway resolves to a real, dedicated
//      Manager destination — never a fake integration, never nothing ----
// PHASE 05B: the gateway now opens the dedicated إدارة الأراضي والممتلكات
// Manager Dashboard ('view: lands') — a native full-page product view
// following the exact same pattern as openFieldSurvey(), replacing the
// Phase 03/04 placeholder (Users-view-filtered-to-Lands redirect). See
// test/manager-phase05b-lands-dashboard.test.js for the full assertion of
// that richer, real-data-only dashboard.
test('2b. Smart Lands gateway opens the real, dedicated Lands Manager Dashboard — not the old Users-view placeholder, not a dead/disabled control, not a fabricated dashboard', () => {
  const manager = read('manager.html');
  assert.match(manager, /goLandsGateway\(e\)\s*\{/);
  const fn = manager.slice(manager.indexOf('goLandsGateway(e) {'), manager.indexOf('goLandsGateway(e) {') + 400);
  assert.match(fn, /view: 'lands'/, 'must open the dedicated Lands view, not the Users view');
  assert.doesNotMatch(fn, /tuFilter: 'أراضي'/, 'the old Users-view-filter placeholder must be retired now that the real dashboard exists');
  assert.match(fn, /SmartHSRLandsAdapter\?\.connect\(this\)/, 'must connect the real Lands data adapter');
  // The sidebar/mobile-nav entries must actually invoke it — no dead/
  // disabled control, and no leftover "pending linking" disclosure now
  // that the real product is live.
  assert.doesNotMatch(manager, /aria-disabled="true"[^>]*بانتظار إضافة المسار التشغيلي الحقيقي/, 'the Lands sidebar item must not be a dead disabled control');
  assert.match(manager, /onClick="\{\{ goLands \}\}"/, 'the sidebar Lands link must be wired to the real gateway handler');
  assert.match(manager, /'إدارة الأراضي والممتلكات', tag: '', on: \(\) => this\.goLandsGateway\(\)/, 'the mobile nav Lands entry must be real, with no stale pending-linking tag');
});

// ---- 4. Day/Night switch does not destroy state ----
test('4. switching theme only touches state.theme — it is a plain setState call, never a page reload or state reset', () => {
  const manager = read('manager.html');
  assert.match(manager, /setDay: \(\) => this\.setState\(\{ theme: 'day' \}\)/);
  assert.match(manager, /setNight: \(\) => this\.setState\(\{ theme: 'night' \}\)/);
  assert.doesNotMatch(manager, /setDay:[\s\S]{0,80}location\.reload/);
  assert.doesNotMatch(manager, /setNight:[\s\S]{0,80}location\.reload/);
});

// ---- Day Mode actually restyles the surfaces the Night default renders ----
// (the concrete defect: --l1/--l2/--l3/--rowX/--sect/--hdrX/--sbX were
// missing from DAY, so cards/tables/header/sidebar stayed Night-styled
// even while Day mode was selected).
test('Day mode overrides the same surface/header/sidebar tokens Night mode relies on by default, closing the "dark cards inside light theme" defect', () => {
  const manager = read('manager.html');
  const dayStart = manager.indexOf('DAY = {');
  const dayEnd = manager.indexOf('\n  };', dayStart);
  const dayBlock = manager.slice(dayStart, dayEnd);
  for (const requiredKey of ['--l1', '--l2', '--l3', '--rowH', '--rowAlt', '--rowSel', '--rowBd', '--sect', '--sectBd', '--hdrBg', '--hdrTx', '--sbBg', '--sbTx', '--thTx']) {
    assert.match(dayBlock, new RegExp(`'${requiredKey.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}'\\s*:`), `Day mode must define ${requiredKey}`);
  }
});

// ---- 5. No fake/fallback product data introduced ----
test('5. the new Lands gateway and Field Survey gateway introduce no fabricated data — real Firestore-backed views only', () => {
  const manager = read('manager.html');
  const fn = manager.slice(manager.indexOf('goLandsGateway(e) {'), manager.indexOf('goLandsGateway(e) {') + 700);
  assert.doesNotMatch(fn, /landGrants|parcels|royalOrder/i, 'must never fabricate real Lands operational data client-side');
  // The Field Survey gateway reuses the existing, already-tested real
  // observations view; it introduces no new data source at all.
  const goRouteFn = manager.slice(manager.indexOf('goRoute(r) {'), manager.indexOf('goRoute(r) {') + 900);
  assert.doesNotMatch(goRouteFn, /fakeObservation|fabricat/i);
});

// ---- 6. MAP and TWIN labels are never conflated ----
test('6. the Map and Twin surfaces carry distinct labels — Twin is never labeled GIS, and the two are never merged into one label', () => {
  const manager = read('manager.html');
  assert.doesNotMatch(manager, /Digital Twin\s*·\s*GIS/i, 'the Twin surface must never be labeled as GIS');
  const labelLine = manager.slice(manager.indexOf('mapSurfaceLabel:'), manager.indexOf('mapSurfaceLabel:') + 300);
  assert.match(labelLine, /التوأم/);
  assert.match(labelLine, /الخريطة/);
  assert.notEqual(
    labelLine.match(/'([^']*)'/g)?.[0],
    labelLine.match(/'([^']*)'/g)?.[1],
    'the Map and Twin labels must be distinct strings'
  );
});

console.log('manager Phase 03 product gateways OK');
