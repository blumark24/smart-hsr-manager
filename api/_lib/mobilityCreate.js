'use strict';

const crypto = require('node:crypto');
const { resolveMobilityRole, activeIsNotFalse } = require('./authz');

const ACTION_CREATE_MISSION = 'createMobilityMission';
const ACTION_CREATE_INCIDENT = 'createMobilityIncident';
const MOBILITY_CREATE_ACTIONS = new Set([ACTION_CREATE_MISSION, ACTION_CREATE_INCIDENT]);
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const SEVERITIES = new Set(['CRITICAL', 'MEDIUM', 'LOW']);
const SERVER_DERIVED_FIELDS = new Set([
  'organizationId', 'createdByUid', 'actorId', 'actorRole', 'department',
  'status', 'createdAt', 'updatedAt', 'updatedByUid', 'employeeName', 'requesterName',
]);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function cleanText(value, maxLength, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : fallback;
}

function cleanDocumentId(value) {
  const text = cleanText(value, 256, '');
  return text && !text.includes('/') ? text : '';
}

function validateClientRequestId(value) {
  return typeof value === 'string' && REQUEST_ID_RE.test(value);
}

function hasServerDerivedSpoof(body) {
  if (!body || typeof body !== 'object') return false;
  return Object.keys(body).some((key) => SERVER_DERIVED_FIELDS.has(key));
}

function hashObject(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function deterministicResourceId(kind, uid, clientRequestId) {
  const digest = crypto.createHash('sha256')
    .update(`${kind}\u0000${uid}\u0000${clientRequestId}`)
    .digest('hex')
    .slice(0, 40);
  return `${kind}_${digest}`;
}

function missionPayload(body) {
  return Object.freeze({
    type: cleanText(body.type, 120, ''),
    destination: cleanText(body.destination, 300, ''),
    reason: cleanText(body.reason, 2000, ''),
    scope: cleanText(body.scope, 120, 'داخل النطاق'),
    requestedEmployeeName: cleanText(body.requestedEmployeeName, 200, ''),
    whenLabel: cleanText(body.whenLabel, 160, ''),
    durationLabel: cleanText(body.durationLabel, 120, ''),
  });
}

function incidentPayload(body) {
  const missionId = cleanDocumentId(body.missionId);
  const suppliedVehicleId = body.vehicleId == null || body.vehicleId === '' ? '' : cleanDocumentId(body.vehicleId);
  const rawSeverity = cleanText(body.severity, 32, 'MEDIUM').toUpperCase();
  return Object.freeze({
    missionId,
    suppliedVehicleId,
    category: cleanText(body.category, 120, 'أخرى'),
    severity: SEVERITIES.has(rawSeverity) ? rawSeverity : null,
    note: cleanText(body.note, 2000, ''),
  });
}

function actorDisplayName(userData, decoded, fallback) {
  return cleanText(userData && userData.name, 200,
    cleanText(decoded && decoded.name, 200,
      cleanText(decoded && decoded.email, 200, fallback)));
}

function deny(statusCode, reason) {
  return { ok: false, statusCode, reason };
}

function existingCreateMatches(existing, { clientRequestId, requestHash, organizationId, uid }) {
  return existing
    && existing.clientRequestId === clientRequestId
    && existing.createRequestHash === requestHash
    && existing.organizationId === organizationId
    && existing.createdByUid === uid;
}

async function createMission({ db, FieldValue, decoded, body }) {
  if (!validateClientRequestId(body.clientRequestId)) return deny(400, 'client_request_id_invalid');
  if (hasServerDerivedSpoof(body)) return deny(400, 'server_derived_fields_forbidden');

  const payload = missionPayload(body);
  const missionId = deterministicResourceId('mission', decoded.uid, body.clientRequestId);
  const auditId = `create_${missionId}`;

  return db.runTransaction(async (transaction) => {
    const userRef = db.collection('users').doc(decoded.uid);
    const missionRef = db.collection('missions').doc(missionId);
    const auditRef = db.collection('auditEvents').doc(auditId);
    const [userSnap, missionSnap, auditSnap] = await Promise.all([
      transaction.get(userRef), transaction.get(missionRef), transaction.get(auditRef),
    ]);

    if (!userSnap.exists) return deny(403, 'department_head_required');
    const userData = userSnap.data() || {};
    const organizationId = cleanText(userData.organizationId, 256, '');
    const department = cleanText(userData.department, 256, '');
    if (!activeIsNotFalse(userData)
      || resolveMobilityRole(userData) !== 'department_head'
      || !organizationId || !department) {
      return deny(403, 'department_head_required');
    }

    const requestHash = hashObject({
      kind: 'mission', uid: decoded.uid, organizationId, department, payload,
    });

    if (missionSnap.exists) {
      const existing = missionSnap.data() || {};
      if (!existingCreateMatches(existing, {
        clientRequestId: body.clientRequestId, requestHash, organizationId, uid: decoded.uid,
      })) return deny(409, 'idempotency_conflict');
      if (!auditSnap.exists) return deny(409, 'integrity_state_invalid');
      return { ok: true, statusCode: 200, missionId, replayed: true };
    }
    if (auditSnap.exists) return deny(409, 'integrity_state_invalid');

    const now = FieldValue.serverTimestamp();
    transaction.set(missionRef, {
      organizationId,
      department,
      createdByUid: decoded.uid,
      requesterName: actorDisplayName(userData, decoded, 'رئيس القسم'),
      status: 'DRAFT',
      ...payload,
      clientRequestId: body.clientRequestId,
      createRequestHash: requestHash,
      createdAt: now,
      updatedAt: now,
      updatedByUid: decoded.uid,
    });
    transaction.set(auditRef, {
      organizationId,
      actorId: decoded.uid,
      actorRole: 'department_head',
      department,
      resourceType: 'mission',
      resourceId: missionId,
      action: 'create',
      toStatus: 'DRAFT',
      clientRequestId: body.clientRequestId,
      timestamp: now,
    });
    return { ok: true, statusCode: 200, missionId, replayed: false };
  });
}

async function createIncident({ db, FieldValue, decoded, body }) {
  if (!validateClientRequestId(body.clientRequestId)) return deny(400, 'client_request_id_invalid');
  if (hasServerDerivedSpoof(body)) return deny(400, 'server_derived_fields_forbidden');

  const payload = incidentPayload(body);
  if (!payload.missionId) return deny(400, 'mission_id_invalid');
  if (body.vehicleId != null && body.vehicleId !== '' && !payload.suppliedVehicleId) {
    return deny(400, 'vehicle_id_invalid');
  }
  if (!payload.severity) return deny(400, 'severity_invalid');

  const incidentId = deterministicResourceId('incident', decoded.uid, body.clientRequestId);
  const auditId = `create_${incidentId}`;

  return db.runTransaction(async (transaction) => {
    const userRef = db.collection('users').doc(decoded.uid);
    const missionRef = db.collection('missions').doc(payload.missionId);
    const incidentRef = db.collection('incidents').doc(incidentId);
    const auditRef = db.collection('auditEvents').doc(auditId);
    const [userSnap, missionSnap, incidentSnap, auditSnap] = await Promise.all([
      transaction.get(userRef), transaction.get(missionRef),
      transaction.get(incidentRef), transaction.get(auditRef),
    ]);

    if (!userSnap.exists) return deny(403, 'employee_required');
    const userData = userSnap.data() || {};
    const organizationId = cleanText(userData.organizationId, 256, '');
    if (!activeIsNotFalse(userData)
      || resolveMobilityRole(userData) !== 'employee'
      || !organizationId) {
      return deny(403, 'employee_required');
    }

    if (!missionSnap.exists) return deny(404, 'mission_not_found');
    const mission = missionSnap.data() || {};
    if (mission.organizationId !== organizationId) return deny(403, 'cross_organization_denied');
    if (mission.assignedEmployeeUid !== decoded.uid) return deny(403, 'mission_not_assigned_to_employee');

    const missionVehicleId = cleanDocumentId(mission.vehicleId || '');
    if (payload.suppliedVehicleId && payload.suppliedVehicleId !== missionVehicleId) {
      return deny(409, 'vehicle_mismatch');
    }

    const department = cleanText(mission.department, 256,
      cleanText(userData.department, 256, ''));
    const canonicalPayload = Object.freeze({
      missionId: payload.missionId,
      vehicleId: missionVehicleId,
      category: payload.category,
      severity: payload.severity,
      note: payload.note,
    });
    const requestHash = hashObject({
      kind: 'incident', uid: decoded.uid, organizationId, department, payload: canonicalPayload,
    });

    // Resolve an idempotent replay before transient lifecycle re-checks. A
    // successful create can be immediately followed by IN_PROGRESS ->
    // INCIDENT_HOLD; retrying a lost HTTP response must still return the
    // already-created canonical incident instead of a false state failure.
    if (incidentSnap.exists) {
      const existing = incidentSnap.data() || {};
      if (!existingCreateMatches(existing, {
        clientRequestId: body.clientRequestId, requestHash, organizationId, uid: decoded.uid,
      })) return deny(409, 'idempotency_conflict');
      if (!auditSnap.exists) return deny(409, 'integrity_state_invalid');
      return { ok: true, statusCode: 200, incidentId, replayed: true };
    }
    if (auditSnap.exists) return deny(409, 'integrity_state_invalid');

    if (mission.status !== 'IN_PROGRESS') return deny(409, 'mission_not_in_progress');

    if (missionVehicleId) {
      const vehicleRef = db.collection('vehicles').doc(missionVehicleId);
      const vehicleSnap = await transaction.get(vehicleRef);
      if (!vehicleSnap.exists) return deny(409, 'vehicle_relationship_invalid');
      const vehicle = vehicleSnap.data() || {};
      if (vehicle.organizationId !== organizationId
        || vehicle.currentMissionId !== payload.missionId
        || vehicle.assignedEmployeeUid !== decoded.uid) {
        return deny(409, 'vehicle_relationship_invalid');
      }
    }

    const now = FieldValue.serverTimestamp();
    transaction.set(incidentRef, {
      organizationId,
      missionId: canonicalPayload.missionId,
      vehicleId: canonicalPayload.vehicleId,
      createdByUid: decoded.uid,
      employeeName: actorDisplayName(userData, decoded, 'الموظف'),
      department,
      category: canonicalPayload.category,
      severity: canonicalPayload.severity,
      note: canonicalPayload.note,
      status: 'NEW',
      clientRequestId: body.clientRequestId,
      createRequestHash: requestHash,
      createdAt: now,
      updatedAt: now,
      updatedByUid: decoded.uid,
    });
    transaction.set(auditRef, {
      organizationId,
      actorId: decoded.uid,
      actorRole: 'employee',
      department,
      resourceType: 'incident',
      resourceId: incidentId,
      action: 'create',
      toStatus: 'NEW',
      missionId: canonicalPayload.missionId,
      clientRequestId: body.clientRequestId,
      timestamp: now,
    });
    return { ok: true, statusCode: 200, incidentId, replayed: false };
  });
}

async function handleTrustedMobilityCreate({ action, db, FieldValue, decoded, body }) {
  if (!decoded || !isNonEmptyString(decoded.uid)) return deny(401, 'unauthenticated');
  if (!MOBILITY_CREATE_ACTIONS.has(action)) return deny(400, 'unknown_mobility_create_action');
  if (action === ACTION_CREATE_MISSION) return createMission({ db, FieldValue, decoded, body });
  return createIncident({ db, FieldValue, decoded, body });
}

module.exports = {
  ACTION_CREATE_MISSION,
  ACTION_CREATE_INCIDENT,
  MOBILITY_CREATE_ACTIONS,
  handleTrustedMobilityCreate,
  _test: {
    cleanText,
    cleanDocumentId,
    validateClientRequestId,
    hasServerDerivedSpoof,
    deterministicResourceId,
    missionPayload,
    incidentPayload,
    hashObject,
  },
};
