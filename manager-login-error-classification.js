// Pure classification of a manager-login failure, shared between
// manager-login.html and its regression tests (loaded there via dynamic
// import(), the same pattern already used for storage-adapter.js).
//
// The bug this exists to prevent: collapsing every possible failure after
// signInWithEmailAndPassword() into one generic "check your email or
// password" message. That message is only true for CREDENTIAL_ERROR_CODES.
// Anything else — a Firestore permission/network failure while reading
// managers/{uid}, a misconfigured or wrong Firebase project, an invalid API
// key — is a system-side problem that has nothing to do with what the user
// typed, and telling them to re-check their password is actively
// misleading (and can send someone chasing a "forgotten password" that was
// never wrong).

// Firebase Auth codes that genuinely describe a credentials problem. Kept
// deliberately generic in the UI (never distinguishing "wrong password"
// from "no such user") to avoid account-enumeration — this list only
// decides which of the two existing user-facing messages to show, it does
// not add a new one.
export const CREDENTIAL_ERROR_CODES = new Set([
  'auth/invalid-credential',
  'auth/wrong-password',
  'auth/user-not-found',
  'auth/invalid-email',
  'auth/user-disabled',
  'auth/missing-password',
  'auth/too-many-requests',
]);

/**
 * @param {{code?: string, message?: string}} error
 * @returns {'unauthorized' | 'credential-failed' | 'system-error'}
 */
export function classifyManagerLoginError(error) {
  if (error && error.message === 'unauthorized-manager') return 'unauthorized';
  if (error && CREDENTIAL_ERROR_CODES.has(error.code)) return 'credential-failed';
  return 'system-error';
}
