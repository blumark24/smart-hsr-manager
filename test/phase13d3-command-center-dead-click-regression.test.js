'use strict';
// ============================================================================
// PHASE13D.3 — regression test for the P0 "مركز القيادة does nothing on the
// first click while User Center is open" defect.
//
// Root cause (proven by source inspection, manager-dashboard-format.js):
// installUserCenterRouteGuard()'s claim() called isolateBackground(root.
// parentElement). root is .manager-users-mount, so root.parentElement is
// <main> (Phase13D.1's mount point) and overlay.parentElement (pageRoot) is
// the row container holding BOTH <aside> and <main>. Filtering out `overlay`
// (<main>) left <aside> — the entire sidebar — as the node marked
// inert=true for as long as Users was open, which silently swallows every
// click on it (including مركز القيادة) at the browser/event-dispatch level,
// before any delegated handler, custom event, or React bridge ever sees it.
//
// This mechanism only ever made sense when User Center was a position:fixed
// modal and isolating "the rest of the page" behind it was the correct
// pattern. Phase13D.1 turned it into a normal sibling view (same tier as
// Field Survey/Lands/Mobility, none of which isolate the sidebar), so the
// isolateBackground/restoreBackground call must not exist any more.
//
// Source-pattern tests only (matches this suite's existing convention) — no
// live browser required.
// ============================================================================
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const format = fs.readFileSync(path.join(__dirname, '..', 'manager-dashboard-format.js'), 'utf8');

function routeGuardSource() {
  const start = format.indexOf('const installUserCenterRouteGuard');
  assert.ok(start > -1, 'could not locate installUserCenterRouteGuard');
  const end = format.indexOf('installUserCenterRouteGuard();', start) + 'installUserCenterRouteGuard();'.length;
  return format.slice(start, end);
}

test('1. the sidebar/background isolation mechanism (isolateBackground/restoreBackground) no longer exists as live code', () => {
  const src = routeGuardSource();
  // Function *definitions* and *calls* must be gone; a prose comment
  // documenting the historical bug (which legitimately names these
  // identifiers) is not what this test is guarding against.
  assert.doesNotMatch(src, /const isolateBackground\s*=/);
  assert.doesNotMatch(src, /const restoreBackground\s*=/);
  assert.doesNotMatch(src, /isolateBackground\(root\.parentElement\)/);
  assert.doesNotMatch(src, /let isolatedNodes/);
  assert.doesNotMatch(src, /node\.inert\s*=\s*true/);
});

test('2. claim() no longer calls isolateBackground() when opening User Center', () => {
  const src = routeGuardSource();
  const claimStart = src.indexOf('const claim = ()');
  const claimEnd = src.indexOf('const startObserver', claimStart);
  assert.ok(claimStart > -1 && claimEnd > claimStart, 'could not locate claim()');
  const claimSrc = src.slice(claimStart, claimEnd);
  assert.doesNotMatch(claimSrc, /isolateBackground\(/);
});

test('3. release() no longer restores an isolated-background state (nothing to restore any more)', () => {
  const src = routeGuardSource();
  const releaseStart = src.indexOf('const release = ()');
  const releaseEnd = src.indexOf('const findRoot', releaseStart);
  assert.ok(releaseStart > -1 && releaseEnd > releaseStart, 'could not locate release()');
  const releaseSrc = src.slice(releaseStart, releaseEnd);
  assert.doesNotMatch(releaseSrc, /restoreBackground/);
});

test('4. the persistent shell (header/aside) still carries no inert-toggling logic anywhere in the file', () => {
  assert.doesNotMatch(format, /aside[\s\S]{0,200}\.inert/);
  assert.doesNotMatch(format, /\.inert\s*=\s*true/);
});
