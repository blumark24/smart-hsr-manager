'use strict';
// ============================================================================
// INSTITUTIONAL ASSIGNMENT FOUNDATION (micro-phase) — pure contract for
// employeeAssignments/{assignmentId}.
//
// Purpose: record WHERE an employee is institutionally assigned or
// temporarily tasked, as an append/history-oriented ledger, WITHOUT making
// this collection an authorization source yet. No existing screen or
// Firestore Rule reads this collection for authorization in this phase —
// see api/_lib/authz.js/firestore.rules, which remain the sole live
// authorization source until an explicit future cutover phase.
//
// Employee identity stays durable and separate from assignment history:
// employees/{employeeId} (platform/contracts/employee-registry-contract.js)
// and users/{uid} are NEVER overwritten by an assignment. An assignment
// only ever RECORDS a placement; it never mutates administration,
// department, jobTitle, or any other employee-identity field.
//
// This module is pure (no I/O, no Firebase) so it can be unit-tested
// directly and reused by the trusted Admin API (api/admin/employees.js).
// ============================================================================

const ASSIGNMENT_TYPE = Object.freeze({
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
  TEMPORARY: 'TEMPORARY',
  SECTION_HEAD: 'SECTION_HEAD',
});
const ASSIGNMENT_TYPE_VALUES = Object.freeze(Object.values(ASSIGNMENT_TYPE));

const ASSIGNMENT_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED',
});
const ASSIGNMENT_STATUS_VALUES = Object.freeze(Object.values(ASSIGNMENT_STATUS));

// scope is deliberately a small, closed shape — never free-form JSON — so
// it stays meaningful without inventing a general-purpose schema this
// phase doesn't need.
const SCOPE_TYPE = Object.freeze({ PRODUCT: 'PRODUCT', SECTION: 'SECTION' });
const SCOPE_TYPE_VALUES = Object.freeze(Object.values(SCOPE_TYPE));

// The canonical Firestore document shape (for reference/tests). `assignmentId`
// mirrors the Firestore doc id as an explicit field, the same pattern
// users/{uid} already uses for `uid`. `status`/`createdAt` are server-set
// only — never accepted from a create request (see CREATE_ALLOWED_FIELDS).
const ASSIGNMENT_DOCUMENT_FIELDS = Object.freeze([
  'assignmentId', 'employeeId', 'organizationId', 'productId', 'scope',
  'assignmentType', 'status', 'startAt', 'endAt', 'issuedBy', 'reason',
  'createdAt',
]);

// Fields that must NEVER change after creation — see Part D of the brief.
// organizationId/employeeId/productId/assignmentType/issuedBy/createdAt
// together identify WHO was assigned WHERE and WHO decided it; changing any
// of them after the fact would silently rewrite history rather than
// recording a new one.
const IMMUTABLE_FIELDS = Object.freeze([
  'assignmentId', 'employeeId', 'organizationId', 'productId', 'assignmentType', 'issuedBy', 'createdAt',
]);

// Only lifecycle fields may change after creation — ending an assignment
// never reopens or rewrites the original placement, it only records that
// it ended, when, by whom, and why.
const LIFECYCLE_MUTABLE_FIELDS = Object.freeze(['status', 'endAt', 'endedBy', 'endedAt', 'endReason']);

// The exact fields a CREATE request may carry. Anything else is rejected —
// this is what keeps a caller from smuggling in `status`, `createdAt`, or
// an arbitrary unexpected field as if it were a legitimate part of the
// request (Part C: "no arbitrary extra privileged fields").
const CREATE_ALLOWED_FIELDS = Object.freeze([
  'employeeId', 'organizationId', 'productId', 'scope', 'assignmentType', 'startAt', 'endAt', 'issuedBy', 'reason',
]);

function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }

function isValidDateInput(v) {
  if (v instanceof Date) return !isNaN(v.getTime());
  if (typeof v === 'string' || typeof v === 'number') return !isNaN(new Date(v).getTime());
  return false;
}
function toDate(v) { return v instanceof Date ? v : new Date(v); }

// scope must be exactly { type: 'PRODUCT'|'SECTION', id: <non-empty string> }
// — no extra keys, no free-form JSON.
function isValidScope(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return false;
  const keys = Object.keys(scope);
  if (keys.length !== 2) return false;
  if (!keys.includes('type') || !keys.includes('id')) return false;
  if (!SCOPE_TYPE_VALUES.includes(scope.type)) return false;
  if (!isNonEmptyString(scope.id)) return false;
  return true;
}

// Pure validation for a CREATE request. Never throws, never touches I/O.
// Returns { ok:true, ...normalized } or { ok:false, reason }.
function validateAssignmentInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'invalid_record' };

  const extraKeys = Object.keys(input).filter(k => !CREATE_ALLOWED_FIELDS.includes(k));
  if (extraKeys.length > 0) return { ok: false, reason: 'unexpected_field' };

  if (!isNonEmptyString(input.employeeId)) return { ok: false, reason: 'employeeId_required' };
  if (!isNonEmptyString(input.organizationId)) return { ok: false, reason: 'organizationId_required' };
  if (!isNonEmptyString(input.productId)) return { ok: false, reason: 'productId_required' };
  if (!ASSIGNMENT_TYPE_VALUES.includes(input.assignmentType)) return { ok: false, reason: 'invalid_assignment_type' };
  if (!isValidScope(input.scope)) return { ok: false, reason: 'invalid_scope' };
  if (!isValidDateInput(input.startAt)) return { ok: false, reason: 'startAt_required' };

  let endAt = null;
  if (input.endAt !== undefined && input.endAt !== null) {
    if (!isValidDateInput(input.endAt)) return { ok: false, reason: 'invalid_endAt' };
    endAt = toDate(input.endAt);
    if (endAt.getTime() < toDate(input.startAt).getTime()) return { ok: false, reason: 'end_before_start' };
  }

  if (!isNonEmptyString(input.issuedBy)) return { ok: false, reason: 'issuedBy_required' };

  if (input.reason !== undefined && input.reason !== null && typeof input.reason !== 'string') {
    return { ok: false, reason: 'invalid_reason' };
  }

  return {
    ok: true,
    employeeId: input.employeeId.trim(),
    organizationId: input.organizationId.trim(),
    productId: input.productId.trim(),
    assignmentType: input.assignmentType,
    scope: { type: input.scope.type, id: input.scope.id.trim() },
    startAt: toDate(input.startAt),
    endAt,
    issuedBy: input.issuedBy.trim(),
    reason: isNonEmptyString(input.reason) ? input.reason.trim() : null,
  };
}

// Only an ACTIVE assignment may be ended — an already-ended or cancelled
// assignment is never reactivated or re-ended by this function (Part D/J:
// "ended assignment not reactivated").
function canEndAssignment(currentStatus) {
  return currentStatus === ASSIGNMENT_STATUS.ACTIVE;
}

// Section-head uniqueness key (Part E): AT MOST ONE active SECTION_HEAD per
// (organizationId, productId, scope.id). This function only computes the
// key — enforcing "at most one" against real data is the caller's (Admin
// API's) job, inside a transaction, since it requires a live query.
function sectionHeadUniquenessKey({ organizationId, productId, scope }) {
  return `${organizationId}::${productId}::${scope && scope.id}`;
}

module.exports = {
  ASSIGNMENT_TYPE,
  ASSIGNMENT_TYPE_VALUES,
  ASSIGNMENT_STATUS,
  ASSIGNMENT_STATUS_VALUES,
  SCOPE_TYPE,
  SCOPE_TYPE_VALUES,
  ASSIGNMENT_DOCUMENT_FIELDS,
  IMMUTABLE_FIELDS,
  LIFECYCLE_MUTABLE_FIELDS,
  CREATE_ALLOWED_FIELDS,
  isValidScope,
  validateAssignmentInput,
  canEndAssignment,
  sectionHeadUniquenessKey,
};
