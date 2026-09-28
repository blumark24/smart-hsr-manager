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
// BEFORE Phase 06A, "one Field-or-Mobility role at a time" held only
// because both products shared this single field — there was no way for a
// single Firestore document to carry two role values at once.
//
// PHASE 06A hotfix — Mobility Entitlement Independence: Mobility now has
// its OWN independent `mobilityAccess` field ({enabled, role}), structurally
// parallel to `landsAccess`, so Field and Mobility (and Lands) can all be
// enabled at once on the same identity. Backward compatibility for every
// EXISTING record never touched by this new field (no bulk migration was
// performed): once `mobilityAccess` exists on a document at all, it alone
// decides that document's Mobility state (mirrors firestore.rules'
// mobilityRoleValue() exactly — keep both in sync); only a document that
// has NEVER been touched by the new field still falls back to reading the
// legacy scalar `role`. `role` itself remains scalar and is now Field-only
// going forward for any record that also carries mobilityAccess.
function resolveProductEntitlements(userDoc) {
  const data = userDoc || {};
  const role = data.role === undefined ? null : data.role;
  const landsAccess = data.landsAccess;
  const mobilityAccess = data.mobilityAccess;

  const isFieldRole = FIELD_ROLES.includes(role);
  const hasMobilityAccessField = mobilityAccess !== undefined;
  const mobilityRole = hasMobilityAccessField
    ? (mobilityAccess && mobilityAccess.enabled === true ? mobilityAccess.role : null)
    : role;
  const isMobilityRole = MOBILITY_ROLES.includes(mobilityRole);
  const landsEnabled = Boolean(landsAccess && landsAccess.enabled === true && LANDS_ROLES.includes(landsAccess.role));

  return Object.freeze({
    field: Object.freeze({ enabled: isFieldRole, role: isFieldRole ? role : null }),
    mobility: Object.freeze({
      enabled: isMobilityRole,
      role: isMobilityRole ? mobilityRole : null,
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
