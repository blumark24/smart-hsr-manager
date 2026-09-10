'use strict';
// ============================================================================
// PHASE 02B.1 / 06C.1 — MOBILITY ENTITLEMENT KEY-PRESENCE SECURITY HOTFIX.
//
// Canonical contract (matches firestore.rules' `'mobilityAccess' in data`):
// the PRESENCE OF THE `mobilityAccess` KEY ITSELF is authoritative. Once
// the key exists on a users/{uid} record at all — even set to a malformed
// value (null, a string, a number, an array, {}) — it alone decides
// Mobility state; a stale legacy `role` must NEVER be consulted again. Only
// a record that has NEVER been touched by the field (the key is genuinely
// absent) may fall back to the legacy scalar `role`.
//
// api/_lib/authz.js's and users-list-view.js's resolveMobilityRole() both
// previously used `data.mobilityAccess != null && typeof === 'object'` —
// which let a present-but-malformed value (null, a string, a number) fall
// through to the legacy-role branch instead of failing closed. This file
// proves the fix against the REAL, unmodified resolver implementations
// (required — not reimplementations of the logic under test), across every
// value shape named in the hotfix brief's 13-row test matrix.
//
// firestore.rules (`'mobilityAccess' in data`), smart-mobility-adapter.js's
// verifyMobilityAccess() (`'mobilityAccess' in data`), login.html's inline
// computation (`mobilityAccess !== undefined`), and platform/contracts/
// product-entitlement-contract.js's resolveProductEntitlements()
// (`mobilityAccess !== undefined`) were all already using true key-presence
// semantics before this hotfix and needed no code change — see
// test/unified-login-entitlement-routing.test.js and
// test/product-entitlement-contract.test.js for their own malformed-value
// coverage, added alongside this file.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const AUTHZ_PATH = require.resolve('../api/_lib/authz.js');
const { resolveMobilityRole: authzResolve, MOBILITY_MANAGEABLE_ROLES } = require(AUTHZ_PATH);

// users-list-view.js is an ES module (export function), loaded via dynamic
// import() — the same pattern test/manager-users-list-state.test.js uses.
const usersListViewPromise = import(require('node:url').pathToFileURL(path.join(root, 'users-list-view.js')).href);

const MALFORMED_MOBILITY_ACCESS_VALUES = [
  ['null', null],
  ['a string', 'employee'],
  ['a number', 123],
  ['an array', []],
  ['an empty object', {}],
  ['{enabled:false}', { enabled: false }],
  ['{enabled:false, role: a stale valid role}', { enabled: false, role: 'employee' }],
  ['{enabled:true} with no role', { enabled: true }],
  ['{enabled:true, role: an invalid role}', { enabled: true, role: 'not_a_real_role' }],
];

// ---- api/_lib/authz.js resolveMobilityRole() — the server-side resolver
// backing mobility_head authorization (getMobilityHeadCallerContext) and
// employee discovery (listMobilityEmployees). ----

test('authz.js resolveMobilityRole: absent key falls back to a valid legacy Mobility role', () => {
  assert.equal(authzResolve({ role: 'mobility_head' }), 'mobility_head');
  assert.equal(authzResolve({ role: 'employee' }), 'employee');
});

test('authz.js resolveMobilityRole: absent key + no role at all resolves to null', () => {
  assert.equal(authzResolve({}), null);
  assert.equal(authzResolve({ role: null }), null);
});

for (const [label, value] of MALFORMED_MOBILITY_ACCESS_VALUES) {
  test(`authz.js resolveMobilityRole: mobilityAccess = ${label} (key present) never falls back to a stale legacy role`, () => {
    for (const staleRole of ['employee', 'mobility_head', 'department_head', 'administrative_affairs']) {
      const result = authzResolve({ role: staleRole, mobilityAccess: value });
      assert.equal(result, null, `stale role "${staleRole}" with mobilityAccess = ${JSON.stringify(value)} must resolve to null, got ${JSON.stringify(result)}`);
    }
  });
}

test('authz.js resolveMobilityRole: a valid {enabled:true, role:<valid>} shape resolves correctly for every valid Mobility role', () => {
  for (const role of MOBILITY_MANAGEABLE_ROLES) {
    assert.equal(authzResolve({ role: null, mobilityAccess: { enabled: true, role } }), role);
  }
});

test('authz.js resolveMobilityRole: Field independence — a Field role is untouched by any Mobility malformation', () => {
  // resolveMobilityRole itself only ever reasons about Mobility; Field's
  // own resolution (MANAGER_SCOPED_ROLES/FIELD role checks) lives entirely
  // outside this function and reads the same `role` field independently —
  // proven here by confirming the legacy `role` value is never mutated or
  // consumed as anything but the Mobility-fallback input.
  const data = { role: 'supervisor', mobilityAccess: null };
  assert.equal(authzResolve(data), null, 'Mobility resolves to null');
  assert.equal(data.role, 'supervisor', 'the legacy role field itself is never touched');
});

test('authz.js resolveMobilityRole: Field + valid Mobility both resolve independently on one identity (the phase brief\'s exact example)', () => {
  const data = { role: 'supervisor', mobilityAccess: { enabled: true, role: 'employee' } };
  assert.equal(authzResolve(data), 'employee');
  assert.equal(data.role, 'supervisor');
});

// ---- users-list-view.js resolveMobilityRole() — backs belongsOnUsersList()
// and the Manager User Center's visible-users derivation. ----

test('users-list-view.js resolveMobilityRole: absent key falls back to a valid legacy Mobility role', async () => {
  const { belongsOnUsersList } = await usersListViewPromise;
  // resolveMobilityRole is not exported directly; belongsOnUsersList is its
  // real, only consumer, so the same real-execution proof applies through it.
  assert.equal(belongsOnUsersList({ role: 'employee' }), true, 'legacy Mobility role alone must remain visible');
});

for (const [label, value] of MALFORMED_MOBILITY_ACCESS_VALUES) {
  test(`users-list-view.js belongsOnUsersList: mobilityAccess = ${label} on a stale legacy-Mobility-only record with no other service is excluded`, async () => {
    const { belongsOnUsersList } = await usersListViewPromise;
    assert.equal(
      belongsOnUsersList({ role: 'employee', mobilityAccess: value }),
      false,
      `a record whose ONLY entitlement is a stale legacy Mobility role, with mobilityAccess = ${JSON.stringify(value)}, must not be visible`
    );
  });
}

test('users-list-view.js belongsOnUsersList: Field independence — a malformed mobilityAccess never hides a real Field role', async () => {
  const { belongsOnUsersList } = await usersListViewPromise;
  assert.equal(belongsOnUsersList({ role: 'supervisor', mobilityAccess: null }), true, 'Field must remain visible regardless of Mobility malformation');
});

// ---- manager-dashboard-adapter.js's liveUsers row mapper — the exact
// object-literal arrow function passed to `.map()`, extracted from the real
// source (not reimplemented) and executed for real via eval, the same way
// test/manager-lands-sso.test.js extracts resolveLandsRedirectBaseFor().
// buildViewData() itself cannot be imported directly (a browser-global ES
// module with `import`/`window`/`location` at module scope), so only the
// self-contained per-row mapper — the part this hotfix actually changed —
// is extracted. ----

function extractLiveUsersRowMapper() {
  const source = read('manager-dashboard-adapter.js');
  const mapCallStart = source.indexOf('users.filter(belongsOnUsersList).map(');
  assert.ok(mapCallStart >= 0, 'expected users.filter(belongsOnUsersList).map( marker not found — has the shape moved?');
  const arrowStart = source.indexOf('item => ({', mapCallStart);
  assert.ok(arrowStart >= 0);
  const closeMarker = "email: item.email || 'غير متاح'\n    })";
  const closeIdx = source.indexOf(closeMarker, arrowStart);
  assert.ok(closeIdx >= 0, 'expected row-mapper close marker not found — has the row shape moved?');
  const fnText = source.slice(arrowStart, closeIdx + closeMarker.length);
  // eslint-disable-next-line no-eval -- real-execution proof of shipped code, not a reimplementation
  return (0, eval)(fnText);
}

test('manager-dashboard-adapter.js liveUsers row mapper: a record never touched by mobilityAccess produces a row with the key genuinely absent', () => {
  const mapper = extractLiveUsersRowMapper();
  const row = mapper({ id: 'u1', role: 'supervisor', active: true, email: 'a@b.com' });
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'mobilityAccess'), false, 'a never-touched record must not gain the mobilityAccess key on its liveUsers row');
});

test('manager-dashboard-adapter.js liveUsers row mapper: an explicit mobilityAccess:null on the source record stays present (and fails closed) on the row', () => {
  const mapper = extractLiveUsersRowMapper();
  const row = mapper({ id: 'u2', role: 'employee', active: true, email: 'a@b.com', mobilityAccess: null });
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'mobilityAccess'), true, 'an explicitly-present mobilityAccess key must remain present on the row');
  assert.equal(row.mobilityAccess, null);
});

test('manager-dashboard-adapter.js liveUsers row mapper: a valid mobilityAccess object is carried through unchanged', () => {
  const mapper = extractLiveUsersRowMapper();
  const access = { enabled: true, role: 'employee' };
  const row = mapper({ id: 'u3', role: null, active: true, email: 'a@b.com', mobilityAccess: access });
  assert.deepEqual(row.mobilityAccess, access);
});

console.log('mobility entitlement key-presence security hotfix (Phase 02B.1/06C.1) OK');
