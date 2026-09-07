'use strict';
// PHASE 04 CORRECTION GATE — the Field Survey Manager Dashboard must be a
// full-page product view (Municipality Manager Dashboard -> Digital
// Municipal Products -> Product Manager Dashboard), never the shared
// quick-view modal/backdrop used by the lighter Observations/Reports/
// Users/Incidents panels. This file proves the specific acceptance
// failure — a centered dialog with a blurred Manager dashboard still
// visible behind it and an "x" as the primary exit — is fixed, and that
// the old modal-based Field Survey markup was retired rather than left as
// a second, competing, unreachable-but-still-present implementation.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manager = read('manager.html');

function methodBody(source, signature, maxLen = 1500) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  return source.slice(start, start + maxLen);
}

// ---- TEST A: the shared backdrop/blur modal never opens for Field Survey ----
test('viewOpen (the shared quick-view backdrop/blur modal) excludes fieldSurvey — Field Survey never opens as a modal', () => {
  assert.match(manager, /viewOpen: st\.view !== 'home' && st\.view !== 'fieldSurvey'/);
});

test('the Field Survey block sits structurally before the shared modal, not inside it — it is not a descendant of <sc-if value="{{ viewOpen }}">', () => {
  const mainStart = manager.indexOf('<main style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px">');
  const mainEnd = manager.indexOf('</main>', mainStart);
  const modalStart = manager.indexOf('<sc-if value="{{ viewOpen }}">');
  const fieldSurveyBlockStart = manager.indexOf('<sc-if value="{{ viewIsFieldSurvey }}">');
  assert.notEqual(mainStart, -1); assert.notEqual(mainEnd, -1); assert.notEqual(modalStart, -1); assert.notEqual(fieldSurveyBlockStart, -1);
  assert.ok(fieldSurveyBlockStart > mainStart && fieldSurveyBlockStart < mainEnd, 'the Field Survey view must render inside <main>, occupying the application workspace');
  assert.ok(mainEnd < modalStart, 'the shared quick-view modal must open only after <main> closes — Field Survey, rendered inside <main>, can never be inside it');
});

test('only one viewIsFieldSurvey block exists — the old modal-based implementation was retired, not left as a second competing experience', () => {
  const occurrences = manager.match(/sc-if value="\{\{ viewIsFieldSurvey \}\}"/g) || [];
  assert.equal(occurrences.length, 1, 'the failed modal-based Field Survey markup must be removed, not merely made unreachable');
});

test('the general Municipality Manager home dashboard content is hidden (not merely covered) while Field Survey is open — it is wrapped in the negated condition, not left rendering underneath', () => {
  const mainStart = manager.indexOf('<main style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px">');
  const homeGuardIdx = manager.indexOf('<sc-if value="{{ !viewIsFieldSurvey }}">', mainStart);
  const fieldSurveyBlockStart = manager.indexOf('<sc-if value="{{ viewIsFieldSurvey }}">', mainStart);
  assert.notEqual(homeGuardIdx, -1, 'the home dashboard content must be gated on !viewIsFieldSurvey, not always rendered');
  assert.ok(homeGuardIdx > mainStart && homeGuardIdx < fieldSurveyBlockStart, 'the home-dashboard guard must open before the Field Survey block, as its sibling — never both visible at once');
});

test('the Field Survey product area is not a centered dialog: no role="dialog"/aria-modal, no fixed-inset backdrop, no "x" close glyph inside its block', () => {
  const start = manager.indexOf('<sc-if value="{{ viewIsFieldSurvey }}">');
  const end = manager.indexOf('</main>', start);
  const block = manager.slice(start, end);
  assert.doesNotMatch(block, /role="dialog"|aria-modal/);
  assert.doesNotMatch(block, /position:fixed;inset:0/);
  assert.doesNotMatch(block, />×</, 'no bare "x" glyph as a close control inside the Field Survey product area');
});

// ---- TEST B: proper product return navigation, not an "x" icon ----
test('the Field Survey product exposes a real "return to Municipality Manager Dashboard" action (text label, reuses the existing closeView handler) as its return path', () => {
  const start = manager.indexOf('<sc-if value="{{ viewIsFieldSurvey }}">');
  const end = manager.indexOf('</main>', start);
  const block = manager.slice(start, end);
  assert.match(block, /العودة إلى لوحة مدير البلدية/);
  assert.match(block, /onClick="\{\{ closeView \}\}"/, 'the return action must reuse the existing, already-tested closeView handler — same session, no reload');
});

// ---- Product navigation: real sections only, no dead tabs ----
test('fsNav offers only real, already-implemented sections (executive overview, observations log, inspector oversight) — no fabricated/dead nav items', () => {
  const fn = methodBody(manager, 'const fsNav = [', 400);
  assert.match(fn, /نظرة تنفيذية/);
  assert.match(fn, /سجل أعمال الحصر/);
  assert.match(fn, /المراقبون/);
  assert.doesNotMatch(fn, /التقارير|قريباً|soon/i, 'no thin/duplicate "reports" tab or "coming soon" placeholder nav item');
});

test('each fsNav screen gates real, previously-verified content (KPIs/priorities/categories, the real table, or real inspector oversight) — never an empty/fake screen', () => {
  assert.match(manager, /fsScreenIsExec: fsScreen === 'exec', fsScreenIsLog: fsScreen === 'log', fsScreenIsInspectors: fsScreen === 'inspectors', fsScreenIsMap: fsScreen === 'map'/);
  const start = manager.indexOf('<sc-if value="{{ viewIsFieldSurvey }}">');
  const end = manager.indexOf('</main>', start);
  const block = manager.slice(start, end);
  assert.match(block, /sc-if value="\{\{ fsScreenIsExec \}\}"[\s\S]{0,1000}fsTotal/, 'exec screen must show the real KPI row');
  assert.match(block, /sc-if value="\{\{ fsScreenIsLog \}\}"[\s\S]{0,2800}tRows/, 'log screen must show the real observations table');
  assert.match(block, /sc-if value="\{\{ fsScreenIsInspectors \}\}"[\s\S]{0,600}fsInspectors/, 'inspectors screen must show the real inspector oversight list');
  assert.match(block, /sc-if value="\{\{ fsScreenIsMap \}\}"[\s\S]{0,600}mapRef/, 'the dedicated map screen must render the real operational map container');
});

// ---- Inspector separation still holds (unchanged by this correction) ----
test('goRoute still opens the promoted fieldSurvey view, never dashboard.html', () => {
  const fn = methodBody(manager, 'goRoute(r) {', 900);
  assert.match(fn, /r === 'survey'\s*\)\s*\{\s*this\.openFieldSurvey\(\)/);
  assert.doesNotMatch(fn, /r === 'survey'[\s\S]{0,60}dashboard\.html/);
});

console.log('manager Phase 04 correction — full-page Field Survey Manager Dashboard OK');
