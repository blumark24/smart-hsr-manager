'use strict';
// ============================================================================
// Shared Field/Lands/Mobility service-entitlement helpers, used by BOTH
// api/admin/users.js (the original single-identity account endpoint) and
// api/admin/employees.js (Phase 03B's employee-registry/account-activation
// endpoint). Extracted so both endpoints apply the exact same validation and
// entitlement rules to the same users/{uid} schema — no drift between two
// copies of the same logic.
//
// Phase 03B product decision: a single identity may now legitimately hold
// BOTH Field/Mobility (the `role` field) and Lands (`landsAccess`) access at
// once — see assertSingleService below. This is an ADDITIVE change: no
// existing field is renamed or removed, and a record that only ever held one
// service continues to behave exactly as before.
// ============================================================================
const { FIELD_MANAGEABLE_ROLES, MOBILITY_MANAGEABLE_ROLES, LANDS_MANAGEABLE_ROLES } = require('./authz');

function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }

// PHASE 06A hotfix — Field is now scoped to its own three role values only
// (FIELD_MANAGEABLE_ROLES). Previously this accepted any MANAGER_SCOPED_ROLE
// (Field OR Mobility), which is exactly the "incorrectly mixes Field and
// Mobility" defect this hotfix closes — see validateMobilitySelection below
// for Mobility's own, now-independent selection.
function validateFieldSelection(field) {
  if (field === undefined) return { ok: true, present: false, enabled: false, role: null };
  if (typeof field !== 'object' || field === null || typeof field.enabled !== 'boolean') {
    return { ok: false, reason: 'invalid_field_selection' };
  }
  if (field.enabled && !FIELD_MANAGEABLE_ROLES.includes(field.role)) return { ok: false, reason: 'invalid_field_role' };
  return { ok: true, present: true, enabled: field.enabled, role: field.enabled ? field.role : null };
}

// PHASE 06A hotfix — Mobility as its own independent service-entitlement
// selection, exactly mirroring validateLandsSelection's shape. Written to
// the NEW, independent users/{uid}.mobilityAccess field (never the legacy
// scalar `role` field a Field selection also writes to) — see
// firestore.rules' mobilityRoleValue() for the read-side of this same
// independence, and the "structural note" comment on resolveMobilitySelection
// in api/admin/users.js for exactly how backward compatibility with
// records that still only hold a legacy Mobility `role` value is preserved.
function validateMobilitySelection(mobility) {
  if (mobility === undefined) return { ok: true, present: false, enabled: false, role: null };
  if (typeof mobility !== 'object' || mobility === null || typeof mobility.enabled !== 'boolean') {
    return { ok: false, reason: 'invalid_mobility_selection' };
  }
  if (mobility.enabled && !MOBILITY_MANAGEABLE_ROLES.includes(mobility.role)) return { ok: false, reason: 'invalid_mobility_role' };
  return { ok: true, present: true, enabled: mobility.enabled, role: mobility.enabled ? mobility.role : null };
}

// Pure decision function — no I/O. Lands' own entitlement.enable/disable are
// single state transitions, not idempotent (calling entitlement.enable on an
// already-enabled record fails on Lands' side), so the correct trusted
// operation depends on the last state THIS API knows was actually synced —
// never merely on what the manager is toggling in the form. Returns
// operation:null when no real Lands-side change is needed.
function computeLandsSyncOperation(previousLandsAccess, landsSel) {
  const wasSynced = Boolean(previousLandsAccess && previousLandsAccess.enabled && previousLandsAccess.syncStatus === 'synced');
  if (landsSel.enabled && !wasSynced) {
    return { operation: 'entitlement.enable', recordChanges: { lands_role: landsSel.role }, wasSynced };
  }
  if (landsSel.enabled && wasSynced && previousLandsAccess.role !== landsSel.role) {
    return { operation: 'entitlement.change_role', recordChanges: { lands_role: landsSel.role }, wasSynced };
  }
  if (!landsSel.enabled && wasSynced) {
    return { operation: 'entitlement.disable', recordChanges: undefined, wasSynced };
  }
  return { operation: null, recordChanges: undefined, wasSynced };
}

function validateLandsSelection(lands) {
  if (lands === undefined) return { ok: true, present: false, enabled: false, role: null };
  if (typeof lands !== 'object' || lands === null || typeof lands.enabled !== 'boolean') {
    return { ok: false, reason: 'invalid_lands_selection' };
  }
  if (lands.enabled && !LANDS_MANAGEABLE_ROLES.includes(lands.role)) return { ok: false, reason: 'invalid_lands_role' };
  return { ok: true, present: true, enabled: lands.enabled, role: lands.enabled ? lands.role : null };
}

// Phase 03B: Field/Mobility (`role`) and Lands (`landsAccess`) are
// independent fields on the same users/{uid} document, so combining them
// requires no schema change — only lifting this artificial mutual-exclusion
// gate. manager/owner were always exempt from this check (they never call
// it); operational employees may now hold both at once ("ONE USER = ONE
// IDENTITY + MULTIPLE CONTROLLED PRODUCT ENTITLEMENTS").
//
// `dual_service_denied` is kept as a defined, documented reason code for any
// caller still matching on the string, but this function no longer returns
// it: the only remaining structural constraint is that `role` itself stays
// scalar (one Field-or-Mobility role at a time — enforced simply by `role`
// being a single string field, never an array) and `landsAccess` stays a
// single sub-object (one Lands role at a time). Both are already true by
// construction and need no runtime check here.
function assertSingleService(_fieldEffectiveEnabled, _landsEffectiveEnabled) {
  return { ok: true };
}

// Combines a (possibly absent) requested selection with the existing stored
// state to determine what the enabled state WOULD BE after this request —
// needed because setServices allows a request to mention only one service,
// leaving the other's current state unchanged.
//
// PHASE 06A hotfix — existingMobilityAccess/existingRole together mirror
// firestore.rules' mobilityRoleValue(): once a record has ever been touched
// by the new independent mobilityAccess field, that field alone decides its
// Mobility state; only a record that has NEVER been touched (no
// mobilityAccess key at all) still falls back to the legacy scalar `role`.
function resolveEffectiveServiceState(fieldSel, landsSel, existingRole, existingLandsAccess, existingMobilityAccess) {
  const fieldEffectiveEnabled = fieldSel.present ? fieldSel.enabled : FIELD_MANAGEABLE_ROLES.includes(existingRole);
  const landsEffectiveEnabled = landsSel.present ? landsSel.enabled : Boolean(existingLandsAccess && existingLandsAccess.enabled);
  const existingMobilityEnabled = existingMobilityAccess !== undefined
    ? Boolean(existingMobilityAccess && existingMobilityAccess.enabled)
    : MOBILITY_MANAGEABLE_ROLES.includes(existingRole);
  return { fieldEffectiveEnabled, landsEffectiveEnabled, existingMobilityEnabled };
}

function passwordPolicyReason(password, target) {
  if (typeof password !== 'string' || password.length < 8) return 'password_policy_failed';
  if (password !== password.trim()) return 'password_policy_failed';
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'password_policy_failed';
  }
  const normalized = password.toLowerCase();
  const obvious = ['password', 'qwerty', 'admin', 'welcome', 'letmein'];
  if (obvious.some(value => normalized.includes(value)) || /(.)\1{3,}/.test(normalized) || /(.{2,})\1{2,}/.test(normalized)) {
    return 'password_policy_failed';
  }
  const identityParts = [target && target.email, target && target.name]
    .filter(isNonEmptyString)
    .flatMap(value => String(value).toLowerCase().split(/[^\p{L}\p{N}]+/u))
    .filter(value => value.length >= 3);
  return identityParts.some(value => normalized.includes(value)) ? 'password_policy_failed' : null;
}

// Deliberately excludes 'supervisor': a supervisor signs into manager.html
// directly and already has a self-service password-change flow there. See
// api/admin/users.js for the full rationale (unchanged from before Phase 03B).
const PASSWORD_TARGET_ROLES = ['inspector', 'contractor', 'mobility_head', 'department_head', 'administrative_affairs', 'employee'];

function isPasswordEligibleTarget(data) {
  if (!data) return false;
  if (PASSWORD_TARGET_ROLES.includes(data.role)) return true;
  // PHASE 06A hotfix — a record whose Mobility access now lives in the
  // independent mobilityAccess field (role no longer needs to hold the
  // mobility value at all) must remain password-eligible exactly as it was
  // before migration, same as the existing Lands-only case right below.
  if (data.mobilityAccess && data.mobilityAccess.enabled === true) return true;
  return data.role === null && Boolean(data.landsAccess && data.landsAccess.enabled === true);
}

module.exports = {
  isNonEmptyString,
  validateFieldSelection,
  validateMobilitySelection,
  validateLandsSelection,
  computeLandsSyncOperation,
  assertSingleService,
  resolveEffectiveServiceState,
  passwordPolicyReason,
  isPasswordEligibleTarget,
  PASSWORD_TARGET_ROLES,
};
