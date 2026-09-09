'use strict';
// ============================================================================
// Phase 03B — compatibility resolver over the EXISTING users/{uid} schema.
//
// This is deliberately additive/read-only: it derives a normalized
// {field, lands, mobility} entitlement view from the fields that already
// exist (`role`, `landsAccess`, and the new optional `vehicleEligible`) —
// it never migrates, renames, or deletes any legacy field, so every
// existing Field/Lands/Mobility authorization path (firestore.rules,
// api/_lib/authz.js, login.html) keeps reading those same legacy fields
// completely unmodified. New code (the employees API, the User Center UI)
// should read entitlements through this resolver rather than re-deriving
// the same booleans ad hoc in multiple places.
// ============================================================================

const FIELD_ROLES = Object.freeze(['supervisor', 'inspector', 'contractor']);
const MOBILITY_ROLES = Object.freeze(['mobility_head', 'department_head', 'administrative_affairs', 'employee']);
const LANDS_ROLES = Object.freeze(['lands_employee', 'lands_department_manager']);

// A user's `role` field is scalar by construction (one string value), so
// "one Field-or-Mobility role at a time" and "one Mobility role at a time"
// both hold automatically — there is no way for a single Firestore document
// to carry two role values at once. Vehicle eligibility is independent of
// role and defaults to eligible when absent (see the backward-compatibility
// note below) — never a role in itself.
function resolveProductEntitlements(userDoc) {
  const data = userDoc || {};
  const role = data.role === undefined ? null : data.role;
  const landsAccess = data.landsAccess;

  const isFieldRole = FIELD_ROLES.includes(role);
  const isMobilityRole = MOBILITY_ROLES.includes(role);
  const landsEnabled = Boolean(landsAccess && landsAccess.enabled === true && LANDS_ROLES.includes(landsAccess.role));

  return Object.freeze({
    field: Object.freeze({ enabled: isFieldRole, role: isFieldRole ? role : null }),
    mobility: Object.freeze({
      enabled: isMobilityRole,
      role: isMobilityRole ? role : null,
      // Phase 03B.1 hotfix — fail-safe default: ONLY an EXPLICIT true
      // counts as eligible. A record with no vehicleEligible field at all
      // (every employee created before this field existed) is now NOT
      // eligible until a manager/department head explicitly grants it —
      // see platform/policies/vehicle-workflow-policy.js and
      // firestore.rules for where this is actually enforced server-side.
      vehicleEligible: data.vehicleEligible === true,
    }),
    lands: Object.freeze({ enabled: landsEnabled, role: landsEnabled ? landsAccess.role : null }),
  });
}

module.exports = { FIELD_ROLES, MOBILITY_ROLES, LANDS_ROLES, resolveProductEntitlements };
