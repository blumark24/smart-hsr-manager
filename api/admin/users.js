'use strict';
const crypto = require('node:crypto');
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
// Actions: list | create | setPassword | setTempPassword | setActive | revokeSessions | getMetadata
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
  getMobilityEmployeeCallerContext,
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
const { evaluateMissionTransition } = require('../../platform/policies/mission-workflow-policy');
const { evaluateVehicleTransition } = require('../../platform/policies/vehicle-workflow-policy');
const { evaluateVehicleAuthorizationTransition } = require('../../platform/policies/vehicle-authorization-policy');

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

function cleanString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function validClientRequestId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value);
}

// Only business input and the retry key belong to the client. Reject all
// other keys, including protected fields supplied with null/false values.
const TRUSTED_CREATE_INPUT_FIELDS = {
  createMissionRequest: ['action', 'clientRequestId', 'type', 'destination', 'reason', 'scope', 'requestedEmployeeId', 'requestedEmployeeName', 'whenLabel', 'durationLabel'],
  createIncident: ['action', 'clientRequestId', 'missionId', 'vehicleId', 'category', 'severity', 'note'],
};

function trustedCreateRequestRef(db, action, uid, clientRequestId) {
  const key = crypto.createHash('sha256')
    .update(`${action}\0${uid}\0${clientRequestId}`, 'utf8')
    .digest('hex');
  return db.collection('mobilityCreateRequests').doc(key);
}

function payloadHash(action, payload) {
  return crypto.createHash('sha256')
    .update(JSON.stringify([action, ...payload]), 'utf8')
    .digest('hex');
}

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

async function getMobilityOperationalCaller(db, uid, allowedRoles) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const role = resolveMobilityRole(data);
  const organizationId = cleanString(data.organizationId);
  if (!Array.isArray(allowedRoles) || !allowedRoles.includes(role)
      || data.active === false || !organizationId) return null;
  return {
    uid,
    role,
    organizationId,
    department: cleanString(data.department),
    name: cleanString(data.name),
  };
}

function isFieldSurveyDepartment(value) {
  return /الحصر|ميداني|field/i.test(cleanString(value));
}

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string') return value;
  const seconds = Number.isFinite(value.seconds) ? value.seconds : value._seconds;
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

const MISSION_STATUS_LABELS = Object.freeze({
  DRAFT: 'مسودة',
  PENDING_APPROVAL: 'بانتظار اعتماد الشؤون الإدارية',
  APPROVED: 'معتمد — بانتظار تخصيص المركبة',
  REJECTED: 'مرفوض',
  VEHICLE_ALLOCATED: 'تم تخصيص المركبة',
  HANDED_OVER: 'تم تسليم المركبة',
  READY: 'جاهزة للبدء',
  IN_PROGRESS: 'في الميدان',
  INCIDENT_HOLD: 'متوقفة بسبب حالة طارئة',
  COMPLETED: 'المهمة مكتملة',
  AWAITING_RETURN: 'بانتظار إعادة المركبة',
  CLOSED: 'مغلقة',
});

function safeMission(id, data) {
  return {
    missionId: id,
    status: data.status || 'DRAFT',
    statusLabel: MISSION_STATUS_LABELS[data.status] || data.status || 'غير محدد',
    department: data.department || null,
    type: data.type || null,
    destination: data.destination || null,
    reason: data.reason || null,
    scope: data.scope || null,
    requestedEmployeeId: data.requestedEmployeeId || null,
    requestedEmployeeUid: data.requestedEmployeeUid || null,
    requestedEmployeeName: data.requestedEmployeeName || null,
    vehicleId: data.vehicleId || null,
    vehicleAuthorizationId: data.vehicleAuthorizationId || null,
    vehicleAuthorizationNumber: data.vehicleAuthorizationNumber || null,
    vehicleAuthorizationStatus: data.vehicleAuthorizationStatus || null,
    assignedEmployeeUid: data.assignedEmployeeUid || null,
    assignedEmployeeName: data.assignedEmployeeName || null,
    whenLabel: data.whenLabel || null,
    durationLabel: data.durationLabel || null,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

const FIELD_OBSERVATION_STATUS_LABELS = Object.freeze({
  PENDING: 'جديدة',
  IN_PROGRESS: 'قيد المعالجة',
  PENDING_REVIEW: 'بانتظار التحقق',
  COMPLETED: 'مغلقة',
});

function safeFieldObservation(id, data) {
  return {
    observationId: id,
    displayId: Number.isFinite(data.displayId) ? data.displayId : null,
    title: data.title || null,
    details: data.details || null,
    type: data.type || null,
    status: data.status || 'PENDING',
    statusLabel: FIELD_OBSERVATION_STATUS_LABELS[data.status] || data.status || 'غير محدد',
    location: data.location || null,
    correctedLat: Number.isFinite(data.correctedLat) ? data.correctedLat : null,
    correctedLng: Number.isFinite(data.correctedLng) ? data.correctedLng : null,
    locationVerified: data.locationVerified === true,
    locationAccuracyMeters: Number.isFinite(data.locationAccuracyMeters) ? data.locationAccuracyMeters : null,
    // Evidence references only. Bytes remain private and are resolved through
    // the authenticated storage reader on the Department Head client.
    imageObjectKey: data.imageObjectKey || null,
    imagePath: data.imagePath || null,
    imageUrl: data.imageUrl || null,
    beforeImagePath: data.beforeImagePath || null,
    afterImagePath: data.afterImagePath || null,
    afterImageUrl: data.afterImageUrl || null,
    resolutionNote: data.resolutionNote || null,
    createdByUid: data.createdByUid || null,
    assignedContractorUid: data.assignedContractorUid || null,
    assignedContractorName: data.assignedContractorName || null,
    assignedByUid: data.assignedByUid || null,
    supervisorNote: data.supervisorNote || null,
    inspectorVerification: data.inspectorVerification && typeof data.inspectorVerification === 'object'
      ? {
          status: data.inspectorVerification.status || null,
          verifiedByUid: data.inspectorVerification.verifiedByUid || null,
          verifiedByName: data.inspectorVerification.verifiedByName || null,
          note: data.inspectorVerification.note || null,
          verifiedAt: timestampToIso(data.inspectorVerification.verifiedAt),
        }
      : null,
    closedByUid: data.closedByUid || null,
    closedByName: data.closedByName || null,
    closureNote: data.closureNote || null,
    closedAt: timestampToIso(data.closedAt),
    createdAt: timestampToIso(data.createdAt),
    assignedAt: timestampToIso(data.assignedAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

const CONTRACTOR_PROFILE_STATUSES = Object.freeze(['ACTIVE', 'SUSPENDED', 'ENDED']);

function cleanDateOnly(value) {
  const v = cleanString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

function contractorProfileState(profile, today = new Date().toISOString().slice(0, 10)) {
  if (!profile) return 'UNREGISTERED';
  if (profile.status === 'SUSPENDED') return 'SUSPENDED';
  if (profile.status === 'ENDED') return 'ENDED';
  if (profile.startDate && profile.startDate > today) return 'NOT_STARTED';
  if (profile.endDate && profile.endDate < today) return 'EXPIRED';
  return profile.status === 'ACTIVE' ? 'ACTIVE' : 'UNREGISTERED';
}

function safeContractorProfile(data) {
  if (!data) return null;
  const profile = {
    companyName: cleanString(data.companyName),
    contractNumber: cleanString(data.contractNumber),
    contractScope: cleanString(data.contractScope),
    contactName: cleanString(data.contactName),
    contactPhone: cleanString(data.contactPhone),
    startDate: cleanDateOnly(data.startDate),
    endDate: cleanDateOnly(data.endDate),
    status: CONTRACTOR_PROFILE_STATUSES.includes(data.status) ? data.status : 'ENDED',
    updatedAt: timestampToIso(data.updatedAt),
  };
  return {
    ...profile,
    operationalState: contractorProfileState(profile),
  };
}

async function requireFieldDepartmentHead(decodedUid) {
  const caller = await getCallerContext(decodedUid);
  if (!caller.isDepartmentHead || caller.role !== 'department_head'
      || !caller.organizationId || !isFieldSurveyDepartment(caller.department)) {
    return null;
  }
  return caller;
}

async function requireFieldInspector(db, decodedUid) {
  const snap = await db.collection('users').doc(decodedUid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const organizationId = cleanString(data.organizationId);
  const department = cleanString(data.department);
  if (data.active === false || data.role !== 'inspector' || !organizationId) return null;
  return {
    uid: decodedUid,
    role: 'inspector',
    organizationId,
    department,
    name: cleanString(data.name, 'مراقب ميداني'),
  };
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

  if (action === 'getContractorPortalContext') {
    const contractorCaller = await getContractorCallerContext(decoded.uid);
    if (!contractorCaller.isContractor || !contractorCaller.organizationId) {
      return sendJson(res, 403, { error: 'forbidden', reason: 'contractor_required' });
    }
    try {
      const [userSnap, profileSnap] = await Promise.all([
        db.collection('users').doc(contractorCaller.uid).get(),
        db.collection('contractorProfiles').doc(contractorCaller.uid).get(),
      ]);
      const user = userSnap.exists ? (userSnap.data() || {}) : {};
      const rawProfile = profileSnap.exists ? (profileSnap.data() || {}) : {};
      if (cleanString(rawProfile.organizationId) && cleanString(rawProfile.organizationId) !== contractorCaller.organizationId) {
        return sendJson(res, 403, { error: 'forbidden', reason: 'cross_organization_denied' });
      }
      const profile = safeContractorProfile(rawProfile);
      return sendJson(res, 200, {
        contractorUid: contractorCaller.uid,
        organizationId: contractorCaller.organizationId,
        companyName: cleanString(rawProfile.companyName, 'شركة متعاقدة'),
        contactName: cleanString(rawProfile.contactName || user.name, 'ممثل الشركة'),
        contractNumber: cleanString(rawProfile.contractNumber),
        contractScope: cleanString(rawProfile.contractScope),
        startDate: cleanDateOnly(rawProfile.startDate),
        endDate: cleanDateOnly(rawProfile.endDate),
        contractStatus: CONTRACTOR_PROFILE_STATUSES.includes(rawProfile.status) ? rawProfile.status : 'ENDED',
        contractState: contractorProfileState(profile),
        administration: cleanString(rawProfile.administration, 'إدارة الحصر الميداني'),
        section: cleanString(rawProfile.section, 'التشوه البصري'),
      });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  if (action === 'listFieldContractorCompanies') {
    const caller = await getCallerContext(decoded.uid);
    if (!caller.isManager || caller.role !== 'manager' || !caller.organizationId) {
      return sendJson(res, 403, { error: 'forbidden', reason: 'manager_required' });
    }
    try {
      const [usersSnap, profilesSnap] = await Promise.all([
        db.collection('users').where('organizationId', '==', caller.organizationId).get(),
        db.collection('contractorProfiles').where('organizationId', '==', caller.organizationId).get(),
      ]);
      const profileByUid = new Map(profilesSnap.docs.map(doc => [doc.id, doc.data() || {}]));
      const contractors = [];
      for (const doc of usersSnap.docs) {
        const data = doc.data() || {};
        if (data.role !== 'contractor') continue;
        const rawProfile = profileByUid.get(doc.id) || {};
        const profile = safeContractorProfile(rawProfile);
        contractors.push({
          uid: doc.id,
          email: cleanString(data.email),
          active: data.active !== false,
          companyName: cleanString(rawProfile.companyName),
          contractNumber: cleanString(rawProfile.contractNumber),
          contractScope: cleanString(rawProfile.contractScope),
          contactName: cleanString(rawProfile.contactName || data.name),
          contactPhone: cleanString(rawProfile.contactPhone),
          startDate: cleanDateOnly(rawProfile.startDate),
          endDate: cleanDateOnly(rawProfile.endDate),
          contractStatus: CONTRACTOR_PROFILE_STATUSES.includes(rawProfile.status) ? rawProfile.status : 'ENDED',
          contractState: contractorProfileState(profile),
          administration: cleanString(rawProfile.administration, 'إدارة الحصر الميداني'),
          section: cleanString(rawProfile.section, 'التشوه البصري'),
          organizationId: caller.organizationId,
        });
      }
      contractors.sort((a,b)=>a.companyName.localeCompare(b.companyName,'ar'));
      return sendJson(res, 200, { contractors });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  // Visual Distortion external-company onboarding from the Municipality
  // Manager User Center. This deliberately reuses the existing users API,
  // Firebase Auth project and contractor/contractorProfiles schema: no new
  // endpoint, no Firestore Rules change, and no employee-registry record.
  // The caller must be the real municipality manager (not the supervisor
  // compatibility role), and the contractor is always scoped to that same
  // organization.
  if (action === 'createFieldContractorCompany') {
    const caller = await getCallerContext(decoded.uid);
    if (!caller.isManager || caller.role !== 'manager' || !caller.organizationId) {
      return sendJson(res, 403, { error: 'forbidden', reason: 'manager_required' });
    }

    const companyName = cleanString(body.companyName);
    const contractNumber = cleanString(body.contractNumber);
    const contractScope = cleanString(body.contractScope);
    const contactName = cleanString(body.contactName);
    const contactPhone = cleanString(body.contactPhone);
    const email = cleanString(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    const startDate = cleanDateOnly(body.startDate);
    const endDate = cleanDateOnly(body.endDate);
    const status = cleanString(body.status, 'ACTIVE');
    const department = cleanString(body.department);

    if (!companyName || !contractNumber || !contractScope || !contactName || !email
        || !startDate || !endDate || !department
        || !CONTRACTOR_PROFILE_STATUSES.includes(status)) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'complete_contractor_company_required' });
    }
    if (!isFieldSurveyDepartment(department)) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'field_department_required' });
    }
    if (endDate < startDate) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'contract_date_range_invalid' });
    }
    const passwordReason = passwordPolicyReason(password, { name: contactName, email });
    if (passwordReason) {
      return sendJson(res, 400, { error: 'invalid_request', reason: passwordReason });
    }

    let createdUid = null;
    try {
      const authUser = await auth.createUser({
        email,
        displayName: contactName,
        disabled: false,
        password,
      });
      createdUid = authUser.uid;
      const now = FieldValue.serverTimestamp();

      await db.runTransaction(async transaction => {
        const userRef = db.collection('users').doc(createdUid);
        const profileRef = db.collection('contractorProfiles').doc(createdUid);
        transaction.set(userRef, {
          uid: createdUid,
          email,
          name: contactName,
          role: 'contractor',
          organizationId: caller.organizationId,
          active: true,
          createdBy: caller.uid,
          createdAt: now,
        });
        transaction.set(profileRef, {
          contractorUid: createdUid,
          organizationId: caller.organizationId,
          department,
          administration: 'إدارة الحصر الميداني',
          section: 'التشوه البصري',
          companyName,
          contractNumber,
          contractScope,
          contactName,
          contactPhone,
          startDate,
          endDate,
          status,
          updatedByUid: caller.uid,
          updatedAt: now,
        });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: caller.organizationId,
          department,
          actorId: caller.uid,
          actorRole: 'manager',
          resourceType: 'contractorProfile',
          resourceId: createdUid,
          action: 'create_contractor_company',
          contractNumber,
          contractStatus: status,
          timestamp: now,
        });
      });

      return sendJson(res, 200, {
        contractorUid: createdUid,
        companyName,
        contactName,
        email,
        contractState: contractorProfileState({
          companyName, contractNumber, contractScope, contactName, contactPhone,
          startDate, endDate, status,
        }),
      });
    } catch (error) {
      if (createdUid && typeof auth.deleteUser === 'function') {
        try { await auth.deleteUser(createdUid); } catch (_) { /* best-effort rollback */ }
      }
      const code = cleanString(error && error.code);
      if (code === 'auth/email-already-exists') {
        return sendJson(res, 409, { error: 'request_failed', reason: 'email_already_exists' });
      }
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  // PHASE 02B — Visual Distortion command surface for the Field Survey
  // Department Head. Contractors are external operational identities, not
  // employee-registry records. All tenant scope comes from the verified
  // department-head identity; the client cannot choose another organization.
  if (action === 'getFieldVisualDistortionCommand') {
    const caller = await requireFieldDepartmentHead(decoded.uid);
    if (!caller) {
      return sendJson(res, 403, { error: 'forbidden', reason: 'field_department_head_required' });
    }
    try {
      const [obsSnap, contractorSnap, profileSnap] = await Promise.all([
        db.collection('observations').where('organizationId', '==', caller.organizationId).get(),
        db.collection('users').where('organizationId', '==', caller.organizationId).get(),
        db.collection('contractorProfiles').where('organizationId', '==', caller.organizationId).get(),
      ]);

      const observations = obsSnap.docs.map(doc => safeFieldObservation(doc.id, doc.data() || {}));
      observations.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const profileByUid = new Map(profileSnap.docs.map(doc => [doc.id, safeContractorProfile(doc.data() || {})]));
      const contractors = [];
      for (const doc of contractorSnap.docs) {
        const data = doc.data() || {};
        if (data.active === false || data.role !== 'contractor') continue;
        const profile = profileByUid.get(doc.id) || null;
        contractors.push({
          uid: doc.id,
          name: cleanString(data.name, 'مقاول'),
          organizationId: caller.organizationId,
          active: true,
          profile,
          contractState: contractorProfileState(profile),
        });
      }
      contractors.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

      return sendJson(res, 200, {
        product: 'visual_distortion',
        observations: observations.slice(0, 250),
        contractors,
      });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  if (action === 'listFieldDepartmentAudit') {
    const caller = await requireFieldDepartmentHead(decoded.uid);
    if (!caller) {
      return sendJson(res, 403, { error: 'forbidden', reason: 'field_department_head_required' });
    }
    try {
      const snap = await db.collection('auditEvents')
        .where('organizationId', '==', caller.organizationId)
        .get();
      const allowedResourceTypes = new Set(['observation', 'contractorProfile', 'auditNote', 'mission', 'vehicle', 'vehicleAuthorization']);
      const events = [];
      for (const doc of snap.docs) {
        const data = doc.data() || {};
        const eventDepartment = cleanString(data.department);
        if (eventDepartment !== cleanString(caller.department)) continue;
        if (!allowedResourceTypes.has(cleanString(data.resourceType))) continue;
        events.push({
          auditId: doc.id,
          resourceType: cleanString(data.resourceType),
          resourceId: cleanString(data.resourceId),
          action: cleanString(data.action),
          actorRole: cleanString(data.actorRole),
          fromStatus: cleanString(data.fromStatus) || null,
          toStatus: cleanString(data.toStatus) || null,
          contractorUid: cleanString(data.contractorUid) || null,
          parentAuditId: cleanString(data.parentAuditId) || null,
          note: cleanString(data.note) || null,
          timestamp: timestampToIso(data.timestamp || data.createdAt),
        });
      }
      events.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
      return sendJson(res, 200, { events: events.slice(0, 250) });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  // Audit history is immutable. Department heads may append a correction or
  // administrative note, which creates a new linked audit event rather than
  // rewriting or deleting the original record.
  if (action === 'appendFieldDepartmentAuditNote') {
    const caller = await requireFieldDepartmentHead(decoded.uid);
    if (!caller) {
      return sendJson(res, 403, { error: 'forbidden', reason: 'field_department_head_required' });
    }

    const parentAuditId = cleanString(body.parentAuditId);
    const note = cleanString(body.note);
    if (!parentAuditId || !note) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'parentAuditId_and_note_required' });
    }
    if (note.length > 600) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'audit_note_too_long' });
    }

    try {
      const parentRef = db.collection('auditEvents').doc(parentAuditId);
      const parentSnap = await parentRef.get();
      if (!parentSnap.exists) {
        return sendJson(res, 404, { error: 'request_failed', reason: 'audit_event_not_found' });
      }
      const parent = parentSnap.data() || {};
      if (cleanString(parent.organizationId) !== cleanString(caller.organizationId)
          || cleanString(parent.department) !== cleanString(caller.department)) {
        return sendJson(res, 403, { error: 'forbidden', reason: 'cross_scope_audit_denied' });
      }

      const ref = db.collection('auditEvents').doc();
      const now = FieldValue.serverTimestamp();
      await ref.set({
        organizationId: caller.organizationId,
        department: caller.department,
        actorId: caller.uid,
        actorRole: 'department_head',
        resourceType: 'auditNote',
        resourceId: cleanString(parent.resourceId) || parentAuditId,
        parentAuditId,
        action: 'append_audit_note',
        note,
        timestamp: now,
      });

      return sendJson(res, 200, {
        auditId: ref.id,
        parentAuditId,
        action: 'append_audit_note',
        note,
      });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  if (action === 'upsertFieldContractorProfile') {
    const caller = await requireFieldDepartmentHead(decoded.uid);
    if (!caller) {
      return sendJson(res, 403, { error: 'forbidden', reason: 'field_department_head_required' });
    }

    const contractorUid = cleanString(body.contractorUid);
    const profileInput = {
      companyName: cleanString(body.companyName),
      contractNumber: cleanString(body.contractNumber),
      contractScope: cleanString(body.contractScope),
      contactName: cleanString(body.contactName),
      contactPhone: cleanString(body.contactPhone),
      startDate: cleanDateOnly(body.startDate),
      endDate: cleanDateOnly(body.endDate),
      status: cleanString(body.status),
    };

    if (!contractorUid || !profileInput.companyName || !profileInput.contractNumber
        || !profileInput.contractScope || !profileInput.startDate || !profileInput.endDate
        || !CONTRACTOR_PROFILE_STATUSES.includes(profileInput.status)) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'complete_contractor_profile_required' });
    }
    if (profileInput.endDate < profileInput.startDate) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'contract_date_range_invalid' });
    }

    try {
      const contractorRef = db.collection('users').doc(contractorUid);
      const profileRef = db.collection('contractorProfiles').doc(contractorUid);
      const outcome = await db.runTransaction(async transaction => {
        const contractorSnap = await transaction.get(contractorRef);
        if (!contractorSnap.exists) return { ok: false, statusCode: 404, reason: 'contractor_not_found' };
        const contractor = contractorSnap.data() || {};
        if (contractor.organizationId !== caller.organizationId) {
          return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
        }
        if (contractor.active === false || contractor.role !== 'contractor') {
          return { ok: false, statusCode: 409, reason: 'active_contractor_required' };
        }

        const now = FieldValue.serverTimestamp();
        transaction.set(profileRef, {
          contractorUid,
          organizationId: caller.organizationId,
          department: caller.department,
          ...profileInput,
          updatedByUid: caller.uid,
          updatedAt: now,
        }, { merge: true });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: caller.organizationId,
          department: caller.department,
          actorId: caller.uid,
          actorRole: 'department_head',
          resourceType: 'contractorProfile',
          resourceId: contractorUid,
          action: 'upsert_contractor_profile',
          contractNumber: profileInput.contractNumber,
          contractStatus: profileInput.status,
          timestamp: now,
        });
        return { ok: true };
      });

      if (!outcome.ok) {
        return sendJson(res, outcome.statusCode, { error: 'request_failed', reason: outcome.reason });
      }
      const safeProfile = safeContractorProfile(profileInput);
      return sendJson(res, 200, {
        contractorUid,
        profile: safeProfile,
        contractState: contractorProfileState(safeProfile),
      });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  if (action === 'assignFieldObservation') {
    const caller = await requireFieldDepartmentHead(decoded.uid);
    if (!caller) {
      return sendJson(res, 403, { error: 'forbidden', reason: 'field_department_head_required' });
    }

    const observationId = cleanString(body.observationId);
    const contractorUid = cleanString(body.contractorUid);
    const supervisorNote = cleanString(body.supervisorNote);
    if (!observationId || !contractorUid) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'observationId_and_contractorUid_required' });
    }

    try {
      const outcome = await db.runTransaction(async transaction => {
        const observationRef = db.collection('observations').doc(observationId);
        const contractorRef = db.collection('users').doc(contractorUid);
        const profileRef = db.collection('contractorProfiles').doc(contractorUid);
        const [observationSnap, contractorSnap, profileSnap] = await Promise.all([
          transaction.get(observationRef),
          transaction.get(contractorRef),
          transaction.get(profileRef),
        ]);
        if (!observationSnap.exists) return { ok: false, statusCode: 404, reason: 'observation_not_found' };
        if (!contractorSnap.exists) return { ok: false, statusCode: 404, reason: 'contractor_not_found' };

        const observation = observationSnap.data() || {};
        const contractor = contractorSnap.data() || {};

        if (observation.organizationId !== caller.organizationId
            || contractor.organizationId !== caller.organizationId) {
          return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
        }
        if (contractor.active === false || contractor.role !== 'contractor') {
          return { ok: false, statusCode: 409, reason: 'active_contractor_required' };
        }
        if (!profileSnap.exists) {
          return { ok: false, statusCode: 409, reason: 'contractor_profile_required' };
        }
        const profile = safeContractorProfile(profileSnap.data() || {});
        if (contractorProfileState(profile) !== 'ACTIVE') {
          return { ok: false, statusCode: 409, reason: 'active_contract_required' };
        }
        if (observation.status !== 'PENDING') {
          return { ok: false, statusCode: 409, reason: 'observation_not_assignable' };
        }

        const now = FieldValue.serverTimestamp();
        const contractorName = cleanString(contractor.name, contractorUid);
        transaction.update(observationRef, {
          assignedContractorUid: contractorUid,
          assignedContractorName: contractorName,
          assignedByUid: caller.uid,
          assignedByName: caller.name || 'رئيس قسم الحصر الميداني',
          assignedAt: now,
          supervisorNote: supervisorNote || '',
          updatedByUid: caller.uid,
          updatedAt: now,
        });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: caller.organizationId,
          department: caller.department,
          actorId: caller.uid,
          actorRole: 'department_head',
          resourceType: 'observation',
          resourceId: observationId,
          action: 'assign_contractor',
          contractorUid,
          timestamp: now,
        });
        return { ok: true, contractorName };
      });

      if (!outcome.ok) {
        return sendJson(res, outcome.statusCode, { error: 'request_failed', reason: outcome.reason });
      }
      return sendJson(res, 200, {
        observationId,
        contractorUid,
        contractorName: outcome.contractorName,
        status: 'PENDING',
      });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  if (action === 'verifyFieldObservation') {
    const caller = await requireFieldInspector(db, decoded.uid);
    if (!caller) {
      return sendJson(res, 403, { error: 'forbidden', reason: 'field_inspector_required' });
    }

    const observationId = cleanString(body.observationId);
    const decision = cleanString(body.decision);
    const note = cleanString(body.note);
    if (!observationId || !['ACCEPT', 'RETURN'].includes(decision)) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'observationId_and_valid_decision_required' });
    }
    if (decision === 'RETURN' && !note) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'return_note_required' });
    }

    try {
      const outcome = await db.runTransaction(async transaction => {
        const observationRef = db.collection('observations').doc(observationId);
        const snap = await transaction.get(observationRef);
        if (!snap.exists) return { ok: false, statusCode: 404, reason: 'observation_not_found' };
        const observation = snap.data() || {};

        if (observation.organizationId !== caller.organizationId) {
          return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
        }
        if (observation.createdByUid !== caller.uid) {
          return { ok: false, statusCode: 403, reason: 'reporting_inspector_required' };
        }
        if (observation.status !== 'PENDING_REVIEW') {
          return { ok: false, statusCode: 409, reason: 'observation_not_pending_verification' };
        }
        if (!isNonEmptyString(observation.assignedContractorUid)) {
          return { ok: false, statusCode: 409, reason: 'assigned_contractor_required' };
        }
        if (!isNonEmptyString(observation.afterImagePath) || !isNonEmptyString(observation.resolutionNote)) {
          return { ok: false, statusCode: 409, reason: 'contractor_evidence_required' };
        }

        const now = FieldValue.serverTimestamp();
        if (decision === 'RETURN') {
          transaction.update(observationRef, {
            status: 'IN_PROGRESS',
            inspectorVerification: {
              status: 'RETURNED',
              verifiedByUid: caller.uid,
              verifiedByName: caller.name,
              note,
              verifiedAt: now,
            },
            updatedByUid: caller.uid,
            updatedAt: now,
          });
          transaction.set(db.collection('auditEvents').doc(), {
            organizationId: caller.organizationId,
            department: caller.department || '',
            actorId: caller.uid,
            actorRole: 'inspector',
            resourceType: 'observation',
            resourceId: observationId,
            action: 'return_to_contractor',
            fromStatus: 'PENDING_REVIEW',
            toStatus: 'IN_PROGRESS',
            contractorUid: observation.assignedContractorUid,
            timestamp: now,
          });
          return { ok: true, status: 'IN_PROGRESS', verificationStatus: 'RETURNED' };
        }

        transaction.update(observationRef, {
          inspectorVerification: {
            status: 'VERIFIED',
            verifiedByUid: caller.uid,
            verifiedByName: caller.name,
            note: note || '',
            verifiedAt: now,
          },
          updatedByUid: caller.uid,
          updatedAt: now,
        });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: caller.organizationId,
          department: caller.department || '',
          actorId: caller.uid,
          actorRole: 'inspector',
          resourceType: 'observation',
          resourceId: observationId,
          action: 'verify_contractor_work',
          status: 'PENDING_REVIEW',
          contractorUid: observation.assignedContractorUid,
          timestamp: now,
        });
        return { ok: true, status: 'PENDING_REVIEW', verificationStatus: 'VERIFIED' };
      });

      if (!outcome.ok) {
        return sendJson(res, outcome.statusCode, { error: 'request_failed', reason: outcome.reason });
      }
      return sendJson(res, 200, {
        observationId,
        status: outcome.status,
        verificationStatus: outcome.verificationStatus,
      });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  if (action === 'closeFieldObservation') {
    const caller = await requireFieldDepartmentHead(decoded.uid);
    if (!caller) {
      return sendJson(res, 403, { error: 'forbidden', reason: 'field_department_head_required' });
    }

    const observationId = cleanString(body.observationId);
    const closureNote = cleanString(body.closureNote);
    if (!observationId) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'observationId_required' });
    }

    try {
      const outcome = await db.runTransaction(async transaction => {
        const observationRef = db.collection('observations').doc(observationId);
        const snap = await transaction.get(observationRef);
        if (!snap.exists) return { ok: false, statusCode: 404, reason: 'observation_not_found' };
        const observation = snap.data() || {};

        if (observation.organizationId !== caller.organizationId) {
          return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
        }
        if (observation.status !== 'PENDING_REVIEW') {
          return { ok: false, statusCode: 409, reason: 'observation_not_pending_closure' };
        }
        const verification = observation.inspectorVerification;
        if (!verification || verification.status !== 'VERIFIED'
            || !isNonEmptyString(verification.verifiedByUid)) {
          return { ok: false, statusCode: 409, reason: 'inspector_verification_required' };
        }

        const now = FieldValue.serverTimestamp();
        transaction.update(observationRef, {
          status: 'COMPLETED',
          closedByUid: caller.uid,
          closedByName: caller.name || 'رئيس قسم الحصر الميداني',
          closureNote: closureNote || '',
          closedAt: now,
          completedAt: now,
          updatedByUid: caller.uid,
          updatedAt: now,
        });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: caller.organizationId,
          department: caller.department,
          actorId: caller.uid,
          actorRole: 'department_head',
          resourceType: 'observation',
          resourceId: observationId,
          action: 'close_visual_distortion_case',
          fromStatus: 'PENDING_REVIEW',
          toStatus: 'COMPLETED',
          verifiedByUid: verification.verifiedByUid,
          contractorUid: observation.assignedContractorUid || null,
          timestamp: now,
        });
        return { ok: true };
      });

      if (!outcome.ok) {
        return sendJson(res, outcome.statusCode, { error: 'request_failed', reason: outcome.reason });
      }
      return sendJson(res, 200, { observationId, status: 'COMPLETED' });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  // PHASE 10 RELEASE-INTEGRITY — trusted mission creation.  This is the
  // only create path: Firestore Rules deny browser CREATE outright.  The
  // verified token identifies an active department head; tenant,
  // department, actor and role are read server-side and cannot be supplied
  // or overridden by the body.  Mission + canonical audit + idempotency
  // receipt commit in one Admin SDK transaction.
  if (action === 'createMissionRequest') {
    if (Object.keys(body).some(key => !TRUSTED_CREATE_INPUT_FIELDS.createMissionRequest.includes(key))) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'protected_or_unknown_field' });
    }
    const caller = await getCallerContext(decoded.uid);
    if (!caller.isDepartmentHead || caller.role !== 'department_head') {
      return sendJson(res, 403, { error: 'forbidden', reason: 'department_head_required' });
    }

    const clientRequestId = body.clientRequestId;
    const requestedEmployeeId = cleanString(body.requestedEmployeeId);
    const missionInput = {
      type: cleanString(body.type),
      destination: cleanString(body.destination),
      reason: cleanString(body.reason),
      scope: cleanString(body.scope, 'داخل النطاق') || 'داخل النطاق',
      requestedEmployeeName: cleanString(body.requestedEmployeeName),
      whenLabel: cleanString(body.whenLabel),
      durationLabel: cleanString(body.durationLabel),
    };
    if (!validClientRequestId(clientRequestId) || !missionInput.type || !missionInput.destination || !missionInput.reason) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'clientRequestId_type_destination_reason_required' });
    }

    const hash = payloadHash(action, [
      missionInput.type, missionInput.destination, missionInput.reason, missionInput.scope,
      requestedEmployeeId, missionInput.requestedEmployeeName, missionInput.whenLabel, missionInput.durationLabel,
    ]);
    const requestRef = trustedCreateRequestRef(db, action, caller.uid, clientRequestId);
    const missionRef = db.collection('missions').doc();
    const auditRef = db.collection('auditEvents').doc();

    try {
      const outcome = await db.runTransaction(async (transaction) => {
        const employeeRef = requestedEmployeeId ? db.collection('employees').doc(requestedEmployeeId) : null;
        const reads = [transaction.get(requestRef)];
        if (employeeRef) reads.push(transaction.get(employeeRef));
        const snapshots = await Promise.all(reads);
        const priorSnap = snapshots[0];

        if (priorSnap.exists) {
          const prior = priorSnap.data() || {};
          if (prior.payloadHash !== hash) return { ok: false, statusCode: 409, reason: 'idempotency_payload_mismatch' };
          return { ok: true, missionId: prior.resourceId, idempotent: true };
        }

        let requestedEmployee = null;
        if (employeeRef) {
          const employeeSnap = snapshots[1];
          if (!employeeSnap.exists) return { ok: false, statusCode: 404, reason: 'employee_not_found' };
          const employee = employeeSnap.data() || {};
          const mobility = employee.products && employee.products.mobility;
          if (employee.organizationId !== caller.organizationId) {
            return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
          }
          if (cleanString(employee.department) !== cleanString(caller.department)) {
            return { ok: false, statusCode: 403, reason: 'cross_department_denied' };
          }
          if (employee.employmentStatus === 'inactive') {
            return { ok: false, statusCode: 409, reason: 'employee_inactive' };
          }
          if (employee.accountStatus !== 'ACTIVE' || !isNonEmptyString(employee.authUid)) {
            return { ok: false, statusCode: 409, reason: 'employee_account_not_active' };
          }
          if (!mobility || mobility.enabled !== true || mobility.role !== 'employee') {
            return { ok: false, statusCode: 409, reason: 'employee_mobility_role_required' };
          }
          if (mobility.vehicleEligible !== true) {
            return { ok: false, statusCode: 409, reason: 'employee_vehicle_not_eligible' };
          }
          requestedEmployee = {
            employeeId: employeeSnap.id,
            uid: employee.authUid,
            name: cleanString(employee.name, employeeSnap.id),
          };
        }

        const now = FieldValue.serverTimestamp();
        const mission = {
          clientRequestId,
          organizationId: caller.organizationId,
          department: caller.department,
          createdByUid: caller.uid,
          requesterName: caller.name || '',
          status: 'DRAFT',
          ...missionInput,
          ...(requestedEmployee ? {
            requestedEmployeeId: requestedEmployee.employeeId,
            requestedEmployeeUid: requestedEmployee.uid,
            requestedEmployeeName: requestedEmployee.name,
          } : {}),
          createdAt: now,
          updatedAt: now,
          updatedByUid: caller.uid,
        };

        transaction.set(missionRef, mission);
        transaction.set(auditRef, {
          organizationId: caller.organizationId,
          department: caller.department,
          actorId: caller.uid,
          actorRole: 'department_head',
          resourceType: 'mission',
          resourceId: missionRef.id,
          action: 'create',
          toStatus: 'DRAFT',
          clientRequestId,
          ...(requestedEmployee ? { requestedEmployeeUid: requestedEmployee.uid } : {}),
          timestamp: now,
        });
        transaction.set(requestRef, {
          action,
          callerUid: caller.uid,
          organizationId: caller.organizationId,
          clientRequestId,
          payloadHash: hash,
          resourceType: 'mission',
          resourceId: missionRef.id,
          createdAt: now,
        });
        return { ok: true, missionId: missionRef.id, idempotent: false };
      });

      if (!outcome.ok) return sendJson(res, outcome.statusCode, { error: 'request_failed', reason: outcome.reason });
      return sendJson(res, 200, { missionId: outcome.missionId, status: 'DRAFT', idempotent: outcome.idempotent });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  // PHASE15 — Municipality-wide Smart Mobility shared workflow.
  // Any active municipal department head with the independent Mobility
  // department_head entitlement may use this workflow for THEIR OWN
  // department. No Field/Lands product entitlement is required. Identity,
  // organization and department always come from the verified live account.
  if (action === 'listDepartmentMissions') {
    const caller = await getCallerContext(decoded.uid);
    if (!caller.isDepartmentHead || caller.role !== 'department_head'
        || !caller.organizationId || !cleanString(caller.department)) {
      return sendJson(res, 403, { error: 'forbidden', reason: 'department_head_required' });
    }
    try {
      const snap = await db.collection('missions').where('organizationId', '==', caller.organizationId).get();
      const missions = [];
      for (const doc of snap.docs) {
        const data = doc.data() || {};
        if (cleanString(data.department) !== cleanString(caller.department)) continue;
        missions.push(safeMission(doc.id, data));
      }
      missions.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return sendJson(res, 200, { missions: missions.slice(0, 100) });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  if (action === 'submitMissionForApproval') {
    const caller = await getCallerContext(decoded.uid);
    if (!caller.isDepartmentHead || caller.role !== 'department_head'
        || !caller.organizationId || !cleanString(caller.department)) {
      return sendJson(res, 403, { error: 'forbidden', reason: 'department_head_required' });
    }
    const missionId = cleanString(body.missionId);
    if (!missionId) return sendJson(res, 400, { error: 'invalid_request', reason: 'missionId_required' });

    try {
      const outcome = await db.runTransaction(async transaction => {
        const missionRef = db.collection('missions').doc(missionId);
        const snap = await transaction.get(missionRef);
        if (!snap.exists) return { ok: false, statusCode: 404, reason: 'mission_not_found' };
        const mission = snap.data() || {};
        if (mission.organizationId !== caller.organizationId) {
          return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
        }
        if (cleanString(mission.department) !== cleanString(caller.department)) {
          return { ok: false, statusCode: 403, reason: 'cross_department_denied' };
        }
        if (!isNonEmptyString(mission.requestedEmployeeUid)) {
          return { ok: false, statusCode: 409, reason: 'approved_employee_required' };
        }
        if (mission.status === 'PENDING_APPROVAL' && mission.createdByUid === caller.uid) {
          return { ok: true, idempotent: true };
        }

        const actor = { uid: caller.uid, role: 'department_head', organizationId: caller.organizationId };
        const decision = evaluateMissionTransition({ actor, mission, toStatus: 'PENDING_APPROVAL' });
        if (!decision.allowed) return { ok: false, statusCode: 409, reason: decision.code };

        const now = FieldValue.serverTimestamp();
        transaction.update(missionRef, {
          status: 'PENDING_APPROVAL',
          updatedAt: now,
          updatedByUid: caller.uid,
        });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: caller.organizationId,
          department: caller.department,
          actorId: caller.uid,
          actorRole: 'department_head',
          resourceType: 'mission',
          resourceId: missionId,
          action: 'submit_for_approval',
          fromStatus: mission.status,
          toStatus: 'PENDING_APPROVAL',
          requestedEmployeeUid: mission.requestedEmployeeUid,
          timestamp: now,
        });
        return { ok: true };
      });
      if (!outcome.ok) return sendJson(res, outcome.statusCode, { error: 'request_failed', reason: outcome.reason });
      return sendJson(res, 200, { missionId, status: 'PENDING_APPROVAL', idempotent: outcome.idempotent === true });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  if (action === 'decideMobilityMission') {
    const actor = await getMobilityOperationalCaller(db, decoded.uid, ['administrative_affairs']);
    if (!actor) return sendJson(res, 403, { error: 'forbidden', reason: 'administrative_affairs_required' });

    const missionId = cleanString(body.missionId);
    const toStatus = cleanString(body.toStatus);
    if (!missionId || !['APPROVED', 'REJECTED', 'DRAFT'].includes(toStatus)) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'missionId_and_valid_decision_required' });
    }

    try {
      const outcome = await db.runTransaction(async transaction => {
        const missionRef = db.collection('missions').doc(missionId);
        const snap = await transaction.get(missionRef);
        if (!snap.exists) return { ok: false, statusCode: 404, reason: 'mission_not_found' };
        const mission = snap.data() || {};
        if (mission.organizationId !== actor.organizationId) {
          return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
        }

        const decision = evaluateMissionTransition({ actor, mission, toStatus });
        if (!decision.allowed) return { ok: false, statusCode: 409, reason: decision.code };

        const now = FieldValue.serverTimestamp();
        transaction.update(missionRef, { status: toStatus, updatedAt: now, updatedByUid: actor.uid });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: actor.organizationId,
          department: mission.department || '',
          actorId: actor.uid,
          actorRole: actor.role,
          resourceType: 'mission',
          resourceId: missionId,
          action: 'administrative_decision',
          fromStatus: mission.status,
          toStatus,
          timestamp: now,
        });
        return { ok: true };
      });
      if (!outcome.ok) return sendJson(res, outcome.statusCode, { error: 'request_failed', reason: outcome.reason });
      return sendJson(res, 200, { missionId, status: toStatus });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  if (action === 'decideVehicleAuthorization') {
    const actor = await getMobilityOperationalCaller(db, decoded.uid, ['administrative_affairs']);
    if (!actor) return sendJson(res, 403, { error: 'forbidden', reason: 'administrative_affairs_required' });

    const missionId = cleanString(body.missionId);
    const toStatus = cleanString(body.toStatus);
    if (!missionId || !['AUTHORIZED', 'REJECTED', 'REVOKED'].includes(toStatus)) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'missionId_and_valid_authorization_decision_required' });
    }

    try {
      const outcome = await db.runTransaction(async transaction => {
        const missionRef = db.collection('missions').doc(missionId);
        const authRef = db.collection('vehicleAuthorizations').doc(missionId);
        const [missionSnap, authSnap] = await Promise.all([
          transaction.get(missionRef), transaction.get(authRef),
        ]);
        if (!missionSnap.exists) return { ok: false, statusCode: 404, reason: 'mission_not_found' };
        if (!authSnap.exists) return { ok: false, statusCode: 404, reason: 'vehicle_authorization_not_found' };

        const mission = missionSnap.data() || {};
        const authorization = authSnap.data() || {};
        if (mission.organizationId !== actor.organizationId || authorization.organizationId !== actor.organizationId) {
          return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
        }
        if (authorization.missionId !== missionId || authorization.vehicleId !== mission.vehicleId
            || authorization.employeeUid !== mission.assignedEmployeeUid) {
          return { ok: false, statusCode: 409, reason: 'vehicle_authorization_relationship_invalid' };
        }

        const decision = evaluateVehicleAuthorizationTransition({ actor, authorization, toStatus });
        if (!decision.allowed) return { ok: false, statusCode: 409, reason: decision.code };

        const now = FieldValue.serverTimestamp();
        if (toStatus === 'AUTHORIZED') {
          transaction.update(authRef, {
            status: 'AUTHORIZED',
            authorizedByUid: actor.uid,
            authorizedByName: actor.name || '',
            authorizedAt: now,
            updatedAt: now,
          });
          transaction.update(missionRef, {
            vehicleAuthorizationStatus: 'AUTHORIZED',
            updatedAt: now,
            updatedByUid: actor.uid,
          });
        } else {
          // Reject/revoke before handover releases the reservation as one
          // system side-effect. Administrative Affairs never selects another
          // vehicle; the mission simply returns to the approved queue for
          // Mobility to allocate again.
          if (mission.status !== 'VEHICLE_ALLOCATED' || !isNonEmptyString(mission.vehicleId)) {
            return { ok: false, statusCode: 409, reason: 'vehicle_authorization_not_releasable' };
          }
          const vehicleRef = db.collection('vehicles').doc(mission.vehicleId);
          const vehicleSnap = await transaction.get(vehicleRef);
          if (!vehicleSnap.exists) return { ok: false, statusCode: 404, reason: 'vehicle_not_found' };
          const vehicle = vehicleSnap.data() || {};
          if (vehicle.organizationId !== actor.organizationId
              || vehicle.currentMissionId !== missionId
              || vehicle.assignedEmployeeUid !== mission.assignedEmployeeUid
              || vehicle.status !== 'RESERVED') {
            return { ok: false, statusCode: 409, reason: 'mission_vehicle_relationship_invalid' };
          }

          transaction.update(authRef, {
            status: toStatus,
            decidedByUid: actor.uid,
            decidedByName: actor.name || '',
            decidedAt: now,
            updatedAt: now,
          });
          transaction.update(missionRef, {
            status: 'APPROVED',
            vehicleId: FieldValue.delete(),
            assignedEmployeeUid: FieldValue.delete(),
            assignedEmployeeName: FieldValue.delete(),
            vehicleAuthorizationId: missionId,
            vehicleAuthorizationStatus: toStatus,
            updatedAt: now,
            updatedByUid: actor.uid,
          });
          transaction.update(vehicleRef, {
            status: 'AVAILABLE',
            assignedEmployeeUid: FieldValue.delete(),
            currentMissionId: FieldValue.delete(),
            updatedAt: now,
            updatedByUid: actor.uid,
          });
          transaction.set(db.collection('auditEvents').doc(), {
            organizationId: actor.organizationId,
            department: mission.department || '',
            actorId: actor.uid,
            actorRole: actor.role,
            resourceType: 'vehicle',
            resourceId: mission.vehicleId,
            action: 'authorization_release',
            fromStatus: 'RESERVED',
            toStatus: 'AVAILABLE',
            missionId,
            timestamp: now,
          });
        }

        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: actor.organizationId,
          department: mission.department || '',
          actorId: actor.uid,
          actorRole: actor.role,
          resourceType: 'vehicleAuthorization',
          resourceId: missionId,
          action: toStatus === 'AUTHORIZED' ? 'authorize_vehicle_use' : (toStatus === 'REVOKED' ? 'revoke_vehicle_authorization' : 'reject_vehicle_authorization'),
          fromStatus: authorization.status,
          toStatus,
          missionId,
          vehicleId: authorization.vehicleId,
          assignedEmployeeUid: authorization.employeeUid,
          timestamp: now,
        });

        return { ok: true, vehicleId: authorization.vehicleId, status: toStatus };
      });
      if (!outcome.ok) return sendJson(res, outcome.statusCode, { error: 'request_failed', reason: outcome.reason });
      return sendJson(res, 200, { missionId, vehicleId: outcome.vehicleId, authorizationStatus: outcome.status });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  if (action === 'listMobilityMissions') {
    const actor = await getMobilityOperationalCaller(db, decoded.uid, ['administrative_affairs', 'mobility_head', 'employee']);
    if (!actor) return sendJson(res, 403, { error: 'forbidden', reason: 'mobility_role_required' });
    try {
      const snap = await db.collection('missions').where('organizationId', '==', actor.organizationId).get();
      const missions = [];
      for (const doc of snap.docs) {
        const data = doc.data() || {};
        if (actor.role === 'employee' && data.assignedEmployeeUid !== actor.uid) continue;
        missions.push(safeMission(doc.id, data));
      }
      missions.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return sendJson(res, 200, { role: actor.role, missions: missions.slice(0, 150) });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  if (action === 'listAvailableVehicles') {
    const actor = await getMobilityOperationalCaller(db, decoded.uid, ['mobility_head']);
    if (!actor) return sendJson(res, 403, { error: 'forbidden', reason: 'mobility_head_required' });
    try {
      const snap = await db.collection('vehicles').where('organizationId', '==', actor.organizationId).get();
      const vehicles = [];
      for (const doc of snap.docs) {
        const data = doc.data() || {};
        if (data.status !== 'AVAILABLE') continue;
        vehicles.push({
          vehicleId: doc.id,
          plate: data.plate || null,
          type: data.type || null,
          make: data.make || null,
          model: data.model || null,
          status: data.status,
        });
      }
      return sendJson(res, 200, { vehicles });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  if (action === 'handoverVehicle') {
    const actor = await getMobilityOperationalCaller(db, decoded.uid, ['mobility_head']);
    if (!actor) return sendJson(res, 403, { error: 'forbidden', reason: 'mobility_head_required' });
    const missionId = cleanString(body.missionId);
    if (!missionId) return sendJson(res, 400, { error: 'invalid_request', reason: 'missionId_required' });

    try {
      const outcome = await db.runTransaction(async transaction => {
        const missionRef = db.collection('missions').doc(missionId);
        const missionSnap = await transaction.get(missionRef);
        if (!missionSnap.exists) return { ok: false, statusCode: 404, reason: 'mission_not_found' };
        const mission = missionSnap.data() || {};
        if (mission.organizationId !== actor.organizationId) return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
        if (!isNonEmptyString(mission.vehicleId)) return { ok: false, statusCode: 409, reason: 'mission_vehicle_required' };

        const vehicleRef = db.collection('vehicles').doc(mission.vehicleId);
        const authorizationRef = db.collection('vehicleAuthorizations').doc(missionId);
        const [vehicleSnap, authorizationSnap] = await Promise.all([
          transaction.get(vehicleRef), transaction.get(authorizationRef),
        ]);
        if (!vehicleSnap.exists) return { ok: false, statusCode: 404, reason: 'vehicle_not_found' };
        if (!authorizationSnap.exists) return { ok: false, statusCode: 409, reason: 'vehicle_authorization_required' };
        const vehicle = vehicleSnap.data() || {};
        const authorization = authorizationSnap.data() || {};
        if (vehicle.organizationId !== actor.organizationId) return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
        if (vehicle.currentMissionId !== missionId
            || vehicle.assignedEmployeeUid !== mission.assignedEmployeeUid) {
          return { ok: false, statusCode: 409, reason: 'mission_vehicle_relationship_invalid' };
        }

        if (authorization.missionId !== missionId || authorization.vehicleId !== mission.vehicleId
            || authorization.employeeUid !== mission.assignedEmployeeUid) {
          return { ok: false, statusCode: 409, reason: 'vehicle_authorization_relationship_invalid' };
        }
        const missionDecision = evaluateMissionTransition({ actor, mission, toStatus: 'HANDED_OVER' });
        const vehicleDecision = evaluateVehicleTransition({ actor, vehicle, toStatus: 'IN_MISSION' });
        const authorizationDecision = evaluateVehicleAuthorizationTransition({ actor, authorization, toStatus: 'ACTIVE' });
        if (!missionDecision.allowed) return { ok: false, statusCode: 409, reason: missionDecision.code };
        if (!vehicleDecision.allowed) return { ok: false, statusCode: 409, reason: vehicleDecision.code };
        if (!authorizationDecision.allowed) return { ok: false, statusCode: 409, reason: authorizationDecision.code };

        const now = FieldValue.serverTimestamp();
        transaction.update(missionRef, {
          status: 'HANDED_OVER',
          vehicleAuthorizationStatus: 'ACTIVE',
          updatedAt: now,
          updatedByUid: actor.uid,
        });
        transaction.update(vehicleRef, { status: 'IN_MISSION', updatedAt: now, updatedByUid: actor.uid });
        transaction.update(authorizationRef, {
          status: 'ACTIVE',
          activatedByUid: actor.uid,
          activatedAt: now,
          updatedAt: now,
        });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: actor.organizationId, actorId: actor.uid, actorRole: actor.role,
          resourceType: 'mission', resourceId: missionId, action: 'handover',
          fromStatus: mission.status, toStatus: 'HANDED_OVER', vehicleId: mission.vehicleId, timestamp: now,
        });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: actor.organizationId, department: mission.department || '',
          actorId: actor.uid, actorRole: actor.role,
          resourceType: 'vehicle', resourceId: mission.vehicleId, action: 'handover',
          fromStatus: vehicle.status, toStatus: 'IN_MISSION', missionId, timestamp: now,
        });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: actor.organizationId, department: mission.department || '',
          actorId: actor.uid, actorRole: actor.role,
          resourceType: 'vehicleAuthorization', resourceId: missionId, action: 'activate_vehicle_authorization',
          fromStatus: authorization.status, toStatus: 'ACTIVE', missionId, vehicleId: mission.vehicleId, timestamp: now,
        });
        return { ok: true, vehicleId: mission.vehicleId };
      });
      if (!outcome.ok) return sendJson(res, outcome.statusCode, { error: 'request_failed', reason: outcome.reason });
      return sendJson(res, 200, { missionId, vehicleId: outcome.vehicleId, status: 'HANDED_OVER' });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  if (action === 'employeeAdvanceMission') {
    const actor = await getMobilityEmployeeCallerContext(decoded.uid);
    if (!actor.isEmployee || actor.role !== 'employee') {
      return sendJson(res, 403, { error: 'forbidden', reason: 'active_employee_required' });
    }
    const missionId = cleanString(body.missionId);
    const toStatus = cleanString(body.toStatus);
    if (!missionId || !['READY', 'IN_PROGRESS', 'INCIDENT_HOLD', 'COMPLETED'].includes(toStatus)) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'invalid_employee_transition' });
    }

    try {
      const outcome = await db.runTransaction(async transaction => {
        const missionRef = db.collection('missions').doc(missionId);
        const snap = await transaction.get(missionRef);
        if (!snap.exists) return { ok: false, statusCode: 404, reason: 'mission_not_found' };
        const mission = snap.data() || {};
        const decision = evaluateMissionTransition({ actor, mission, toStatus });
        if (!decision.allowed) return { ok: false, statusCode: 409, reason: decision.code };

        const now = FieldValue.serverTimestamp();
        transaction.update(missionRef, { status: toStatus, updatedAt: now, updatedByUid: actor.uid });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: actor.organizationId, department: actor.department || mission.department || '',
          actorId: actor.uid, actorRole: actor.role, resourceType: 'mission', resourceId: missionId,
          action: 'employee_advance', fromStatus: mission.status, toStatus, timestamp: now,
        });
        return { ok: true };
      });
      if (!outcome.ok) return sendJson(res, outcome.statusCode, { error: 'request_failed', reason: outcome.reason });
      return sendJson(res, 200, { missionId, status: toStatus });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  if (action === 'employeeReturnVehicle') {
    const actor = await getMobilityEmployeeCallerContext(decoded.uid);
    if (!actor.isEmployee || actor.role !== 'employee') {
      return sendJson(res, 403, { error: 'forbidden', reason: 'active_employee_required' });
    }
    const missionId = cleanString(body.missionId);
    if (!missionId) return sendJson(res, 400, { error: 'invalid_request', reason: 'missionId_required' });

    try {
      const outcome = await db.runTransaction(async transaction => {
        const missionRef = db.collection('missions').doc(missionId);
        const missionSnap = await transaction.get(missionRef);
        if (!missionSnap.exists) return { ok: false, statusCode: 404, reason: 'mission_not_found' };
        const mission = missionSnap.data() || {};
        if (mission.organizationId !== actor.organizationId) return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
        if (!isNonEmptyString(mission.vehicleId)) return { ok: false, statusCode: 409, reason: 'mission_vehicle_required' };

        const vehicleRef = db.collection('vehicles').doc(mission.vehicleId);
        const vehicleSnap = await transaction.get(vehicleRef);
        if (!vehicleSnap.exists) return { ok: false, statusCode: 404, reason: 'vehicle_not_found' };
        const vehicle = vehicleSnap.data() || {};
        if (vehicle.organizationId !== actor.organizationId
            || vehicle.currentMissionId !== missionId
            || vehicle.assignedEmployeeUid !== actor.uid
            || mission.assignedEmployeeUid !== actor.uid) {
          return { ok: false, statusCode: 409, reason: 'mission_vehicle_relationship_invalid' };
        }

        const missionDecision = evaluateMissionTransition({ actor, mission, toStatus: 'AWAITING_RETURN' });
        const vehicleDecision = evaluateVehicleTransition({ actor, vehicle, toStatus: 'RETURN_PENDING' });
        if (!missionDecision.allowed) return { ok: false, statusCode: 409, reason: missionDecision.code };
        if (!vehicleDecision.allowed) return { ok: false, statusCode: 409, reason: vehicleDecision.code };

        const now = FieldValue.serverTimestamp();
        transaction.update(missionRef, { status: 'AWAITING_RETURN', updatedAt: now, updatedByUid: actor.uid });
        transaction.update(vehicleRef, { status: 'RETURN_PENDING', updatedAt: now, updatedByUid: actor.uid });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: actor.organizationId, actorId: actor.uid, actorRole: actor.role,
          resourceType: 'mission', resourceId: missionId, action: 'employee_return_vehicle',
          fromStatus: mission.status, toStatus: 'AWAITING_RETURN', vehicleId: mission.vehicleId, timestamp: now,
        });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: actor.organizationId, actorId: actor.uid, actorRole: actor.role,
          resourceType: 'vehicle', resourceId: mission.vehicleId, action: 'employee_return_vehicle',
          fromStatus: vehicle.status, toStatus: 'RETURN_PENDING', missionId, timestamp: now,
        });
        return { ok: true, vehicleId: mission.vehicleId };
      });
      if (!outcome.ok) return sendJson(res, outcome.statusCode, { error: 'request_failed', reason: outcome.reason });
      return sendJson(res, 200, { missionId, vehicleId: outcome.vehicleId, status: 'AWAITING_RETURN' });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  if (action === 'confirmVehicleReturn') {
    const actor = await getMobilityOperationalCaller(db, decoded.uid, ['mobility_head']);
    if (!actor) return sendJson(res, 403, { error: 'forbidden', reason: 'mobility_head_required' });
    const missionId = cleanString(body.missionId);
    if (!missionId) return sendJson(res, 400, { error: 'invalid_request', reason: 'missionId_required' });

    try {
      const outcome = await db.runTransaction(async transaction => {
        const missionRef = db.collection('missions').doc(missionId);
        const missionSnap = await transaction.get(missionRef);
        if (!missionSnap.exists) return { ok: false, statusCode: 404, reason: 'mission_not_found' };
        const mission = missionSnap.data() || {};
        if (mission.organizationId !== actor.organizationId) return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
        if (!isNonEmptyString(mission.vehicleId)) return { ok: false, statusCode: 409, reason: 'mission_vehicle_required' };

        const vehicleRef = db.collection('vehicles').doc(mission.vehicleId);
        const authorizationRef = db.collection('vehicleAuthorizations').doc(missionId);
        const [vehicleSnap, authorizationSnap] = await Promise.all([
          transaction.get(vehicleRef), transaction.get(authorizationRef),
        ]);
        if (!vehicleSnap.exists) return { ok: false, statusCode: 404, reason: 'vehicle_not_found' };
        if (!authorizationSnap.exists) return { ok: false, statusCode: 409, reason: 'vehicle_authorization_required' };
        const vehicle = vehicleSnap.data() || {};
        const authorization = authorizationSnap.data() || {};
        if (vehicle.organizationId !== actor.organizationId
            || vehicle.currentMissionId !== missionId
            || vehicle.assignedEmployeeUid !== mission.assignedEmployeeUid) {
          return { ok: false, statusCode: 409, reason: 'mission_vehicle_relationship_invalid' };
        }
        if (authorization.missionId !== missionId || authorization.vehicleId !== mission.vehicleId
            || authorization.employeeUid !== mission.assignedEmployeeUid) {
          return { ok: false, statusCode: 409, reason: 'vehicle_authorization_relationship_invalid' };
        }

        const missionDecision = evaluateMissionTransition({ actor, mission, toStatus: 'CLOSED' });
        const vehicleDecision = evaluateVehicleTransition({ actor, vehicle, toStatus: 'AVAILABLE' });
        const authorizationDecision = evaluateVehicleAuthorizationTransition({ actor, authorization, toStatus: 'EXPIRED' });
        if (!missionDecision.allowed) return { ok: false, statusCode: 409, reason: missionDecision.code };
        if (!vehicleDecision.allowed) return { ok: false, statusCode: 409, reason: vehicleDecision.code };
        if (!authorizationDecision.allowed) return { ok: false, statusCode: 409, reason: authorizationDecision.code };

        const now = FieldValue.serverTimestamp();
        transaction.update(missionRef, {
          status: 'CLOSED',
          vehicleAuthorizationStatus: 'EXPIRED',
          updatedAt: now,
          updatedByUid: actor.uid,
        });
        transaction.update(vehicleRef, {
          status: 'AVAILABLE',
          assignedEmployeeUid: FieldValue.delete(),
          currentMissionId: FieldValue.delete(),
          updatedAt: now,
          updatedByUid: actor.uid,
        });
        transaction.update(authorizationRef, {
          status: 'EXPIRED',
          expiredByUid: actor.uid,
          expiredAt: now,
          updatedAt: now,
        });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: actor.organizationId, department: mission.department || '',
          actorId: actor.uid, actorRole: actor.role,
          resourceType: 'mission', resourceId: missionId, action: 'confirm_return',
          fromStatus: mission.status, toStatus: 'CLOSED', vehicleId: mission.vehicleId, timestamp: now,
        });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: actor.organizationId, department: mission.department || '',
          actorId: actor.uid, actorRole: actor.role,
          resourceType: 'vehicle', resourceId: mission.vehicleId, action: 'confirm_return',
          fromStatus: vehicle.status, toStatus: 'AVAILABLE', missionId, timestamp: now,
        });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: actor.organizationId, department: mission.department || '',
          actorId: actor.uid, actorRole: actor.role,
          resourceType: 'vehicleAuthorization', resourceId: missionId, action: 'expire_vehicle_authorization',
          fromStatus: authorization.status, toStatus: 'EXPIRED', missionId, vehicleId: mission.vehicleId, timestamp: now,
        });
        return { ok: true, vehicleId: mission.vehicleId };
      });
      if (!outcome.ok) return sendJson(res, outcome.statusCode, { error: 'request_failed', reason: outcome.reason });
      return sendJson(res, 200, { missionId, vehicleId: outcome.vehicleId, status: 'CLOSED' });
    } catch (_) {
      return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
    }
  }

  // PHASE 10 RELEASE-INTEGRITY — trusted incident creation.  The employee
  // identity and Mobility context come only from the verified token + live
  // user record.  The referenced mission (and optional vehicle) is read and
  // validated in the same transaction that creates the NEW incident, its
  // canonical audit event, and the idempotency receipt.
  if (action === 'createIncident') {
    if (Object.keys(body).some(key => !TRUSTED_CREATE_INPUT_FIELDS.createIncident.includes(key))) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'protected_or_unknown_field' });
    }
    const caller = await getMobilityEmployeeCallerContext(decoded.uid);
    if (!caller.isEmployee || caller.role !== 'employee') {
      return sendJson(res, 403, { error: 'forbidden', reason: 'active_employee_required' });
    }
    const clientRequestId = body.clientRequestId;
    const incident = {
      missionId: cleanString(body.missionId),
      vehicleId: cleanString(body.vehicleId),
      category: cleanString(body.category, 'أخرى') || 'أخرى',
      severity: cleanString(body.severity, 'MEDIUM') || 'MEDIUM',
      note: cleanString(body.note),
    };
    if (!validClientRequestId(clientRequestId) || !incident.missionId || !['LOW', 'MEDIUM', 'CRITICAL'].includes(incident.severity)) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'valid_clientRequestId_missionId_severity_required' });
    }
    const hash = payloadHash(action, [incident.missionId, incident.vehicleId, incident.category, incident.severity, incident.note]);
    const requestRef = trustedCreateRequestRef(db, action, caller.uid, clientRequestId);
    const incidentRef = db.collection('incidents').doc();
    const auditRef = db.collection('auditEvents').doc();
    try {
      const outcome = await db.runTransaction(async (transaction) => {
        const missionRef = db.collection('missions').doc(incident.missionId);
        const reads = [transaction.get(requestRef), transaction.get(missionRef)];
        const vehicleRef = incident.vehicleId ? db.collection('vehicles').doc(incident.vehicleId) : null;
        if (vehicleRef) reads.push(transaction.get(vehicleRef));
        const snapshots = await Promise.all(reads);
        const priorSnap = snapshots[0];
        if (priorSnap.exists) {
          const prior = priorSnap.data() || {};
          if (prior.payloadHash !== hash) return { ok: false, statusCode: 409, reason: 'idempotency_payload_mismatch' };
          return { ok: true, incidentId: prior.resourceId, idempotent: true };
        }
        const missionSnap = snapshots[1];
        if (!missionSnap.exists) return { ok: false, statusCode: 404, reason: 'mission_not_found' };
        const missionData = missionSnap.data() || {};
        if (missionData.organizationId !== caller.organizationId) return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
        if (missionData.assignedEmployeeUid !== caller.uid) return { ok: false, statusCode: 403, reason: 'employee_not_assigned' };
        if (missionData.status !== 'IN_PROGRESS') return { ok: false, statusCode: 409, reason: 'mission_not_in_progress' };
        if (vehicleRef) {
          const vehicleSnap = snapshots[2];
          if (!vehicleSnap.exists) return { ok: false, statusCode: 404, reason: 'vehicle_not_found' };
          const vehicleData = vehicleSnap.data() || {};
          const validRelationship = missionData.vehicleId === incident.vehicleId
            && vehicleData.organizationId === caller.organizationId
            && vehicleData.assignedEmployeeUid === caller.uid
            && vehicleData.currentMissionId === incident.missionId
            && vehicleData.status === 'IN_MISSION';
          if (!validRelationship) return { ok: false, statusCode: 409, reason: 'vehicle_relationship_invalid' };
        }
        const now = FieldValue.serverTimestamp();
        transaction.set(incidentRef, {
          clientRequestId,
          organizationId: caller.organizationId,
          missionId: incident.missionId,
          vehicleId: incident.vehicleId,
          createdByUid: caller.uid,
          employeeName: caller.name || '',
          department: caller.department || missionData.department || '',
          category: incident.category,
          severity: incident.severity,
          note: incident.note,
          status: 'NEW',
          createdAt: now,
          updatedAt: now,
          updatedByUid: caller.uid,
        });
        transaction.set(auditRef, {
          organizationId: caller.organizationId,
          department: caller.department || missionData.department || '',
          actorId: caller.uid,
          actorRole: 'employee',
          resourceType: 'incident',
          resourceId: incidentRef.id,
          action: 'create',
          toStatus: 'NEW',
          missionId: incident.missionId,
          clientRequestId,
          timestamp: now,
        });
        transaction.set(requestRef, {
          action,
          callerUid: caller.uid,
          organizationId: caller.organizationId,
          clientRequestId,
          payloadHash: hash,
          resourceType: 'incident',
          resourceId: incidentRef.id,
          createdAt: now,
        });
        return { ok: true, incidentId: incidentRef.id, idempotent: false };
      });
      if (!outcome.ok) return sendJson(res, outcome.statusCode, { error: 'request_failed', reason: outcome.reason });
      return sendJson(res, 200, { incidentId: outcome.incidentId, status: 'NEW', idempotent: outcome.idempotent });
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
        if (isNonEmptyString(mission.requestedEmployeeUid) && mission.requestedEmployeeUid !== employeeUid) {
          return { ok: false, statusCode: 409, reason: 'approved_employee_mismatch' };
        }

        const actor = { uid: decoded.uid, role: 'mobility_head', organizationId };
        const missionDecision = evaluateMissionTransition({
          actor,
          mission,
          toStatus: 'VEHICLE_ALLOCATED',
          requestedFields: { vehicleId, assignedEmployeeUid: employeeUid },
        });
        if (!missionDecision.allowed) {
          return { ok: false, statusCode: 409, reason: missionDecision.code };
        }
        const vehicleDecision = evaluateVehicleTransition({
          actor,
          vehicle,
          toStatus: 'RESERVED',
          requestedFields: { assignedEmployeeUid: employeeUid, currentMissionId: missionId },
          assignedEmployee: {
            organizationId: employee.organizationId,
            active: employee.active,
            role: resolveMobilityRole(employee),
            vehicleEligible: employee.vehicleEligible,
          },
        });
        if (!vehicleDecision.allowed) {
          return { ok: false, statusCode: 409, reason: vehicleDecision.code };
        }

        const now = FieldValue.serverTimestamp();
        const employeeName = isNonEmptyString(employee.name) ? employee.name.trim() : '';
        const authorizationRef = db.collection('vehicleAuthorizations').doc(missionId);
        const authorizationNumber = 'VA-' + String(missionId).slice(-8).toUpperCase();
        transaction.update(missionRef, {
          status: 'VEHICLE_ALLOCATED',
          vehicleId,
          assignedEmployeeUid: employeeUid,
          assignedEmployeeName: employeeName,
          vehicleAuthorizationId: missionId,
          vehicleAuthorizationNumber: authorizationNumber,
          vehicleAuthorizationStatus: 'PENDING_AUTHORIZATION',
          updatedAt: now,
          updatedByUid: decoded.uid,
        });
        transaction.set(authorizationRef, {
          authorizationId: missionId,
          authorizationNumber,
          organizationId,
          department: mission.department || '',
          missionId,
          vehicleId,
          employeeUid,
          employeeName,
          status: 'PENDING_AUTHORIZATION',
          requestedByUid: decoded.uid,
          requestedByRole: 'mobility_head',
          requestedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        transaction.update(vehicleRef, {
          status: 'RESERVED',
          assignedEmployeeUid: employeeUid,
          currentMissionId: missionId,
          updatedAt: now,
          updatedByUid: decoded.uid,
        });
        // Mission and vehicle audit records are committed atomically with
        // the allocation so the cross-product workflow has one truthful trail.
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId,
          actorId: decoded.uid,
          actorRole: 'mobility_head',
          resourceType: 'mission',
          resourceId: missionId,
          action: 'allocate_vehicle',
          fromStatus: mission.status,
          toStatus: 'VEHICLE_ALLOCATED',
          vehicleId,
          assignedEmployeeUid: employeeUid,
          timestamp: now,
        });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId,
          department: mission.department || '',
          actorId: decoded.uid,
          actorRole: 'mobility_head',
          resourceType: 'vehicle',
          resourceId: vehicleId,
          action: 'reserve',
          fromStatus: vehicle.status,
          toStatus: 'RESERVED',
          missionId,
          assignedEmployeeUid: employeeUid,
          timestamp: now,
        });
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId,
          department: mission.department || '',
          actorId: decoded.uid,
          actorRole: 'mobility_head',
          resourceType: 'vehicleAuthorization',
          resourceId: missionId,
          action: 'create_vehicle_authorization_request',
          toStatus: 'PENDING_AUTHORIZATION',
          missionId,
          vehicleId,
          assignedEmployeeUid: employeeUid,
          timestamp: now,
        });
        return { ok: true, authorizationNumber };
      });

      if (!outcome.ok) {
        return sendJson(res, outcome.statusCode, { error: 'request_failed', reason: outcome.reason });
      }
      return sendJson(res, 200, {
        missionId, vehicleId, employeeUid, status: 'VEHICLE_ALLOCATED',
        vehicleAuthorizationId: missionId,
        vehicleAuthorizationNumber: outcome.authorizationNumber,
        vehicleAuthorizationStatus: 'PENDING_AUTHORIZATION',
      });
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

        // Inspector capture intentionally remains untouched and older
        // observations do not carry a department field. Derive the audit
        // department from the trusted reporting-inspector record instead of
        // accepting any department value from the contractor request.
        const reporterUid = cleanString(observation && observation.createdByUid);
        const reporterRef = reporterUid ? db.collection('users').doc(reporterUid) : null;
        const reporterSnap = reporterRef ? await transaction.get(reporterRef) : null;
        const reporter = reporterSnap && reporterSnap.exists ? (reporterSnap.data() || {}) : {};
        const auditDepartment = reporter.role === 'inspector'
          && reporter.organizationId === contractorCaller.organizationId
          ? cleanString(reporter.department)
          : '';

        const now = FieldValue.serverTimestamp();
        transaction.update(obsRef, { ...update, updatedAt: now });
        // The one canonical audit event, inside this same transaction —
        // actor/organization are always the trusted server-derived
        // caller, never request-body values. Department is derived from the
        // reporting inspector so the Field Head audit can remain exact-scope.
        transaction.set(db.collection('auditEvents').doc(), {
          organizationId: contractorCaller.organizationId,
          department: auditDepartment,
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

      // ---- municipality manager password management ----
      // setPassword is the normal User Center flow: a municipality manager
      // selects the final password for a linked institutional employee.
      // setTempPassword remains intact only for legacy temporary-password flows.
      case 'setPassword':
      case 'setTempPassword': {
        const { uid, password } = body;
        if (!isNonEmptyString(uid) || !isNonEmptyString(password)) {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'password_policy_failed' });
        }

        if (!caller.isManager || caller.role !== 'manager' || !isNonEmptyString(caller.organizationId)) {
          return sendJson(res, 403, { error: 'forbidden', reason: 'password_management_denied' });
        }
        if (!hasRecentAuthentication(decoded)) {
          return sendJson(res, 401, { error: 'unauthenticated', reason: 'reauthentication_required' });
        }

        const record = await findRecord(db, uid);
        if (!record) {
          return sendJson(res, 404, { error: 'record_not_found' });
        }
        if (!isNonEmptyString(record.data.organizationId) || record.data.organizationId !== caller.organizationId) {
          return sendJson(res, 403, { error: 'forbidden', reason: 'target_organization_mismatch' });
        }

        if (action === 'setPassword') {
          // Direct edit is deliberately limited to a real linked employee
          // account in users/{uid}. It never applies to managers/owners and
          // never silently upgrades a legacy unlinked login.
          if (record.collection !== 'users' || !isNonEmptyString(record.data.employeeId)) {
            return sendJson(res, 403, { error: 'forbidden', reason: 'password_target_denied' });
          }

          const employeeSnap = await db.collection('employees').doc(record.data.employeeId).get();
          const employee = employeeSnap.exists ? (employeeSnap.data() || {}) : null;
          if (!employee ||
              employee.organizationId !== caller.organizationId ||
              employee.authUid !== uid) {
            return sendJson(res, 409, { error: 'invalid_request', reason: 'employee_account_link_mismatch' });
          }
        } else if (!isPasswordEligibleTarget(record.data)) {
          return sendJson(res, 403, { error: 'forbidden', reason: 'password_target_denied' });
        }

        const policyFailure = passwordPolicyReason(password, record.data);
        if (policyFailure) {
          return sendJson(res, 400, { error: 'invalid_request', reason: policyFailure });
        }

        const forceChangeOnNextLogin = action === 'setTempPassword';

        await auth.updateUser(uid, { password });
        await auth.revokeRefreshTokens(uid);

        await record.ref.set({
          mustChangePassword: forceChangeOnNextLogin,
          passwordUpdatedAt: FieldValue.serverTimestamp(),
          sessionsRevokedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        await recordAdminAudit(db, {
          caller,
          organizationId: record.data.organizationId,
          targetUid: uid,
          action: forceChangeOnNextLogin ? 'password_reset' : 'password_change',
        });

        return sendJson(res, 200, {
          uid,
          mustChangePassword: forceChangeOnNextLogin,
          revoked: true,
        });
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
