'use strict';
// Regression coverage for Phase 04's dedicated Smart Field Survey Manager
// Dashboard: a genuine executive/operational oversight view for
// الحصر الميداني الذكي, built entirely from real, already-existing data
// contracts (observations, users) — no fabricated KPIs, priorities,
// inspector activity, or map data, and no second login / no routing into
// the Inspector's own operational screen (dashboard.html).

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

// ---- Gateway / routing ----
test('the Field Survey gateway opens the dedicated fieldSurvey view, never the Inspector screen', () => {
  const fn = methodBody(manager, 'goRoute(r) {', 900);
  assert.match(fn, /r === 'survey'\s*\)\s*\{\s*this\.openFieldSurvey\(\)/);
  assert.doesNotMatch(fn, /r === 'survey'[\s\S]{0,60}dashboard\.html/);
});

test('the Field Survey Manager Dashboard is reachable and titled distinctly from the general observations/reports views', () => {
  assert.match(manager, /viewIsFieldSurvey: st\.view === 'fieldSurvey'/);
  assert.match(manager, /'لوحة مدير الحصر الميداني الذكي'/);
});

test('the dashboard provides a return path to the Municipality Manager Dashboard without a second login', () => {
  const fieldSurveyBlockStart = manager.indexOf("sc-if value=\"{{ viewIsFieldSurvey }}\"");
  const fieldSurveyBlockEnd = manager.indexOf('sc-if value="{{ viewIsUsers }}"', fieldSurveyBlockStart);
  const block = manager.slice(fieldSurveyBlockStart, fieldSurveyBlockEnd);
  assert.match(block, /onClick="\{\{ closeView \}\}"/, 'must reuse the existing closeView handler (same session, no reload/second login)');
});

// ---- KPIs: real derivation only ----
test('KPIs are derived from the live observations array, never hardcoded/fabricated numbers', () => {
  assert.match(manager, /fsTotal: String\(allObservations\.length\)/);
  assert.match(manager, /fsOpen: String\(fsOpenObservations\.length\)/);
  assert.match(manager, /fsCompleted: String\(allObservations\.filter\(o => o\.status === 'COMPLETED'\)\.length\)/);
  assert.match(manager, /fsCompletionRate: metrics\.completionRate \|\| '—'/, 'must reuse the same real completionRate already computed in the adapter, not a second calculation');
});

// ---- Operational priorities: real riskAssessment.priority field only ----
test('operational priorities use the real riskAssessment.priority field (surfaced by the adapter), with an honest "undetermined" fallback — never an invented severity', () => {
  assert.match(adapter, /priority: \(data\.riskAssessment && typeof data\.riskAssessment\.priority === 'string'\) \? data\.riskAssessment\.priority : null/);
  const fn = methodBody(manager, 'const fsPriorityLabel', 900);
  assert.match(fn, /HIGH: 'مرتفعة', MEDIUM: 'متوسطة', LOW: 'منخفضة'/);
  assert.match(fn, /'غير محدد'/, 'an absent/unknown priority must render as undetermined, never a guessed severity');
  assert.doesNotMatch(fn, /Math\.random/);
});

test('priorities only ever come from open (non-completed) observations, sorted by the real field — no fabricated ranking', () => {
  const fn = methodBody(manager, 'const fsOpenObservations', 700);
  assert.match(fn, /allObservations\.filter\(o => o\.status !== 'COMPLETED'\)/);
  assert.match(fn, /fsPriorityWeight\(b\.priority\) - fsPriorityWeight\(a\.priority\)/);
});

// ---- Inspector oversight: real join against users + observations, no fabricated GPS/ranking/productivity ----
test('inspector oversight joins real users (role-filtered) against real observations by createdByUid — no fabricated GPS, ranking, or productivity score', () => {
  const fn = methodBody(manager, 'const fsInspectorUsers', 1200);
  assert.match(fn, /\['inspector', 'contractor', 'supervisor'\]\.includes\(u\.role\)/);
  assert.match(fn, /allObservations\.filter\(o => o\.createdByUid === u\.id\)/);
  assert.doesNotMatch(fn, /gps|GPS|ranking|productivity|online/i, 'must never fabricate presence/GPS/ranking data the real contract does not provide');
});

test('the real createdByUid field is surfaced by the adapter so inspector identity can be joined honestly, never defaulted to a fabricated name', () => {
  assert.match(adapter, /createdByUid: typeof data\.createdByUid === 'string' && data\.createdByUid \? data\.createdByUid : null/);
});

// ---- Table / filters: real data, existing evidence path reused ----
test('the Field Survey table filters real observations by real status values and a real search, and every row opens the existing, already-tested evidence drawer', () => {
  const fn = methodBody(manager, "} else if (st.view === 'fieldSurvey') {", 3200);
  assert.match(fn, /PENDING: null.*|'قيد الانتظار': 'PENDING'/);
  assert.match(fn, /on: \(\) => this\.openEvidenceDrawer\(o\)/, 'must reuse the existing, already-secured evidence drawer — never a new/parallel detail view');
  assert.doesNotMatch(fn, /Math\.random|fakeInspector|\bplaceholder\b/i, 'must never fabricate row/search data (the legitimate tPlaceholder input-hint variable is intentionally excluded)');
});

// ---- Map: real existing Leaflet engine embedded directly, never a new map/fake data ----
// Superseded/expanded by test/manager-phase04b-master-ui.test.js — kept here
// as the original narrow assertion, updated for Phase 04B's real embedded
// map (the map is no longer a mere exit-to-home button).
test('the dashboard embeds the real, already-existing operational map container directly — no new map engine, no fake markers', () => {
  const fieldSurveyBlockStart = manager.indexOf("sc-if value=\"{{ viewIsFieldSurvey }}\"");
  const fieldSurveyBlockEnd = manager.indexOf('</main>', fieldSurveyBlockStart);
  const block = manager.slice(fieldSurveyBlockStart, fieldSurveyBlockEnd);
  assert.match(block, /ref="\{\{ mapRef \}\}"/, 'must render the real, shared Leaflet container, not merely link away to it');
  // Only ONE initOperationalMap/L.map call site exists anywhere in the file
  // — Field Survey embeds the same singleton engine, never a second one.
  assert.equal((manager.match(/L\.map\(this\.mapEl/g) || []).length, 1);
});

// ---- No new products, no unrelated changes ----
test('this dashboard introduces no Smart Lands or Smart Mobility content (vehicles, missions, land grants)', () => {
  const fieldSurveyBlockStart = manager.indexOf("sc-if value=\"{{ viewIsFieldSurvey }}\"");
  const fieldSurveyBlockEnd = manager.indexOf('sc-if value="{{ viewIsUsers }}"', fieldSurveyBlockStart);
  const block = manager.slice(fieldSurveyBlockStart, fieldSurveyBlockEnd);
  assert.doesNotMatch(block, /vehicle|mission|landGrant|parcel/i);
});

// ---- Security: Inspector can never reach the Manager's Field Survey view ----
// The Field Survey Manager Dashboard adds no new authorization surface of
// its own — it renders from the same component state every other Manager
// view already renders from. So the real boundary to prove is the one that
// already exists and that this phase must not have weakened:
// verifyManagerAccess() re-verifies role on every manager.html load
// (independent of manager-login.html and of any client-side sessionStorage
// state), and it can only ever resolve to 'manager' or 'supervisor' — never
// 'inspector', 'contractor', or any other operational role.
test('verifyManagerAccess never authorizes an inspector/contractor account — only managers/{uid}.role==manager or users/{uid}.role==supervisor', () => {
  const fn = methodBody(adapter, 'async function verifyManagerAccess(api, db, user) {', 1000);
  assert.match(fn, /data\.role === 'manager'/, 'the managers/{uid} branch must require role === manager, never any role check that could pass for inspector');
  assert.match(fn, /data\.role !== 'supervisor'[\s\S]{0,80}return null/, 'the users/{uid} branch must reject every role except supervisor, so an inspector/contractor record returns null');
  assert.doesNotMatch(fn, /'inspector'|'contractor'/, 'verifyManagerAccess must never special-case or allow-list an operational role');
});

test('a rejected verifyManagerAccess() result signs the account out and redirects to manager-login.html before any observations/users data is ever requested — an Inspector session can never load Field Survey data into the Manager component', () => {
  const fn = methodBody(adapter, 'stopAuth = authApi.onAuthStateChanged(auth, async user => {', 2300);
  assert.match(fn, /const context = await verifyManagerAccess\(firestoreApi, db, user\)\.catch\(\(\) => null\);/);
  const guardIdx = fn.indexOf('if (!context) {');
  const queryIdx = fn.indexOf("firestoreApi.collection(db, 'observations')");
  assert.notEqual(guardIdx, -1);
  assert.notEqual(queryIdx, -1);
  assert.ok(guardIdx < queryIdx, 'the !context guard (sign-out + redirect) must run before any observations query is constructed');
  const guardBlock = fn.slice(guardIdx, queryIdx);
  assert.match(guardBlock, /await authApi\.signOut\(auth\)/);
  assert.match(guardBlock, /location\.replace\('manager-login\.html'\)/);
  assert.match(guardBlock, /return;/);
});

console.log('manager Phase 04 Field Survey Manager Dashboard OK');
