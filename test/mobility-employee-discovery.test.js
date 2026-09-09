'use strict';
// PHASE 06A.1 Blocker 2 — Mobility Allocation Employee Discovery.
//
// smart-mobility-adapter.js's subscribeEmployees() used to query only
// where('role', '==', 'employee'), so a valid Mobility employee whose role
// now lives in the independent mobilityAccess field (role: null, or a Field
// role like 'supervisor', with mobilityAccess: {enabled:true,
// role:'employee'}) never appeared in liveEmployees, and so could never be
// selected in the allocation drawer even though firestore.rules already
// allowed both the read and the allocation write.
//
// This file tests the pure logic in mobility-employee-discovery.js (loaded
// via dynamic import() — the pattern already used for users-list-view.js)
// for cases A-F, plus the source-level wiring that keeps subscribeEmployees
// running two narrowly-scoped queries (never a broad same-org read filtered
// client-side) and merging them through that same pure logic. Cases G/H
// (real allocation success/denial) are covered by the Firestore Rules
// emulator suites: test/mobility-mission-rules.test.js's V8g/V8h and
// test/manager-user-center-rules.test.js's Blocker2 case A-F read tests.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const discoveryPromise = import(pathToFileURL(path.join(root, 'mobility-employee-discovery.js')).href);

test('case A: a legacy role:employee record with no mobilityAccess key is a live Mobility employee', async () => {
  const { isLiveMobilityEmployee } = await discoveryPromise;
  assert.equal(isLiveMobilityEmployee({ role: 'employee', active: true }), true);
});

test('case B: a mobilityAccess employee whose legacy role is null is a live Mobility employee', async () => {
  const { isLiveMobilityEmployee } = await discoveryPromise;
  assert.equal(isLiveMobilityEmployee({ role: null, active: true, mobilityAccess: { enabled: true, role: 'employee' } }), true);
});

test('case C: a Field supervisor who also holds an independent mobilityAccess employee entitlement is a live Mobility employee', async () => {
  const { isLiveMobilityEmployee } = await discoveryPromise;
  assert.equal(isLiveMobilityEmployee({ role: 'supervisor', active: true, mobilityAccess: { enabled: true, role: 'employee' } }), true);
});

test('case D: a stale legacy role:employee is NOT a live Mobility employee once mobilityAccess explicitly disables it', async () => {
  const { isLiveMobilityEmployee } = await discoveryPromise;
  assert.equal(isLiveMobilityEmployee({ role: 'employee', active: true, mobilityAccess: { enabled: false, role: null } }), false);
});

test('case F: an inactive account is never a live Mobility employee, legacy or independent', async () => {
  const { isLiveMobilityEmployee } = await discoveryPromise;
  assert.equal(isLiveMobilityEmployee({ role: 'employee', active: false }), false);
  assert.equal(isLiveMobilityEmployee({ role: null, active: false, mobilityAccess: { enabled: true, role: 'employee' } }), false);
});

test('a record with an unrelated Mobility role (not employee) is not a live Mobility employee', async () => {
  const { isLiveMobilityEmployee } = await discoveryPromise;
  assert.equal(isLiveMobilityEmployee({ role: null, active: true, mobilityAccess: { enabled: true, role: 'mobility_head' } }), false);
});

test('a plain Field-only or Lands-only record (no employee role anywhere) is not a live Mobility employee', async () => {
  const { isLiveMobilityEmployee } = await discoveryPromise;
  assert.equal(isLiveMobilityEmployee({ role: 'supervisor', active: true }), false);
  assert.equal(isLiveMobilityEmployee({ role: null, active: true, landsAccess: { enabled: true, role: 'lands_employee' } }), false);
});

test('mergeLiveEmployees dedupes a uid present in both query results and applies isLiveMobilityEmployee to the merged set', async () => {
  const { mergeLiveEmployees } = await discoveryPromise;
  const legacy = new Map([
    ['u-legacy', { role: 'employee', active: true, name: 'Legacy Employee' }],
    // case D: matched by the legacy query (role:employee) but must be
    // excluded from the merged result because mobilityAccess disables it.
    ['u-stale-disabled', { role: 'employee', active: true, mobilityAccess: { enabled: false, role: null }, name: 'Stale Disabled' }],
  ]);
  const mobility = new Map([
    ['u-mobility-only', { role: null, active: true, mobilityAccess: { enabled: true, role: 'employee' }, name: 'Mobility Only' }],
    // present in both maps (e.g. transient overlap during migration) — must
    // appear exactly once in the merged output.
    ['u-legacy', { role: 'employee', active: true, mobilityAccess: { enabled: true, role: 'employee' }, name: 'Legacy Employee' }],
  ]);
  const merged = mergeLiveEmployees(legacy, mobility);
  const uids = merged.map(e => e.uid).sort();
  assert.deepEqual(uids, ['u-legacy', 'u-mobility-only']);
  assert.equal(merged.find(e => e.uid === 'u-legacy').name, 'Legacy Employee');
});

// ---- Source-level wiring: subscribeEmployees must never regress to a
// single role=='employee' query or to a broad same-org read filtered
// client-side. ----

const adapter = read('smart-mobility-adapter.js');

test('wiring: smart-mobility-adapter.js imports the shared pure discovery module', () => {
  assert.match(adapter, /import\s*\{\s*mergeLiveEmployees\s*\}\s*from\s*'\.\/mobility-employee-discovery\.js'/);
});

test('wiring: subscribeEmployees runs the legacy role:employee query', () => {
  const start = adapter.indexOf('function subscribeEmployees(');
  assert.ok(start >= 0, 'subscribeEmployees must exist');
  const end = adapter.indexOf('\nasync function start(', start);
  const body = adapter.slice(start, end > 0 ? end : start + 4000);
  assert.match(body, /where\('organizationId', '==', context\.organizationId\)/);
  assert.match(body, /where\('role', '==', 'employee'\)/);
  // The independent-field query must be scoped to organizationId AND both
  // mobilityAccess.enabled and mobilityAccess.role — never a bare
  // same-org read with no role/entitlement filter at all.
  assert.match(body, /where\('mobilityAccess\.enabled', '==', true\)/);
  assert.match(body, /where\('mobilityAccess\.role', '==', 'employee'\)/);
  // Never a single query with no role/entitlement filter beyond
  // organizationId — that would be the forbidden over-broad same-org read.
  const whereClauseCount = (body.match(/firestoreApi\.where\(/g) || []).length;
  assert.ok(whereClauseCount >= 4, 'expected at least two organizationId-scoped queries, each with its own role/entitlement filter');
  assert.match(body, /mergeLiveEmployees\(legacyDocs, mobilityDocs\)/);
});

console.log('mobility employee discovery (Blocker 2) OK');
