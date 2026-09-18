'use strict';
// ============================================================================
// PHASE12C.3 — USER CENTER LIFECYCLE STARVATION REGRESSION
//
// Finding A (Phase12C.2, live-traced against the real Preview): rapid
// open/close/reopen could leave the User Center stuck on the route guard's
// static loading placeholder — .ucv2-app present, routeGuardLoading=true,
// aria-busy=true — with ZERO network requests and .ucv2-host NEVER added,
// proving renderCenter() never even reached its first DOM mutation.
//
// Proven mechanism (live trace, Phase12C.3): boot()'s smart-hsr:user-center-
// lifecycle listener routed its active:true render attempt through
// requestRender(), whose retryTimer is a 60ms setTimeout that gets
// clearTimeout()'d and rescheduled by EVERY MutationObserver callback fire —
// and reopening the User Center reliably produces a burst of 15-25+ such
// fires (this file's own boot() observer, the route guard's observer, and
// others reacting to the same DOM churn), each one pushing the debounce
// window back. If that burst doesn't fall silent for a full 60ms before the
// next close happens, the debounced render call never fires while the view
// is still "users", and nothing else retries — the shell is stuck for that
// open, for an unbounded amount of time.
//
// Fix: the lifecycle listener's active:true branch now calls renderCenter()
// directly instead of through requestRender() — the one authoritative "a
// fresh shell now exists" signal is no longer routed through a timer that
// arbitrary, unrelated page churn can indefinitely reset. requestRender()'s
// debounce is untouched and still backs the click listener and the generic
// MutationObserver fallback.
//
// This extracts the REAL boot() source via node:vm and executes it against a
// controllable fake MutationObserver/window/document, the same "extract
// real source, execute it directly" technique established by
// test/manager-component-did-update-regression.test.js — proving the actual
// shipped trigger-dispatch code, not a reimplementation of it.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const centerSource = fs.readFileSync(path.join(__dirname, '..', 'manager-phase11d-user-center-enhancements.js'), 'utf8');

function slice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `start marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `end marker not found: ${endMarker}`);
  return source.slice(start, end);
}

// A minimal, controllable fake DOM/event surface — no real DOM/browser
// library involved. FakeMutationObserver exposes its callback so the test
// can simulate arbitrary bursts of unrelated mutation "noise" on demand.
function buildHarness(renderCenterSpy) {
  const bootSrc = slice(centerSource, 'function boot(){', "if(document.readyState==='loading')");

  const windowListeners = {};
  const documentListeners = {};
  const fakeWindow = {
    addEventListener: (type, fn) => { (windowListeners[type] = windowListeners[type] || []).push(fn); },
    dispatchEvent: (event) => { (windowListeners[event.type] || []).forEach(fn => fn(event)); },
  };
  const fakeDocument = {
    body: {},
    addEventListener: (type, fn, opts) => { (documentListeners[type] = documentListeners[type] || []).push({ fn, opts }); },
  };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }

  const observerInstances = [];
  class FakeMutationObserver {
    constructor(cb) { this.cb = cb; observerInstances.push(this); }
    observe() {}
    disconnect() {}
  }

  let generation = 0, requested = false, root = null;
  const sandbox = {
    console,
    window: fakeWindow,
    document: fakeDocument,
    CustomEvent,
    MutationObserver: FakeMutationObserver,
    setTimeout, clearTimeout,
    clean: value => String(value == null ? '' : value).trim(),
    installTheme: () => {},
    findCenterRoot: () => ({ querySelector: () => null }),
    renderCenter: renderCenterSpy,
    get renderGeneration() { return generation; }, set renderGeneration(v) { generation = v; },
    get renderRequested() { return requested; }, set renderRequested(v) { requested = v; },
    get lastRoot() { return root; }, set lastRoot(v) { root = v; },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${bootSrc}\nboot();`, sandbox);

  return {
    fireLifecycle: active => fakeWindow.dispatchEvent(new CustomEvent('smart-hsr:user-center-lifecycle', { detail: { active } })),
    fireMutationNoise: (n = 1) => { for (let i = 0; i < n; i++) observerInstances.forEach(o => o.cb([{ type: 'attributes', addedNodes: [] }], o)); },
    windowListenerCount: type => (windowListeners[type] || []).length,
    documentListenerCount: type => (documentListeners[type] || []).length,
  };
}

test('the lifecycle listener calls renderCenter() directly for active:true, not through the resettable debounce', () => {
  const lifecycleSrc = slice(centerSource, "window.addEventListener('smart-hsr:user-center-lifecycle'", '});');
  assert.match(lifecycleSrc, /if\(event\.detail\?\.active\)renderCenter\(\);/,
    'active:true must call renderCenter() directly — routing it through requestRender() is exactly the starvation bug this phase fixes');
  assert.doesNotMatch(lifecycleSrc, /if\(event\.detail\?\.active\)requestRender\(\);/,
    'must not have regressed back to the debounced call');
});

test('active:true triggers an immediate, synchronous render attempt even under a sustained mutation-noise burst', () => {
  let renderCalls = 0;
  const h = buildHarness(() => { renderCalls += 1; });
  const baseline = renderCalls; // boot() itself calls renderCenter() once unconditionally on load

  h.fireLifecycle(true);
  // Simulate the exact live-traced failure condition: a large burst of
  // unrelated MutationObserver callback fires immediately following the
  // lifecycle signal, faster than the old 60ms debounce could ever settle.
  h.fireMutationNoise(30);

  assert.equal(renderCalls - baseline, 1, 'renderCenter() must have already been invoked before any mutation noise could matter — the old requestRender() routing would have been reset 30 times here and never fired');
});

test('100 synthetic open/close cycles with mutation noise between every signal: render ownership is never starved', () => {
  let renderCalls = 0;
  let lifecycleActiveCalls = 0;
  const h = buildHarness(() => { renderCalls += 1; });
  renderCalls = 0; // discard boot()'s own unconditional initial renderCenter() call

  for (let cycle = 1; cycle <= 100; cycle++) {
    h.fireMutationNoise(Math.floor(Math.random() * 10)); // background churn before open, like live Firestore/UI updates
    h.fireLifecycle(true);
    lifecycleActiveCalls += 1;
    h.fireMutationNoise(20 + Math.floor(Math.random() * 20)); // the live-traced post-open cascade
    h.fireLifecycle(false); // close
    h.fireMutationNoise(Math.floor(Math.random() * 5));
  }

  assert.equal(renderCalls, lifecycleActiveCalls, `every one of ${lifecycleActiveCalls} active:true signals must have produced exactly one render attempt — got ${renderCalls} (${lifecycleActiveCalls - renderCalls} starved = permanent-loading cases)`);
  // Listener accumulation: boot() registers its listeners exactly once, at
  // module load — 100 open/close cycles (dispatched to those same
  // listeners) must not have registered any more.
  assert.equal(h.windowListenerCount('smart-hsr:user-center-lifecycle'), 1, 'no listener accumulation across cycles');
});

test('close still invalidates stale render ownership (renderGeneration bump / lastRoot reset unchanged)', () => {
  const closeSrc = slice(centerSource, "window.addEventListener('smart-hsr:user-center-lifecycle'", '});');
  assert.match(closeSrc, /renderGeneration\+=1;/);
  assert.match(closeSrc, /renderRequested=false;/);
  assert.match(closeSrc, /else lastRoot=null;/);
});

test('requestRender() debounce itself is untouched — still backs the click listener and the generic MutationObserver fallback', () => {
  assert.match(centerSource, /const requestRender=\(\)=>\{\s*clearTimeout\(retryTimer\);\s*retryTimer=setTimeout\(\(\)=>\{/);
  assert.match(centerSource, /document\.addEventListener\('click',event=>\{if\(\/مركز إدارة المستخدمين\|مركز المستخدمين\/\.test\(clean\(event\.target\?\.closest\?\.\('a,button,\[role="button"\]'\)\?\.textContent\)\)\)requestRender\(\);\},true\);/);
});
