'use strict';
// Regression coverage for the manager Users-list state-corruption bug:
// users silently disappearing and a stray email auto-populating the
// search field. Root causes (both confirmed by code tracing, not guesses):
//
//   1. Users disappearing: the Firestore onSnapshot success handler in
//      manager.html's loadFromFirestore() hard-filtered every document to
//      role in {supervisor, inspector, contractor} — which silently
//      dropped every Lands-only employee (role is legitimately null for
//      them) from the `users` array entirely. renderUsers()'s error state
//      also unconditionally replaced the whole table (including any
//      already-loaded data) on any transient listener error.
//
//   2. Email in search: there is no application code path that writes to
//      #userSearch's value at all (verified: it is referenced in exactly
//      two places in manager.html — its own declaration and the one read
//      in renderUsers()). The field lacked `autocomplete="off"`, and its
//      placeholder text contains the Arabic word for "email" — a known
//      trigger for browser-native autofill on unprotected text inputs.
//      Fixed at the markup level (autocomplete="off"), not in JS, because
//      there was no JS bug to fix here.
//
// This file tests the pure logic (users-list-view.js, loaded via dynamic
// import() — the pattern already used for storage-adapter.js and
// manager-login-error-classification.js) plus the source-level wiring
// that keeps these two bugs from coming back.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const viewPromise = import(pathToFileURL(path.join(root, 'users-list-view.js')).href);

const FIELD_USER = { id: 'f1', name: 'Ahmed Field', email: 'ahmed.field@example.com', role: 'inspector', active: true };
const LANDS_USER = { id: 'l1', name: 'Sara Lands', email: 'sara.lands@example.com', role: null, landsAccess: { enabled: true, role: 'lands_employee', syncStatus: 'synced' } };
const LANDS_DEPT_MANAGER = { id: 'l2', name: 'Khaled Dept', email: 'khaled.dept@example.com', role: null, landsAccess: { enabled: true, role: 'lands_department_manager', syncStatus: 'pending_trusted_sync' } };

// ---- 1. Initial load -> all users visible ----
test('1. belongsOnUsersList: a Field account and a Lands-only account are both real, both belong on the list', async () => {
  const { belongsOnUsersList } = await viewPromise;
  assert.equal(belongsOnUsersList(FIELD_USER), true);
  assert.equal(belongsOnUsersList(LANDS_USER), true);
  assert.equal(belongsOnUsersList(LANDS_DEPT_MANAGER), true);
});

test('belongsOnUsersList: a corrupt/empty document (neither a Field role nor Lands access) is excluded', async () => {
  const { belongsOnUsersList } = await viewPromise;
  assert.equal(belongsOnUsersList({}), false);
  assert.equal(belongsOnUsersList({ role: null }), false);
  assert.equal(belongsOnUsersList(null), false);
  assert.equal(belongsOnUsersList({ role: 'manager' }), false); // managers live in managers/{uid}, never here
});

// ---- 2 & 3. Search starts empty; no account email auto-populates it ----
test('2/3. deriveVisibleUsers: an empty search returns every user, unfiltered', async () => {
  const { deriveVisibleUsers } = await viewPromise;
  const all = [FIELD_USER, LANDS_USER, LANDS_DEPT_MANAGER];
  const visible = deriveVisibleUsers(all, { search: '' });
  assert.deepEqual(visible.map(u => u.id).sort(), ['f1', 'l1', 'l2']);
  assert.notEqual(visible, all, 'must return a new array, never the same reference');
});

// manager.html's search box is no longer a raw DOM #userSearch input read
// by an imperative renderUsers() — it is a Designer-component template
// binding (value="{{ tQ }}" onChange="{{ setTQ }}"), and the users-list
// tab's search state (`tq`) lives entirely in component state, never
// assigned from anywhere but that one onChange handler. There is no
// separate "clear" function to lose autocomplete protection: the input
// itself carries type="search" + autocomplete="off" + readonly-until-focus,
// so nothing (browser autofill included) can write into it except a real
// user keystroke handled by setTQ.
test('manager.html: the users/incidents search inputs are hardened against autofill (readonly-until-focus, type=search, autocomplete=off)', () => {
  const source = read('manager.html');
  const inputs = [...source.matchAll(/<input type="search"[^>]*value="\{\{ tQ \}\}"[^>]*>/g)];
  assert.equal(inputs.length, 2, 'expected exactly the users-list and incidents-list search inputs');
  for (const [inputTag] of inputs) {
    assert.match(inputTag, /autocomplete="off"/);
    assert.match(inputTag, /readonly/);
    assert.match(inputTag, /onfocus="this\.removeAttribute\(&#39;readonly&#39;\)"/);
  }
});

test("the search state (tq) is only ever assigned by its own onChange handler, never from a user's email/name/identity", () => {
  const source = read('manager.html');
  const setTQFn = source.slice(source.indexOf('const setTQ ='), source.indexOf('const setTQ =') + 80);
  assert.match(setTQFn, /this\.setState\(\{ tq: e\.target\.value \}\)/);
  assert.doesNotMatch(source, /tq:\s*(?:user\.email|managerContext|displayName|context\.name)/, 'the search field must never be pre-populated from identity data');
});

// ---- 4. Typing an email fragment matches only that user ----
test('4. deriveVisibleUsers: a search term matches only the user whose name/email contains it', async () => {
  const { deriveVisibleUsers } = await viewPromise;
  const all = [FIELD_USER, LANDS_USER, LANDS_DEPT_MANAGER];
  const visible = deriveVisibleUsers(all, { search: 'sara.lands' });
  assert.deepEqual(visible.map(u => u.id), ['l1']);
});

test('deriveVisibleUsers matches by name too, case-insensitively, and never mutates the input array', async () => {
  const { deriveVisibleUsers } = await viewPromise;
  const all = [FIELD_USER, LANDS_USER];
  const before = JSON.stringify(all);
  const visible = deriveVisibleUsers(all, { search: 'AHMED' });
  assert.deepEqual(visible.map(u => u.id), ['f1']);
  assert.equal(JSON.stringify(all), before, 'allUsers must never be mutated by filtering');
});

// ---- 5. Clear search -> all users immediately return ----
// render() recomputes tRows fresh from st.tq on every invocation (there is
// no separate cached "view" to go stale) — deriveVisibleUsers is called
// with { search: tq } derived straight from state each time render() runs,
// which happens automatically on every setState (including setTQ's), so
// clearing the input triggers an immediate, guaranteed-fresh re-render.
test('5. the users table is recomputed fresh from state.tq on every render — clearing the input immediately restores every user', () => {
  const source = read('manager.html');
  assert.match(source, /const tq = \(st\.tq \|\| ''\)\.trim\(\)\.toLocaleLowerCase\('ar'\)/);
  assert.match(source, /usersListView\.deriveVisibleUsers\(roleScoped, \{ search: tq \}\)/);
  const setTQFn = source.slice(source.indexOf('const setTQ ='), source.indexOf('const setTQ =') + 80);
  assert.match(setTQFn, /this\.setState\(\{ tq: e\.target\.value \}\)/, 'typing must go through setState so render() re-derives tq');
});

// ---- 6-12. Nothing else touches search state: mutation handlers, service
//            editing, enable/disable, and tab switching ----
// There is no separate DOM #userSearch to accidentally write into anymore
// (see manager-phase3-functional-parity.test.js: "No user-mutation handler
// manually refetches the user list — the adapter's live onSnapshot
// subscription is the only refresh path"). The only remaining risk in the
// current architecture is a mutation/navigation handler resetting the
// unrelated `tq`/`tuFilter` state fields as a side effect; confirmed none do.
test('6/7/8/9/10/11/12. user-mutation and drawer functions never reset the search/filter state as a side effect', () => {
  const source = read('manager.html');
  const functions = ['submitAddUser', 'submitServiceChange', 'enableUserAction', 'resetUserPassword', 'openUserDetail', 'closeUserDrawer', 'openServiceEdit'];
  for (const name of functions) {
    const sigStart = source.indexOf(`async ${name}(`);
    const start = sigStart !== -1 ? sigStart : source.indexOf(`${name}(`);
    assert.notEqual(start, -1, `${name} not found`);
    const body = source.slice(start, start + 1000);
    assert.doesNotMatch(body, /\btq:\s*['"]/, `${name} must not reset the search state`);
    assert.doesNotMatch(body, /\btuFilter:\s*['"]/, `${name} must not reset the active filter`);
  }
});

test('switching views (openView) never touches the users search/filter state', () => {
  const source = read('manager.html');
  const fn = source.slice(source.indexOf('openView(view, e)'), source.indexOf('openView(view, e)') + 300);
  assert.doesNotMatch(fn, /\btq:|tuFilter:/);
});

// ---- 13. Failed refresh -> previously loaded users remain visible ----
// viewEmpty (the only thing that can blank out the table) is keyed purely
// on `!tRows.length` — never on dataState — so an error on an already-
// populated list can never blank it out; only a first load with zero
// documents shows the placeholder, and viewEmptyText picks up the real
// error text only in that already-empty case.
test('13. the users/incidents placeholder only appears when there is genuinely no data yet, never merely because of a transient error', () => {
  const source = read('manager.html');
  assert.match(source, /viewEmpty: \(\(st\.view === 'users' \|\| st\.view === 'incidents'\) \? !tRows\.length : !viewObservations\.length\)/);
  assert.match(source, /viewEmptyText: st\.dataState === 'error' \? \(st\.dataError \|\| /);
});

test("13b. the live users subscription's error callback never clears the in-memory `users` array — only the adapter's own `users` variable is touched, and it is never reset to []", () => {
  const source = read('manager-dashboard-adapter.js');
  const fn = source.slice(source.indexOf('stopUsers = firestoreApi.onSnapshot(userFilter'), source.indexOf('stopUsers = firestoreApi.onSnapshot(userFilter') + 500);
  assert.doesNotMatch(fn, /users\s*=\s*\[\]/, 'the error callback must never clear the users array — it only surfaces dataState/dataError and flashes a toast');
  assert.match(fn, /component\.flash\(component\.liveDataError\)/);
});

// ---- 14/15. Lands-only and Field-only users both stay visible ----
test('14/15. a Lands-only user and a Field-only user both survive belongsOnUsersList and deriveVisibleUsers together', async () => {
  const { belongsOnUsersList, deriveVisibleUsers } = await viewPromise;
  const rawDocs = [FIELD_USER, LANDS_USER];
  const kept = rawDocs.filter(belongsOnUsersList);
  assert.equal(kept.length, 2);
  const visible = deriveVisibleUsers(kept, { search: '' });
  assert.deepEqual(visible.map(u => u.id).sort(), ['f1', 'l1']);
});

// The role-whitelist filtering that used to run inline inside manager.html's
// own onSnapshot success handler now runs in buildViewData() (manager-
// dashboard-adapter.js), which every onSnapshot success handler feeds
// through via update() — this is where the real Lands-inclusive filter
// (belongsOnUsersList) actually applies today.
test('manager-dashboard-adapter.js: the live users list is filtered through belongsOnUsersList, not a Field-only role whitelist', () => {
  const source = read('manager-dashboard-adapter.js');
  const fn = source.slice(source.indexOf('function buildViewData'), source.indexOf('function buildViewData') + 2200);
  assert.match(fn, /users\.filter\(belongsOnUsersList\)/);
  assert.doesNotMatch(fn, /\['supervisor','inspector','contractor'\]\.includes/);
});

// ---- 16. Out-of-order async responses cannot overwrite newer data ----
// The old bug required a manual generation counter because
// loadFromFirestore() could be invoked repeatedly, layering new onSnapshot
// listeners over old ones with no way to tell an old callback's data apart
// from a new one's. The current architecture removes the race at its root
// instead of counting around it: stopObservations/stopUsers/stopIncidents
// unconditionally tear down any previous listeners before the auth-state
// handler ever creates new ones (see the "onAuthStateChanged" fix below),
// and manager-phase3-functional-parity.test.js's "No user-mutation handler
// manually refetches the user list" confirms there is no other code path
// that could re-invoke subscription setup mid-session at all — so there is
// never more than one live listener whose callbacks could race.
test("16. any previous users/observations/incidents listeners are torn down before new ones are created, so a stale callback can never fire after a fresh subscription starts", () => {
  const source = read('manager-dashboard-adapter.js');
  const authHandlerStart = source.indexOf('onAuthStateChanged(auth, async user =>') !== -1
    ? source.indexOf('onAuthStateChanged(auth, async user =>')
    : source.indexOf('onAuthStateChanged(auth,');
  assert.notEqual(authHandlerStart, -1, 'onAuthStateChanged wiring not found');
  const fn = source.slice(authHandlerStart, authHandlerStart + 900);
  assert.match(fn, /stopObservations\?\.\(\); stopUsers\?\.\(\); stopIncidents\?\.\(\);/);
  // and the subscription setup itself never happens anywhere except inside
  // this one auth-state handler.
  const setupCount = (source.match(/stopUsers = firestoreApi\.onSnapshot\(userFilter/g) || []).length;
  assert.equal(setupCount, 1, 'the users listener must only ever be established in one place');
});
