'use strict';
// ============================================================================
// Phase 03B — Unified User Center: canonical municipal EMPLOYEE MASTER
// REGISTRY contract.
//
// An employee record is the durable HR-shaped fact that "this person works
// for this organization". It is DELIBERATELY separate from a login account
// (users/{uid}): an employee can exist in the registry with no Firebase Auth
// account at all (accountStatus NO_ACCOUNT), which is the normal state for
// most of an eventual ~200-employee Excel import until a manager/department
// head activates the ones who actually need to sign in.
//
// This module is pure (no I/O, no Firebase) so it can be unit-tested
// directly and reused by both the Admin API (api/admin/employees.js) and,
// later, an Excel-import pipeline (not built in this phase) without any
// duplicated validation logic.
// ============================================================================

const ACCOUNT_STATUS = Object.freeze({
  NO_ACCOUNT: 'NO_ACCOUNT',
  PENDING_ACTIVATION: 'PENDING_ACTIVATION',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
});
const ACCOUNT_STATUS_VALUES = Object.freeze(Object.values(ACCOUNT_STATUS));

// Only these transitions are legal. Notably: PENDING_ACTIVATION can fall
// back to NO_ACCOUNT (an activation attempt that could not complete
// atomically must say so honestly, never sit forever in a fake "in
// progress" state — see api/admin/employees.js `activateAccount`), and
// SUSPENDED can only ever be reached from ACTIVE (an account must exist
// before it can be suspended).
const ACCOUNT_STATUS_TRANSITIONS = Object.freeze({
  NO_ACCOUNT: Object.freeze(['PENDING_ACTIVATION']),
  PENDING_ACTIVATION: Object.freeze(['ACTIVE', 'NO_ACCOUNT']),
  ACTIVE: Object.freeze(['SUSPENDED']),
  SUSPENDED: Object.freeze(['ACTIVE']),
});

function canTransitionAccountStatus(from, to) {
  if (!ACCOUNT_STATUS_VALUES.includes(from) || !ACCOUNT_STATUS_VALUES.includes(to)) return false;
  return (ACCOUNT_STATUS_TRANSITIONS[from] || []).includes(to);
}

const EMPLOYMENT_STATUS_VALUES = Object.freeze(['active', 'inactive']);

// The exact field set a future Excel ingestion must map onto (Part A/K of
// the Phase 03B brief). Deliberately narrow: no national ID, no salary, no
// other unnecessary sensitive data — only what the product actually uses.
// Excel import itself is explicitly NOT implemented in this phase; this is
// only the target contract shape so that work is import-ready later.
const EMPLOYEE_IMPORT_FIELDS = Object.freeze([
  'employeeId',
  'organizationId',
  'name',
  'employeeRef', // an opaque internal employee reference number, if the municipality already has one — never a national ID
  'email',
  'phone',
  'administration',
  'department',
  'jobTitle',
  'employmentStatus',
  'directManagerEmployeeId',
]);

function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }

// Pure validation for a single employee-registry record (create, or a
// future import row). Never throws, never touches I/O. jobTitle is
// intentionally NOT validated against any authorization vocabulary — it is
// free-text HR data and must never be treated as a security role (see
// authorization boundary M in the Phase 03B brief).
function validateEmployeeRecord(input) {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'invalid_record' };
  if (!isNonEmptyString(input.organizationId)) return { ok: false, reason: 'organizationId_required' };
  if (!isNonEmptyString(input.name)) return { ok: false, reason: 'name_required' };
  if (input.email !== undefined && input.email !== null && !isNonEmptyString(input.email)) {
    return { ok: false, reason: 'invalid_email' };
  }
  if (input.phone !== undefined && input.phone !== null && typeof input.phone !== 'string') {
    return { ok: false, reason: 'invalid_phone' };
  }
  if (input.employmentStatus !== undefined && !EMPLOYMENT_STATUS_VALUES.includes(input.employmentStatus)) {
    return { ok: false, reason: 'invalid_employment_status' };
  }
  for (const field of ['administration', 'department', 'jobTitle', 'employeeRef', 'directManagerEmployeeId']) {
    if (input[field] !== undefined && input[field] !== null && typeof input[field] !== 'string') {
      return { ok: false, reason: `invalid_${field}` };
    }
  }
  return { ok: true };
}

module.exports = {
  ACCOUNT_STATUS,
  ACCOUNT_STATUS_VALUES,
  ACCOUNT_STATUS_TRANSITIONS,
  canTransitionAccountStatus,
  EMPLOYMENT_STATUS_VALUES,
  EMPLOYEE_IMPORT_FIELDS,
  validateEmployeeRecord,
};
