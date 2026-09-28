'use strict';
// ============================================================================
// PHASE13D.2 — regression tests for the defensive hardening of the
// [data-open-employee] ("•••") action-menu click handler in
// manager-phase11d-user-center-enhancements.js.
//
// Background: a live investigation (deliberate, aggressive repro attempts —
// rapid search/filter churn and rapid Home<->Users toggling, both with real
// synthetic clicks against the deployed Preview) could NOT reproduce a
// stale-closure/overlapping-render race for the held `directory` reference.
// That hypothesis is DISPROVEN. Independent of that, the handler's original
// `if(!employee)return;` was a genuinely silent no-op by construction — this
// phase hardens ONLY that path (authoritative single refresh, then a visible
// non-technical message), without claiming to have fixed a proven race.
//
// Source-pattern tests only (matches this suite's existing convention, e.g.
// test/phase13d1-manager-shell-navigation-stability.test.js) — no live
// browser required.
// ============================================================================
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const enhancements = fs.readFileSync(path.join(__dirname, '..', 'manager-phase11d-user-center-enhancements.js'), 'utf8');
const core = fs.readFileSync(path.join(__dirname, '..', 'manager-phase11c-user-center-core.js'), 'utf8');

function handlerSource() {
  const start = enhancements.indexOf("app.querySelectorAll('[data-open-employee]')");
  assert.ok(start > -1, 'could not locate the [data-open-employee] handler');
  const end = enhancements.indexOf('}));', start) + 4;
  return enhancements.slice(start, end);
}

test('1. normal employee lookup (found immediately) still reaches the existing profile/action flow', () => {
  const src = handlerSource();
  assert.match(src, /let employee=\(directory\.employees\|\|\[\]\)\.find\(e=>String\(e\.employeeId\)===id\)/);
  assert.match(src, /await U\.profile\(employee\);decorateProfileDialog\(employee\);/);
});

test('2. a first-lookup miss triggers exactly ONE authoritative refresh via getDirectory(true)', () => {
  const src = handlerSource();
  const refreshCalls = src.match(/getDirectory\(true\)/g) || [];
  assert.equal(refreshCalls.length, 1, `expected exactly one getDirectory(true) call in the handler, found ${refreshCalls.length}`);
  assert.match(src, /if\(!employee\)\{\s*const refreshed=await getDirectory\(true\);/);
});

test('3. a successful refreshed lookup falls through to the same existing profile/action flow (no duplicated call)', () => {
  const src = handlerSource();
  assert.match(src, /employee=\(refreshed\.employees\|\|\[\]\)\.find\(e=>String\(e\.employeeId\)===id\)/);
  const profileCalls = src.match(/await U\.profile\(employee\)/g) || [];
  assert.equal(profileCalls.length, 1, 'U.profile(employee) must be called from a single, shared code path regardless of whether the refresh ran');
});

test('4. a second (post-refresh) miss shows a visible, non-technical message instead of returning silently', () => {
  const src = handlerSource();
  assert.match(src, /if\(!employee\)\{ showCenterActionError\(app,\{reason:'employee_not_found_after_refresh'\}\); return; \}/);
  assert.match(core, /employee_not_found_after_refresh:'تعذر تحميل بيانات الموظف\. حدّث الصفحة وحاول مرة أخرى\.'/);
});

test('5. the old bare silent-return path is gone', () => {
  assert.doesNotMatch(enhancements, /if\(!employee\)return;btn\.disabled=true/);
});

test('6. no retry loop around the refresh (no while/for wrapping getDirectory, at most one refresh attempt per click)', () => {
  const src = handlerSource();
  assert.doesNotMatch(src, /while\s*\(/);
  assert.doesNotMatch(src, /for\s*\(/);
});

test('7. exactly one click listener is still registered per action button (no duplicate binding introduced)', () => {
  const src = handlerSource();
  const addListenerCalls = src.match(/addEventListener\('click'/g) || [];
  assert.equal(addListenerCalls.length, 1, 'expected exactly one addEventListener(\'click\', ...) call in the handler body');
});

test('8. the busy/disabled UI state wraps the entire lookup+refresh+action sequence (feedback during the refresh, not just the final call)', () => {
  const src = handlerSource();
  const btnDisabledIdx = src.indexOf('btn.disabled=true');
  const tryIdx = src.indexOf('try{');
  const refreshIdx = src.indexOf('getDirectory(true)');
  const finallyIdx = src.indexOf('finally{');
  assert.ok(btnDisabledIdx > -1 && btnDisabledIdx < tryIdx, 'busy state must be set before the lookup/refresh attempt');
  assert.ok(tryIdx < refreshIdx && refreshIdx < finallyIdx, 'the refresh must happen inside the same try/finally that clears busy state');
  assert.match(src, /finally\{btn\.disabled=false;app\.removeAttribute\('aria-busy'\);\}/);
});
