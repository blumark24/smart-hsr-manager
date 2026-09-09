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

test('vehicleEligible defaults to true when absent (backward-compatible with every pre-Phase-03B record)', () => {
  const out = resolveProductEntitlements({ role: 'employee' });
  assert.equal(out.mobility.vehicleEligible, true);
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

test('no account at all: everything disabled, vehicleEligible still defaults true', () => {
  const out = resolveProductEntitlements({});
  assert.equal(out.field.enabled, false);
  assert.equal(out.lands.enabled, false);
  assert.equal(out.mobility.enabled, false);
  assert.equal(out.mobility.vehicleEligible, true);
});

test('legacy compatibility: a record with only the fields that existed before Phase 03B resolves identically to how it always behaved', () => {
  const legacyFieldOnly = resolveProductEntitlements({ role: 'contractor', organizationId: 'org-1', active: true });
  assert.equal(legacyFieldOnly.field.enabled, true);
  assert.equal(legacyFieldOnly.field.role, 'contractor');
  const legacyLandsOnly = resolveProductEntitlements({ role: null, organizationId: 'org-1', landsAccess: { enabled: true, role: 'lands_employee', syncStatus: 'synced' } });
  assert.equal(legacyLandsOnly.lands.enabled, true);
});
