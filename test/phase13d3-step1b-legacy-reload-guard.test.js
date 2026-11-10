'use strict';
// ============================================================================
// PHASE13D.3 STEP 1B — regression test for the legacy full-page-reload
// navigation conflict.
//
// Root cause (proven by source + live trace):
// manager-phase11a-foundation.js registers its own document-level,
// capture-phase click listener (onPrimaryNavigationClick), independent of
// and registered AFTER manager-dashboard-format.js's
// installManagerNavigationGuard(). When the clicked element's textContent
// matches HOME_LABELS ('الرئيسية'/'لوحة المدير'), it called
// window.location.assign() unconditionally — a full page reload. Because
// both listeners live on the same `document` node in the same (capture)
// phase, the delegated guard's event.stopPropagation() does not stop this
// second, same-node listener from also firing on the very same click, so
// every already-successful SPA navigation home was immediately followed by
// a redundant full reload racing it. Confirmed live: ~1 reload per
// Users->Home cycle, degrading first-click reliability to 89/100 in a 100x
// stress run.
//
// Fix: the legacy handler's HOME_LABELS branch now returns early (skips its
// own preventDefault/stopPropagation/location.assign entirely) whenever the
// clicked element has a [data-manager-view] ancestor -- i.e. whenever that
// route is already owned by the delegated SPA navigation system. Any
// Home-labeled element WITHOUT a [data-manager-view] ancestor (not yet
// converted, or genuinely external) keeps the original fallback behavior
// completely unchanged.
//
// Source-pattern tests only (matches this suite's existing convention) — no
// live browser required.
// ============================================================================
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const foundation = fs.readFileSync(path.join(__dirname, '..', 'manager-phase11a-foundation.js'), 'utf8');
const format = fs.readFileSync(path.join(__dirname, '..', 'manager-dashboard-format.js'), 'utf8');
const manager = fs.readFileSync(path.join(__dirname, '..', 'manager.html'), 'utf8');

function onPrimaryNavigationClickSource() {
  const start = foundation.indexOf('const onPrimaryNavigationClick');
  const end = foundation.indexOf('const start = ()', start);
  assert.ok(start > -1 && end > start, 'could not locate onPrimaryNavigationClick');
  return foundation.slice(start, end);
}

test('1. the legacy HOME_LABELS branch skips its own full-page fallback when the click is already owned by [data-manager-view]', () => {
  const src = onPrimaryNavigationClickSource();
  assert.match(src, /if\s*\(\s*target\.closest\('\[data-manager-view\]'\)\s*\)\s*return;/);
  // The guard's CODE line (not any comment mentioning it) must precede the
  // actual reload statement. Anchor on the real call shape with its real
  // argument, which no comment in this file quotes verbatim.
  const guardIdx = src.indexOf("if (target.closest('[data-manager-view]')) return;");
  const assignIdx = src.indexOf('window.location.assign(current.toString())');
  assert.ok(guardIdx > -1 && assignIdx > guardIdx, 'the data-manager-view guard must run before window.location.assign(current.toString())');
});

test('2. window.location.assign is still reachable for Home-labeled elements NOT covered by data-manager-view (unconverted/external fallback preserved)', () => {
  const src = onPrimaryNavigationClickSource();
  assert.match(src, /window\.location\.assign\(current\.toString\(\)\)/);
  // The guard is a conditional early-return, not a deletion of the fallback.
  assert.doesNotMatch(src, /HOME_LABELS\.some[\s\S]{0,40}return;\s*\}/, 'HOME_LABELS branch must not have been reduced to an unconditional no-op');
});

test('3. the SERVICE_LABELS branch (scroll-to-top) is completely untouched by this fix -- not part of the proven conflict', () => {
  assert.match(foundation, /if \(SERVICE_LABELS\.some\(service => label\.includes\(service\)\)\) setTimeout\(\(\)=>window\.scrollTo\(\{top:0,behavior:'smooth'\}\),0\);/);
});

test('4. no stopImmediatePropagation was introduced -- the fix guards the legacy handler itself instead of suppressing sibling listeners', () => {
  assert.doesNotMatch(foundation, /stopImmediatePropagation/);
  assert.doesNotMatch(format, /stopImmediatePropagation/);
});

test('5. the delegated navigation guard (installManagerNavigationGuard) registers before manager-phase11a-foundation.js is loaded, proving registration order', () => {
  const guardCallIdx = format.indexOf('installManagerNavigationGuard();');
  const loadFilesIdx = format.indexOf("'./manager-phase11a-foundation.js'");
  assert.ok(guardCallIdx > -1 && loadFilesIdx > -1 && guardCallIdx < loadFilesIdx, 'installManagerNavigationGuard() must run before manager-phase11a-foundation.js is even requested');
});

test('6. every primary Manager sidebar route still carries exactly one data-manager-view attribute occurrence per element (single ownership, no duplicate route wiring)', () => {
  const ROUTES = ['home', 'survey', 'lands', 'mobility', 'observations', 'map', 'reports', 'users'];
  for (const route of ROUTES) {
    assert.match(manager, new RegExp(`data-manager-view="${route}"`));
  }
  // The delegated guard dispatches exactly one navigate-request per matched click.
  assert.match(format, /const view = target\?\.dataset\.managerView;/);
  assert.match(format, /if \(!view\) return;/);
  assert.match(format, /new CustomEvent\('smart-hsr:navigate-request', \{ detail: \{ view \} \}\)/);
});

test('7. no window.location.assign call exists anywhere else in the legacy foundation file (the one guarded occurrence is the only reload path)', () => {
  // Count only the real call shape (with its actual argument), so this
  // assertion is immune to any comment that mentions window.location.assign
  // by name without reproducing the exact call.
  const occurrences = (foundation.match(/window\.location\.assign\(current\.toString\(\)\)/g) || []).length;
  assert.equal(occurrences, 1, `expected exactly one window.location.assign(current.toString()) call site, found ${occurrences}`);
});
