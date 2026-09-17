'use strict';
// ============================================================================
// FINAL HARDENING ADDENDUM — deterministic SECTION_HEAD uniqueness lock.
// Pure contract module, no I/O. Backs employeeAssignmentLocks/{lockId}, a
// second, independent enforcement layer for "at most one ACTIVE SECTION_HEAD
// per (organizationId, productId, scope)" — a deterministic document id
// (SHA-256 of the canonical tuple) so two concurrent create attempts for the
// exact same tuple always race for the exact same Firestore document,
// letting a single transaction serialize them instead of relying solely on
// a query-then-write race window.
// ============================================================================
const crypto = require('crypto');

const LOCK_STATUS = Object.freeze({ ACTIVE: 'ACTIVE', RELEASED: 'RELEASED' });
const LOCK_STATUS_VALUES = Object.freeze(Object.values(LOCK_STATUS));

// Identity fields that must never change once a lock document exists for a
// given id — the id itself is the hash of these, so genuinely changing any
// of them would mean a different lock document entirely, never an edit to
// this one.
const LOCK_IMMUTABLE_FIELDS = Object.freeze(['organizationId', 'productId', 'scopeType', 'scopeId', 'createdAt']);
const LOCK_LIFECYCLE_MUTABLE_FIELDS = Object.freeze(['status', 'assignmentId', 'updatedAt', 'releasedBy', 'releasedAt']);

// The canonical tuple MUST be built exactly this way: a JSON array (fixed
// element order by construction), never an object (whose key order is not
// guaranteed to be stable input to a hash) and never raw delimiter-joined
// strings (ambiguous when a field itself could contain the delimiter).
function canonicalLockTuple({ organizationId, productId, scope }) {
  const scopeType = scope && scope.type;
  const scopeId = scope && scope.id;
  return JSON.stringify([organizationId, productId, scopeType, scopeId]);
}

// The lock id is ALWAYS derived — never accepted from a caller — so it can
// never be spoofed, collided, or picked to target an unrelated document.
function computeSectionHeadLockId(tuple) {
  return crypto.createHash('sha256').update(canonicalLockTuple(tuple)).digest('hex');
}

// A lock document's lifecycle: it does not exist (NEW) -> ACTIVE (acquired)
// -> RELEASED (the SECTION_HEAD assignment it pointed to was ended) ->
// ACTIVE again (a new SECTION_HEAD assignment re-acquires the same tuple).
// There is no terminal state and no delete — the row itself is permanent
// once first created.
const LOCK_TRANSITIONS = Object.freeze({
  NEW: [LOCK_STATUS.ACTIVE],
  [LOCK_STATUS.ACTIVE]: [LOCK_STATUS.RELEASED],
  [LOCK_STATUS.RELEASED]: [LOCK_STATUS.ACTIVE],
});

function canTransitionLockStatus(from, to) {
  const key = from == null ? 'NEW' : from;
  const allowed = LOCK_TRANSITIONS[key];
  return Array.isArray(allowed) && allowed.includes(to);
}

// Fail-closed consistency check run whenever a transaction is about to treat
// an ACTIVE lock as proof that a SECTION_HEAD is already active. `lock` is
// the lock document (with organizationId/productId/scopeType/scopeId as the
// caller currently believes them to be); `assignmentData` is the Firestore
// data of the assignment the lock claims to point at (or null/undefined if
// no such document exists). Every check must hold for the lock to be
// trusted; any single mismatch means the lock and the assignment collection
// have diverged and must never be auto-repaired, overwritten, or silently
// released — the caller fails closed and requires administrative review.
function verifyLockConsistency(lock, assignmentData) {
  if (!lock || !lock.assignmentId) return { ok: false, reason: 'section_head_lock_inconsistent' };
  if (!assignmentData) return { ok: false, reason: 'section_head_lock_inconsistent' };
  if (assignmentData.status !== 'ACTIVE') return { ok: false, reason: 'section_head_lock_inconsistent' };
  if (assignmentData.assignmentType !== 'SECTION_HEAD') return { ok: false, reason: 'section_head_lock_inconsistent' };
  if (assignmentData.organizationId !== lock.organizationId) return { ok: false, reason: 'section_head_lock_inconsistent' };
  if (assignmentData.productId !== lock.productId) return { ok: false, reason: 'section_head_lock_inconsistent' };
  const scope = assignmentData.scope || {};
  if (scope.type !== lock.scopeType) return { ok: false, reason: 'section_head_lock_inconsistent' };
  if (scope.id !== lock.scopeId) return { ok: false, reason: 'section_head_lock_inconsistent' };
  return { ok: true };
}

module.exports = {
  LOCK_STATUS,
  LOCK_STATUS_VALUES,
  LOCK_IMMUTABLE_FIELDS,
  LOCK_LIFECYCLE_MUTABLE_FIELDS,
  canonicalLockTuple,
  computeSectionHeadLockId,
  canTransitionLockStatus,
  verifyLockConsistency,
};
