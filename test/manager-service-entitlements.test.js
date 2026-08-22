'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateFieldSelection, validateLandsSelection } = require('../api/admin/users.js')._test;

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
