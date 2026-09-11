'use strict';
// ============================================================================
// FINAL HARDENING ADDENDUM — pure unit tests for
// platform/contracts/employee-assignment-lock-contract.js. No I/O, no fakes
// needed.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  LOCK_STATUS,
  LOCK_STATUS_VALUES,
  canonicalLockTuple,
  computeSectionHeadLockId,
  canTransitionLockStatus,
  verifyLockConsistency,
} = require('../platform/contracts/employee-assignment-lock-contract');

test('LOCK: the status vocabulary is exactly ACTIVE/RELEASED, nothing more', () => {
  assert.deepEqual([...LOCK_STATUS_VALUES].sort(), ['ACTIVE', 'RELEASED']);
});

test('LOCK: canonicalLockTuple builds a JSON array in [organizationId, productId, scope.type, scope.id] order', () => {
  const tuple = canonicalLockTuple({ organizationId: 'org-1', productId: 'mobility', scope: { type: 'PRODUCT', id: 'mobility' } });
  assert.equal(tuple, JSON.stringify(['org-1', 'mobility', 'PRODUCT', 'mobility']));
});

test('LOCK: computeSectionHeadLockId is the SHA-256 hex digest of the canonical tuple, computed exactly as specified', () => {
  const input = { organizationId: 'org-1', productId: 'mobility', scope: { type: 'PRODUCT', id: 'mobility' } };
  const expected = crypto.createHash('sha256').update(JSON.stringify(['org-1', 'mobility', 'PRODUCT', 'mobility'])).digest('hex');
  assert.equal(computeSectionHeadLockId(input), expected);
  assert.equal(computeSectionHeadLockId(input).length, 64);
  assert.match(computeSectionHeadLockId(input), /^[0-9a-f]{64}$/);
});

test('LOCK: computeSectionHeadLockId is deterministic — identical tuples always produce the same id', () => {
  const a = computeSectionHeadLockId({ organizationId: 'org-1', productId: 'mobility', scope: { type: 'PRODUCT', id: 'mobility' } });
  const b = computeSectionHeadLockId({ organizationId: 'org-1', productId: 'mobility', scope: { type: 'PRODUCT', id: 'mobility' } });
  assert.equal(a, b);
});

test('LOCK: a different organizationId, productId, scope.type, or scope.id each independently produces a different id', () => {
  const base = { organizationId: 'org-1', productId: 'mobility', scope: { type: 'PRODUCT', id: 'mobility' } };
  const baseId = computeSectionHeadLockId(base);
  assert.notEqual(computeSectionHeadLockId({ ...base, organizationId: 'org-2' }), baseId);
  assert.notEqual(computeSectionHeadLockId({ ...base, productId: 'field' }), baseId);
  assert.notEqual(computeSectionHeadLockId({ ...base, scope: { type: 'SECTION', id: 'mobility' } }), baseId);
  assert.notEqual(computeSectionHeadLockId({ ...base, scope: { type: 'PRODUCT', id: 'other' } }), baseId);
});

test('LOCK: id is never sensitive to object-key order — only the fixed JSON-array element order matters', () => {
  const a = computeSectionHeadLockId({ organizationId: 'org-1', productId: 'mobility', scope: { type: 'PRODUCT', id: 'x' } });
  const b = computeSectionHeadLockId({ scope: { id: 'x', type: 'PRODUCT' }, productId: 'mobility', organizationId: 'org-1' });
  assert.equal(a, b);
});

test('canTransitionLockStatus: NEW -> ACTIVE is the only allowed first acquisition', () => {
  assert.equal(canTransitionLockStatus(undefined, LOCK_STATUS.ACTIVE), true);
  assert.equal(canTransitionLockStatus(null, LOCK_STATUS.ACTIVE), true);
  assert.equal(canTransitionLockStatus(undefined, LOCK_STATUS.RELEASED), false);
});

test('canTransitionLockStatus: ACTIVE -> RELEASED and RELEASED -> ACTIVE are allowed; no other transition is', () => {
  assert.equal(canTransitionLockStatus(LOCK_STATUS.ACTIVE, LOCK_STATUS.RELEASED), true);
  assert.equal(canTransitionLockStatus(LOCK_STATUS.RELEASED, LOCK_STATUS.ACTIVE), true);
  assert.equal(canTransitionLockStatus(LOCK_STATUS.ACTIVE, LOCK_STATUS.ACTIVE), false);
  assert.equal(canTransitionLockStatus(LOCK_STATUS.RELEASED, LOCK_STATUS.RELEASED), false);
});

// ---- verifyLockConsistency: fail-closed cross-checks ----

const LOCK = Object.freeze({
  organizationId: 'org-1', productId: 'mobility', scopeType: 'PRODUCT', scopeId: 'mobility', assignmentId: 'assign-1', status: 'ACTIVE',
});
const MATCHING_ASSIGNMENT = Object.freeze({
  organizationId: 'org-1', productId: 'mobility', scope: { type: 'PRODUCT', id: 'mobility' }, assignmentType: 'SECTION_HEAD', status: 'ACTIVE',
});

test('verifyLockConsistency: a lock whose referenced assignment agrees on every field is consistent', () => {
  assert.equal(verifyLockConsistency(LOCK, MATCHING_ASSIGNMENT).ok, true);
});

test('verifyLockConsistency: a lock with no assignmentId is inconsistent', () => {
  const out = verifyLockConsistency({ ...LOCK, assignmentId: null }, MATCHING_ASSIGNMENT);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'section_head_lock_inconsistent');
});

test('verifyLockConsistency: a referenced assignment that does not exist (null) is inconsistent', () => {
  const out = verifyLockConsistency(LOCK, null);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'section_head_lock_inconsistent');
});

test('verifyLockConsistency: a referenced assignment that is not ACTIVE is inconsistent', () => {
  const out = verifyLockConsistency(LOCK, { ...MATCHING_ASSIGNMENT, status: 'ENDED' });
  assert.equal(out.ok, false);
});

test('verifyLockConsistency: a referenced assignment that is not SECTION_HEAD is inconsistent', () => {
  const out = verifyLockConsistency(LOCK, { ...MATCHING_ASSIGNMENT, assignmentType: 'PRIMARY' });
  assert.equal(out.ok, false);
});

test('verifyLockConsistency: a mismatched organizationId/productId/scope.type/scope.id is inconsistent', () => {
  assert.equal(verifyLockConsistency(LOCK, { ...MATCHING_ASSIGNMENT, organizationId: 'org-2' }).ok, false);
  assert.equal(verifyLockConsistency(LOCK, { ...MATCHING_ASSIGNMENT, productId: 'field' }).ok, false);
  assert.equal(verifyLockConsistency(LOCK, { ...MATCHING_ASSIGNMENT, scope: { type: 'SECTION', id: 'mobility' } }).ok, false);
  assert.equal(verifyLockConsistency(LOCK, { ...MATCHING_ASSIGNMENT, scope: { type: 'PRODUCT', id: 'other' } }).ok, false);
});

console.log('employee-assignment-lock-contract pure unit tests OK');
