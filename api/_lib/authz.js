'use strict';
// ============================================================================
// Authentication + authorization helpers for the Admin API.
//
// Model (matches firestore.rules):
//   owner                   -> owners/{uid}   (allowlist; active != false)
//   manager                 -> managers/{uid} (role 'manager'; active != false)
//                              also the municipality_manager Smart Mobility role
//   supervisor              -> users/{uid}    (role 'supervisor'; no Admin API access)
//   inspector               -> users/{uid}    (role 'inspector')
//   contractor              -> users/{uid}    (role 'contractor')
//   mobility_head           -> users/{uid}    (Smart Mobility)
//   department_head         -> users/{uid}    (Smart Mobility)
//   administrative_affairs  -> users/{uid}    (Smart Mobility)
//   employee                -> users/{uid}    (Smart Mobility)
//
// Phase 2: owners may call the live API for any organization. An
// organization manager (managers/{uid}, role 'manager', active != false,
// non-empty organizationId) may additionally call it, but assertCanManage
// restricts them to supervisors/inspectors/contractors/Smart Mobility roles
// of their OWN organizationId only. Supervisors never receive
// account-management access.
// ============================================================================
const { getAuth, getDb } = require('./firebaseAdmin');

// Smart Mobility roles (Phase 2/3 integration). municipality_manager reuses
// the existing 'manager' role/collection rather than a new value — same
// account, same organizationId scope.
const MOBILITY_MANAGEABLE_ROLES = ['mobility_head', 'department_head', 'administrative_affairs', 'employee'];

// Roles this API is ever allowed to create/manage. 'owner' is intentionally
// excluded — the API must never create or manage owners or escalate to owner.
const MANAGEABLE_ROLES = ['manager', 'supervisor', 'inspector', 'contractor', ...MOBILITY_MANAGEABLE_ROLES];

// Roles an organization manager (as opposed to an owner) may manage.
const MANAGER_SCOPED_ROLES = ['supervisor', 'inspector', 'contractor', ...MOBILITY_MANAGEABLE_ROLES];

// Stage B flag: manager-initiated, same-organization management is enabled.
const MANAGER_MANAGEMENT_ENABLED = true;

function collectionForRole(role) {
  if (role === 'manager') return 'managers';
  if (['supervisor', 'inspector', 'contractor', ...MOBILITY_MANAGEABLE_ROLES].includes(role)) return 'users';
  return null;
}

function activeIsNotFalse(data) {
  return !(data && data.active === false);
}

// Verify the Firebase ID token from the Authorization header.
// checkRevoked=true so revoked sessions (disabled/rotated) are rejected.
async function verifyRequestToken(req) {
  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  if (!m) {
    const err = new Error('missing_bearer_token');
    err.statusCode = 401;
    throw err;
  }
  try {
    return await getAuth().verifyIdToken(m[1], true);
  } catch (e) {
    const err = new Error('invalid_or_revoked_token');
    err.statusCode = 401;
    throw err;
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
// supervisors/inspectors/contractors in its OWN organization; never managers,
// owners, or another organization. Everyone else -> denied.
function assertCanManage(caller, target) {
  const targetRole = target && target.targetRole;
  const targetOrg = target && target.targetOrganizationId;

  if (!MANAGEABLE_ROLES.includes(targetRole)) {
    return { allowed: false, reason: 'target_role_not_manageable' };
  }
  if (!caller) return { allowed: false, reason: 'no_caller' };

  if (caller.isOwner) {
    return { allowed: true, reason: 'owner' };
  }
  if (caller.isManager) {
    if (!MANAGER_SCOPED_ROLES.includes(targetRole)) {
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
  MOBILITY_MANAGEABLE_ROLES,
  MANAGEABLE_ROLES,
  MANAGER_SCOPED_ROLES,
  MANAGER_MANAGEMENT_ENABLED,
  collectionForRole,
  activeIsNotFalse,
  verifyRequestToken,
  getCallerContext,
  assertCanManage,
};
