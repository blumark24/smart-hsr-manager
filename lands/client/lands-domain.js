export const LANDS_ROLES = Object.freeze(['municipal_manager', 'lands_department_manager', 'lands_employee']);
export const canManageEntitlements = (role) => role === 'municipal_manager';
export const canCreateGrant = (role) => LANDS_ROLES.includes(role);
export const canReviewGrant = (role) => role === 'municipal_manager' || role === 'lands_department_manager';

// Gate 2 final correction: the Conveyance axis no longer has a stage/status
// field at all — it is driven ONLY by letter_number + letter_date. A grant
// created before this correction may still carry an old conveyance.stage
// value in Firestore; it is simply never read, required, or written by the
// current workflow (no migration, no mass-delete — old data stays as-is
// and remains fully readable).

// Gate 2: the ONE canonical completeness calculation — exactly the five
// approved axes, 20% each. This replaces two previously-conflicting
// systems found in the Gate 0 audit: this function's own old 3-field
// inline check, and lands-core.js's now-removed computeCompleteness(),
// which checked *_id foreign-key fields that don't actually exist on a
// real grant for beneficiary/royal_order/allocation_decision — those are
// embedded objects (see client/lands-client.js's real createGrant()),
// never id references.
//
// Gate 2 correction: the Plan+Parcel axis is driven by manual, directly
// user-entered business reference numbers (plan_reference_number /
// parcel_reference_number) — NOT plan_id/parcel_id. Those two remain
// exactly what they always were: real Firestore document-id references
// into the separate plans/parcels collections, used for spatial/entity
// linkage on the GIS Twin (see client/lands-spatial.js, parcelById() in
// index.html) — a deliberately separate concept from this axis, per
// the approved product rule. A manual reference number is never written
// into plan_id/parcel_id, and linking a real Plan/Parcel entity never
// implies GIS verification of a manual reference.
//
// Every UI surface (Dashboard, Grant Registry, Decision Grant Registry,
// Grant Digital File, Completion Intelligence, Automation Engine, Review
// Mode fixtures) reads the result via grant.completeness — none of them
// may recompute independently.
export function computeGrantCompleteness(grant) {
  const axisOrder = ['beneficiary', 'royal_order', 'allocation_decision', 'plan_parcel', 'conveyance'];
  const axisOk = {
    beneficiary: Boolean(grant.beneficiary?.name && grant.beneficiary?.national_id),
    royal_order: Boolean(grant.royal_order?.number && grant.royal_order?.date),
    allocation_decision: Boolean(grant.allocation_decision?.number && grant.allocation_decision?.date),
    // Plan/Parcel stay optional for draft creation/editing — this axis
    // only contributes its 20% once BOTH manual reference numbers are
    // entered. No geometry, no GIS verification, no entity linkage
    // (plan_id/parcel_id) is required or implied.
    plan_parcel: Boolean(grant.plan_reference_number && grant.parcel_reference_number),
    // Complete once BOTH manual business fields are entered — letter_number
    // and letter_date. No stage/status field is required, read, or
    // considered here, even if an old record happens to still carry one.
    conveyance: Boolean(grant.conveyance?.letter_number && grant.conveyance?.letter_date)
  };
  const missing = axisOrder.filter((axis) => !axisOk[axis]);
  const percentage = (axisOrder.length - missing.length) * (100 / axisOrder.length);
  return { status: missing.length ? 'incomplete' : 'complete', missing, percentage };
}

/** Response-only projection. Never pass this object to Firestore writes. */
export function presentGrant(id, grant) {
  return { id, ...grant, completeness: computeGrantCompleteness(grant) };
}
