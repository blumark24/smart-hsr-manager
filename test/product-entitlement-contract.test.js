'use strict';
// Pure unit tests for platform/contracts/product-entitlement-contract.js —
// the Phase 03B compatibility resolver over the EXISTING users/{uid}
// schema. No I/O, no fakes needed.

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveProductEntitlements } = require('../platform/contracts/product-entitlement-contract');

test('Field-only account', () => {
  const out = resolveProductEntitlements({ role: 'inspector' });
  assert.equal(out.field.enabled, true);
  assert.equal(out.field.role, 'inspector');
  assert.equal(out.lands.enabled, false);
  assert.equal(out.mobility.enabled, false);
});

test('Lands-only account', () => {
  const out = resolveProductEntitlements({ role: null, landsAccess: { enabled: true, role: 'lands_employee' } });
  assert.equal(out.field.enabled, false);
  assert.equal(out.lands.enabled, true);
  assert.equal(out.lands.role, 'lands_employee');
  assert.equal(out.mobility.enabled, false);
});

test('Field + Lands on the same identity (Phase 03B combined access)', () => {
  const out = resolveProductEntitlements({ role: 'supervisor', landsAccess: { enabled: true, role: 'lands_department_manager' } });
  assert.equal(out.field.enabled, true);
  assert.equal(out.field.role, 'supervisor');
  assert.equal(out.lands.enabled, true);
  assert.equal(out.lands.role, 'lands_department_manager');
});

test('Mobility access is independent and mutually exclusive with Field, on the same role field', () => {
  const out = resolveProductEntitlements({ role: 'mobility_head' });
  assert.equal(out.mobility.enabled, true);
  assert.equal(out.mobility.role, 'mobility_head');
  assert.equal(out.field.enabled, false, 'a Mobility role is never ALSO reported as a Field role');
});

test('Mobility + Lands can combine on the same identity too', () => {
  const out = resolveProductEntitlements({ role: 'employee', landsAccess: { enabled: true, role: 'lands_employee' } });
  assert.equal(out.mobility.enabled, true);
  assert.equal(out.lands.enabled, true);
});

test('one Mobility role only: role is a single string field, so two roles at once is structurally impossible', () => {
  const out = resolveProductEntitlements({ role: 'department_head' });
  assert.equal(out.mobility.role, 'department_head');
  // There is no array/list form accepted anywhere in this resolver — a
  // second role value would have to overwrite `role` itself.
  assert.equal(typeof out.mobility.role, 'string');
});

test('vehicleEligible: Phase 03B.1 fail-safe default — absent means NOT eligible', () => {
  const out = resolveProductEntitlements({ role: 'employee' });
  assert.equal(out.mobility.vehicleEligible, false);
});

test('vehicleEligible: true is preserved', () => {
  const out = resolveProductEntitlements({ role: 'employee', vehicleEligible: true });
  assert.equal(out.mobility.vehicleEligible, true);
});

test('vehicleEligible: an explicit false is honored (real revocation, not just a UI toggle)', () => {
  const out = resolveProductEntitlements({ role: 'employee', vehicleEligible: false });
  assert.equal(out.mobility.vehicleEligible, false);
});

test('vehicleEligible is independent of role: an employee role account keeps its Mobility access even when vehicleEligible is false', () => {
  const out = resolveProductEntitlements({ role: 'employee', vehicleEligible: false });
  assert.equal(out.mobility.enabled, true, 'losing vehicle eligibility must never remove Mobility access itself');
  assert.equal(out.mobility.vehicleEligible, false);
});

test('a Lands role value outside the manageable set is never reported as enabled', () => {
  const out = resolveProductEntitlements({ role: null, landsAccess: { enabled: true, role: 'lands_municipal_manager' } });
  assert.equal(out.lands.enabled, false, 'an institution-level Lands role is never exposed via this employee-facing resolver');
});

test('no account at all: everything disabled, vehicleEligible defaults false (fail-safe)', () => {
  const out = resolveProductEntitlements({});
  assert.equal(out.field.enabled, false);
  assert.equal(out.lands.enabled, false);
  assert.equal(out.mobility.enabled, false);
  assert.equal(out.mobility.vehicleEligible, false);
});

test('vehicleEligible: any non-true value (string "true", 1, null) is still NOT eligible — only the boolean true counts', () => {
  for (const value of ['true', 1, null, undefined, 0, 'false']) {
    const out = resolveProductEntitlements({ role: 'employee', vehicleEligible: value });
    assert.equal(out.mobility.vehicleEligible, false, `expected ${JSON.stringify(value)} to be treated as not eligible`);
  }
});

// ---- PHASE 02B/06C — the mobilityAccess dual-read (independent field
// authoritative when present) was already implemented here since Phase
// 06A, but had no dedicated test coverage until now; login.html's own
// inline mirror of this exact logic is covered separately in
// test/unified-login-entitlement-routing.test.js. ----

test('mobilityAccess: an independent Mobility entitlement enables Mobility even when the legacy role is null', () => {
  const out = resolveProductEntitlements({ role: null, mobilityAccess: { enabled: true, role: 'employee' } });
  assert.equal(out.mobility.enabled, true);
  assert.equal(out.mobility.role, 'employee');
});

test('mobilityAccess: Field and Mobility both enabled on one identity — role supervisor, mobilityAccess enabled as employee', () => {
  const out = resolveProductEntitlements({ role: 'supervisor', mobilityAccess: { enabled: true, role: 'employee' } });
  assert.equal(out.field.enabled, true);
  assert.equal(out.field.role, 'supervisor');
  assert.equal(out.mobility.enabled, true);
  assert.equal(out.mobility.role, 'employee');
});

test('mobilityAccess.enabled === false overrides a stale legacy Mobility role — never reactivated', () => {
  const out = resolveProductEntitlements({ role: 'mobility_head', mobilityAccess: { enabled: false, role: null } });
  assert.equal(out.mobility.enabled, false);
  assert.equal(out.mobility.role, null);
});

test('mobilityAccess.enabled === false does not affect an independently-enabled Field role on the same identity', () => {
  const out = resolveProductEntitlements({ role: 'supervisor', mobilityAccess: { enabled: false, role: null } });
  assert.equal(out.field.enabled, true, 'Field survives a Mobility disable');
  assert.equal(out.mobility.enabled, false);
});

test('a legacy Mobility role is honored ONLY when mobilityAccess is absent entirely', () => {
  const untouched = resolveProductEntitlements({ role: 'department_head' });
  assert.equal(untouched.mobility.enabled, true, 'never touched by mobilityAccess — legacy role still applies');
  const touched = resolveProductEntitlements({ role: 'department_head', mobilityAccess: { enabled: false, role: null } });
  assert.equal(touched.mobility.enabled, false, 'once mobilityAccess exists at all, it alone decides — legacy role is never consulted again');
});

test('an invalid Mobility role inside mobilityAccess is never reported as enabled', () => {
  const out = resolveProductEntitlements({ role: null, mobilityAccess: { enabled: true, role: 'not_a_real_role' } });
  assert.equal(out.mobility.enabled, false);
  assert.equal(out.mobility.role, null);
});

test('mobilityAccess + Lands combine independently of Field', () => {
  const out = resolveProductEntitlements({ role: null, mobilityAccess: { enabled: true, role: 'mobility_head' }, landsAccess: { enabled: true, role: 'lands_employee' } });
  assert.equal(out.mobility.enabled, true);
  assert.equal(out.lands.enabled, true);
  assert.equal(out.field.enabled, false);
});

test('all three products (Field, independent Mobility, Lands) can be enabled at once', () => {
  const out = resolveProductEntitlements({
    role: 'inspector',
    mobilityAccess: { enabled: true, role: 'administrative_affairs' },
    landsAccess: { enabled: true, role: 'lands_employee' },
  });
  assert.equal(out.field.enabled, true);
  assert.equal(out.mobility.enabled, true);
  assert.equal(out.lands.enabled, true);
});

// ---- PHASE 02B.1/06C.1 SECURITY HOTFIX — resolveProductEntitlements()
// already used true key-presence semantics (`mobilityAccess !== undefined`)
// before this hotfix; these cases lock that in against every malformed
// value shape named in the hotfix brief's test matrix, alongside the two
// resolvers that DID need fixing (api/_lib/authz.js, users-list-view.js —
// see test/mobility-entitlement-key-presence-security.test.js). ----

for (const [label, value] of [
  ['null', null],
  ['a string', 'employee'],
  ['a number', 123],
  ['an array', []],
  ['an empty object', {}],
]) {
  test(`mobilityAccess = ${label} (key present) on a stale legacy Mobility role never falls back — Mobility denied`, () => {
    const out = resolveProductEntitlements({ role: 'mobility_head', mobilityAccess: value });
    assert.equal(out.mobility.enabled, false, `mobilityAccess = ${JSON.stringify(value)} must fail closed, not fall back to the legacy role`);
    assert.equal(out.mobility.role, null);
  });

  test(`mobilityAccess = ${label} (key present) never affects an independently-enabled Field role`, () => {
    const out = resolveProductEntitlements({ role: 'supervisor', mobilityAccess: value });
    assert.equal(out.field.enabled, true, 'Field must survive any Mobility malformation');
    assert.equal(out.mobility.enabled, false);
  });
}

test('mobilityAccess: {enabled:true} with no role is denied, not silently accepted', () => {
  const out = resolveProductEntitlements({ role: null, mobilityAccess: { enabled: true } });
  assert.equal(out.mobility.enabled, false);
  assert.equal(out.mobility.role, null);
});

test('legacy compatibility: a record with only the fields that existed before Phase 03B resolves identically to how it always behaved', () => {
  const legacyFieldOnly = resolveProductEntitlements({ role: 'contractor', organizationId: 'org-1', active: true });
  assert.equal(legacyFieldOnly.field.enabled, true);
  assert.equal(legacyFieldOnly.field.role, 'contractor');
  const legacyLandsOnly = resolveProductEntitlements({ role: null, organizationId: 'org-1', landsAccess: { enabled: true, role: 'lands_employee', syncStatus: 'synced' } });
  assert.equal(legacyLandsOnly.lands.enabled, true);
});
