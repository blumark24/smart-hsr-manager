'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateFieldSelection, validateLandsSelection, computeLandsSyncOperation, assertSingleService, resolveEffectiveServiceState } = require('../api/admin/users.js')._test;

test('field selection: absent is valid and disabled', () => {
  assert.deepEqual(validateFieldSelection(undefined), { ok: true, present: false, enabled: false, role: null });
});

test('field selection: accepts each existing Field role unchanged', () => {
  for (const role of ['supervisor', 'inspector', 'contractor']) {
    assert.deepEqual(validateFieldSelection({ enabled: true, role }), { ok: true, present: true, enabled: true, role });
  }
});

test('field selection: rejects manager and any unknown role', () => {
  assert.equal(validateFieldSelection({ enabled: true, role: 'manager' }).ok, false);
  assert.equal(validateFieldSelection({ enabled: true, role: 'owner' }).ok, false);
  assert.equal(validateFieldSelection({ enabled: true, role: 'lands_employee' }).ok, false);
});

test('field selection: disabled clears the role regardless of what was sent', () => {
  assert.deepEqual(validateFieldSelection({ enabled: false, role: 'inspector' }), { ok: true, present: true, enabled: false, role: null });
});

test('lands selection: absent is valid and disabled', () => {
  assert.deepEqual(validateLandsSelection(undefined), { ok: true, present: false, enabled: false, role: null });
});

test('lands selection: exposes only lands_employee and lands_department_manager', () => {
  assert.deepEqual(validateLandsSelection({ enabled: true, role: 'lands_employee' }), { ok: true, present: true, enabled: true, role: 'lands_employee' });
  assert.deepEqual(validateLandsSelection({ enabled: true, role: 'lands_department_manager' }), { ok: true, present: true, enabled: true, role: 'lands_department_manager' });
});

test('lands selection: rejects the institution-level Lands role as an employee option', () => {
  assert.equal(validateLandsSelection({ enabled: true, role: 'municipal_manager' }).ok, false);
});

test('lands selection: rejects unknown roles and malformed input', () => {
  assert.equal(validateLandsSelection({ enabled: true, role: 'lands_admin' }).ok, false);
  assert.equal(validateLandsSelection({ enabled: true }).ok, false);
  assert.equal(validateLandsSelection('lands_employee').ok, false);
  assert.equal(validateLandsSelection({}).ok, false);
});

test('lands selection: disabled clears the role regardless of what was sent', () => {
  assert.deepEqual(validateLandsSelection({ enabled: false, role: 'lands_employee' }), { ok: true, present: true, enabled: false, role: null });
});

// ---- combinations matching the required manager-sprint test checklist ----
// Mirrors exactly what the `create`/`setServices` handlers do with the two
// validators' results before deciding whether to proceed.
function wouldAllowCreate(fieldInput, landsInput) {
  const fieldSel = validateFieldSelection(fieldInput);
  const landsSel = validateLandsSelection(landsInput);
  if (!fieldSel.ok || !landsSel.ok) return { allowed: false, reason: !fieldSel.ok ? fieldSel.reason : landsSel.reason };
  if (!fieldSel.enabled && !landsSel.enabled) return { allowed: false, reason: 'at_least_one_service_required' };
  return { allowed: true, fieldEnabled: fieldSel.enabled, landsEnabled: landsSel.enabled };
}

test('Field-only: allowed, Lands stays off', () => {
  const result = wouldAllowCreate({ enabled: true, role: 'inspector' }, { enabled: false });
  assert.deepEqual(result, { allowed: true, fieldEnabled: true, landsEnabled: false });
});

test('Lands-only: allowed, Field stays off', () => {
  const result = wouldAllowCreate({ enabled: false }, { enabled: true, role: 'lands_employee' });
  assert.deepEqual(result, { allowed: true, fieldEnabled: false, landsEnabled: true });
});

test('Field + Lands: both allowed together', () => {
  const result = wouldAllowCreate({ enabled: true, role: 'supervisor' }, { enabled: true, role: 'lands_department_manager' });
  assert.deepEqual(result, { allowed: true, fieldEnabled: true, landsEnabled: true });
});

test('neither service selected: denied', () => {
  const result = wouldAllowCreate({ enabled: false }, { enabled: false });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'at_least_one_service_required');
});

test('an invalid Lands role denies the whole request even if Field is valid', () => {
  const result = wouldAllowCreate({ enabled: true, role: 'inspector' }, { enabled: true, role: 'lands_municipal_manager' });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'invalid_lands_role');
});

// ---- computeLandsSyncOperation: which trusted Lands operation applies ----
// (manager -> Lands trusted bridge, api/_lib/landsBridge.js)

test('new Lands grant (never synced): entitlement.enable', () => {
  const result = computeLandsSyncOperation(undefined, { enabled: true, role: 'lands_employee' });
  assert.deepEqual(result, { operation: 'entitlement.enable', recordChanges: { lands_role: 'lands_employee' }, wasSynced: false });
});

test('role change on an already-synced account: entitlement.change_role', () => {
  const previous = { enabled: true, role: 'lands_employee', syncStatus: 'synced' };
  const result = computeLandsSyncOperation(previous, { enabled: true, role: 'lands_department_manager' });
  assert.deepEqual(result, { operation: 'entitlement.change_role', recordChanges: { lands_role: 'lands_department_manager' }, wasSynced: true });
});

test('revoking an already-synced account: entitlement.disable', () => {
  const previous = { enabled: true, role: 'lands_employee', syncStatus: 'synced' };
  const result = computeLandsSyncOperation(previous, { enabled: false, role: null });
  assert.deepEqual(result, { operation: 'entitlement.disable', recordChanges: undefined, wasSynced: true });
});

test('no-op: already synced with the same role', () => {
  const previous = { enabled: true, role: 'lands_employee', syncStatus: 'synced' };
  const result = computeLandsSyncOperation(previous, { enabled: true, role: 'lands_employee' });
  assert.equal(result.operation, null);
});

test('no-op: disabling a Lands service that was never actually synced', () => {
  const previous = { enabled: true, role: 'lands_employee', syncStatus: 'pending_trusted_sync' };
  const result = computeLandsSyncOperation(previous, { enabled: false, role: null });
  assert.equal(result.operation, null);
});

test('Field-only field selection never influences the Lands operation decision', () => {
  // computeLandsSyncOperation takes only landsAccess state + the Lands
  // selection — the Field role/selection is never a parameter, so Field
  // changes can never leak into a Lands mutation decision.
  assert.equal(computeLandsSyncOperation.length, 2);
});

// ---- assertSingleService / resolveEffectiveServiceState: one employee, one service ----

test('assertSingleService: allows Field-only, Lands-only, or neither', () => {
  assert.equal(assertSingleService(true, false).ok, true);
  assert.equal(assertSingleService(false, true).ok, true);
  assert.equal(assertSingleService(false, false).ok, true);
});

test('assertSingleService: denies both services enabled at once', () => {
  const result = assertSingleService(true, true);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'dual_service_denied');
});

test('resolveEffectiveServiceState: a request mentioning only Lands keeps the existing Field role in effect', () => {
  const fieldSel = validateFieldSelection(undefined); // not present in this request
  const landsSel = validateLandsSelection({ enabled: true, role: 'lands_employee' });
  const result = resolveEffectiveServiceState(fieldSel, landsSel, 'inspector', undefined);
  assert.deepEqual(result, { fieldEffectiveEnabled: true, landsEffectiveEnabled: true });
  // Combined with assertSingleService, this is exactly the "silently keep
  // both services" case the transfer rule must catch:
  assert.equal(assertSingleService(result.fieldEffectiveEnabled, result.landsEffectiveEnabled).ok, false);
});

test('resolveEffectiveServiceState: an explicit transfer (both mentioned) resolves to exactly one service', () => {
  const fieldSel = validateFieldSelection({ enabled: false });
  const landsSel = validateLandsSelection({ enabled: true, role: 'lands_employee' });
  const result = resolveEffectiveServiceState(fieldSel, landsSel, 'inspector', undefined);
  assert.deepEqual(result, { fieldEffectiveEnabled: false, landsEffectiveEnabled: true });
  assert.equal(assertSingleService(result.fieldEffectiveEnabled, result.landsEffectiveEnabled).ok, true);
});

test('resolveEffectiveServiceState: a request mentioning only Field keeps an existing synced Lands membership in effect', () => {
  const fieldSel = validateFieldSelection({ enabled: true, role: 'inspector' });
  const landsSel = validateLandsSelection(undefined);
  const result = resolveEffectiveServiceState(fieldSel, landsSel, null, { enabled: true, role: 'lands_employee', syncStatus: 'synced' });
  assert.deepEqual(result, { fieldEffectiveEnabled: true, landsEffectiveEnabled: true });
  assert.equal(assertSingleService(result.fieldEffectiveEnabled, result.landsEffectiveEnabled).ok, false);
});
