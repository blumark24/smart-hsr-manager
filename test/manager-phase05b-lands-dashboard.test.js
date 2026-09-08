'use strict';
// PHASE 05B — focused regression tests for the new دedicated
// إدارة الأراضي والممتلكات Municipality Manager Dashboard: a native
// full-page product view inside manager.html, following the exact Field
// Survey integration pattern, reading real Lands data read-only.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manager = read('manager.html');
const adapter = read('manager-lands-adapter.js');

function methodBody(source, signature, maxLen = 1500) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  return source.slice(start, start + maxLen);
}

// ---- A. Dedicated full-page Lands Manager architecture ----
test('A. إدارة الأراضي والممتلكات is a full-page product view inside <main>, exactly one implementation, never a modal', () => {
  const mainStart = manager.indexOf('<main style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px">');
  const mainEnd = manager.indexOf('</main>', mainStart);
  const landsStart = manager.indexOf('<sc-if value="{{ viewIsLands }}">');
  assert.notEqual(landsStart, -1);
  assert.ok(landsStart > mainStart && landsStart < mainEnd, 'the Lands product view must render inside <main>, not elsewhere');
  assert.equal((manager.match(/sc-if value="\{\{ viewIsLands \}\}"/g) || []).length, 1, 'only one Lands product implementation must exist');
  // it must be excluded from the shared home-dashboard content, the same
  // way Field Survey is. This template engine's {{ }} resolver has no &&
  // operator support (support.js's resolve()/resolvePath()), so the
  // combined condition must be a single precomputed boolean
  // (viewIsHomeContent), never an inline "{{ !viewIsFieldSurvey &&
  // !viewIsLands }}" — that would silently degrade to just
  // "{{ !viewIsFieldSurvey }}" and render the home dashboard underneath
  // Lands too (the exact regression this test guards against).
  assert.match(manager, /<sc-if value="\{\{ viewIsHomeContent \}\}">/);
  assert.match(manager, /viewIsHomeContent: st\.view !== 'fieldSurvey' && st\.view !== 'lands'/);
  assert.doesNotMatch(manager, /(?:sc-if value|onClick|onChange)="\{\{[^}]*&&[^}]*\}\}"/, 'no compound && expression must ever be placed directly inside a template attribute {{ }} — this engine cannot evaluate it (checked in actual markup, not in explanatory comments)');
});

// ---- B. goLandsGateway routes to the real product ----
test('B. goLandsGateway() opens the real Lands view and connects the real adapter — no Users-view placeholder redirect remains', () => {
  const fn = methodBody(manager, 'goLandsGateway(e) {', 400);
  assert.match(fn, /view: 'lands'/);
  assert.match(fn, /SmartHSRLandsAdapter\?\.connect\(this\)/);
  assert.doesNotMatch(fn, /tuFilter: 'أراضي'/, 'the old placeholder must no longer redirect to the Users view');
});

// ---- C. no modal/overlay architecture ----
test('C. the Lands product area is not a centered dialog: no role="dialog"/aria-modal, no fixed-inset backdrop, no giant X close glyph inside its block', () => {
  const start = manager.indexOf('<sc-if value="{{ viewIsLands }}">');
  const end = manager.indexOf('</main>', start);
  const block = manager.slice(start, end);
  assert.doesNotMatch(block, /role="dialog"|aria-modal/);
  assert.doesNotMatch(block, /position:fixed;inset:0/);
  assert.doesNotMatch(block, />\s*×\s*</);
  // it uses the same real "return to Manager" control Field Survey uses.
  assert.match(block, /العودة إلى لوحة مدير البلدية/);
  assert.match(block, /onClick="\{\{ closeView \}\}"/);
});

// ---- D. real-data-only contract ----
test('D. every KPI/table field in the Lands view is sourced from this.liveLandsXxx (adapter-published real data) — no invented numbers, no fake fixtures in product code', () => {
  const start = manager.indexOf('<sc-if value="{{ viewIsLands }}">');
  const end = manager.indexOf('</main>', start);
  const block = manager.slice(start, end);
  for (const token of ['landsKpiTotal', 'landsKpiApproved', 'landsKpiAvgPercent', 'landsKpiMissingDocs', 'landsKpiNoLocation', 'landsRows', 'landsDocRows', 'landsPriorities', 'landsAuditEvents']) {
    assert.match(block, new RegExp(`\\{\\{ ${token}|list="\\{\\{ ${token}`), `${token} must be rendered from real adapter-published state`);
  }
  const renderFn = methodBody(manager, 'const landsScreen = st.landsScreen', 4000);
  assert.match(renderFn, /this\.liveLandsKpi/);
  assert.match(renderFn, /this\.liveLandsRegistry/);
  assert.match(renderFn, /this\.liveLandsDocuments/);
  assert.doesNotMatch(renderFn, /Math\.random|faker|lorem/i, 'no randomized/fabricated data generation');
  // the adapter itself must read only from the real Lands Firestore
  // namespace, never write, never a second Firebase app/session.
  assert.match(adapter, /landsMunicipalities\/\$\{orgId\}/);
  assert.doesNotMatch(adapter, /initializeApp\(/, 'must reuse the existing smart-hsr-manager-session app, never create a second one');
});

// ---- E. no privileged write actions ----
test('E. the Lands dashboard performs no writes/mutations — only onSnapshot reads and the existing self-only bootstrap call', () => {
  assert.doesNotMatch(adapter, /setDoc\(|updateDoc\(|deleteDoc\(|addDoc\(/, 'the adapter must never write to Firestore');
  assert.doesNotMatch(adapter, /lands-mutations|lands-sso-register|lands-sso-consume/, 'must never invoke the consequential-mutation or employee SSO endpoints');
  assert.match(adapter, /fetch\('\/api\/admin\/lands-bootstrap'/, 'the only network call besides reads must be the existing, already-approved, self-only bootstrap endpoint');
  // the Lands product view itself must contain no approve/reject/delete/
  // entitlement-change controls.
  const start = manager.indexOf('<sc-if value="{{ viewIsLands }}">');
  const end = manager.indexOf('</main>', start);
  const block = manager.slice(start, end);
  assert.doesNotMatch(block, /اعتماد|رفض|حذف|تعديل الصلاحية/, 'no approve/reject/delete/entitlement-change UI in this read-only phase');
});

// ---- F. organizationId -> municipality_id mapping use ----
test('F. the adapter uses the existing session organizationId directly as the Lands municipality_id — no invented mapping table', () => {
  assert.match(adapter, /component\.state\?\.orgId/);
  assert.match(adapter, /const base = `landsMunicipalities\/\$\{orgId\}`/);
  assert.doesNotMatch(adapter, /municipalityMap|orgToMunicipality|mappingTable/i, 'must not invent a separate mapping mechanism');
  assert.match(adapter, /ensureBootstrap/, 'must use the existing bootstrap flow, which itself uses organizationId as municipality_id (api/_lib/landsManagerBootstrap.js)');
});

// ---- G. responsive GIS container ----
test('G. the GIS/map screen is a visually substantial card driven by a dedicated --lndMapH token, honest empty state, no fabricated geometry', () => {
  const start = manager.indexOf('<sc-if value="{{ landsScreenIsGis }}">');
  assert.notEqual(start, -1);
  const block = manager.slice(start, start + 2000);
  assert.match(block, /min-height:var\(--lndMapH,320px\)/);
  assert.match(block, /لا تتوفر بيانات مكانية مرتبطة بالقطع الحالية/);
  assert.doesNotMatch(block, /L\.map\(|L\.circleMarker|L\.marker/, 'must never reuse the Field Survey/observations Leaflet map or fabricate geometry');
  assert.doesNotMatch(block, /19\.1284|41\.0784/, 'must never hardcode Al-Qunfudhah or any fabricated coordinates');
  const bp = methodBody(manager, 'BP = {', 2500);
  assert.match(bp, /'--lndMapH': '240px'/);
  assert.match(bp, /'--lndMapH': '200px'/);
});

// ---- H. narrow table behavior ----
test('H. the Registry and Documents tables reuse the existing --thead/--rowWrap narrow pattern plus a dedicated --lndCellMinW floor at mob width only', () => {
  const registryStart = manager.indexOf('<sc-if value="{{ landsScreenIsRegistry }}">');
  const registryBlock = manager.slice(registryStart, registryStart + 3000);
  assert.match(registryBlock, /display:var\(--thead,flex\)/);
  assert.match(registryBlock, /flex-wrap:var\(--rowWrap,nowrap\)/);
  assert.match(registryBlock, /min-width:var\(--lndCellMinW,0\)/);

  const docsStart = manager.indexOf('<sc-if value="{{ landsScreenIsDocuments }}">');
  const docsBlock = manager.slice(docsStart, docsStart + 2000);
  assert.match(docsBlock, /min-width:var\(--lndCellMinW,0\)/);

  const bp = methodBody(manager, 'BP = {', 2500);
  const mobStart = bp.indexOf('mob: {');
  const mobTier = bp.slice(mobStart, bp.indexOf('\n  };', mobStart));
  const tabStart = bp.indexOf('tab: {');
  const tabTier = bp.slice(tabStart, mobStart);
  assert.match(mobTier, /'--lndCellMinW': '92px'/);
  assert.doesNotMatch(tabTier, /--lndCellMinW/, '768/1024 table density must be unaffected — mob-only floor, mirroring --fsCellMinW');
});

// ---- I. safe return to Manager ----
test('I. closeView() is a plain view:home transition — no reload, no sign-out, no session loss', () => {
  assert.match(manager, /closeView: \(\) => this\.setState\(\{ view: 'home' \}\)/);
  assert.doesNotMatch(manager, /closeView:[\s\S]{0,120}(location\.reload|signOut|location\.replace)/);
});

// ---- J. Field Survey gateway unchanged ----
test('J. openFieldSurvey()/goRoute("survey") remain exactly as Phase 04 left them — unaffected by the Lands dashboard addition', () => {
  const fn = methodBody(manager, 'openFieldSurvey() {', 300);
  assert.match(fn, /view: 'fieldSurvey', mapMode: 'map'/);
  const goRouteFn = methodBody(manager, 'goRoute(r) {', 900);
  assert.match(goRouteFn, /r === 'survey'\)\s*\{\s*this\.openFieldSurvey\(\)/);
});

// ---- K. Mobility gateway unchanged ----
test('K. goRoute("mobility") still navigates to smart-mobility.html, unaffected by the Lands dashboard addition', () => {
  const goRouteFn = methodBody(manager, 'goRoute(r) {', 900);
  assert.match(goRouteFn, /r === 'mobility'[\s\S]{0,60}smart-mobility\.html/);
});
