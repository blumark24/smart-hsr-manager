'use strict';
// ============================================================================
// PHASE13D.3 WAVE 2B.1 — MOBILE HOME SPA RELOAD GUARD.
//
// Root cause (proven live during Wave 2B verification, confirmed by source):
// the Step1B legacy fallback (manager-phase11a-foundation.js,
// onPrimaryNavigationClick) forces a full window.location.assign() reload
// for any Home-labeled click UNLESS the clicked element has a
// [data-manager-view] ancestor. The desktop sidebar's Home link carries that
// attribute, so it was already protected. The mobile drawer's Home row
// (manager.html mobNav) is a plain onClick={{i.on}} div with its own
// working goHome() SPA handler -- but it never carried [data-manager-view],
// so every mobile-drawer Home click hit the unconditional reload path
// instead of reaching that handler at all (stopPropagation() in the
// document-capture-phase fallback runs before the click ever reaches the
// drawer item's own listener).
//
// Fix: mobNav's Home row alone now also carries data-mnav-home="1"
// (every other row gets "" via the array's shared .map() default, so this
// never widens to any other row). The legacy fallback gets one additional,
// equally narrow early-return -- target.closest('[data-mnav-home="1"]') --
// placed AFTER the original, byte-for-byte-unchanged data-manager-view
// guard. The original guard, the reload call, and the SERVICE_LABELS branch
// are untouched.
//
// Source-pattern tests only (matches this suite's existing convention) — no
// live browser required; live verification is covered separately.
// ============================================================================
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const foundation = fs.readFileSync(path.join(root, 'manager-phase11a-foundation.js'), 'utf8');
const format = fs.readFileSync(path.join(root, 'manager-dashboard-format.js'), 'utf8');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');

function methodBody(source, signature, maxLen = 1200) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  return source.slice(start, start + maxLen);
}

function onPrimaryNavigationClickSource() {
  const start = foundation.indexOf('const onPrimaryNavigationClick');
  const end = foundation.indexOf('const start = ()', start);
  assert.ok(start > -1 && end > start, 'could not locate onPrimaryNavigationClick');
  return foundation.slice(start, end);
}

// ---- item 1/2/3: mobile Home never reloads, reaches goHome(), reaches st.view='home' ----

test('1. mobile drawer Home row carries data-mnav-home="1" and is the only mobNav row that does', () => {
  const mobNavBlock = methodBody(manager, 'mobNav: [', 1700);
  assert.match(mobNavBlock, /view: 'home', mnavHome: '1', \.\.\.navLook\(mobileNavigationAuthoritative && st\.view === 'home'\)/);
  // Shared default is '' for every row unless explicitly overridden.
  assert.match(manager, /mnavHome: ''/);
  // Exactly one row overrides it to '1'.
  const overrides = (manager.match(/mnavHome: '1'/g) || []).length;
  assert.equal(overrides, 1, 'expected exactly one mobNav row to override mnavHome to \'1\' (Home only)');
});

test('2. the drawer template renders data-mnav-home from the per-item prop, on the same element as onClick/aria-current', () => {
  assert.match(manager, /<div onClick="\{\{ i\.on \}\}" data-manager-view="\{\{ i\.view \}\}" data-f="1" data-mnav-home="\{\{ i\.mnavHome \}\}" aria-current="\{\{ i\.current \}\}"/);
});

test('3. the legacy fallback\'s new opt-out matches exactly that marker, placed after (not replacing) the original data-manager-view guard', () => {
  const src = onPrimaryNavigationClickSource();
  const originalGuardIdx = src.indexOf("if (target.closest('[data-manager-view]')) return;");
  const newGuardIdx = src.indexOf('if (target.closest(\'[data-mnav-home="1"]\')) return;');
  const assignIdx = src.indexOf('window.location.assign(current.toString())');
  assert.ok(originalGuardIdx > -1, 'original data-manager-view guard must be byte-for-byte unchanged');
  assert.ok(newGuardIdx > originalGuardIdx, 'new mnav-home guard must be added after the original guard, not before/replacing it');
  assert.ok(assignIdx > newGuardIdx, 'both guards must run before the reload call');
});

test('4/goHome reachability: mobile Home now uses the same delegated route contract as desktop Home', () => {
  const mobNavBlock = methodBody(manager, 'mobNav: [', 1700);
  assert.match(mobNavBlock, /view: 'home'/);
  assert.doesNotMatch(mobNavBlock, /on: \(\) => this\.goHome\(\)/);
  const bridge = methodBody(manager, 'this.onNavigateRequest = e => {', 600);
  assert.match(bridge, /home: \(\) => this\.goHome\(\)/);
});

test('goHome() sets st.view=\'home\' via plain setState -- no navigation call of any kind', () => {
  const goHomeBody = methodBody(manager, 'goHome(e) {', 300);
  assert.match(goHomeBody, /this\.setState\(\{ view: 'home', mobNavOpen: false \}\)/);
  assert.doesNotMatch(goHomeBody, /window\.location|location\.assign|location\.href/);
});

// ---- item 4: desktop Home remains SPA-only (already covered by Step1B; re-asserted here for completeness) ----

test('4. desktop Home link is covered by [data-manager-view] and therefore never reaches the reload branch at all', () => {
  assert.match(manager, /data-manager-view="home"[^>]*aria-current="\{\{ navHomeCurrent \}\}"/);
  const src = onPrimaryNavigationClickSource();
  assert.match(src, /if \(target\.closest\('\[data-manager-view\]'\)\) return;/);
});

// ---- item 5: all other [data-manager-view] routes (desktop) remain SPA-only, untouched by this fix ----

test('5. every desktop [data-manager-view] route still exists exactly once and is untouched by the Wave 2B.1 diff (only the Home mobNav row and the legacy guard changed)', () => {
  const ROUTES = ['home', 'survey', 'lands', 'mobility', 'observations', 'map', 'reports', 'users'];
  for (const route of ROUTES) {
    assert.match(manager, new RegExp(`data-manager-view="${route}"`));
  }
});

test('5b. the other real mobNav routes use view identifiers and do not carry the Home compatibility marker', () => {
  const mobNavBlock = methodBody(manager, 'mobNav: [', 1700);
  const nonHomeRoutes = [
    "view: 'survey'", "view: 'lands'", "view: 'mobility'", "view: 'observations'",
    "view: 'map'", "view: 'reports'", "view: 'users'",
  ];
  for (const marker of nonHomeRoutes) {
    const idx = mobNavBlock.indexOf(marker);
    assert.ok(idx > -1, `${marker} not found in mobNav`);
    const rowEnd = mobNavBlock.indexOf('},', idx);
    const row = mobNavBlock.slice(idx, rowEnd === -1 ? idx + 200 : rowEnd);
    assert.doesNotMatch(row, /mnavHome: '1'/, `${marker} row must not carry mnavHome:'1'`);
  }
});

// ---- item 6: true external/legacy fallback still works where intended ----

test('6. window.location.assign is still reachable for a Home-labeled element covered by NEITHER guard (genuinely external/unconverted fallback fully preserved)', () => {
  const src = onPrimaryNavigationClickSource();
  assert.match(src, /window\.location\.assign\(current\.toString\(\)\)/);
  assert.doesNotMatch(src, /HOME_LABELS\.some[\s\S]{0,40}return;\s*\}/, 'HOME_LABELS branch must not have been reduced to an unconditional no-op');
  const occurrences = (foundation.match(/window\.location\.assign\(current\.toString\(\)\)/g) || []).length;
  assert.equal(occurrences, 1, `expected exactly one window.location.assign(current.toString()) call site, found ${occurrences}`);
});

// ---- item 7: no duplicate navigation owner introduced ----

test('7. no duplicate navigation owner -- the fix is a second early-return on the EXISTING legacy handler, not a new document-level click listener or a new event dispatcher', () => {
  const listenerCount = (foundation.match(/document\.addEventListener\('click'/g) || []).length;
  assert.equal(listenerCount, 1, 'manager-phase11a-foundation.js must still register exactly one document click listener');
  assert.doesNotMatch(foundation, /dispatchEvent|new CustomEvent/, 'the legacy handler must not start dispatching its own navigation event -- it only backs off and lets the existing goHome() onClick run');
  const mobNavBlock = methodBody(manager, 'mobNav: [', 2100);
  assert.doesNotMatch(mobNavBlock, /on: \(\) => this\.(?:goHome|goRoute|goLandsGateway|openView|openMap)/, 'real mobile routes must not retain direct route handlers');
});

// ---- item 8/9: no double-click requirement, no dead click ----

test('8/9. the mnav-home opt-out is an unconditional early-return (no counter, no toggle, no second-click-required state) -- first matching click always backs off', () => {
  const src = onPrimaryNavigationClickSource();
  assert.match(src, /if \(target\.closest\('\[data-mnav-home="1"\]'\)\) return;/);
});

// ---- item 10: no regression to the Step1B guard itself ----

test('10. the original Step1B data-manager-view guard is byte-for-byte unchanged, and still runs before window.location.assign', () => {
  const src = onPrimaryNavigationClickSource();
  assert.match(src, /if\s*\(\s*target\.closest\('\[data-manager-view\]'\)\s*\)\s*return;/);
  const guardIdx = src.indexOf("if (target.closest('[data-manager-view]')) return;");
  const assignIdx = src.indexOf('window.location.assign(current.toString())');
  assert.ok(guardIdx > -1 && assignIdx > guardIdx, 'the data-manager-view guard must still run before window.location.assign(current.toString())');
});

test('10b. SERVICE_LABELS branch (scroll-to-top) untouched by this fix', () => {
  assert.match(foundation, /if \(SERVICE_LABELS\.some\(service => label\.includes\(service\)\)\) setTimeout\(\(\)=>window\.scrollTo\(\{top:0,behavior:'smooth'\}\),0\);/);
});

test('10c. installManagerNavigationGuard registration-order proof (manager-dashboard-format.js) is untouched', () => {
  const guardCallIdx = format.indexOf('installManagerNavigationGuard();');
  const loadFilesIdx = format.indexOf("'./manager-phase11a-foundation.js'");
  assert.ok(guardCallIdx > -1 && loadFilesIdx > -1 && guardCallIdx < loadFilesIdx, 'installManagerNavigationGuard() must still run before manager-phase11a-foundation.js is even requested');
});

// ---- item 11/12: Wave 2B active-state and Map route tests remain valid (file-scope sanity) ----

test('11/12. Wave 2B.2 does not touch frozen Window System, RBAC, or Firestore Rules files', () => {
  const { execSync } = require('node:child_process');
  let diffFiles = '';
  try {
    diffFiles = execSync('git diff --name-only HEAD', { cwd: root, encoding: 'utf8' });
  } catch (_) {
    diffFiles = '';
  }
  const files = diffFiles.split('\n').filter(Boolean);
  for (const f of files) {
    assert.doesNotMatch(f, /manager-phase11[cdfg]-/, `${f} must not be modified (Window System V1 is frozen)`);
    assert.doesNotMatch(f, /(?:firestore|storage)\.rules$/i, `${f} must not be modified (security rules are frozen)`);
    assert.doesNotMatch(f, /(?:^|\/)api\//, `${f} must not be modified (RBAC/backend policy is frozen)`);
  }
});
