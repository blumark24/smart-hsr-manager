// Pure Mobility employee-discovery logic, kept separate from Firestore/DOM
// state so it can be reasoned about and tested without either. Loaded by
// smart-mobility-adapter.js and by tests via dynamic import() — the same
// pattern already used for users-list-view.js.

/**
 * PHASE 06A.1 — same dual-read as mobilityRoleValue() in firestore.rules and
 * resolveMobilityRole() in users-list-view.js: once a document has ever been
 * touched by the independent mobilityAccess field, that field alone decides
 * whether it is a live Mobility employee — an explicit
 * mobilityAccess.enabled:false must never be resurrected by a stale legacy
 * role:'employee' left over from before the document was migrated. Only a
 * document that has never been touched by the new field (no mobilityAccess
 * key at all) still falls back to the legacy scalar `role`. Inactive
 * accounts (active === false) are never live employees regardless of role.
 *
 * @param {{active?: boolean, role?: string|null, mobilityAccess?: {enabled?: boolean, role?: string|null}|null}} data
 * @returns {boolean}
 */
export function isLiveMobilityEmployee(data) {
  if (!data || typeof data !== 'object' || data.active === false) return false;
  if (data.mobilityAccess != null && typeof data.mobilityAccess === 'object') {
    return data.mobilityAccess.enabled === true && data.mobilityAccess.role === 'employee';
  }
  return data.role === 'employee';
}

/**
 * Merges two already org-scoped, already narrowly-filtered Firestore query
 * result sets (uid -> raw doc data) into the final liveEmployees list,
 * re-applying isLiveMobilityEmployee() so a document that only matched the
 * legacy query because of a stale role:'employee' but carries an explicit
 * mobilityAccess.enabled:false is excluded from the merged result.
 *
 * @param {Map<string, object>} legacyDocs
 * @param {Map<string, object>} mobilityDocs
 * @returns {Array<{uid: string, name: string}>}
 */
export function mergeLiveEmployees(legacyDocs, mobilityDocs) {
  const raw = new Map();
  for (const [uid, data] of legacyDocs) raw.set(uid, data);
  for (const [uid, data] of mobilityDocs) raw.set(uid, data);
  return Array.from(raw.entries())
    .filter(([, data]) => isLiveMobilityEmployee(data))
    .map(([uid, data]) => ({ uid, name: data.name || data.email || uid }));
}
