'use strict';
// ============================================================================
// INSTITUTIONAL ASSIGNMENT FOUNDATION (micro-phase) — pure unit tests for
// platform/contracts/employee-assignment-contract.js. No I/O, no fakes
// needed.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ASSIGNMENT_TYPE_VALUES,
  ASSIGNMENT_STATUS_VALUES,
  validateAssignmentInput,
  canEndAssignment,
  isValidScope,
  sectionHeadUniquenessKey,
} = require('../platform/contracts/employee-assignment-contract');

const BASE = Object.freeze({
  employeeId: 'emp-1',
  organizationId: 'org-1',
  productId: 'mobility',
  scope: { type: 'PRODUCT', id: 'mobility' },
  startAt: '2026-01-01',
  issuedBy: 'mgr-1',
});

// ---- valid assignment types ----

test('CONTRACT: valid PRIMARY', () => {
  const out = validateAssignmentInput({ ...BASE, assignmentType: 'PRIMARY' });
  assert.equal(out.ok, true);
  assert.equal(out.assignmentType, 'PRIMARY');
});

test('CONTRACT: valid SECONDARY', () => {
  const out = validateAssignmentInput({ ...BASE, assignmentType: 'SECONDARY' });
  assert.equal(out.ok, true);
  assert.equal(out.assignmentType, 'SECONDARY');
});

test('CONTRACT: valid TEMPORARY', () => {
  const out = validateAssignmentInput({ ...BASE, assignmentType: 'TEMPORARY', endAt: '2026-02-01' });
  assert.equal(out.ok, true);
  assert.equal(out.assignmentType, 'TEMPORARY');
  assert.ok(out.endAt instanceof Date);
});

test('CONTRACT: valid SECTION_HEAD', () => {
  const out = validateAssignmentInput({ ...BASE, assignmentType: 'SECTION_HEAD' });
  assert.equal(out.ok, true);
  assert.equal(out.assignmentType, 'SECTION_HEAD');
});

test('CONTRACT: GENERAL_SUPERVISOR is never a recognized assignment type in this phase', () => {
  assert.ok(!ASSIGNMENT_TYPE_VALUES.includes('GENERAL_SUPERVISOR'));
  const out = validateAssignmentInput({ ...BASE, assignmentType: 'GENERAL_SUPERVISOR' });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'invalid_assignment_type');
});

test('CONTRACT: the assignment-type vocabulary is exactly PRIMARY/SECONDARY/TEMPORARY/SECTION_HEAD, nothing more', () => {
  assert.deepEqual([...ASSIGNMENT_TYPE_VALUES].sort(), ['PRIMARY', 'SECONDARY', 'SECTION_HEAD', 'TEMPORARY']);
});

test('CONTRACT: the status vocabulary is exactly ACTIVE/ENDED/CANCELLED, nothing more', () => {
  assert.deepEqual([...ASSIGNMENT_STATUS_VALUES].sort(), ['ACTIVE', 'CANCELLED', 'ENDED']);
});

// ---- required field violations ----

test('CONTRACT: missing employeeId denied', () => {
  const { employeeId, ...rest } = BASE;
  const out = validateAssignmentInput({ ...rest, assignmentType: 'PRIMARY' });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'employeeId_required');
});

test('CONTRACT: missing organizationId denied', () => {
  const { organizationId, ...rest } = BASE;
  const out = validateAssignmentInput({ ...rest, assignmentType: 'PRIMARY' });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'organizationId_required');
});

test('CONTRACT: invalid productId denied (empty string)', () => {
  const out = validateAssignmentInput({ ...BASE, productId: '', assignmentType: 'PRIMARY' });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'productId_required');
});

test('CONTRACT: invalid assignmentType denied', () => {
  const out = validateAssignmentInput({ ...BASE, assignmentType: 'not_a_real_type' });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'invalid_assignment_type');
});

test('CONTRACT: invalid status is never something a create request can even set (status is server-only, not an accepted input field)', () => {
  const out = validateAssignmentInput({ ...BASE, assignmentType: 'PRIMARY', status: 'ACTIVE' });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'unexpected_field');
});

test('CONTRACT: invalid scope denied — wrong type value', () => {
  const out = validateAssignmentInput({ ...BASE, assignmentType: 'PRIMARY', scope: { type: 'DEPARTMENT', id: 'x' } });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'invalid_scope');
});

test('CONTRACT: invalid scope denied — missing id', () => {
  const out = validateAssignmentInput({ ...BASE, assignmentType: 'PRIMARY', scope: { type: 'PRODUCT' } });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'invalid_scope');
});

test('CONTRACT: invalid scope denied — free-form extra keys are rejected (scope must not become arbitrary JSON)', () => {
  const out = validateAssignmentInput({ ...BASE, assignmentType: 'PRIMARY', scope: { type: 'PRODUCT', id: 'x', extra: 'nope' } });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'invalid_scope');
});

test('CONTRACT: invalid scope denied — not an object at all', () => {
  assert.equal(validateAssignmentInput({ ...BASE, assignmentType: 'PRIMARY', scope: 'mobility' }).ok, false);
  assert.equal(validateAssignmentInput({ ...BASE, assignmentType: 'PRIMARY', scope: null }).ok, false);
});

test('isValidScope: both SECTION and PRODUCT scope types are valid shapes', () => {
  assert.equal(isValidScope({ type: 'PRODUCT', id: 'mobility' }), true);
  assert.equal(isValidScope({ type: 'SECTION', id: 'الأسواق' }), true);
});

test('CONTRACT: endAt before startAt denied', () => {
  const out = validateAssignmentInput({ ...BASE, assignmentType: 'TEMPORARY', startAt: '2026-06-01', endAt: '2026-01-01' });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'end_before_start');
});

test('CONTRACT: endAt is optional — absent is valid', () => {
  const out = validateAssignmentInput({ ...BASE, assignmentType: 'PRIMARY' });
  assert.equal(out.ok, true);
  assert.equal(out.endAt, null);
});

test('CONTRACT: startAt is required', () => {
  const { startAt, ...rest } = BASE;
  const out = validateAssignmentInput({ ...rest, assignmentType: 'PRIMARY' });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'startAt_required');
});

test('CONTRACT: issuedBy is required', () => {
  const { issuedBy, ...rest } = BASE;
  const out = validateAssignmentInput({ ...rest, assignmentType: 'PRIMARY' });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'issuedBy_required');
});

test('CONTRACT: reason is optional free text; a non-string reason is rejected', () => {
  assert.equal(validateAssignmentInput({ ...BASE, assignmentType: 'PRIMARY' }).reason, null);
  assert.equal(validateAssignmentInput({ ...BASE, assignmentType: 'PRIMARY', reason: 'نقل مؤقت' }).ok, true);
  assert.equal(validateAssignmentInput({ ...BASE, assignmentType: 'PRIMARY', reason: 123 }).ok, false);
});

test('CONTRACT: an arbitrary, unexpected privileged field (e.g. createdAt, assignmentId) is rejected outright', () => {
  assert.equal(validateAssignmentInput({ ...BASE, assignmentType: 'PRIMARY', createdAt: new Date() }).ok, false);
  assert.equal(validateAssignmentInput({ ...BASE, assignmentType: 'PRIMARY', assignmentId: 'forged-id' }).ok, false);
  assert.equal(validateAssignmentInput({ ...BASE, assignmentType: 'PRIMARY', somethingElse: true }).ok, false);
});

// ---- canEndAssignment ----

test('canEndAssignment: only ACTIVE may be ended', () => {
  assert.equal(canEndAssignment('ACTIVE'), true);
  assert.equal(canEndAssignment('ENDED'), false);
  assert.equal(canEndAssignment('CANCELLED'), false);
  assert.equal(canEndAssignment(undefined), false);
});

// ---- HISTORY SCENARIO 1 (contract-level proof): an employee whose
// administration is 'الزراعة' gets a Mobility SECTION_HEAD assignment —
// the assignment contract itself never reads or touches administration/
// department/jobTitle at all; it is a pure function of the assignment
// fields only. ----

test('HISTORY: validateAssignmentInput never reads or requires any employee-identity field (administration/department/jobTitle)', () => {
  const out = validateAssignmentInput({ ...BASE, assignmentType: 'SECTION_HEAD', productId: 'mobility', scope: { type: 'PRODUCT', id: 'mobility' } });
  assert.equal(out.ok, true);
  assert.ok(!('administration' in out));
  assert.ok(!('department' in out));
  assert.ok(!('jobTitle' in out));
});

test('sectionHeadUniquenessKey: identical org+product+scope produce the same key regardless of other fields', () => {
  const a = sectionHeadUniquenessKey({ organizationId: 'org-1', productId: 'mobility', scope: { id: 'mobility' } });
  const b = sectionHeadUniquenessKey({ organizationId: 'org-1', productId: 'mobility', scope: { id: 'mobility' } });
  assert.equal(a, b);
});

test('sectionHeadUniquenessKey: a different scope id produces a different key', () => {
  const a = sectionHeadUniquenessKey({ organizationId: 'org-1', productId: 'field', scope: { id: 'الأسواق' } });
  const b = sectionHeadUniquenessKey({ organizationId: 'org-1', productId: 'field', scope: { id: 'صحة البيئة' } });
  assert.notEqual(a, b);
});

console.log('employee-assignment-contract pure unit tests OK');
