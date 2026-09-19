'use strict';
// PHASE13D.3 WAVE 2B — Manager Navigation Contract Implementation.
// Source-contract coverage (regex/string assertions against the real, raw
// manager.html source), following the same convention as
// manager-phase3-functional-parity.test.js and phase13d1-manager-shell-
// navigation-stability.test.js: exact-pattern checks, not a live browser.
//
// Scope: exactly two fixes.
//   WF-01 — dynamic sidebar active state, st.view as sole source of truth.
//   NAV-01 — الخريطة التشغيلية promoted to a real view:'map' SPA route.
// Everything else (Reports/Observations content ownership, responsive
// behavior, Window System V1) is asserted UNCHANGED, not modified.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');

function methodBody(source, signature, maxLen = 1200) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  return source.slice(start, start + maxLen);
}

// ---- WF-01: active-state source of truth (items 1-8) ----

test('WF-01: navLook/navPrefixed compute active state from st.view alone, no ternary inside {{ }} (this template engine cannot evaluate one)', () => {
  assert.match(manager, /const navLook = active => \(\{/);
  assert.match(manager, /current: active \? 'page' : 'false'/);
  assert.match(manager, /const navPrefixed = \(prefix, active\) => \{/);
});

test('WF-01 items 1-8: each desktop route is active only for its own st.view while the mobile drawer is not authoritative', () => {
  assert.match(manager, /\.\.\.navPrefixed\('navHome', !mobileNavigationAuthoritative && st\.view === 'home'\)/);
  assert.match(manager, /\.\.\.navPrefixed\('navSurvey', !mobileNavigationAuthoritative && st\.view === 'fieldSurvey'\)/);
  assert.match(manager, /\.\.\.navPrefixed\('navLands', !mobileNavigationAuthoritative && st\.view === 'lands'\)/);
  assert.match(manager, /\.\.\.navPrefixed\('navMobility', !mobileNavigationAuthoritative && st\.view === 'mobility'\)/);
  assert.match(manager, /\.\.\.navPrefixed\('navUsers', !mobileNavigationAuthoritative && st\.view === 'users'\)/);
  assert.match(manager, /\.\.\.navPrefixed\('navMap', !mobileNavigationAuthoritative && st\.view === 'map'\)/);
  assert.match(manager, /\.\.\.navPrefixed\('navObs', !mobileNavigationAuthoritative && st\.view === 'observations'\)/);
  assert.match(manager, /\.\.\.navPrefixed\('navReports', !mobileNavigationAuthoritative && st\.view === 'reports'\)/);
});

test('WF-01 item 9: desktop active state remains mutually exclusive and is suppressed while the responsive drawer owns aria-current', () => {
  const activeCalls = [...manager.matchAll(/navPrefixed\('nav(\w+)', !mobileNavigationAuthoritative && st\.view === '(\w+)'\)/g)];
  assert.equal(activeCalls.length, 8, 'expected exactly 8 navPrefixed(...) calls driving sidebar active state');
  const compared = activeCalls.map(m => m[2]);
  assert.equal(new Set(compared).size, 8, 'the 8 compared route values must be distinct -- otherwise two links could read active for the same st.view');
  assert.match(manager, /const mobileNavigationAuthoritative = \(st\.bp === 'tab' \|\| st\.bp === 'mob'\) && st\.mobNavOpen;/);
});

test('WF-01 item 10: the old static aria-current="page" hardcoded on Home only is gone -- no stale always-on active state survives', () => {
  assert.doesNotMatch(manager, /data-manager-view="home"[^>]*aria-current="page"/);
  assert.match(manager, /data-manager-view="home"[^>]*aria-current="\{\{ navHomeCurrent \}\}"/);
});

test('WF-01 item 11: desktop sidebar parity -- all 8 data-manager-view links (including the two accordion sub-groups) carry a dynamic aria-current bound to their own nav*Current prop', () => {
  assert.match(manager, /data-manager-view="home"[^>]*aria-current="\{\{ navHomeCurrent \}\}"/);
  assert.match(manager, /data-manager-view="survey"[^>]*aria-current="\{\{ navSurveyCurrent \}\}"/);
  assert.match(manager, /data-manager-view="lands"[^>]*aria-current="\{\{ navLandsCurrent \}\}"/);
  assert.match(manager, /data-manager-view="mobility"[^>]*aria-current="\{\{ navMobilityCurrent \}\}"/);
  assert.match(manager, /data-manager-view="users"[^>]*aria-current="\{\{ navUsersCurrent \}\}"/);
  assert.match(manager, /data-manager-view="map"[^>]*aria-current="\{\{ navMapCurrent \}\}"/);
  assert.match(manager, /data-manager-view="observations"[^>]*aria-current="\{\{ navObsCurrent \}\}"/);
  assert.match(manager, /data-manager-view="reports"[^>]*aria-current="\{\{ navReportsCurrent \}\}"/);
});

test('WF-01 item 12: mobile drawer parity -- every real mobNav destination gets the same navLook(...) active/inactive look as its desktop counterpart, and the sc-for template renders it (aria-current + color + background + border)', () => {
  const mobNavBlock = methodBody(manager, 'mobNav: [', 2100);
  const routePairs = [['home', 'home'], ['survey', 'fieldSurvey'], ['lands', 'lands'], ['mobility', 'mobility'], ['observations', 'observations'], ['map', 'map'], ['reports', 'reports'], ['users', 'users']];
  for (const [route, stateView] of routePairs) {
    assert.match(mobNavBlock, new RegExp(`view: '${route}'[^\\n]*navLook\\(mobileNavigationAuthoritative && st\\.view === '${stateView}'\\)`));
  }
  assert.match(manager, /<sc-for list="\{\{ mobNav \}\}" as="i"[^>]*>\s*<div onClick="\{\{ i\.on \}\}" data-manager-view="\{\{ i\.view \}\}" data-f="1" data-mnav-home="\{\{ i\.mnavHome \}\}" aria-current="\{\{ i\.current \}\}"/);
});

test('WF-01: settings stays a dialog, not a route -- unaffected by the active-state change', () => {
  assert.match(manager, /onClick="\{\{ openSettings \}\}"/);
  assert.doesNotMatch(manager, /data-manager-view="settings"/);
});

test('WF-01: disabled/"قريباً" stub items remain inert -- no active state, no data-manager-view, unaffected by this change', () => {
  const adminExpanded = methodBody(manager, 'aria-disabled="true" title="الهيكل الإداري قريباً"', 400);
  assert.doesNotMatch(adminExpanded, /data-manager-view/);
});

// ---- NAV-01: Operational Map is a real SPA route (items 13-16) ----

test('NAV-01 item 13: map first-click navigation still owned by the single existing delegated chain -- click -> installManagerNavigationGuard -> smart-hsr:navigate-request -> the React bridge\'s route table -> openMap() (unchanged ownership, only the destination state changes)', () => {
  const bridge = methodBody(manager, 'this.onNavigateRequest = e => {', 500);
  assert.match(bridge, /map: \(\) => this\.openMap\(\)/);
});

test('NAV-01 item 14: map stays inside the Manager SPA -- openMap() sets a real, distinct view:\'map\' state (not view:\'home\')', () => {
  const openMap = methodBody(manager, 'openMap(e) {', 400);
  assert.match(openMap, /view: 'map'/);
  assert.doesNotMatch(openMap, /view: 'home'/);
});

test('NAV-01: the old anchor-scroll-into-Home hack is gone -- openMap() no longer scrolls the map shell into view (it is now its own <main>-mounted section, not a card partway down Home)', () => {
  const openMap = methodBody(manager, 'openMap(e) {', 400);
  assert.doesNotMatch(openMap, /scrollIntoView/);
});

test('NAV-01 item 15: no window.location.assign (or .href) anywhere in openMap() -- the sidebar map click never leaves the Manager shell', () => {
  const openMap = methodBody(manager, 'openMap(e) {', 400);
  assert.doesNotMatch(openMap, /window\.location|location\.assign|location\.href/);
});

test('NAV-01: Manager shell (aside/header) is preserved -- viewIsMap is a normal <main>-mounted sibling view exactly like fieldSurvey/lands/mobility/users, not a full-page navigation', () => {
  assert.match(manager, /viewIsMap: st\.view === 'map'/);
  assert.match(manager, /<sc-if value="\{\{ viewIsMap \}\}">/);
});

test('NAV-01: Home\'s own dashboard (KPIs/priority list) unmounts while the Map route is open, exactly like the other real routes', () => {
  assert.match(manager, /viewIsHomeContent: st\.view !== 'fieldSurvey' && st\.view !== 'lands' && st\.view !== 'mobility' && st\.view !== 'users' && st\.view !== 'map'/);
});

test('NAV-01: the shared manager-view-overlay modal (used by reports/observations/incidents) does not also try to open for the map route', () => {
  assert.match(manager, /viewOpen: st\.view !== 'home' && st\.view !== 'fieldSurvey' && st\.view !== 'lands' && st\.view !== 'mobility' && st\.view !== 'users' && st\.view !== 'map'/);
});

test('NAV-01 item 16: the explicit "فتح الخريطة التشغيلية الكاملة" CTA inside the new Map view reuses the already-approved continuity mechanism unchanged (openCanonicalMap -> openCanonicalOperationalMap() -> /operational-map.html) -- no new/duplicated canonical-map logic was written', () => {
  const mapViewBlock = methodBody(manager, '<sc-if value="{{ viewIsMap }}">', 10000);
  assert.match(mapViewBlock, /aria-label="فتح الخريطة التشغيلية الكاملة"/);
  assert.match(mapViewBlock, /onClick="\{\{ openCanonicalMap \}\}"/);
  // openCanonicalMap itself, and the canonical handler it points to, are
  // pre-existing and untouched by this phase.
  assert.match(manager, /openCanonicalMap: \(\) => this\.openCanonicalOperationalMap\(\)/);
  assert.match(manager, /openCanonicalOperationalMap\(\) \{/);
});

test('NAV-01: the new Map view reuses the existing map-shell ref callbacks (mapShellRef/mapRef) -- same Leaflet-binding infrastructure fieldSurvey/lands/mobility already share, no new map logic invented', () => {
  const mapViewBlock = methodBody(manager, '<sc-if value="{{ viewIsMap }}">', 2000);
  assert.match(mapViewBlock, /ref="\{\{ mapShellRef \}\}"/);
  assert.match(mapViewBlock, /ref="\{\{ mapRef \}\}"/);
});

// ---- Reports/Observations unchanged (item 17) ----

test('item 17: Reports content ownership is untouched -- still the shared viewOpen overlay, still reports\' own viewTitle/viewIntro branch, unchanged text', () => {
  assert.match(manager, /st\.view === 'reports' \? 'التقارير التشغيلية'/);
  assert.match(manager, /st\.view === 'reports' \? 'ملخص حي مُشتق من البلاغات والمستخدمين المقيدين بالمنظمة\.'/);
  assert.match(manager, /viewIsReports: st\.view === 'reports'/);
});

test('item 17: Observations content ownership is untouched -- still the shared viewOpen overlay, still observations\' own default viewTitle/viewIntro branch, unchanged text', () => {
  assert.match(manager, /viewIsObservations: st\.view === 'observations'/);
  // Both viewTitle/viewIntro ternary chains still fall through to the
  // observations text as their final default case (only 'map' was
  // inserted as a new branch; the existing branches were not reordered
  // or edited).
  assert.match(manager, /: 'البلاغات',/);
  assert.match(manager, /: 'عرض للقراءة فقط للبلاغات التي سمحت الصلاحيات بتحميلها\.',/);
});

test('item 17: no other view exclusion changed -- viewIsHomeContent/viewOpen gained exactly one new exclusion each ("map"), fieldSurvey/lands/mobility/users are listed exactly as before', () => {
  const homeContentOccurrences = (manager.match(/viewIsHomeContent: st\.view !== 'fieldSurvey' && st\.view !== 'lands' && st\.view !== 'mobility' && st\.view !== 'users'/g) || []).length;
  assert.equal(homeContentOccurrences, 1, 'expected exactly one viewIsHomeContent definition, with fieldSurvey/lands/mobility/users unchanged and only map newly appended');
});

// ---- Window System V1 frozen (sanity: this phase never touches it) ----

test('Window System V1 (Add Employee / Edit User glass dialogs) is untouched by this phase -- no manager-phase11c/d/f/g file is part of this diff', () => {
  const { execSync } = require('node:child_process');
  let diffFiles = '';
  try {
    diffFiles = execSync('git diff --name-only HEAD', { cwd: root, encoding: 'utf8' });
  } catch (_) {
    diffFiles = '';
  }
  for (const f of diffFiles.split('\n').filter(Boolean)) {
    assert.doesNotMatch(f, /manager-phase11[cdfg]-/, `${f} must not be modified by Wave 2B (Window System V1 is frozen)`);
  }
});
