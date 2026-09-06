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

test('manager.html: #userSearch has autocomplete disabled so the browser cannot inject a saved email into it', () => {
  const source = read('manager.html');
  const inputTag = source.slice(source.indexOf('<input id="userSearch"'), source.indexOf('/>', source.indexOf('<input id="userSearch"')) + 2);
  assert.match(inputTag, /autocomplete="off"/);
});

test('manager.html: no code path writes into #userSearch except the explicit clear action', () => {
  const source = read('manager.html');
  const clearFn = source.slice(source.indexOf('function clearUserSearch'), source.indexOf('window.clearUserSearch'));
  assert.match(clearFn, /const input = document\.getElementById\('userSearch'\)/);
  assert.match(clearFn, /input\.value = ''/);
  // Outside clearUserSearch, #userSearch's value must only ever be READ,
  // never assigned to.
  const withoutClearFn = source.slice(0, source.indexOf('function clearUserSearch')) + source.slice(source.indexOf('window.clearUserSearch'));
  assert.doesNotMatch(withoutClearFn, /userSearch'\)\.value\s*=(?!=)/);
});

test("17. a manager's own email/name is never assigned into the search input anywhere in the file", () => {
  const source = read('manager.html');
  assert.doesNotMatch(source, /userSearch['")]\.value\s*=\s*(?:user\.email|managerContext|displayName)/);
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
test('5. renderUsers reads the search value fresh each call, so clearing the input immediately restores every user', () => {
  const source = read('manager.html');
  const fn = source.slice(source.indexOf('function renderUsers()'), source.indexOf('window.filterUsers'));
  assert.match(fn, /usersViewState\.search = document\.getElementById\('userSearch'\)\.value/);
  assert.match(fn, /deriveVisibleUsers\(users, usersViewState\)/);
});

// ---- 6-12. Nothing else touches search: modal open/close, edit, add, service/role
//            update, enable/disable, tab switching, refresh ----
test('6/7/8/9/10/11. modal and account-management functions never write to #userSearch', () => {
  const source = read('manager.html');
  const functions = ['openModal', 'closeModal', 'saveUser', 'openServicesManagement', 'saveServices', 'toggleUser', 'openAccessManagement'];
  for (const name of functions) {
    const start = source.indexOf(`function ${name}(`);
    if (start === -1) continue; // openModal/closeModal are const arrow fns, checked separately below
    const end = source.indexOf('\n    }', start);
    const body = source.slice(start, end);
    assert.doesNotMatch(body, /userSearch/, `${name} must not reference #userSearch`);
  }
  const constArrows = source.match(/const (openModal|closeModal) = [^\n]+/g) || [];
  for (const line of constArrows) assert.doesNotMatch(line, /userSearch/);
});

test('12. loadFromFirestore() (refresh) resets `users` but never touches #userSearch', () => {
  const source = read('manager.html');
  const fn = source.slice(source.indexOf('function loadFromFirestore()'), source.indexOf('\n    // Observations'));
  assert.doesNotMatch(fn, /userSearch/);
});

test('switching tabs (activateTab) never touches #userSearch or reloads `users`', () => {
  const source = read('manager.html');
  const fn = source.slice(source.indexOf('function activateTab('), source.indexOf('window.activateTab'));
  assert.doesNotMatch(fn, /userSearch/);
  assert.doesNotMatch(fn, /loadFromFirestore/);
});

// ---- 13. Failed refresh -> previously loaded users remain visible ----
test('13. renderUsers only shows the loading/error placeholder when there is genuinely no data yet', () => {
  const source = read('manager.html');
  const fn = source.slice(source.indexOf('function renderUsers()'), source.indexOf('window.filterUsers'));
  assert.match(fn, /usersState==='loading' && !users\.length/);
  assert.match(fn, /usersState==='error' && !users\.length/);
  assert.doesNotMatch(fn, /if\(usersState==='error'\)\{ body\.innerHTML/); // the old unconditional blank-out
});

test("13b. the users-subscription error handler keeps `users` untouched and shows a non-destructive toast once data already exists", () => {
  const source = read('manager.html');
  const errStart = source.indexOf('}, err=>{', source.indexOf('function loadFromFirestore()'));
  const errEnd = source.indexOf('});', errStart);
  const handler = source.slice(errStart, errEnd);
  assert.match(handler, /if\(users\.length\)\{ showToast\('تعذر تحديث قائمة المستخدمين\. ما زالت آخر البيانات المحملة معروضة\.'\); \}/);
  assert.doesNotMatch(handler, /users\s*=\s*\[\]/, 'the error handler must never clear the users array');
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

test('manager.html: the onSnapshot success handler uses belongsOnUsersList, not a Field-only role whitelist', () => {
  const source = read('manager.html');
  assert.match(source, /if\(!belongsOnUsersList\(x\)\) return;/);
  assert.doesNotMatch(source, /!\['supervisor','inspector','contractor'\]\.includes\(x\.role\)\) return;/);
});

// ---- 16. Out-of-order async responses cannot overwrite newer data ----
test('16. loadFromFirestore() guards both the success and error snapshot callbacks with a generation check', () => {
  const source = read('manager.html');
  const fn = source.slice(source.indexOf('function loadFromFirestore()'), source.indexOf('\n    // Observations'));
  assert.match(fn, /usersLoadGeneration \+= 1;/);
  assert.match(fn, /const usersGeneration = usersLoadGeneration;/);
  const successAndErrorGuards = fn.match(/if\(usersGeneration !== usersLoadGeneration\) return;/g) || [];
  assert.equal(successAndErrorGuards.length, 2, 'expected the generation guard in both the success and error onSnapshot callbacks');
});
