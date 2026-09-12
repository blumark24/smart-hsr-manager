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
  MANAGER_MANAGEMENT_ENABLED,
  MOBILITY_MANAGEABLE_ROLES,
  collectionForRole,
  verifyRequestToken,
  getCallerContext,
  getMobilityHeadCallerContext,
  getContractorCallerContext,
  isValidMobilityAllocationTarget,
  resolveMobilityRole,
  assertCanManage,
} = require('../_lib/authz');
const { buildContractorObservationUpdate } = require('../../platform/policies/contractor-observation-workflow');
const { callLandsTrustedMutation } = require('../_lib/landsBridge');
const { ensureManagerLandsBootstrap, runBootstrapTransaction } = require('../_lib/landsManagerBootstrap');
const { resolveLandsSyncOutcome } = require('../_lib/landsSyncReconciliation');
const {
  validateFieldSelection,
  validateMobilitySelection,
  validateLandsSelection,
  computeLandsSyncOperation,
  assertSingleService,
  resolveEffectiveServiceState,
  passwordPolicyReason,
  isPasswordEligibleTarget,
} = require('../_lib/serviceEntitlements');

// The manager's own already-verified bearer token, forwarded as-is to Lands'
// trusted mutation endpoint (see api/_lib/landsBridge.js). Extracted
// separately from verifyRequestToken's decoded claims so authz.js's return
// contract stays untouched for every other caller.
function extractBearerToken(req) {
  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return m ? m[1] : null;
}

// Append-only audit trail for security-relevant User Center mutations
// (see firestore.rules adminAuditEvents match block). Written with the
// Admin SDK, so it bypasses client rules entirely — actorId/actorRole/
// organizationId always come from the ALREADY-VERIFIED `caller` context
// derived server-side from the caller's own bearer token, never from the
// request body, so a client can never forge, spoof, or suppress an
// entry. Never pass a password, temp password, token, or any other
// credential material in `detail` — this function does not sanitize it.
async function recordAdminAudit(db, { caller, organizationId, targetUid, action, detail }) {
  const doc = {
    // The TARGET's organization, not necessarily the caller's — an owner
    // has no organizationId of their own (getCallerContext returns null
    // for owner), but the record must still be scoped to the affected
    // organization so that organization's own manager can read it.
    organizationId,
    actorId: caller.uid,
    actorRole: caller.role,
    targetUid,
    action,
    createdAt: FieldValue.serverTimestamp(),
  };
  if (detail && typeof detail === 'object') doc.detail = detail;
  await db.collection('adminAuditEvents').add(doc);
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

function hasRecentAuthentication(decoded, nowSeconds = Math.floor(Date.now() / 1000)) {
  const authTime = Number(decoded && decoded.auth_time);
  return Number.isFinite(authTime) && authTime > 0 && authTime <= nowSeconds + 60
    && nowSeconds - authTime <= RECENT_AUTH_WINDOW_SECONDS;
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
  // PHASE 02B/06C — the same dual-read as firestore.rules' mobilityRoleValue()
  // and resolveMobilityRole() elsewhere: once mobilityAccess exists on a
  // record at all, it alone decides that record's Mobility state (an
  // explicit {enabled:false} is never resurrected by a stale legacy `role`);
  // only a record never touched by the new field falls back to `role`.
  const mobilityRole = resolveMobilityRole(record.data);
  const mobilityEnabled = MOBILITY_MANAGEABLE_ROLES.includes(mobilityRole);
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
    // Normalized safe Mobility entitlement — structurally parallel to
    // landsAccess above. No internal fields (requestedBy/requestedAt) are
    // ever exposed here.
    mobilityAccess: mobilityEnabled
      ? { enabled: true, role: mobilityRole }
      : { enabled: false, role: null },
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
  const body = await readJsonBody(req);
  const action = body.action;
  const auth = getAuth();
  const db = getDb();

  // PHASE 06A.2 — listMobilityEmployees is authorized completely separately
  // from every other action below: it is the only action a mobility_head
  // (never an owner/manager by itself) may ever call on this endpoint, and
  // every other action's owner/manager gate must stay byte-for-byte
  // unchanged for every existing caller. See the dedicated case below for
  // why this is safe (organizationId comes ONLY from this verified
  // server-side context, never the request body).
  if (action === 'listMobilityEmployees') {
    const mobilityCaller = await getMobilityHeadCallerContext(decoded.uid);
    if (!mobilityCaller.isMobilityHead) {
      return sendJson(res, 403, { error: 'forbidden', reason: 'mobility_head_required' });
    }
    try {
      const snap = await db.collection('users').where('organizationId', '==', mobilityCaller.organizationId).get();
      const employees = [];
      for (const doc of snap.docs) {
        const d = doc.data() || {};
        if (d.active === false) continue;
        if (resolveMobilityRole(d) !== 'employee') continue;
        // Minimal safe projection only — no email, no role/mobilityAccess
        // internals, no other account metadata. PHASE 02B/06C: email is
        // never used as a display-name fallback, even when name is absent —
        // fall back straight to the safe, non-sensitive doc id instead. The
        // allocation drawer only ever needs a uid to write and a name to
        // display; Rules (validMobilityAllocationTarget) remain the sole
        // authority over whether an allocation to this uid actually
        // succeeds.
        employees.push({ uid: doc.id, name: d.name || doc.id });
      }
      return sendJson(res, 200, { employees });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  // PHASE 06B — TRUSTED VEHICLE ALLOCATION CUTOVER. Authorized exactly like
  // listMobilityEmployees above (an ACTIVE mobility_head only — never an
  // owner/manager by itself), completely separate from the owner/manager
  // gate below. This is now the ONLY way a mission may move
  // APPROVED->VEHICLE_ALLOCATED and a vehicle AVAILABLE->RESERVED — see
  // firestore.rules, where both client-side transitions are now denied
  // outright (Admin SDK writes below bypass Rules entirely, so Rules no
  // longer need to, and structurally cannot safely, arbitrate this pair).
  //
  // organizationId/actorId/actorRole/audit identity are NEVER read from the
  // request body — only missionId/vehicleId/employeeUid are. The caller's
  // own organization is resolved exclusively from their verified server-side
  // Mobility identity (mobilityCaller.organizationId), exactly like
  // listMobilityEmployees. Mission, vehicle, and target-employee validation
  // (existence, same-organization, status, target eligibility) all happen
  // inside ONE Admin SDK transaction that also performs the writes, so a
  // stale read can never be acted on and the mission update, the vehicle
  // update, and the one canonical audit event either all commit or none do.
  if (action === 'allocateVehicle') {
    const mobilityCaller = await getMobilityHeadCallerContext(decoded.uid);
    if (!mobilityCaller.isMobilityHead) {
      return sendJson(res, 403, { error: 'forbidden', reason: 'mobility_head_required' });
    }
    const { missionId, vehicleId, employeeUid } = body;
    if (!isNonEmptyString(missionId) || !isNonEmptyString(vehicleId) || !isNonEmptyString(employeeUid)) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'missionId_vehicleId_employeeUid_required' });
    }
    const organizationId = mobilityCaller.organizationId;
    try {
      const outcome = await db.runTransaction(async (transaction) => {
        const missionRef = db.collection('missions').doc(missionId);
        const vehicleRef = db.collection('vehicles').doc(vehicleId);
        const employeeRef = db.collection('users').doc(employeeUid);
        const [missionSnap, vehicleSnap, employeeSnap] = await Promise.all([
          transaction.get(missionRef), transaction.get(vehicleRef), transaction.get(employeeRef),
        ]);

        if (!missionSnap.exists) return { ok: false, statusCode: 404, reason: 'mission_not_found' };
        const mission = missionSnap.data() || {};
        if (mission.organizationId !== organizationId) return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
        if (mission.status !== 'APPROVED') return { ok: false, statusCode: 409, reason: 'mission_not_approved' };

        if (!vehicleSnap.exists) return { ok: false, statusCode: 404, reason: 'vehicle_not_found' };
        const vehicle = vehicleSnap.data() || {};
        if (vehicle.organizationId !== organizationId) return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
        if (vehicle.status !== 'AVAILABLE') return { ok: false, statusCode: 409, reason: 'vehicle_not_available' };

        if (!employeeSnap.exists) return { ok: false, statusCode: 404, reason: 'employee_not_found' };
        const employee = employeeSnap.data() || {};
        if (!isValidMobilityAllocationTarget(employee, organizationId)) {
          return { ok: false, statusCode: 403, reason: 'invalid_allocation_target' };
        }

        const now = FieldValue.serverTimestamp();
        const employeeName = isNonEmptyString(employee.name) ? employee.name.trim() : '';
        transaction.update(missionRef, {
          status: 'VEHICLE_ALLOCATED',
          vehicleId,
          assignedEmployeeUid: employeeUid,
          assignedEmployeeName: employeeName,
          updatedAt: now,
          updatedByUid: decoded.uid,
        });
        transaction.update(vehicleRef, {
          status: 'RESERVED',
          assignedEmployeeUid: employeeUid,
          currentMissionId: missionId,
          updatedAt: now,
          updatedByUid: decoded.uid,
        });
        // The one canonical audit event, inside this same transaction —
        // actor/role/organization are always the trusted server-derived
        // caller, never request-body values, so neither can ever be spoofed.
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId,
          actorId: decoded.uid,
          actorRole: 'mobility_head',
          resourceType: 'mission',
          resourceId: missionId,
          action: 'allocate_vehicle',
          fromStatus: 'APPROVED',
          toStatus: 'VEHICLE_ALLOCATED',
          vehicleId,
          timestamp: now,
        });
        return { ok: true };
      });

      if (!outcome.ok) {
        return sendJson(res, outcome.statusCode, { error: 'request_failed', reason: outcome.reason });
      }
      return sendJson(res, 200, { missionId, vehicleId, employeeUid, status: 'VEHICLE_ALLOCATED' });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  // PHASE 08.1 CLOSURE 2 — TRUSTED CONTRACTOR OBSERVATION STATUS TRANSITION.
  // Authorized exactly like allocateVehicle above (an ACTIVE contractor
  // only), completely separate from the owner/manager gate below. This is
  // now the ONLY way an assigned observation may move
  // PENDING->IN_PROGRESS or IN_PROGRESS->CONTRACTOR_SUBMITTED — see
  // firestore.rules, where the client-side contractor transition is now
  // denied outright (this Admin SDK write bypasses Rules entirely, so
  // Rules no longer need to, and structurally cannot safely, arbitrate
  // it). organizationId is NEVER read from the request body — only
  // observationId/transitionKey/note/fix/afterImagePath are. The final
  // resolutionNote/status/updatedByUid fields are constructed by
  // platform/policies/contractor-observation-workflow.js — the server,
  // not the client, is the authority for their exact content. Read +
  // validate + write all happen inside one transaction so a stale read
  // can never be acted on.
  if (action === 'contractorObservationUpdate') {
    const contractorCaller = await getContractorCallerContext(decoded.uid);
    if (!contractorCaller.isContractor) {
      return sendJson(res, 403, { error: 'forbidden', reason: 'contractor_required' });
    }
    const { observationId, transitionKey, note, fix, afterImagePath } = body;
    if (!isNonEmptyString(observationId) || !isNonEmptyString(transitionKey)) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'observationId_transitionKey_required' });
    }
    try {
      const outcome = await db.runTransaction(async (transaction) => {
        const obsRef = db.collection('observations').doc(observationId);
        const obsSnap = await transaction.get(obsRef);
        const observation = obsSnap.exists ? obsSnap.data() : null;
        const { decision, update } = buildContractorObservationUpdate({
          actor: { uid: contractorCaller.uid, organizationId: contractorCaller.organizationId },
          observation, transitionKey, note, fix, afterImagePath,
        });
        if (!decision.allowed) return { ok: false, decision };
        const now = FieldValue.serverTimestamp();
        transaction.update(obsRef, { ...update, updatedAt: now });
        // The one canonical audit event, inside this same transaction —
        // actor/organization are always the trusted server-derived
        // caller, never request-body values, so neither can ever be
        // spoofed.
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: contractorCaller.organizationId,
          actorId: contractorCaller.uid,
          actorRole: 'contractor',
          resourceType: 'observation',
          resourceId: observationId,
          action: 'contractor_transition',
          toStatus: update.status,
          timestamp: now,
        });
        return { ok: true, status: update.status };
      });
      if (!outcome.ok) {
        const statusCode = outcome.decision.code === 'CONTRACTOR_OBSERVATION_NOT_FOUND' ? 404
          : outcome.decision.code === 'CROSS_ORGANIZATION_DENIED' || outcome.decision.code === 'CONTRACTOR_NOT_ASSIGNED' ? 403
          : 409;
        return sendJson(res, statusCode, { error: 'request_failed', reason: outcome.decision.code });
      }
      return sendJson(res, 200, { observationId, status: outcome.status });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  // ---- authorize (owner: any org; manager: own org, inspector/contractor only) ----
  const caller = await getCallerContext(decoded.uid);
  if (!caller.isOwner && !(caller.isManager && MANAGER_MANAGEMENT_ENABLED)) {
    return sendJson(res, 403, { error: 'forbidden', reason: 'owner_or_manager_required' });
  }

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
            // record with a declared Lands entitlement (role is null there
            // since Field was never enabled for that account), PLUS any
            // record whose Mobility role lives ONLY in the independent
            // mobilityAccess field (role may also be null there, or a Field
            // role — see resolveMobilityRole()'s dual-read). Any one of the
            // three is sufficient; this must never be based on the legacy
            // `role` field or a Lands declaration alone, or a genuine
            // same-org Mobility-only account silently disappears from the
            // Manager User Center.
            const hasFieldRole = MANAGER_SCOPED_ROLES.includes(data.role);
            const hasMobilityRole = MOBILITY_MANAGEABLE_ROLES.includes(resolveMobilityRole(data));
            const hasLandsDeclared = Boolean(data.landsAccess && data.landsAccess.enabled);
            if (caller.isManager && !hasFieldRole && !hasMobilityRole && !hasLandsDeclared) continue;
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

        await recordAdminAudit(db, {
          caller, organizationId, targetUid: userRecord.uid, action: 'create', detail: { role },
        });

        // Response never includes the password.
        return sendJson(res, 200, {
          uid: userRecord.uid, email: email.trim(), role, organizationId, active: true,
        });
      } else {
        // ---- create a single-service (Field, Mobility, OR Lands) operational user ----
        // Only ever creates users/{uid} records — never managers — so this
        // path can never be used to create another manager or owner.
        // PHASE 06A hotfix: Mobility is its own independent selection here
        // too, never accepted through `field` any more.
        const { organizationId, email, name, field, mobility, lands, password, active } = body;
        if (!isNonEmptyString(email) || !isNonEmptyString(organizationId)) {
          return sendJson(res, 400, { error: 'email_and_organizationId_required' });
        }
        const initialActive = active !== false;
        const fieldSel = validateFieldSelection(field);
        if (!fieldSel.ok) return sendJson(res, 400, { error: 'invalid_request', reason: fieldSel.reason });
        const mobilitySel = validateMobilitySelection(mobility);
        if (!mobilitySel.ok) return sendJson(res, 400, { error: 'invalid_request', reason: mobilitySel.reason });
        const landsSel = validateLandsSelection(lands);
        if (!landsSel.ok) return sendJson(res, 400, { error: 'invalid_request', reason: landsSel.reason });
        if (!fieldSel.enabled && !mobilitySel.enabled && !landsSel.enabled) {
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
          targetRole: fieldSel.enabled ? fieldSel.role : mobilitySel.enabled ? mobilitySel.role : 'inspector',
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
        // A mutation conflict (already exists in exactly the requested
        // state) is reconciled to synced rather than left stuck as a false
        // failure — see api/_lib/landsSyncReconciliation.js. Any other
        // failure reason is left untouched.
        const landsOutcome = landsSel.enabled
          ? await resolveLandsSyncOutcome({
              landsSync, idToken: rawToken, municipalityId: organizationId, uid: userRecord.uid,
              desiredEnabled: true, desiredRole: landsSel.role,
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
            syncStatus: landsOutcome.syncStatus,
            ...(landsOutcome.eventId ? { lastAuditEventId: landsOutcome.eventId } : {}),
            ...(landsOutcome.syncError ? { syncError: landsOutcome.syncError } : {}),
          };
        }
        // PHASE 06A hotfix — Mobility's own independent entitlement field on
        // a brand-new record, structurally parallel to landsAccess above but
        // native to this same project (no remote trusted-mutation sync
        // needed, unlike Lands).
        if (mobilitySel.enabled) {
          doc.mobilityAccess = {
            enabled: true, role: mobilitySel.role,
            requestedBy: caller.uid, requestedAt: FieldValue.serverTimestamp(),
          };
        }
        await db.collection('users').doc(userRecord.uid).set(doc);

        await recordAdminAudit(db, {
          caller, organizationId, targetUid: userRecord.uid, action: 'create',
          detail: {
            field: { enabled: fieldSel.enabled, role: fieldSel.role },
            mobility: { enabled: mobilitySel.enabled, role: mobilitySel.role },
            lands: { enabled: landsSel.enabled, role: landsSel.role },
          },
        });

        return sendJson(res, 200, {
          uid: userRecord.uid, email: email.trim(), organizationId, active: initialActive,
          mustChangePassword: isNonEmptyString(password),
          field: { enabled: fieldSel.enabled, role: fieldSel.role },
          mobility: { enabled: mobilitySel.enabled, role: mobilitySel.role },
          lands: landsSel.enabled
            ? { enabled: true, role: landsSel.role, syncStatus: landsOutcome.syncStatus, syncError: landsOutcome.syncError }
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
        const { uid, field, mobility, lands, vehicleEligible } = body;
        if (!isNonEmptyString(uid)) return sendJson(res, 400, { error: 'uid_required' });
        const record = await findRecord(db, uid);
        if (!record || record.collection !== 'users') return sendJson(res, 404, { error: 'record_not_found' });

        const fieldSel = validateFieldSelection(field);
        if (!fieldSel.ok) return sendJson(res, 400, { error: 'invalid_request', reason: fieldSel.reason });
        // PHASE 06A hotfix — Mobility as its own independent selection,
        // never mixed into `field` any more (see validateMobilitySelection).
        const mobilitySel = validateMobilitySelection(mobility);
        if (!mobilitySel.ok) return sendJson(res, 400, { error: 'invalid_request', reason: mobilitySel.reason });
        const landsSel = validateLandsSelection(lands);
        if (!landsSel.ok) return sendJson(res, 400, { error: 'invalid_request', reason: landsSel.reason });
        if (vehicleEligible !== undefined && typeof vehicleEligible !== 'boolean') {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'invalid_vehicle_eligible' });
        }
        if (!fieldSel.present && !mobilitySel.present && !landsSel.present && vehicleEligible === undefined) {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'no_service_changes' });
        }
        // Phase 03B: Field and Lands may now both be enabled at once on the
        // same identity (see api/_lib/serviceEntitlements.js assertSingleService)
        // — this resolves what the FULL post-request state would be (a
        // request may only mention one service, leaving the other's current
        // stored state in effect) purely for bookkeeping; it no longer
        // blocks the combined case. PHASE 06A hotfix: Mobility is now a
        // third fully independent entitlement in this same computation.
        const { fieldEffectiveEnabled, landsEffectiveEnabled } = resolveEffectiveServiceState(fieldSel, landsSel, record.data.role, record.data.landsAccess, record.data.mobilityAccess);
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
        // PHASE 06A hotfix — Mobility's own independent entitlement field,
        // structurally parallel to landsAccess. Deliberately NEVER deleted
        // on disable (unlike landsAccess below): once this key exists at
        // all, firestore.rules' mobilityRoleValue() treats it as the sole
        // source of truth for this record's Mobility state and stops
        // falling back to the legacy scalar `role` field — so an explicit
        // disable must leave {enabled:false} in place, not delete the key,
        // or a stale legacy `role` value (from before this record was ever
        // touched by the new independent control) could still grant access
        // through the backward-compatibility fallback. The legacy `role`
        // field itself is never touched here — Field's own selection above
        // is the only thing that ever writes it, preserving Field
        // independence in both directions.
        if (mobilitySel.present) {
          update.mobilityAccess = {
            enabled: mobilitySel.enabled, role: mobilitySel.role,
            requestedBy: caller.uid, requestedAt: FieldValue.serverTimestamp(),
          };
        }
        // Phase 03B: an independent entitlement, never a role — see
        // platform/policies/vehicle-workflow-policy.js for where this is
        // actually enforced server-side (firestore.rules vehicle allocation).
        if (vehicleEligible !== undefined) update.vehicleEligible = vehicleEligible;

        let landsSync = null;
        let landsOutcome = null;
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
            // A mutation conflict (already exists in exactly the requested
            // state) is reconciled to synced rather than left stuck as a
            // false failure — see api/_lib/landsSyncReconciliation.js.
            landsOutcome = await resolveLandsSyncOutcome({
              landsSync, idToken: rawToken, municipalityId, uid,
              desiredEnabled: landsSel.enabled, desiredRole: landsSel.role,
            });
          }

          if (landsSel.enabled) {
            update.landsAccess = {
              enabled: true, role: landsSel.role,
              requestedBy: caller.uid, requestedAt: FieldValue.serverTimestamp(),
              syncStatus: landsOutcome ? landsOutcome.syncStatus : (wasSynced ? 'synced' : 'pending_trusted_sync'),
              ...(landsOutcome && landsOutcome.eventId ? { lastAuditEventId: landsOutcome.eventId } : {}),
              ...(landsOutcome && landsOutcome.syncError ? { syncError: landsOutcome.syncError } : {}),
            };
          } else {
            update.landsAccess = FieldValue.delete();
          }
        }
        await record.ref.set(update, { merge: true });

        await recordAdminAudit(db, {
          caller, organizationId: municipalityId, targetUid: uid, action: 'set_services',
          detail: {
            field: fieldSel.present ? { enabled: fieldSel.enabled, role: fieldSel.role } : undefined,
            mobility: mobilitySel.present ? { enabled: mobilitySel.enabled, role: mobilitySel.role } : undefined,
            lands: landsSel.present ? { enabled: landsSel.enabled, role: landsSel.role } : undefined,
            vehicleEligible,
          },
        });

        return sendJson(res, 200, {
          uid,
          field: fieldSel.present ? { enabled: fieldSel.enabled, role: fieldSel.role } : undefined,
          mobility: mobilitySel.present ? { enabled: mobilitySel.enabled, role: mobilitySel.role } : undefined,
          lands: landsSel.present
            ? { enabled: landsSel.enabled, role: landsSel.role, syncStatus: landsSel.enabled ? (update.landsAccess.syncStatus) : null, syncError: landsOutcome ? landsOutcome.syncError : null }
            : undefined,
          vehicleEligible,
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

        // No password echoed back, and never audited — only the fact that
        // a reset happened, never the value.
        await recordAdminAudit(db, { caller, organizationId: record.data.organizationId, targetUid: uid, action: 'password_reset' });
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
        await recordAdminAudit(db, {
          caller, organizationId: record.data.organizationId, targetUid: uid,
          action: active ? 'enable' : 'disable',
        });
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

      // ---- one-time Lands institution-manager bootstrap (self-only, idempotent) ----
      // PHASE 06A.2 — consolidated from the former dedicated
      // api/admin/lands-bootstrap.js endpoint (removed to stay within
      // Vercel's Hobby-plan serverless-function-per-deployment limit) into
      // this action. Byte-for-byte the same guarantees as that endpoint: no
      // request body is ever read for identity/target purposes — the ONLY
      // inputs are the verified caller's own uid/organizationId, resolved
      // server-side. computeBootstrapDecision (api/_lib/landsManagerBootstrap.js)
      // independently re-checks caller.isManager itself, so an owner caller
      // (allowed past the shared gate above) is still correctly denied here
      // with reason 'manager_required' — unchanged from the original
      // endpoint's own behavior. Idempotent: a second call performs no
      // mutation and returns alreadyBootstrapped:true.
      case 'landsBootstrap': {
        const outcome = await runBootstrapTransaction(db, caller);
        if (!outcome.decision.allowed) {
          return sendJson(res, 403, { error: 'forbidden', reason: outcome.decision.reason });
        }
        return sendJson(res, 200, {
          municipalityId: caller.organizationId,
          landsRole: 'municipal_manager',
          alreadyBootstrapped: outcome.decision.alreadyBootstrapped,
        });
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
