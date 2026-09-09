// Pure users-list view logic, kept completely separate from Firestore/DOM
// state so it can be reasoned about and tested without either. Loaded by
// manager.html and by tests via dynamic import() — the same pattern
// already used for storage-adapter.js and
// manager-login-error-classification.js.
//
// allUsers must never be mutated by anything in this file.

// 'Field' here means this app (Smart HSR Manager) as opposed to the
// separate Lands app — the ORIGINAL supervisor/inspector/contractor roles
// only. Smart Mobility's four roles are handled separately below: PHASE
// 06A gave Mobility its own independent `mobilityAccess` field ({enabled,
// role}), structurally parallel to landsAccess, so a Mobility role no
// longer necessarily lives in this same scalar `role` a Field role also
// uses — see resolveMobilityRole() for the dual-read that keeps every
// pre-06A record (Mobility role still in the legacy scalar `role`) working
// unchanged.
const TRUE_FIELD_ROLES = new Set(['supervisor', 'inspector', 'contractor']);
const MOBILITY_ROLES = new Set(['mobility_head', 'department_head', 'administrative_affairs', 'employee']);

/**
 * PHASE 06A.1 — mirrors firestore.rules' mobilityRoleValue() and
 * platform/contracts/product-entitlement-contract.js's resolveProductEntitlements()
 * exactly: once a document has ever been touched by the new independent
 * mobilityAccess field (the key exists at all, regardless of its enabled
 * value), that field alone decides the document's Mobility role — an
 * explicit {enabled:false} must never be overridden by a stale legacy
 * `role` value left over from before the document was migrated. Only a
 * document that has NEVER been touched by the new field (no mobilityAccess
 * key at all) still falls back to reading the legacy scalar `role`.
 *
 * @param {{role?: string|null, mobilityAccess?: {enabled?: boolean, role?: string|null}|null}} userDoc
 * @returns {string|null}
 */
function resolveMobilityRole(userDoc) {
  if (userDoc.mobilityAccess != null && typeof userDoc.mobilityAccess === 'object') {
    return userDoc.mobilityAccess.enabled === true ? userDoc.mobilityAccess.role : null;
  }
  return MOBILITY_ROLES.has(userDoc.role) ? userDoc.role : null;
}

/**
 * Which Firestore users/{uid} documents belong on the manager's Users list
 * at all. A real operational account is a true Field account (role is
 * supervisor/inspector/contractor), a Lands-only account (recognized by a
 * landsAccess object — role may legitimately be null), and/or a Mobility
 * account (recognized via resolveMobilityRole()'s independent-field-first
 * dual-read — role may legitimately be null or a Field role now that
 * Mobility has its own field). Any one of the three is sufficient; a
 * document matching none of them is excluded. This is a pure OR: Field +
 * Mobility, Mobility + Lands, Field + Lands, and all three at once are all
 * exactly as visible as any single one alone.
 *
 * @param {{role?: string|null, landsAccess?: object, mobilityAccess?: object}} userDoc
 * @returns {boolean}
 */
export function belongsOnUsersList(userDoc) {
  if (!userDoc || typeof userDoc !== 'object') return false;
  const hasFieldRole = TRUE_FIELD_ROLES.has(userDoc.role);
  const hasLandsAccess = userDoc.landsAccess != null && typeof userDoc.landsAccess === 'object';
  const hasMobilityRole = MOBILITY_ROLES.has(resolveMobilityRole(userDoc));
  return hasFieldRole || hasLandsAccess || hasMobilityRole;
}

/**
 * Derives the currently-visible subset of allUsers for a given view state.
 * Pure: never mutates allUsers, never reads or writes any DOM/global state.
 *
 * @param {Array<{name?: string, email?: string}>} allUsers
 * @param {{search?: string}} viewState
 * @returns {Array} a new array — never the same reference as allUsers
 */
export function deriveVisibleUsers(allUsers, viewState) {
  const search = String(viewState?.search || '').trim().toLowerCase();
  if (!search) return allUsers.slice();
  return allUsers.filter(u =>
    String(u?.name || '').toLowerCase().includes(search) ||
    String(u?.email || '').toLowerCase().includes(search)
  );
}
