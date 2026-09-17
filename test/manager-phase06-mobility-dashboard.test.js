'use strict';
// PHASE 06 — focused regression tests for the new dedicated
// إدارة الحركة والسير Municipality Manager executive view: a native
// full-page, read-only product view inside manager.html, following the
// exact same pattern manager-phase05b-lands-dashboard.test.js already
// locks in for Lands, reading real Mobility data (missions/vehicles/
// incidents) read-only. The Municipality Manager is never treated as one
// of the four Mobility operational roles, and this view never touches
// smart-mobility.html/smart-mobility-adapter.js, which remain unchanged.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manager = read('manager.html');
const adapter = read('manager-mobility-adapter.js');

function methodBody(source, signature, maxLen = 1500) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  return source.slice(start, start + maxLen);
}

// ---- A. Dedicated full-page Mobility Manager architecture ----
test('A. إدارة الحركة والسير is a full-page product view inside <main>, exactly one implementation, never a modal', () => {
  const mainStart = manager.indexOf('<main style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px">');
  const mainEnd = manager.lastIndexOf('</main>');
  const mobilityStart = manager.indexOf('<sc-if value="{{ viewIsMobility }}">');
  assert.notEqual(mobilityStart, -1);
  assert.ok(mobilityStart > mainStart && mobilityStart < mainEnd, 'the Mobility executive view must render inside <main>, not elsewhere');
  assert.equal((manager.match(/sc-if value="\{\{ viewIsMobility \}\}"/g) || []).length, 1, 'only one Mobility executive view implementation must exist');
  assert.match(manager, /<sc-if value="\{\{ viewIsHomeContent \}\}">/);
  assert.match(manager, /viewIsHomeContent: st\.view !== 'fieldSurvey' && st\.view !== 'lands' && st\.view !== 'mobility'/);
  assert.doesNotMatch(manager, /(?:sc-if value|onClick|onChange)="\{\{[^}]*&&[^}]*\}\}"/, 'no compound && expression must ever be placed directly inside a template attribute {{ }} — this engine cannot evaluate it');
});

// ---- B. goMobilityGateway routes to the real product, replacing the old external navigation ----
test('B. goMobilityGateway() opens the real Mobility executive view and connects the real adapter — no external navigation remains for the Manager route', () => {
  const fn = methodBody(manager, 'goMobilityGateway(e) {', 400);
  assert.match(fn, /view: 'mobility'/);
  assert.match(fn, /SmartHSRMobilityAdapter\?\.connect\(this\)/);
  const routeFn = methodBody(manager, 'goRoute(r) {', 900);
  assert.match(routeFn, /r === 'mobility'\)\s*\{\s*this\.goMobilityGateway\(\)/);
  assert.doesNotMatch(routeFn, /r === 'mobility'[\s\S]{0,60}smart-mobility\.html/, 'the Manager dashboard route must no longer navigate away');
});

// ---- C. no modal/overlay architecture ----
test('C. the Mobility executive area is not a centered dialog: no role="dialog"/aria-modal, no fixed-inset backdrop, no giant X close glyph inside its block', () => {
  const start = manager.indexOf('<sc-if value="{{ viewIsMobility }}">');
  const end = manager.indexOf('</main>', start);
  const block = manager.slice(start, end);
  assert.doesNotMatch(block, /role="dialog"|aria-modal/);
  assert.doesNotMatch(block, /position:fixed;inset:0/);
  assert.doesNotMatch(block, />\s*×\s*</);
  assert.match(block, /العودة إلى لوحة مدير البلدية/);
  assert.match(block, /onClick="\{\{ closeView \}\}"/);
});

// ---- D. real-data-only contract ----
test('D. every KPI/summary field in the Mobility view is sourced from this.liveMobilityXxx (adapter-published real data) — no invented numbers, no fake fixtures in product code', () => {
  const start = manager.indexOf('<sc-if value="{{ viewIsMobility }}">');
  const end = manager.indexOf('</main>', start);
  const block = manager.slice(start, end);
  for (const token of ['mobilityKpiMissionsTotal', 'mobilityKpiMissionsActive', 'mobilityKpiVehiclesTotal', 'mobilityKpiVehiclesAvailable', 'mobilityKpiIncidentsOpen', 'mobilityKpiIncidentsResolved', 'mobilityDepartments']) {
    assert.match(block, new RegExp(`\\{\\{ ${token}|list="\\{\\{ ${token}`), `${token} must be rendered from real adapter-published state`);
  }
  const renderFn = methodBody(manager, 'const mobilityDataState = this.liveMobilityDataState', 1200);
  assert.match(renderFn, /this\.liveMobilityKpi/);
  assert.match(renderFn, /this\.liveMobilityDepartments/);
  assert.doesNotMatch(renderFn, /Math\.random|faker|lorem/i, 'no randomized/fabricated data generation');
  // honest loading placeholder before real data arrives — never a fabricated zero.
  assert.match(renderFn, /missionsTotal: '—'/);
  // the adapter itself must read only from the real, existing, unmodified
  // top-level missions/vehicles/incidents collections, org-scoped, never a
  // second Firebase app/session.
  assert.match(adapter, /collection\(db, 'missions'\)/);
  assert.match(adapter, /collection\(db, 'vehicles'\)/);
  assert.match(adapter, /collection\(db, 'incidents'\)/);
  assert.match(adapter, /where\('organizationId', '==', orgId\)/);
  assert.doesNotMatch(adapter, /initializeApp\(/, 'must reuse the existing smart-hsr-manager-session app, never create a second one');
});

// ---- E. no privileged write actions ----
test('E. the Mobility executive view performs no writes/mutations — read-only onSnapshot subscriptions only', () => {
  assert.doesNotMatch(adapter, /setDoc\(|updateDoc\(|deleteDoc\(|addDoc\(|runTransaction\(/, 'the adapter must never write to Firestore');
  assert.doesNotMatch(adapter, /fetch\(/, 'the adapter must perform no network calls of its own — Manager already has direct read access under existing Rules, unlike Lands\' bootstrap requirement');
  const start = manager.indexOf('<sc-if value="{{ viewIsMobility }}">');
  const end = manager.indexOf('</main>', start);
  const block = manager.slice(start, end);
  assert.doesNotMatch(block, /اعتماد|رفض|حذف|تخصيص مركبة|تسليم/, 'no approve/reject/delete/allocate/handover UI in this read-only executive view');
});

// ---- F. Municipality Manager is never treated as a Mobility operational role ----
test('F. the executive view and its gateway never sign into the Mobility session app or reference the four operational role keys as selectable options', () => {
  assert.doesNotMatch(adapter, /smart-hsr-mobility-session/, 'the executive adapter must never touch the separate operational Mobility session app');
  const fn = methodBody(manager, 'goMobilityGateway(e) {', 700);
  assert.doesNotMatch(fn, /mobility_head|department_head|administrative_affairs/, 'the Manager gateway must not assign or reference an operational Mobility role');
  // smart-mobility.html/smart-mobility-adapter.js remain completely untouched.
  const mobilityPage = read('smart-mobility.html');
  assert.match(mobilityPage, /st\.role === 'manager' && st\.screen === 'exec'/, 'the standalone Mobility app\'s own manager branch must remain exactly as before');
});

// ---- G. organizationId scoping, no invented mapping ----
test('G. the adapter uses the existing session organizationId directly to scope every read — no invented mapping table', () => {
  assert.match(adapter, /component\.state\?\.orgId/);
  assert.doesNotMatch(adapter, /municipalityMap|orgToMunicipality|mappingTable/i, 'must not invent a separate mapping mechanism');
});

// ---- H. safe return to Manager ----
test('H. closeView() is a plain view:home transition — no reload, no sign-out, no session loss (same shared handler Lands/Field Survey already use)', () => {
  assert.match(manager, /closeView: \(\) => this\.setState\(\{ view: 'home' \}\)/);
  assert.doesNotMatch(manager, /closeView:[\s\S]{0,120}(location\.reload|signOut|location\.replace)/);
});

// ---- I. Lands/Field Survey gateways unaffected ----
test('I. goLandsGateway()/goRoute("lands") and openFieldSurvey()/goRoute("survey") remain exactly as before — unaffected by the Mobility dashboard addition', () => {
  const landsFn = methodBody(manager, 'goLandsGateway(e) {', 400);
  assert.match(landsFn, /view: 'lands'/);
  assert.match(landsFn, /SmartHSRLandsAdapter\?\.connect\(this\)/);
  const fsFn = methodBody(manager, 'openFieldSurvey() {', 300);
  assert.match(fsFn, /view: 'fieldSurvey', mapMode: 'map'/);
});

// ---- J. vehicleEligible/status vocabulary matches the real, existing Mobility contract exactly ----
test('J. the adapter never invents a new mission/vehicle/incident status value — only the real values smart-mobility-adapter.js already defines', () => {
  const realMissionStatuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'VEHICLE_ALLOCATED', 'HANDED_OVER', 'READY', 'IN_PROGRESS', 'INCIDENT_HOLD', 'COMPLETED', 'AWAITING_RETURN', 'CLOSED'];
  const realVehicleStatuses = ['AVAILABLE', 'RESERVED', 'IN_MISSION', 'RETURN_PENDING', 'MAINTENANCE', 'OUT_OF_SERVICE'];
  const realIncidentStatuses = ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'];
  const statusLiterals = [...adapter.matchAll(/'([A-Z_]+)'/g)].map(m => m[1]);
  const allReal = new Set([...realMissionStatuses, ...realVehicleStatuses, ...realIncidentStatuses]);
  for (const literal of statusLiterals) {
    assert.ok(allReal.has(literal), `adapter references an unrecognized status literal '${literal}' not part of the real, existing Mobility contract`);
  }
});
