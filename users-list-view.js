// Pure users-list view logic, kept completely separate from Firestore/DOM
// state so it can be reasoned about and tested without either. Loaded by
// manager.html and by tests via dynamic import() — the same pattern
// already used for storage-adapter.js and
// manager-login-error-classification.js.
//
// allUsers must never be mutated by anything in this file.

const FIELD_ROLES = new Set(['supervisor', 'inspector', 'contractor']);

/**
 * Which Firestore users/{uid} documents belong on the manager's Users list
 * at all. A real operational account is either a Field account (role is
 * one of the existing Field roles) or a Lands-only account (role is
 * null/absent — Lands is single-service-exclusive with Field, see
 * api/admin/users.js — and recognized instead by having a landsAccess
 * object). Only a document that is neither is excluded.
 *
 * This replaces a stricter Field-only role whitelist that silently
 * dropped every Lands-only employee from the list the moment their
 * account existed, because their role is legitimately null.
 *
 * @param {{role?: string|null, landsAccess?: object}} userDoc
 * @returns {boolean}
 */
export function belongsOnUsersList(userDoc) {
  if (!userDoc || typeof userDoc !== 'object') return false;
  const hasFieldRole = FIELD_ROLES.has(userDoc.role);
  const hasLandsAccess = userDoc.landsAccess != null && typeof userDoc.landsAccess === 'object';
  return hasFieldRole || hasLandsAccess;
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
