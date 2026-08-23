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
  MANAGEABLE_ROLES,
  MANAGER_SCOPED_ROLES,
  LANDS_MANAGEABLE_ROLES,
  MANAGER_MANAGEMENT_ENABLED,
  collectionForRole,
  verifyRequestToken,
  getCallerContext,
  assertCanManage,
} = require('../_lib/authz');
const { callLandsTrustedMutation } = require('../_lib/landsBridge');
const { ensureManagerLandsBootstrap } = require('../_lib/landsManagerBootstrap');

// The manager's own already-verified bearer token, forwarded as-is to Lands'
// trusted mutation endpoint (see api/_lib/landsBridge.js). Extracted
// separately from verifyRequestToken's decoded claims so authz.js's return
// contract stays untouched for every other caller.
function extractBearerToken(req) {
  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return m ? m[1] : null;
}

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
// Deliberately excludes 'supervisor': a supervisor signs into manager.html
// directly and already has a self-service password-change flow there
// (#passwordChangeForm) — this endpoint is for accounts that have no such
// self-service option. Lands-only accounts (role: null) are eligible the
// same way inspector/contractor are, via isPasswordEligibleTarget below.
const PASSWORD_TARGET_ROLES = ['inspector', 'contractor'];

// A Lands-only account (role: null, single-service-exclusive with Field —
// see validateFieldSelection/validateLandsSelection above) is just as much
// a real operational employee as an inspector/contractor, and must be
// equally eligible for a manager-issued temporary password. Recognized by
// an explicit `landsAccess.enabled === true` declaration, never merely by
// the absence of a role (which could also mean a malformed record).
function isPasswordEligibleTarget(data) {
  if (!data) return false;
  if (PASSWORD_TARGET_ROLES.includes(data.role)) return true;
  return data.role === null && Boolean(data.landsAccess && data.landsAccess.enabled === true);
}

function hasRecentAuthentication(decoded, nowSeconds = Math.floor(Date.now() / 1000)) {
  const authTime = Number(decoded && decoded.auth_time);
  return Number.isFinite(authTime) && authTime > 0 && authTime <= nowSeconds + 60
    && nowSeconds - authTime <= RECENT_AUTH_WINDOW_SECONDS;
}

function passwordPolicyReason(password, target) {
  if (typeof password !== 'string' || password.length < 8) return 'password_policy_failed';
  if (password !== password.trim()) return 'password_policy_failed';
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'password_policy_failed';
  }
  const normalized = password.toLowerCase();
  const obvious = ['password', 'qwerty', 'admin', 'welcome', 'letmein'];
  if (obvious.some(value => normalized.includes(value)) || /(.)\1{3,}/.test(normalized) || /(.{2,})\1{2,}/.test(normalized)) {
    return 'password_policy_failed';
  }
  const identityParts = [target && target.email, target && target.name]
    .filter(isNonEmptyString)
    .flatMap(value => String(value).toLowerCase().split(/[^\p{L}\p{N}]+/u))
    .filter(value => value.length >= 3);
  return identityParts.some(value => normalized.includes(value)) ? 'password_policy_failed' : null;
}

// ---- multi-service entitlement helpers (Smart HSR Manager + Smart HSR Lands) ----
// A user account is ONE Firebase identity; each service's access is declared
// independently here. Field's existing top-level role/active/organizationId
// fields are untouched and remain the sole source of truth for Field access
// (see firestore.rules isActiveOrgUser()) — this only adds a sibling
// `landsAccess` field. Crucially, landsAccess is a MANAGER-DECLARED REQUEST,
// never the real grant: actual Lands authorization lives in Lands' own
// landsMunicipalities/{municipality_id}/userAccess/{uid} document, written
// only through Lands' trusted mutation endpoint (a cross-origin service this
// Admin API cannot safely call yet — see server _test note / final report).
function validateFieldSelection(field) {
  if (field === undefined) return { ok: true, present: false, enabled: false, role: null };
  if (typeof field !== 'object' || field === null || typeof field.enabled !== 'boolean') {
    return { ok: false, reason: 'invalid_field_selection' };
  }
  if (field.enabled && !MANAGER_SCOPED_ROLES.includes(field.role)) return { ok: false, reason: 'invalid_field_role' };
  return { ok: true, present: true, enabled: field.enabled, role: field.enabled ? field.role : null };
}
// Pure decision function — no I/O. Lands' own entitlement.enable/disable are
// single state transitions, not idempotent (calling entitlement.enable on an
// already-enabled record fails on Lands' side), so the correct trusted
// operation depends on the last state THIS API knows was actually synced —
// never merely on what the manager is toggling in the form. Returns
// operation:null when no real Lands-side change is needed.
function computeLandsSyncOperation(previousLandsAccess, landsSel) {
  const wasSynced = Boolean(previousLandsAccess && previousLandsAccess.enabled && previousLandsAccess.syncStatus === 'synced');
  if (landsSel.enabled && !wasSynced) {
    return { operation: 'entitlement.enable', recordChanges: { lands_role: landsSel.role }, wasSynced };
  }
  if (landsSel.enabled && wasSynced && previousLandsAccess.role !== landsSel.role) {
    return { operation: 'entitlement.change_role', recordChanges: { lands_role: landsSel.role }, wasSynced };
  }
  if (!landsSel.enabled && wasSynced) {
    return { operation: 'entitlement.disable', recordChanges: undefined, wasSynced };
  }
  return { operation: null, recordChanges: undefined, wasSynced };
}

function validateLandsSelection(lands) {
  if (lands === undefined) return { ok: true, present: false, enabled: false, role: null };
  if (typeof lands !== 'object' || lands === null || typeof lands.enabled !== 'boolean') {
    return { ok: false, reason: 'invalid_lands_selection' };
  }
  if (lands.enabled && !LANDS_MANAGEABLE_ROLES.includes(lands.role)) return { ok: false, reason: 'invalid_lands_role' };
  return { ok: true, present: true, enabled: lands.enabled, role: lands.enabled ? lands.role : null };
}

// ONE operational employee = ONE operational service only (manager/owner are
// the sole exception, and this function is never used for them — it only
// ever gates the operational users/{uid} create/setServices paths). Pure,
// no I/O: takes the EFFECTIVE enabled state of each service after applying
// whatever this request changes (a service not mentioned in the request
// keeps its existing stored state — see resolveEffectiveServiceState).
function assertSingleService(fieldEffectiveEnabled, landsEffectiveEnabled) {
  if (fieldEffectiveEnabled && landsEffectiveEnabled) return { ok: false, reason: 'dual_service_denied' };
  return { ok: true };
}

// Combines a (possibly absent) requested selection with the existing stored
// state to determine what the enabled state WOULD BE after this request —
// needed because setServices allows a request to mention only one service,
// leaving the other's current state unchanged.
function resolveEffectiveServiceState(fieldSel, landsSel, existingRole, existingLandsAccess) {
  const fieldEffectiveEnabled = fieldSel.present ? fieldSel.enabled : MANAGER_SCOPED_ROLES.includes(existingRole);
  const landsEffectiveEnabled = landsSel.present ? landsSel.enabled : Boolean(existingLandsAccess && existingLandsAccess.enabled);
  return { fieldEffectiveEnabled, landsEffectiveEnabled };
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
  const landsAccess = record.data.landsAccess;
  return {
    uid,
    email,
    role: record.data.role || null,
    active: record.data.active !== false,
    organizationId: record.data.organizationId || null,
    mustChangePassword: record.data.mustChangePassword === true,
    lastSignInTime,
    // Declared intent only — not proof of a real Lands membership. See the
    // validateLandsSelection/setServices comment above.
    landsAccess: landsAccess && landsAccess.enabled === true
      ? { enabled: true, role: landsAccess.role || null, syncStatus: landsAccess.syncStatus || 'pending_trusted_sync' }
      : { enabled: false, role: null, syncStatus: null },
  };
}

async function handler(req, res) {
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
  const rawToken = extractBearerToken(req); // forwarded verbatim to the Lands bridge only, never logged or stored

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
            // A manager sees same-org Field-role records as before, PLUS any
            // record that only has a declared Lands entitlement (role is
            // null there since Field was never enabled for that account).
            const hasFieldRole = MANAGER_SCOPED_ROLES.includes(data.role);
            const hasLandsDeclared = Boolean(data.landsAccess && data.landsAccess.enabled);
            if (caller.isManager && !hasFieldRole && !hasLandsDeclared) continue;
            out.push(await safeMetadata(auth, doc.id, { data }));
          }
        }
        return sendJson(res, 200, { users: out });
      }

      // ---- create a manager / supervisor / inspector / contractor ----
      // (original single-role shape — byte-for-byte unchanged so every
      // existing caller, including owner-users.js, keeps working exactly as
      // before)
      case 'create': if (isNonEmptyString(body.role)) {
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
      } else {
        // ---- create a single-service (Field OR Lands) operational user ----
        // Only ever creates users/{uid} records — never managers — so this
        // path can never be used to create another manager or owner.
        const { organizationId, email, name, field, lands, password, active } = body;
        if (!isNonEmptyString(email) || !isNonEmptyString(organizationId)) {
          return sendJson(res, 400, { error: 'email_and_organizationId_required' });
        }
        const initialActive = active !== false;
        const fieldSel = validateFieldSelection(field);
        if (!fieldSel.ok) return sendJson(res, 400, { error: 'invalid_request', reason: fieldSel.reason });
        const landsSel = validateLandsSelection(lands);
        if (!landsSel.ok) return sendJson(res, 400, { error: 'invalid_request', reason: landsSel.reason });
        if (!fieldSel.enabled && !landsSel.enabled) {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'at_least_one_service_required' });
        }
        const singleServiceCheck = assertSingleService(fieldSel.enabled, landsSel.enabled);
        if (!singleServiceCheck.ok) return sendJson(res, 400, { error: 'invalid_request', reason: singleServiceCheck.reason });
        if (isNonEmptyString(password)) {
          const policyFailure = passwordPolicyReason(password, { email, name });
          if (policyFailure) return sendJson(res, 400, { error: 'invalid_request', reason: policyFailure });
        }
        // Same organization-scoping decision Field creation already applies;
        // a nominal manageable Field role is used for the authorization check
        // even when Lands-only, since a Lands-only account is still a
        // same-organization operational user, never a manager/owner.
        const decision = assertCanManage(caller, {
          targetRole: fieldSel.enabled ? fieldSel.role : 'inspector',
          targetOrganizationId: organizationId,
        });
        if (!decision.allowed) {
          return sendJson(res, 403, { error: 'forbidden', reason: decision.reason });
        }

        const createParams = { email: email.trim(), disabled: !initialActive };
        if (isNonEmptyString(name)) createParams.displayName = name.trim();
        if (isNonEmptyString(password)) createParams.password = password; // set, never stored
        const userRecord = await auth.createUser(createParams);

        // A brand-new Lands membership is always entitlement.enable — never
        // change_role, since no prior membership can exist for a uid that
        // was just created. See setServices below for the change_role and
        // disable cases on an EXISTING account.
        //
        // Before the FIRST trusted Lands mutation this manager ever makes,
        // ensure their own municipal_manager bootstrap membership exists —
        // see api/_lib/landsManagerBootstrap.js. No-op after the first time
        // (idempotent) and no-op entirely for a non-manager (owner) caller.
        if (landsSel.enabled) await ensureManagerLandsBootstrap(db, caller);
        const landsSync = landsSel.enabled
          ? await callLandsTrustedMutation({
              idToken: rawToken, municipalityId: organizationId,
              operation: 'entitlement.enable', recordId: userRecord.uid,
              recordChanges: { lands_role: landsSel.role },
            })
          : null;

        const doc = {
          uid: userRecord.uid,
          email: email.trim(),
          name: isNonEmptyString(name) ? name.trim() : '',
          role: fieldSel.role,
          organizationId,
          active: initialActive,
          createdBy: caller.uid,
          createdAt: FieldValue.serverTimestamp(),
          ...(isNonEmptyString(password) ? { mustChangePassword: true } : {}),
        };
        if (landsSel.enabled) {
          doc.landsAccess = {
            enabled: true, role: landsSel.role,
            requestedBy: caller.uid, requestedAt: FieldValue.serverTimestamp(),
            syncStatus: landsSync.ok ? 'synced' : 'pending_trusted_sync',
            ...(landsSync.ok ? { lastAuditEventId: landsSync.eventId || null } : { syncError: landsSync.reason }),
          };
        }
        await db.collection('users').doc(userRecord.uid).set(doc);

        return sendJson(res, 200, {
          uid: userRecord.uid, email: email.trim(), organizationId, active: initialActive,
          mustChangePassword: isNonEmptyString(password),
          field: { enabled: fieldSel.enabled, role: fieldSel.role },
          lands: landsSel.enabled
            ? { enabled: true, role: landsSel.role, syncStatus: landsSync.ok ? 'synced' : 'pending_trusted_sync', syncError: landsSync.ok ? null : landsSync.reason }
            : { enabled: false, role: null, syncStatus: null },
        });
      }

      // ---- set a user's per-service entitlements (Field and/or Lands) ----
      // Field's changes here behave exactly like the existing status/role
      // model (same MANAGER_SCOPED_ROLES, same organizationId scoping).
      // Disabling a service clears its role/declaration without touching the
      // Firebase Auth account or the other service — "remove a service
      // without deleting the user account".
      case 'setServices': {
        const { uid, field, lands } = body;
        if (!isNonEmptyString(uid)) return sendJson(res, 400, { error: 'uid_required' });
        const record = await findRecord(db, uid);
        if (!record || record.collection !== 'users') return sendJson(res, 404, { error: 'record_not_found' });

        const fieldSel = validateFieldSelection(field);
        if (!fieldSel.ok) return sendJson(res, 400, { error: 'invalid_request', reason: fieldSel.reason });
        const landsSel = validateLandsSelection(lands);
        if (!landsSel.ok) return sendJson(res, 400, { error: 'invalid_request', reason: landsSel.reason });
        if (!fieldSel.present && !landsSel.present) {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'no_service_changes' });
        }
        // Service transfer safety: resolve what the FULL post-request state
        // would be (a request may only mention one service, leaving the
        // other's current stored state in effect) and reject if that would
        // leave both services enabled at once — one operational employee
        // may only ever hold one operational service.
        const { fieldEffectiveEnabled, landsEffectiveEnabled } = resolveEffectiveServiceState(fieldSel, landsSel, record.data.role, record.data.landsAccess);
        const singleServiceCheck = assertSingleService(fieldEffectiveEnabled, landsEffectiveEnabled);
        if (!singleServiceCheck.ok) return sendJson(res, 400, { error: 'invalid_request', reason: singleServiceCheck.reason });

        // users/{uid} only ever holds supervisor/inspector/contractor/null
        // (Lands-only) records — never a manager/owner — so the same-org
        // check alone is the correct, sufficient authorization here.
        const municipalityId = record.data.organizationId;
        if (!caller.isOwner) {
          if (!caller.isManager || municipalityId !== caller.organizationId) {
            return sendJson(res, 403, { error: 'forbidden', reason: 'cross_organization_denied' });
          }
        }

        const update = { updatedAt: FieldValue.serverTimestamp() };
        if (fieldSel.present) update.role = fieldSel.role;

        let landsSync = null;
        if (landsSel.present) {
          const previous = record.data.landsAccess;
          const { operation, recordChanges, wasSynced } = computeLandsSyncOperation(previous, landsSel);

          if (operation) {
            // Same one-time, idempotent bootstrap as the create path above —
            // covers a manager whose FIRST-ever Lands entitlement action
            // happens to be a setServices change/disable rather than create.
            await ensureManagerLandsBootstrap(db, caller);
            landsSync = await callLandsTrustedMutation({
              idToken: rawToken, municipalityId,
              operation, recordId: uid,
              ...(recordChanges !== undefined ? { recordChanges } : {}),
            });
          }

          if (landsSel.enabled) {
            update.landsAccess = {
              enabled: true, role: landsSel.role,
              requestedBy: caller.uid, requestedAt: FieldValue.serverTimestamp(),
              syncStatus: landsSync ? (landsSync.ok ? 'synced' : 'pending_trusted_sync') : (wasSynced ? 'synced' : 'pending_trusted_sync'),
              ...(landsSync && landsSync.ok ? { lastAuditEventId: landsSync.eventId || null } : {}),
              ...(landsSync && !landsSync.ok ? { syncError: landsSync.reason } : {}),
            };
          } else {
            update.landsAccess = FieldValue.delete();
          }
        }
        await record.ref.set(update, { merge: true });

        return sendJson(res, 200, {
          uid,
          field: fieldSel.present ? { enabled: fieldSel.enabled, role: fieldSel.role } : undefined,
          lands: landsSel.present
            ? { enabled: landsSel.enabled, role: landsSel.role, syncStatus: landsSel.enabled ? (update.landsAccess.syncStatus) : null, syncError: landsSync && !landsSync.ok ? landsSync.reason : null }
            : undefined,
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
        if (!record || !isPasswordEligibleTarget(record.data)) {
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
}

module.exports = handler;
module.exports._test = { passwordPolicyReason, validateFieldSelection, validateLandsSelection, computeLandsSyncOperation, assertSingleService, resolveEffectiveServiceState, isPasswordEligibleTarget };
