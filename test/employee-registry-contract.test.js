'use strict';
// Pure unit tests for platform/contracts/employee-registry-contract.js —
// no I/O, no Firebase, no fakes needed.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ACCOUNT_STATUS,
  ACCOUNT_STATUS_VALUES,
  canTransitionAccountStatus,
  validateEmployeeRecord,
  EMPLOYEE_IMPORT_FIELDS,
  EMPLOYMENT_STATUS_VALUES,
} = require('../platform/contracts/employee-registry-contract');

test('ACCOUNT_STATUS has exactly the four required states', () => {
  assert.deepEqual(ACCOUNT_STATUS_VALUES.slice().sort(), ['ACTIVE', 'NO_ACCOUNT', 'PENDING_ACTIVATION', 'SUSPENDED'].sort());
  assert.equal(ACCOUNT_STATUS.NO_ACCOUNT, 'NO_ACCOUNT');
  assert.equal(ACCOUNT_STATUS.PENDING_ACTIVATION, 'PENDING_ACTIVATION');
  assert.equal(ACCOUNT_STATUS.ACTIVE, 'ACTIVE');
  assert.equal(ACCOUNT_STATUS.SUSPENDED, 'SUSPENDED');
});

test('an employee record can exist without an account (NO_ACCOUNT is a valid standalone state)', () => {
  const result = validateEmployeeRecord({ organizationId: 'org-1', name: 'موظف بلا حساب' });
  assert.equal(result.ok, true);
  // NO_ACCOUNT itself is not a field validateEmployeeRecord sets — it is
  // the caller's (api/admin/employees.js `create`) job to start every new
  // record at NO_ACCOUNT. This test only proves the record shape itself
  // never requires an account-related field to be valid.
});

test('account status transitions: only the documented edges are legal', () => {
  assert.equal(canTransitionAccountStatus('NO_ACCOUNT', 'PENDING_ACTIVATION'), true);
  assert.equal(canTransitionAccountStatus('PENDING_ACTIVATION', 'ACTIVE'), true);
  assert.equal(canTransitionAccountStatus('PENDING_ACTIVATION', 'NO_ACCOUNT'), true, 'a failed activation must be able to fall back to NO_ACCOUNT');
  assert.equal(canTransitionAccountStatus('ACTIVE', 'SUSPENDED'), true);
  assert.equal(canTransitionAccountStatus('SUSPENDED', 'ACTIVE'), true);
});

test('account status transitions: illegal jumps are denied', () => {
  assert.equal(canTransitionAccountStatus('NO_ACCOUNT', 'ACTIVE'), false, 'cannot skip PENDING_ACTIVATION bookkeeping');
  assert.equal(canTransitionAccountStatus('SUSPENDED', 'PENDING_ACTIVATION'), false);
  assert.equal(canTransitionAccountStatus('SUSPENDED', 'NO_ACCOUNT'), false);
  assert.equal(canTransitionAccountStatus('ACTIVE', 'NO_ACCOUNT'), false);
  assert.equal(canTransitionAccountStatus('ACTIVE', 'PENDING_ACTIVATION'), false);
  assert.equal(canTransitionAccountStatus('bogus', 'ACTIVE'), false);
});

test('validateEmployeeRecord: requires organizationId and name', () => {
  assert.equal(validateEmployeeRecord({}).ok, false);
  assert.equal(validateEmployeeRecord({ organizationId: 'org-1' }).ok, false);
  assert.equal(validateEmployeeRecord({ name: 'Ali' }).ok, false);
  assert.equal(validateEmployeeRecord({ organizationId: 'org-1', name: 'Ali' }).ok, true);
});

test('validateEmployeeRecord: rejects an invalid employmentStatus', () => {
  const result = validateEmployeeRecord({ organizationId: 'org-1', name: 'Ali', employmentStatus: 'on_leave_forever' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_employment_status');
});

test('validateEmployeeRecord: accepts both real employment statuses', () => {
  for (const status of EMPLOYMENT_STATUS_VALUES) {
    assert.equal(validateEmployeeRecord({ organizationId: 'org-1', name: 'Ali', employmentStatus: status }).ok, true);
  }
});

test('EMPLOYEE_IMPORT_FIELDS: the import-ready contract carries no unnecessary sensitive data (no national ID, no salary)', () => {
  assert.ok(EMPLOYEE_IMPORT_FIELDS.includes('employeeId'));
  assert.ok(EMPLOYEE_IMPORT_FIELDS.includes('organizationId'));
  assert.ok(EMPLOYEE_IMPORT_FIELDS.includes('name'));
  assert.ok(EMPLOYEE_IMPORT_FIELDS.includes('department'));
  assert.ok(!EMPLOYEE_IMPORT_FIELDS.some(f => /national|salary|iban|passport/i.test(f)));
});
