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

// Smart Mobility roles (Phase 2/3 integration). municipality_manager reuses
// the existing 'manager' role/collection rather than a new value — same
// account, same organizationId scope.
const MOBILITY_MANAGEABLE_ROLES = ['mobility_head', 'department_head', 'administrative_affairs', 'employee'];

// Roles this API is ever allowed to create/manage. 'owner' is intentionally
// excluded — the API must never create or manage owners or escalate to owner.
const MANAGEABLE_ROLES = ['manager', 'supervisor', 'inspector', 'contractor', ...MOBILITY_MANAGEABLE_ROLES];

// Roles an organization manager (as opposed to an owner) may manage.
const MANAGER_SCOPED_ROLES = ['supervisor', 'inspector', 'contractor', ...MOBILITY_MANAGEABLE_ROLES];

// PHASE 06A hotfix — Field's own three role values, kept as their own list
// (distinct from MANAGER_SCOPED_ROLES, which still covers "any role the
// legacy scalar `role` field may hold at all" for the broader
// can-a-manager-manage-this-record checks above, unaffected by this
// hotfix). Used to scope the `field` service-entitlement selection to Field
// roles only, now that Mobility has its own independent
// validateMobilitySelection()/MOBILITY_MANAGEABLE_ROLES check — Field must
// no longer accept a Mobility role value, and vice versa.
const FIELD_MANAGEABLE_ROLES = ['supervisor', 'inspector', 'contractor'];

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
  if (['supervisor', 'inspector', 'contractor', ...MOBILITY_MANAGEABLE_ROLES].includes(role)) return 'users';
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
//
// Phase 03B additionally recognizes an active `department_head` users/{uid}
// record (isDepartmentHead / department fields, both new). This is purely
// additive: every existing caller of getCallerContext only ever reads
// isOwner/isManager/role/organizationId, which are unaffected — a
// department_head caller still resolves isOwner:false, isManager:false,
// exactly as before Phase 03B, so the ORIGINAL Admin API
// (api/admin/users.js) still denies such a caller with the same
// 'owner_or_manager_required' it always has. Only the NEW employee-registry
// endpoint (api/admin/employees.js) reads isDepartmentHead/department.
//
// PHASE 02B.2/06C.2 SECURITY HOTFIX — department-head resolution below uses
// resolveMobilityRole(d) (the same canonical, key-presence-authoritative
// resolver already fixed for mobility_head above), NOT a direct `d.role ===
// 'department_head'` check. The direct check let a stale legacy
// role:'department_head' record keep employee-registry authorization even
// after mobilityAccess explicitly disabled it (e.g. {enabled:false,
// role:null}) — a present mobilityAccess key must always be the sole
// source of truth once it exists, matching every other resolver in this
// codebase. Only a record NEVER touched by mobilityAccess still falls back
// to the legacy scalar `role`.
async function getCallerContext(uid) {
  const db = getDb();
  const ownerSnap = await db.collection('owners').doc(uid).get();
  if (ownerSnap.exists && activeIsNotFalse(ownerSnap.data())) {
    return { uid, isOwner: true, isManager: false, isDepartmentHead: false, role: 'owner', organizationId: null, department: null };
  }
  const mgrSnap = await db.collection('managers').doc(uid).get();
  if (mgrSnap.exists) {
    const d = mgrSnap.data() || {};
    const orgId = typeof d.organizationId === 'string' ? d.organizationId.trim() : '';
    // Fail closed: a manager record without a non-empty organizationId is
    // never treated as an authorized manager.
    if (d.role === 'manager' && activeIsNotFalse(d) && orgId) {
      return { uid, isOwner: false, isManager: true, isDepartmentHead: false, role: 'manager', organizationId: orgId, department: null };
    }
  }
  const usrSnap = await db.collection('users').doc(uid).get();
  if (usrSnap.exists) {
    const d = usrSnap.data() || {};
    const orgId = typeof d.organizationId === 'string' ? d.organizationId.trim() : '';
    const dept = typeof d.department === 'string' ? d.department.trim() : '';
    // Fail closed exactly like the manager check above: a department_head
    // record missing organizationId or department is never treated as an
    // authorized department head. resolveMobilityRole(d) — not a direct
    // `d.role` check — so an explicit mobilityAccess disable/malformation
    // can never be overridden by a stale legacy role, and a migrated
    // department head (role: null, mobilityAccess: {enabled:true,
    // role:'department_head'}) is correctly recognized.
    if (resolveMobilityRole(d) === 'department_head' && activeIsNotFalse(d) && orgId && dept) {
      return { uid, isOwner: false, isManager: false, isDepartmentHead: true, role: 'department_head', organizationId: orgId, department: dept };
    }
  }
  return { uid, isOwner: false, isManager: false, isDepartmentHead: false, role: null, organizationId: null, department: null };
}

// PHASE 06A.2 — the exact same dual-read as firestore.rules'
// mobilityRoleValue(), smart-mobility-adapter.js's verifyMobilityAccess(),
// and users-list-view.js's resolveMobilityRole(): once a users/{uid} record
// has ever been touched by the independent mobilityAccess field (the key
// exists at all, regardless of its enabled value), that field alone decides
// the record's Mobility role — an explicit {enabled:false} must never be
// overridden by a stale legacy `role` value. Only a record that has never
// been touched by the new field still falls back to the legacy scalar
// `role`. Used both to resolve a caller's own mobility_head identity below
// and, server-side only, to decide which same-org records are live Mobility
// employees for the listMobilityEmployees admin action.
// PHASE 02B.1/06C.1 SECURITY HOTFIX — the presence of the `mobilityAccess`
// KEY ITSELF is authoritative, not merely a truthy/object-typed value. The
// previous `data.mobilityAccess != null && typeof === 'object'` check let a
// present-but-malformed value (null, a string, a number) silently fall
// through to the legacy `role` fallback below — exactly the drift this
// hotfix closes. Once the key exists on the record at all (checked via
// hasOwnProperty, so an explicit `null` counts as present), it alone
// decides Mobility state: only a valid {enabled:true, role:<valid role>}
// shape returns a role; every other value for a present key (null, a
// scalar, an array, {}, enabled:false, a missing/invalid role) fails
// closed to null and is NEVER reactivated by a stale legacy role. Only a
// record that has NEVER been touched by this field (the key is genuinely
// absent) falls back to the legacy scalar `role`.
//
// PRE-PHASE-07 IAM HARDENING — the absent-key fallback branch now validates
// against the SAME MOBILITY_MANAGEABLE_ROLES vocabulary as the present-key
// branch, instead of returning `data.role` unvalidated. Previously
// resolveMobilityRole({role:'supervisor'}) returned the raw string
// 'supervisor' — never exploitable today because every current caller
// re-validates the result with a strict `===`/`.includes()` check before
// trusting it, but a latent contract gap and an inconsistency with the
// sibling resolver in users-list-view.js, which already validated this
// branch. A non-Mobility legacy role (manager, supervisor, inspector,
// contractor, an empty string, or any other unrecognized value) now
// resolves to null here too, exactly like a present-but-malformed
// mobilityAccess value already does.
function resolveMobilityRole(data) {
  if (data && Object.prototype.hasOwnProperty.call(data, 'mobilityAccess')) {
    const access = data.mobilityAccess;
    const enabled = Boolean(access) && typeof access === 'object' && access.enabled === true;
    return enabled && MOBILITY_MANAGEABLE_ROLES.includes(access.role) ? access.role : null;
  }
  const legacyRole = data && data.role;
  return MOBILITY_MANAGEABLE_ROLES.includes(legacyRole) ? legacyRole : null;
}

// PHASE 06A.2 — a narrow, fail-closed caller-context resolver for exactly
// one action (api/admin/users.js's listMobilityEmployees): is this uid an
// ACTIVE mobility_head of a real organization, right now, per Firestore?
// Deliberately separate from getCallerContext() above (which knows nothing
// about Mobility roles at all) so every existing caller of
// getCallerContext/assertCanManage is completely unaffected by this
// addition — this is purely additive, exactly like assertCanManageEmployee.
async function getMobilityHeadCallerContext(uid) {
  const db = getDb();
  const usrSnap = await db.collection('users').doc(uid).get();
  if (usrSnap.exists) {
    const d = usrSnap.data() || {};
    const orgId = typeof d.organizationId === 'string' ? d.organizationId.trim() : '';
    // Fail closed: an inactive record, or one missing a non-empty
    // organizationId, is never treated as an authorized mobility_head —
    // mirrors the manager/department_head checks in getCallerContext above.
    if (resolveMobilityRole(d) === 'mobility_head' && activeIsNotFalse(d) && orgId) {
      return { uid, isMobilityHead: true, organizationId: orgId };
    }
  }
  return { uid, isMobilityHead: false, organizationId: null };
}

// PHASE 08.1 CLOSURE 2 — a narrow, fail-closed caller-context resolver for
// exactly one action (api/admin/users.js's contractorObservationUpdate):
// is this uid an ACTIVE contractor of a real organization, right now, per
// Firestore? Deliberately separate from getCallerContext() above, same
// reasoning as getMobilityHeadCallerContext just above.
async function getContractorCallerContext(uid) {
  const db = getDb();
  const usrSnap = await db.collection('users').doc(uid).get();
  if (usrSnap.exists) {
    const d = usrSnap.data() || {};
    const orgId = typeof d.organizationId === 'string' ? d.organizationId.trim() : '';
    if (d.role === 'contractor' && activeIsNotFalse(d) && orgId) {
      return { uid, isContractor: true, organizationId: orgId };
    }
  }
  return { uid, isContractor: false, organizationId: null };
}

// PHASE 06B — mirrors firestore.rules' validMobilityAllocationTarget()
// exactly: the target of a vehicle allocation must be a real, same-
// organization, active user whose CURRENT Mobility role (the same
// mobilityAccess-first dual read resolveMobilityRole() already uses
// everywhere else) is one of the four real Mobility operational roles, and
// must carry an explicit vehicleEligible === true (missing or false denies
// — the Phase 03B.1 fail-safe default). Pure/no I/O: the caller passes the
// already-fetched target document data (read inside the same Admin SDK
// transaction that performs the allocation), so this can be reused inside
// a transaction without any extra reads. Kept in this file, next to
// resolveMobilityRole(), so both stay in sync by construction rather than
// by convention.
function isValidMobilityAllocationTarget(targetData, organizationId) {
  if (!targetData) return false;
  const orgId = typeof targetData.organizationId === 'string' ? targetData.organizationId : '';
  return orgId === organizationId
    && activeIsNotFalse(targetData)
    && MOBILITY_MANAGEABLE_ROLES.includes(resolveMobilityRole(targetData))
    && targetData.vehicleEligible === true;
}

// Phase 03B — employee-registry authorization (api/admin/employees.js
// only; the original users.js endpoint and assertCanManage above are
// untouched). Owner: any organization. Manager: same organizationId, any
// department, but never targeting another manager/owner. Department head:
// same organizationId AND same department only, and never targeting
// themselves for a privileged change (no self-elevation) or another
// manager/department head. Everyone else: denied.
function assertCanManageEmployee(caller, target) {
  const targetOrg = target && target.targetOrganizationId;
  const targetDept = target && target.targetDepartment;
  const targetEmployeeUid = target && target.targetAuthUid;

  if (!caller) return { allowed: false, reason: 'no_caller' };

  if (caller.isOwner) return { allowed: true, reason: 'owner' };

  if (caller.isManager) {
    if (!caller.organizationId || targetOrg !== caller.organizationId) {
      return { allowed: false, reason: 'cross_organization_denied' };
    }
    return { allowed: true, reason: 'manager_same_org' };
  }

  if (caller.isDepartmentHead) {
    if (targetEmployeeUid && targetEmployeeUid === caller.uid) {
      return { allowed: false, reason: 'self_elevation_denied' };
    }
    if (!caller.organizationId || targetOrg !== caller.organizationId) {
      return { allowed: false, reason: 'cross_organization_denied' };
    }
    if (!caller.department || targetDept !== caller.department) {
      return { allowed: false, reason: 'cross_department_denied' };
    }
    return { allowed: true, reason: 'department_head_same_department' };
  }

  return { allowed: false, reason: 'not_authorized' };
}

// Pure authorization decision. Owner -> anything manageable. Manager -> only
// supervisors/inspectors/contractors/Smart Mobility roles OR a Lands-only
// account (targetRole is exactly `null`) in its OWN organization; never
// managers, owners, or another organization. Everyone else -> denied.
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
  MOBILITY_MANAGEABLE_ROLES,
  FIELD_MANAGEABLE_ROLES,
  LANDS_MANAGEABLE_ROLES,
  MANAGER_MANAGEMENT_ENABLED,
  isManagerScopedTarget,
  collectionForRole,
  activeIsNotFalse,
  resolveMobilityRole,
  verifyRequestToken,
  getCallerContext,
  getMobilityHeadCallerContext,
  getContractorCallerContext,
  isValidMobilityAllocationTarget,
  assertCanManage,
  assertCanManageEmployee,
  AUTH_CODES,
  tokenProject,
};
