'use strict';
// ============================================================================
// PHASE12C.1 — USER CENTER RUNTIME HANG REGRESSION
//
// Root cause (confirmed by live-Preview reproduction + code audit):
//   manager-phase11c-user-center-core.js's U.post/U.org called the bare
//   fetch() API with no timeout/AbortController. renderCenter()'s single
//   `await getDirectory(force)` therefore had no upper bound: if either the
//   employees or the users list request stalled (cold serverless start,
//   dropped connection), the awaited promise never settled — not resolved,
//   not rejected — so renderCenter() never reached EITHER its success-render
//   branch OR its existing catch/error branch. The route guard's static
//   placeholder ("جاري تجهيز السجل المؤسسي", manager-dashboard-format.js)
//   was left on screen forever with no recoverable state.
//
//   A second, independent defect made retry unreliable even when the error
//   branch WAS reached: U.session() cached its promise in a module-level
//   `sessionP` variable and never cleared it on rejection, so once poisoned
//   by one early failure it permanently short-circuited every future
//   session/org/post call — including the "إعادة المحاولة" retry button —
//   for the rest of the page's lifetime.
//
// These tests extract the REAL fixed source (via node:vm) and execute it
// directly, the same "extract real source, execute it directly" technique
// established by test/manager-component-did-update-regression.test.js.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const coreSource = fs.readFileSync(path.join(__dirname, '..', 'manager-phase11c-user-center-core.js'), 'utf8');
const centerSource = fs.readFileSync(path.join(__dirname, '..', 'manager-phase11d-user-center-enhancements.js'), 'utf8');

function slice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `start marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `end marker not found: ${endMarker}`);
  return source.slice(start, end);
}

// ---------------------------------------------------------------------------
// A minimal window/document shim — just enough surface for
// manager-phase11c-user-center-core.js to load and run top-to-bottom
// (addEventListener stubs, a no-op style-injection path). No real DOM
// library (e.g. jsdom) is a project dependency, so this stays intentionally
// narrow rather than pulling one in for these tests.
// ---------------------------------------------------------------------------
function buildCoreSandbox({ fetchImpl, setTimeoutImpl, clearTimeoutImpl } = {}) {
  const listeners = {};
  const fakeStyleEl = { set textContent(_v) {}, id: '' };
  const window = {
    SmartHSRInstitutionalUC: undefined,
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    dispatchEvent: () => {},
  };
  const document = {
    getElementById: () => null,
    createElement: () => ({ ...fakeStyleEl }),
    head: { appendChild: () => {} },
    documentElement: { dataset: {} },
    querySelectorAll: () => [],
  };
  const sandbox = {
    window, document, console,
    fetch: fetchImpl,
    AbortController,
    setTimeout: setTimeoutImpl || setTimeout,
    clearTimeout: clearTimeoutImpl || clearTimeout,
    MutationObserver: class { observe() {} disconnect() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(coreSource, sandbox);
  return { U: sandbox.window.SmartHSRInstitutionalUC, listeners };
}

test('U.fetchTimed rejects with request_timeout instead of hanging forever when the network stalls', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // A genuinely stalled request: it only ever settles if its AbortSignal
  // fires, exactly like real fetch() — the failure mode reproduced against
  // the live Preview (a request that neither resolves nor rejects on its own).
  const neverSettles = (url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => {
      const err = new Error('The operation was aborted.');
      err.name = 'AbortError';
      reject(err);
    });
  });
  const { U } = buildCoreSandbox({ fetchImpl: neverSettles });

  const pending = U.fetchTimed('/api/admin/employees', { method: 'POST' });
  let settled = false;
  pending.then(() => { settled = true; }, () => { settled = true; });

  // Well before the timeout: must still be pending, not settled early/falsely.
  await Promise.resolve();
  assert.equal(settled, false, 'must not settle before the timeout elapses');

  t.mock.timers.tick(U.REQUEST_TIMEOUT_MS);
  await assert.rejects(pending, (err) => {
    assert.equal(err.reason, 'request_timeout');
    return true;
  }, 'a stalled request must eventually reject instead of hanging forever');
});

test('U.fetchTimed resolves normally and passes the real response through when the network responds in time', async () => {
  const fakeResponse = { ok: true, status: 200, json: async () => ({ employees: [] }) };
  const { U } = buildCoreSandbox({ fetchImpl: async () => fakeResponse });
  const result = await U.fetchTimed('/api/admin/employees', { method: 'POST' });
  assert.equal(result, fakeResponse, 'a normal response must not be altered or delayed by the timeout guard');
});

test('U.org and U.post route their fetch calls through the timeout-bounded U.fetchTimed, not a bare fetch()', () => {
  // A regex assertion (this repo's dominant style for the ~39 existing focused
  // tests) rather than execution: proves BOTH call sites the root-cause fix
  // needed to cover are actually wrapped, not just one of them.
  assert.match(coreSource, /U\.org=async\(\)=>\{[^}]*U\.fetchTimed\('\/api\/organization\/context'/);
  assert.match(coreSource, /U\.post=async\(path,p\)=>\{[^}]*U\.fetchTimed\(path,/);
  assert.doesNotMatch(
    slice(coreSource, 'U.post=async', 'U.dir=async'),
    /await fetch\(/,
    'U.post/U.org must not fall back to an un-timed fetch() call'
  );
});

test('U.session no longer permanently caches a rejected session promise (poisoned-cache fix)', async () => {
  const sessionSrc = slice(coreSource, 'U.session=async', 'U.fetchTimed=async');
  assert.match(sessionSrc, /sessionP=p/);
  assert.match(sessionSrc, /p\.catch\(\(\)=>\{if\(sessionP===p\)sessionP=null\}\)/,
    'a rejected attempt must clear sessionP so the NEXT call retries instead of returning the same dead promise forever');
  // Executable proof of the actual failure mode this fixes: a manual
  // memoization cache built with the OLD (pre-fix) shape stays poisoned
  // forever after one rejection, exactly like the bug did.
  let oldCache;
  const oldSession = async () => { if (oldCache) return oldCache; oldCache = Promise.reject(new Error('no_session')); return oldCache; };
  await Promise.allSettled([oldSession()]);
  await assert.rejects(oldSession()); // still rejects on the 2nd call — proving the OLD shape can never recover, motivating the fix
});

test('the transient-error/permission-denied classification renders the exact required states (Missions 4 & 5)', () => {
  const classifySrc = slice(centerSource, 'const deniedReasons=', "const retryButton=isPermissionDenied?'':'<button class=\"ucv2-btn ghost\" data-retry>إعادة المحاولة</button>';");
  const src = `
    (function classify(error){
      ${classifySrc}
      const retryButton=isPermissionDenied?'':'<button class="ucv2-btn ghost" data-retry>إعادة المحاولة</button>';
      return { stateClass, title, hasRetry: retryButton !== '' };
    })
  `;
  const sandbox = {};
  vm.createContext(sandbox);
  const classify = vm.runInContext(src, sandbox);

  const permissionResult = classify({ status: 403, message: 'forbidden' });
  assert.equal(permissionResult.stateClass, 'ucv2-state error ucv2-state-denied');
  assert.equal(permissionResult.title, 'لا تملك صلاحية الوصول لمركز المستخدمين');
  assert.equal(permissionResult.hasRetry, false, 'permission denial must be a controlled dead-end, not offer a retry that can never succeed');

  const managerRequiredResult = classify({ reason: 'manager_required', message: 'manager_required' });
  assert.equal(managerRequiredResult.stateClass, 'ucv2-state error ucv2-state-denied');

  const timeoutResult = classify({ reason: 'request_timeout', message: 'request_timeout' });
  assert.equal(timeoutResult.stateClass, 'ucv2-state error ucv2-state-transient');
  assert.equal(timeoutResult.title, 'تعذر تحميل سجل المستخدمين');
  assert.equal(timeoutResult.hasRetry, true, 'a transient/timeout failure must offer Retry, never leave the user with no way forward');
});

test('renderCenter logs the failure and empty vs no-results states stay distinguishable (Missions 4 & 5)', () => {
  assert.match(centerSource, /console\.error\('\[UC:init:error\]', error\)/,
    'a minimal production diagnostic must fire on the error path so a real hang/failure is observable, not silent');

  const emptyStateSrc = slice(centerSource, 'function emptyState(total){', '; }');
  const src = `(function emptyState(total){ ${emptyStateSrc.replace('function emptyState(total){', '')} })`;
  const sandbox = {};
  vm.createContext(sandbox);
  const emptyState = vm.runInContext(src, sandbox);

  const noRecords = emptyState(0);
  assert.match(noRecords, /ucv2-state-no-records/);
  assert.doesNotMatch(noRecords, /data-reset-filters/, 'a genuinely empty registry has nothing to reset a filter back to');

  const noResults = emptyState(5);
  assert.match(noResults, /ucv2-state-no-results/);
  assert.match(noResults, /data-reset-filters/, 'zero matches against a non-empty registry must offer a way back to the full list, not read as a broken/empty screen');
});

test('renderCenter never starts a second concurrent load and never lets a stale generation overwrite a newer one (Missions 4 & 7-E)', () => {
  // Static proof the coalescing/generation guards this fix relies on to keep
  // "no infinite loading" from becoming "duplicate/overlapping loading" are
  // still exactly in place and unweakened.
  assert.match(centerSource, /if\s*\(renderQueued\)\s*\{\s*renderRequested\s*=\s*true;\s*return;\s*\}/);
  assert.match(centerSource, /const generation\s*=\s*renderGeneration;/);
  assert.match(centerSource, /generation\s*!==\s*renderGeneration/);
  assert.match(centerSource, /renderQueued\s*=\s*false;/);
});
