'use strict';
// ============================================================================
// Authentication + authorization helpers for the Admin API.
//
// Model (matches firestore.rules):
//   owner      -> owners/{uid}      (allowlist; active != false)
//   manager    -> managers/{uid}    (role 'manager';  active != false)
//   supervisor -> users/{uid}       (role 'supervisor'; no Admin API access)
//   inspector  -> users/{uid}       (role 'inspector')
//   contractor -> users/{uid}       (role 'contractor')
//
// Phase 2: owners may call the live API for any organization. An
// organization manager (managers/{uid}, role 'manager', active != false,
// non-empty organizationId) may additionally call it, but assertCanManage
// restricts them to supervisors/inspectors/contractors of their OWN
// organizationId only. Supervisors never receive account-management access.
// ============================================================================
const { getAuth, getDb } = require('./firebaseAdmin');

const AUTH_CODES = Object.freeze({ HEADER_MISSING: 'AUTH_HEADER_MISSING', TOKEN_INVALID: 'AUTH_TOKEN_INVALID', TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED', PROJECT_MISMATCH: 'AUTH_PROJECT_MISMATCH' });

function authError(code) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 401;
  return error;
}

function tokenProject(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1] || '', 'base64url').toString('utf8'));
    const audience = typeof payload.aud === 'string' ? payload.aud : '';
    const prefix = 'https://securetoken.google.com/';
    const issuerProject = typeof payload.iss === 'string' && payload.iss.startsWith(prefix) ? payload.iss.slice(prefix.length) : '';
    return audience && audience === issuerProject ? audience : '';
  } catch (_) { return ''; }
}

// Roles this API is ever allowed to create/manage. 'owner' is intentionally
// excluded — the API must never create or manage owners or escalate to owner.
const MANAGEABLE_ROLES = ['manager', 'supervisor', 'inspector', 'contractor'];

// Roles an organization manager (as opposed to an owner) may manage.
const MANAGER_SCOPED_ROLES = ['supervisor', 'inspector', 'contractor'];

// Smart HSR Lands roles a manager may assign as a SERVICE ENTITLEMENT DECLARATION
// (see api/admin/users.js `setServices`/`create`). This is deliberately a
// separate, smaller list from Field's roles: lands_municipal_manager is an
// institution-level Lands role and is never exposed as an employee option
// here, matching the same "manager cannot create another manager" boundary
// Field already enforces via MANAGER_SCOPED_ROLES.
const LANDS_MANAGEABLE_ROLES = ['lands_employee', 'lands_department_manager'];

// Stage B flag: manager-initiated, same-organization management is enabled.
const MANAGER_MANAGEMENT_ENABLED = true;

function collectionForRole(role) {
  if (role === 'manager') return 'managers';
  if (role === 'supervisor' || role === 'inspector' || role === 'contractor') return 'users';
  return null;
}

function activeIsNotFalse(data) {
  return !(data && data.active === false);
}

// Verify the Firebase ID token from the Authorization header.
// checkRevoked=true so revoked sessions (disabled/rotated) are rejected.
async function verifyRequestToken(req, verifyIdToken = (token, checkRevoked) => getAuth().verifyIdToken(token, checkRevoked)) {
  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  if (!m) {
    throw authError(AUTH_CODES.HEADER_MISSING);
  }
  try {
    // Firebase Admin is the single verification authority. A local comparison
    // against app.options.projectId can diverge from the credential project on
    // Vercel Preview and reject a token that Admin can verify correctly.
    return await verifyIdToken(m[1], true);
  } catch (e) {
    if (e && e.code === 'auth/id-token-expired') throw authError(AUTH_CODES.TOKEN_EXPIRED);
    throw authError(AUTH_CODES.TOKEN_INVALID);
  }
}

// Build the caller's role context from Firestore (owner / manager / other).
async function getCallerContext(uid) {
  const db = getDb();
  const ownerSnap = await db.collection('owners').doc(uid).get();
  if (ownerSnap.exists && activeIsNotFalse(ownerSnap.data())) {
    return { uid, isOwner: true, isManager: false, role: 'owner', organizationId: null };
  }
  const mgrSnap = await db.collection('managers').doc(uid).get();
  if (mgrSnap.exists) {
    const d = mgrSnap.data() || {};
    const orgId = typeof d.organizationId === 'string' ? d.organizationId.trim() : '';
    // Fail closed: a manager record without a non-empty organizationId is
    // never treated as an authorized manager.
    if (d.role === 'manager' && activeIsNotFalse(d) && orgId) {
      return { uid, isOwner: false, isManager: true, role: 'manager', organizationId: orgId };
    }
  }
  return { uid, isOwner: false, isManager: false, role: null, organizationId: null };
}

// Pure authorization decision. Owner -> anything manageable. Manager -> only
// supervisors/inspectors/contractors OR a Lands-only account (targetRole is
// exactly `null`) in its OWN organization; never managers, owners, or
// another organization. Everyone else -> denied.
//
// Account security (temp password, enable/disable, session revocation)
// belongs to the Firebase Auth identity, not to which operational service
// an employee happens to work in. A Lands-only employee's users/{uid} doc
// legitimately has role === null (Lands is single-service-exclusive with
// Field — see api/admin/users.js) and is recognized here by that exact
// `null`, never by `undefined`/a missing field, so a malformed or
// unexpected record still fails closed exactly as before.
function isManagerScopedTarget(targetRole) {
  return targetRole === null || MANAGER_SCOPED_ROLES.includes(targetRole);
}

function assertCanManage(caller, target) {
  const targetRole = target && target.targetRole;
  const targetOrg = target && target.targetOrganizationId;

  if (targetRole !== null && !MANAGEABLE_ROLES.includes(targetRole)) {
    return { allowed: false, reason: 'target_role_not_manageable' };
  }
  if (!caller) return { allowed: false, reason: 'no_caller' };

  if (caller.isOwner) {
    return { allowed: true, reason: 'owner' };
  }
  if (caller.isManager) {
    if (!isManagerScopedTarget(targetRole)) {
      return { allowed: false, reason: 'manager_cannot_manage_managers' };
    }
    if (!caller.organizationId || targetOrg !== caller.organizationId) {
      return { allowed: false, reason: 'cross_organization_denied' };
    }
    return { allowed: true, reason: 'manager_same_org' };
  }
  return { allowed: false, reason: 'not_authorized' };
}

module.exports = {
  MANAGEABLE_ROLES,
  MANAGER_SCOPED_ROLES,
  LANDS_MANAGEABLE_ROLES,
  MANAGER_MANAGEMENT_ENABLED,
  isManagerScopedTarget,
  collectionForRole,
  activeIsNotFalse,
  verifyRequestToken,
  getCallerContext,
  assertCanManage,
  AUTH_CODES,
  tokenProject,
};
