'use strict';
// ============================================================================
// POST /api/admin/users  — secure server-side account & password management.
//
// Auth:   Authorization: Bearer <Firebase ID token>   (verified, revoke-checked)
// Authz:  caller must be an owner (owners/{uid}, active != false), OR an
//         organization manager (managers/{uid}, role 'manager', active !=
//         false, non-empty organizationId) acting only on supervisor/
//         inspector/contractor records of that SAME organizationId.
//         Supervisors are deliberately not authorized callers.
// Body:   { action, ...params }
//
// Actions: list | create | setTempPassword | setActive | revokeSessions | getMetadata
//
// SECURITY: passwords are never returned, never logged, never stored in
// Firestore. A temporary password sets mustChangePassword:true on the record.
// ============================================================================
const { getAuth, getDb, FieldValue } = require('../_lib/firebaseAdmin');
const {
  MOBILITY_MANAGEABLE_ROLES,
  MANAGEABLE_ROLES,
  MANAGER_SCOPED_ROLES,
  MANAGER_MANAGEMENT_ENABLED,
  collectionForRole,
  verifyRequestToken,
  getCallerContext,
  assertCanManage,
} = require('../_lib/authz');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch (_) { return {}; }
}

function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }

const RECENT_AUTH_WINDOW_SECONDS = 10 * 60;
const PASSWORD_TARGET_ROLES = ['inspector', 'contractor', ...MOBILITY_MANAGEABLE_ROLES];

function hasRecentAuthentication(decoded, nowSeconds = Math.floor(Date.now() / 1000)) {
  const authTime = Number(decoded && decoded.auth_time);
  return Number.isFinite(authTime) && authTime > 0 && authTime <= nowSeconds + 60
    && nowSeconds - authTime <= RECENT_AUTH_WINDOW_SECONDS;
}

function passwordPolicyReason(password, target) {
  if (typeof password !== 'string' || password.length < 12) return 'password_policy_failed';
  if (password !== password.trim()) return 'password_policy_failed';
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'password_policy_failed';
  }
  const normalized = password.toLowerCase();
  const obvious = ['password', 'qwerty', 'admin', 'welcome', 'letmein', '1234', 'abcd'];
  if (obvious.some(value => normalized.includes(value)) || /(.)\1{3,}/.test(normalized) || /(.{2,})\1{2,}/.test(normalized)) {
    return 'password_policy_failed';
  }
  const identityParts = [target && target.email, target && target.name]
    .filter(isNonEmptyString)
    .flatMap(value => String(value).toLowerCase().split(/[^\p{L}\p{N}]+/u))
    .filter(value => value.length >= 3);
  return identityParts.some(value => normalized.includes(value)) ? 'password_policy_failed' : null;
}

function safeAdminFailure(error) {
  const code = error && error.errorInfo && error.errorInfo.code;
  if (code === 'auth/email-already-exists') return { statusCode: 409, reason: 'email_already_exists' };
  if (code === 'auth/invalid-email') return { statusCode: 400, reason: 'invalid_email' };
  if (code === 'auth/invalid-password') return { statusCode: 400, reason: 'invalid_password' };
  return { statusCode: 500, reason: 'temporary_failure' };
}

// Locate a managed user's record (managers/ or users/) by uid.
async function findRecord(db, uid) {
  const mgr = await db.collection('managers').doc(uid).get();
  if (mgr.exists) return { ref: mgr.ref, data: mgr.data() || {}, collection: 'managers' };
  const usr = await db.collection('users').doc(uid).get();
  if (usr.exists) return { ref: usr.ref, data: usr.data() || {}, collection: 'users' };
  return null;
}

// Only ever expose safe, non-sensitive account metadata.
async function safeMetadata(auth, uid, record) {
  let lastSignInTime = null;
  let email = record.data.email || null;
  try {
    const u = await auth.getUser(uid);
    lastSignInTime = (u.metadata && u.metadata.lastSignInTime) || null;
    email = u.email || email;
  } catch (_) { /* auth user may not exist yet */ }
  return {
    uid,
    email,
    role: record.data.role || null,
    active: record.data.active !== false,
    organizationId: record.data.organizationId || null,
    mustChangePassword: record.data.mustChangePassword === true,
    lastSignInTime,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  // ---- authenticate ----
  let decoded;
  try {
    decoded = await verifyRequestToken(req);
  } catch (e) {
    return sendJson(res, e.statusCode || 401, { error: 'unauthenticated' });
  }

  // ---- authorize (owner: any org; manager: own org, inspector/contractor only) ----
  const caller = await getCallerContext(decoded.uid);
  if (!caller.isOwner && !(caller.isManager && MANAGER_MANAGEMENT_ENABLED)) {
    return sendJson(res, 403, { error: 'forbidden', reason: 'owner_or_manager_required' });
  }

  const body = await readJsonBody(req);
  const action = body.action;
  const auth = getAuth();
  const db = getDb();

  try {
    switch (action) {
      // ---- list users of an organization ----
      case 'list': {
        const organizationId = body.organizationId;
        if (!isNonEmptyString(organizationId)) {
          return sendJson(res, 400, { error: 'organizationId_required' });
        }
        // A manager may only ever list their OWN organization, and never
        // sees manager/owner records — inspectors/contractors only.
        if (caller.isManager && organizationId !== caller.organizationId) {
          return sendJson(res, 403, { error: 'forbidden', reason: 'cross_organization_denied' });
        }
        const collectionsToQuery = caller.isManager ? ['users'] : ['managers', 'users'];
        const out = [];
        for (const col of collectionsToQuery) {
          const snap = await db.collection(col)
            .where('organizationId', '==', organizationId).get();
          for (const doc of snap.docs) {
            const data = doc.data() || {};
            if (caller.isManager && !MANAGER_SCOPED_ROLES.includes(data.role)) continue;
            out.push(await safeMetadata(auth, doc.id, { data }));
          }
        }
        return sendJson(res, 200, { users: out });
      }

      // ---- create a manager / supervisor / inspector / contractor ----
      case 'create': {
        const { organizationId, role, email, name, password } = body;
        if (!MANAGEABLE_ROLES.includes(role)) {
          return sendJson(res, 400, { error: 'invalid_role', allowed: MANAGEABLE_ROLES });
        }
        if (!isNonEmptyString(email) || !isNonEmptyString(organizationId)) {
          return sendJson(res, 400, { error: 'email_and_organizationId_required' });
        }
        const decision = assertCanManage(caller, { targetRole: role, targetOrganizationId: organizationId });
        if (!decision.allowed) {
          return sendJson(res, 403, { error: 'forbidden', reason: decision.reason });
        }

        const createParams = { email: email.trim(), disabled: false };
        if (isNonEmptyString(name)) createParams.displayName = name.trim();
        if (isNonEmptyString(password)) createParams.password = password; // set, never stored
        const userRecord = await auth.createUser(createParams);

        const col = collectionForRole(role);
        await db.collection(col).doc(userRecord.uid).set({
          uid: userRecord.uid,
          email: email.trim(),
          name: isNonEmptyString(name) ? name.trim() : '',
          role,
          organizationId,
          active: true,
          createdBy: caller.uid,
          createdAt: FieldValue.serverTimestamp(),
        });

        // Response never includes the password.
        return sendJson(res, 200, {
          uid: userRecord.uid, email: email.trim(), role, organizationId, active: true,
        });
      }

      // ---- set a temporary password (forces change on next login) ----
      case 'setTempPassword': {
        const { uid, password } = body;
        if (!isNonEmptyString(uid) || !isNonEmptyString(password)) {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'password_policy_failed' });
        }
        // This sensitive action is deliberately manager-only. Owners and
        // supervisors use their separate approved workflows and cannot inherit
        // organization-manager password authority through this endpoint.
        if (!caller.isManager || caller.role !== 'manager' || !isNonEmptyString(caller.organizationId)) {
          return sendJson(res, 403, { error: 'forbidden', reason: 'password_management_denied' });
        }
        if (!hasRecentAuthentication(decoded)) {
          return sendJson(res, 401, { error: 'unauthenticated', reason: 'reauthentication_required' });
        }
        const record = await findRecord(db, uid);
        if (!record || !PASSWORD_TARGET_ROLES.includes(record.data.role)) {
          return sendJson(res, 403, { error: 'forbidden', reason: 'password_target_denied' });
        }
        if (!isNonEmptyString(record.data.organizationId) || record.data.organizationId !== caller.organizationId) {
          return sendJson(res, 403, { error: 'forbidden', reason: 'target_organization_mismatch' });
        }
        const policyFailure = passwordPolicyReason(password, record.data);
        if (policyFailure) return sendJson(res, 400, { error: 'invalid_request', reason: policyFailure });

        await auth.updateUser(uid, { password }); // password set, never stored/logged
        await auth.revokeRefreshTokens(uid);
        await record.ref.set({
          mustChangePassword: true,
          passwordUpdatedAt: FieldValue.serverTimestamp(),
          sessionsRevokedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        // No password echoed back.
        return sendJson(res, 200, { uid, mustChangePassword: true, revoked: true });
      }

      // ---- enable / disable an account ----
      case 'setActive': {
        const { uid, active } = body;
        if (!isNonEmptyString(uid) || typeof active !== 'boolean') {
          return sendJson(res, 400, { error: 'uid_and_active_boolean_required' });
        }
        const record = await findRecord(db, uid);
        if (!record) return sendJson(res, 404, { error: 'record_not_found' });
        const decision = assertCanManage(caller, {
          targetRole: record.data.role, targetOrganizationId: record.data.organizationId,
        });
        if (!decision.allowed) return sendJson(res, 403, { error: 'forbidden', reason: decision.reason });

        await auth.updateUser(uid, { disabled: !active });
        await record.ref.set({ active, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return sendJson(res, 200, { uid, active });
      }

      // ---- revoke all refresh tokens (sign the user out everywhere) ----
      case 'revokeSessions': {
        const { uid } = body;
        if (!isNonEmptyString(uid)) return sendJson(res, 400, { error: 'uid_required' });
        const record = await findRecord(db, uid);
        if (!record) return sendJson(res, 404, { error: 'record_not_found' });
        const decision = assertCanManage(caller, {
          targetRole: record.data.role, targetOrganizationId: record.data.organizationId,
        });
        if (!decision.allowed) return sendJson(res, 403, { error: 'forbidden', reason: decision.reason });

        await auth.revokeRefreshTokens(uid);
        await record.ref.set({ sessionsRevokedAt: FieldValue.serverTimestamp() }, { merge: true });
        return sendJson(res, 200, { uid, revoked: true });
      }

      // ---- safe account metadata ----
      case 'getMetadata': {
        const { uid } = body;
        if (!isNonEmptyString(uid)) return sendJson(res, 400, { error: 'uid_required' });
        const record = await findRecord(db, uid);
        if (!record) return sendJson(res, 404, { error: 'record_not_found' });
        const decision = assertCanManage(caller, {
          targetRole: record.data.role, targetOrganizationId: record.data.organizationId,
        });
        if (!decision.allowed) return sendJson(res, 403, { error: 'forbidden', reason: decision.reason });

        const meta = await safeMetadata(auth, uid, record);
        return sendJson(res, 200, { user: meta });
      }

      default:
        return sendJson(res, 400, { error: 'unknown_action' });
    }
  } catch (e) {
    // Never leak internals or any credential material.
    const failure = safeAdminFailure(e);
    return sendJson(res, failure.statusCode, { error: 'request_failed', reason: failure.reason });
  }
};
