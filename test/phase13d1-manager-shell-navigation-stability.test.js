'use strict';
// ============================================================================
// PHASE13D.1 — regression tests for:
//   1) the primary Manager sidebar navigation fix (a proven live
//      ReferenceError, caused by raw unresolved onClick="{{ goX }}"
//      template text intermittently reaching the DOM as a native onclick
//      attribute, is now impossible for the 8 primary routes because they
//      no longer carry any such binding at all — a persistent, capture-
//      phase delegated listener intercepts the click before any per-node
//      template-compiled handler could ever run, broken or not);
//   2) User Center's mount, now a normal sibling Manager view inside
//      <main> (manager.html's viewIsUsers block) instead of a fixed-
//      position overlay outside it.
//
// Source-pattern tests only (matches this suite's existing convention,
// e.g. test/manager-user-center-ui.test.js) — no live browser required.
// ============================================================================
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const manager = fs.readFileSync(path.join(__dirname, '..', 'manager.html'), 'utf8');
const format = fs.readFileSync(path.join(__dirname, '..', 'manager-dashboard-format.js'), 'utf8');
const skin = fs.readFileSync(path.join(__dirname, '..', 'manager-phase11g-user-center-approved-skin.js'), 'utf8');
const enhancements = fs.readFileSync(path.join(__dirname, '..', 'manager-phase11d-user-center-enhancements.js'), 'utf8');

const ROUTES = ['home', 'survey', 'lands', 'mobility', 'observations', 'map', 'reports', 'users'];
const OLD_HANDLERS = ['goHome', 'goSurvey', 'goLands', 'goMobility', 'goObservations', 'goMap', 'goReports', 'goUsers'];

test('1. every primary Manager sidebar route carries a data-manager-view attribute', () => {
  for (const route of ROUTES) {
    assert.match(manager, new RegExp(`data-manager-view="${route}"`), `missing data-manager-view="${route}"`);
  }
});

test('2. no persistent-shell navigation item (header or sidebar) still carries the fragile inline-template onClick binding', () => {
  // Scoped to the persistent app shell — <header> through the end of
  // <aside> — which is mounted once and survives every view change
  // (exactly the region where the proven race can strike). Per-view
  // content further down inside <main> (Home/Field Survey quick-action
  // duplicates, etc.) is a separate, lower-risk surface out of this
  // phase's scope; only route-navigation items living in the ALWAYS-
  // mounted shell (header profile/notifications dropdowns, sidebar
  // primary nav, sidebar "الخدمات النشطة" shortcuts) are covered here.
  const shellStart = manager.indexOf('<header ');
  const shellEnd = manager.indexOf('</aside>', shellStart);
  assert.ok(shellStart > -1 && shellEnd > shellStart, 'could not locate header/aside shell boundaries');
  const shellSource = manager.slice(shellStart, shellEnd);
  for (const handler of OLD_HANDLERS) {
    assert.doesNotMatch(shellSource, new RegExp(`onClick="\\{\\{ ${handler} \\}\\}"`), `${handler} still bound via inline template onClick inside the persistent shell`);
  }
  // And every one of those spots now uses data-manager-view instead —
  // note some routes (users, observations, survey, lands) legitimately
  // appear more than once in the shell (primary nav + a header dropdown
  // or sidebar shortcut), so this only asserts presence, not count.
  for (const route of ROUTES) {
    assert.match(shellSource, new RegExp(`data-manager-view="${route}"`));
  }
});

test('3. the delegated navigation guard installs exactly once, guarded by a window flag', () => {
  assert.match(format, /if \(window\.__smartHsrManagerNavGuard\) return;/);
  assert.match(format, /window\.__smartHsrManagerNavGuard = true;/);
});

test('4. the guard calls preventDefault() on matched clicks', () => {
  const idx = format.indexOf('installManagerNavigationGuard');
  const fnSource = format.slice(idx, format.indexOf('installManagerNavigationGuard();', idx));
  assert.match(fnSource, /event\.preventDefault\(\)/);
});

test('5. the guard is registered in the capture phase', () => {
  const idx = format.indexOf('installManagerNavigationGuard');
  const fnSource = format.slice(idx, format.indexOf('installManagerNavigationGuard();', idx));
  assert.match(fnSource, /document\.addEventListener\('click', event => \{[\s\S]*?\}, true\);/);
});

test('6. the guard dispatches exactly one deterministic smart-hsr:navigate-request event carrying the route', () => {
  const idx = format.indexOf('installManagerNavigationGuard');
  const fnSource = format.slice(idx, format.indexOf('installManagerNavigationGuard();', idx));
  assert.match(fnSource, /new CustomEvent\('smart-hsr:navigate-request', \{ detail: \{ view: target\.dataset\.managerView \} \}\)/);
  assert.match(fnSource, /window\.dispatchEvent/);
});

test('7. the React bridge maps every approved route to the existing, unmodified Manager business methods', () => {
  const idx = manager.indexOf('this.onNavigateRequest');
  assert.ok(idx > -1, 'onNavigateRequest bridge not found');
  const bridgeSource = manager.slice(idx, manager.indexOf('smart-hsr:navigate-request', idx) + 400);
  const expectations = {
    home: /home:\s*\(\) => this\.goHome\(\)/,
    survey: /survey:\s*\(\) => this\.goRoute\('survey'\)/,
    lands: /lands:\s*\(\) => this\.goLandsGateway\(\)/,
    mobility: /mobility:\s*\(\) => this\.goRoute\('mobility'\)/,
    map: /map:\s*\(\) => this\.openMap\(\)/,
    reports: /reports:\s*\(\) => this\.openView\('reports'\)/,
    observations: /observations:\s*\(\) => this\.openView\('observations'\)/,
    users: /users:\s*\(\) => this\.openView\('users'\)/,
  };
  for (const [route, re] of Object.entries(expectations)) {
    assert.match(bridgeSource, re, `route "${route}" not correctly bridged to its existing method`);
  }
  // No duplicated authorization/business logic — every branch is a single
  // delegating call to a pre-existing method, nothing else.
  assert.doesNotMatch(bridgeSource, /fetch\(|setState\(\{[^}]*organizationId/);
});

test('8. the navigate-request listener is registered once in componentDidMount and removed in componentWillUnmount', () => {
  const mountIdx = manager.indexOf('componentDidMount()');
  const unmountIdx = manager.indexOf('componentWillUnmount()');
  assert.ok(mountIdx > -1 && unmountIdx > mountIdx, 'could not locate componentDidMount/componentWillUnmount');
  const mountSource = manager.slice(mountIdx, unmountIdx);
  const unmountSource = manager.slice(unmountIdx, unmountIdx + 800);
  assert.match(mountSource, /window\.addEventListener\('smart-hsr:navigate-request', this\.onNavigateRequest\)/);
  assert.match(unmountSource, /window\.removeEventListener\('smart-hsr:navigate-request', this\.onNavigateRequest\)/);
});

test('9. User Center mounts as a normal sibling Manager view inside <main>, not a fixed-position overlay outside it', () => {
  const mainStart = manager.indexOf('<main ');
  const mainEnd = manager.indexOf('</main>', mainStart);
  assert.ok(mainStart > -1 && mainEnd > mainStart, 'could not locate <main> boundaries');
  const mainSource = manager.slice(mainStart, mainEnd);
  assert.match(mainSource, /sc-if value="\{\{ viewIsUsers \}\}"/, 'viewIsUsers block must live inside <main>');
  assert.match(mainSource, /class="manager-users-mount"/);

  // The old modal-overlay presentation must no longer carry Users at all.
  const overlayStart = manager.indexOf('class="manager-view-overlay"');
  const overlayEnd = manager.indexOf('</sc-if>\n\n  <sc-if', overlayStart) > -1
    ? manager.indexOf('</sc-if>\n\n  <sc-if', overlayStart)
    : manager.length;
  const overlaySource = manager.slice(overlayStart, overlayEnd);
  assert.doesNotMatch(overlaySource, /viewIsUsers/, 'the legacy overlay-hosted Users block must be removed, not just unreachable');

  // viewOpen (the shared modal trigger) must exclude 'users'.
  assert.match(manager, /viewOpen: st\.view !== 'home' && st\.view !== 'fieldSurvey' && st\.view !== 'lands' && st\.view !== 'mobility' && st\.view !== 'users'/);
  // Home content must unmount while Users is open, exactly like the other real views.
  assert.match(manager, /viewIsHomeContent: st\.view !== 'fieldSurvey' && st\.view !== 'lands' && st\.view !== 'mobility' && st\.view !== 'users'/);

  // .ucv2-host itself must be position:static, not fixed.
  assert.match(skin, /\.ucv2-host\{\s*position:static!important;/);
  assert.doesNotMatch(skin, /\.ucv2-host\{\s*position:fixed!important;/);

  // The route guard must target the new mount point, and must no longer
  // apply overlay-only styling to root.parentElement (which is now <main>,
  // shared by every Manager view).
  assert.match(format, /document\.querySelector\('\.manager-users-mount'\)/);
  assert.doesNotMatch(format, /classList\.add\('ucv2-shell-overlay'\)/);
  assert.doesNotMatch(format, /classList\.remove\('ucv2-shell-overlay'\)/);
});

test('10. User Center\'s table wrapper carries no vertical scroll of its own (no nested scroll surface)', () => {
  assert.doesNotMatch(enhancements, /\.ucv2-table-wrap\{overflow:auto[^}]*max-height/);
  assert.match(skin, /\.ucv2-table-wrap\{[^}]*max-height:none!important;overflow:visible!important/);
});

test('11. the approved service labels are unchanged by this phase\'s work', () => {
  assert.match(manager, /إدارة الحصر الميداني/);
  assert.match(manager, /إدارة الأراضي والممتلكات/);
  assert.match(manager, /إدارة حركة السير/);
  assert.doesNotMatch(manager, /إدارة الحركة والسير/);
});
