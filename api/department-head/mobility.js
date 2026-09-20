'use strict';

const { getDb, FieldValue } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, getCallerContext } = require('../_lib/authz');
const { evaluateMissionTransition } = require('../../platform/policies/mission-workflow-policy');

const STATUS_LABELS = Object.freeze({
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

function clean(value, max = 180) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function isFieldSurveyDepartment(value) {
  return /الحصر|ميداني|field/i.test(clean(value, 120));
}

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string') return value;
  const seconds = Number.isFinite(value.seconds) ? value.seconds : value._seconds;
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

function safeMission(id, data) {
  return {
    missionId: id,
    status: data.status || 'DRAFT',
    statusLabel: STATUS_LABELS[data.status] || data.status || 'غير محدد',
    department: data.department || null,
    type: data.type || null,
    destination: data.destination || null,
    reason: data.reason || null,
    scope: data.scope || null,
    requestedEmployeeId: data.requestedEmployeeId || null,
    requestedEmployeeName: data.requestedEmployeeName || null,
    requestedEmployeeUid: data.requestedEmployeeUid || null,
    vehicleId: data.vehicleId || null,
    assignedEmployeeUid: data.assignedEmployeeUid || null,
    assignedEmployeeName: data.assignedEmployeeName || null,
    whenLabel: data.whenLabel || null,
    durationLabel: data.durationLabel || null,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

async function requireFieldDepartmentHead(req) {
  const decoded = await verifyRequestToken(req);
  const caller = await getCallerContext(decoded.uid);
  if (!caller.isDepartmentHead || caller.role !== 'department_head'
      || !caller.organizationId || !caller.department || !isFieldSurveyDepartment(caller.department)) {
    const error = new Error('field_department_head_required');
    error.statusCode = 403;
    throw error;
  }
  return caller;
}

async function findEligibleEmployee(db, caller, employeeId) {
  const id = clean(employeeId, 120);
  if (!id) return { ok: false, reason: 'employee_required' };

  const snap = await db.collection('employees').doc(id).get();
  if (!snap.exists) return { ok: false, reason: 'employee_not_found' };

  const employee = snap.data() || {};
  if (employee.organizationId !== caller.organizationId) return { ok: false, reason: 'cross_organization_denied' };
  if (clean(employee.department, 120) !== clean(caller.department, 120)) return { ok: false, reason: 'cross_department_denied' };
  if (employee.employmentStatus === 'inactive') return { ok: false, reason: 'employee_inactive' };
  if (employee.accountStatus !== 'ACTIVE' || !clean(employee.authUid, 180)) return { ok: false, reason: 'employee_account_not_active' };

  const mobility = employee.products && employee.products.mobility;
  if (!mobility || mobility.enabled !== true || mobility.role !== 'employee') {
    return { ok: false, reason: 'employee_mobility_role_required' };
  }
  if (mobility.vehicleEligible !== true) return { ok: false, reason: 'employee_vehicle_not_eligible' };

  return {
    ok: true,
    employeeId: snap.id,
    employee: {
      name: clean(employee.name, 140) || 'موظف',
      authUid: clean(employee.authUid, 180),
      jobTitle: clean(employee.jobTitle, 140),
    },
  };
}

async function listMissions(db, caller) {
  const snap = await db.collection('missions').where('organizationId', '==', caller.organizationId).get();
  const missions = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (clean(data.department, 120) !== clean(caller.department, 120)) continue;
    missions.push(safeMission(doc.id, data));
  }
  missions.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return missions.slice(0, 100);
}

async function createAndSubmit(db, caller, body) {
  const employeeResult = await findEligibleEmployee(db, caller, body.employeeId);
  if (!employeeResult.ok) return { ok: false, statusCode: 400, reason: employeeResult.reason };

  const type = clean(body.type, 120) || 'مهمة حصر ميداني';
  const destination = clean(body.destination, 180);
  const reason = clean(body.reason, 500);
  const whenLabel = clean(body.whenLabel, 120);
  const durationLabel = clean(body.durationLabel, 120);
  const scope = clean(body.scope, 120) || 'داخل النطاق';

  if (!destination || !reason) {
    return { ok: false, statusCode: 400, reason: 'destination_and_reason_required' };
  }

  const actor = { uid: caller.uid, role: 'department_head', organizationId: caller.organizationId };
  const draftMission = {
    organizationId: caller.organizationId,
    department: caller.department,
    createdByUid: caller.uid,
    status: 'DRAFT',
  };
  const transition = evaluateMissionTransition({ actor, mission: draftMission, toStatus: 'PENDING_APPROVAL' });
  if (!transition.allowed) return { ok: false, statusCode: 403, reason: transition.code };

  const ref = db.collection('missions').doc();
  const now = FieldValue.serverTimestamp();
  const mission = {
    organizationId: caller.organizationId,
    department: caller.department,
    createdByUid: caller.uid,
    requesterName: caller.name || 'رئيس القسم',
    status: 'PENDING_APPROVAL',
    type,
    destination,
    reason,
    scope,
    requestedEmployeeId: employeeResult.employeeId,
    requestedEmployeeName: employeeResult.employee.name,
    requestedEmployeeUid: employeeResult.employee.authUid,
    whenLabel,
    durationLabel,
    createdAt: now,
    updatedAt: now,
    updatedByUid: caller.uid,
  };

  const batch = db.batch();
  batch.set(ref, mission);
  batch.set(db.collection('auditEvents').doc(), {
    organizationId: caller.organizationId,
    actorId: caller.uid,
    actorRole: 'department_head',
    resourceType: 'mission',
    resourceId: ref.id,
    action: 'create_and_submit',
    fromStatus: 'DRAFT',
    toStatus: 'PENDING_APPROVAL',
    requestedEmployeeUid: employeeResult.employee.authUid,
    timestamp: now,
  });
  await batch.commit();

  return {
    ok: true,
    mission: safeMission(ref.id, {
      ...mission,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  };
}

async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  let caller;
  try {
    caller = await requireFieldDepartmentHead(req);
  } catch (error) {
    return sendJson(res, error.statusCode || 401, {
      error: error.statusCode === 403 ? 'forbidden' : 'unauthenticated',
      reason: error.message || 'authorization_failed',
    });
  }

  const body = await readJsonBody(req);
  const db = getDb();

  try {
    if (body.action === 'list') {
      return sendJson(res, 200, { missions: await listMissions(db, caller) });
    }

    if (body.action === 'createAndSubmit') {
      const result = await createAndSubmit(db, caller, body);
      if (!result.ok) return sendJson(res, result.statusCode || 400, { error: 'invalid_request', reason: result.reason });
      return sendJson(res, 200, { mission: result.mission });
    }

    return sendJson(res, 400, { error: 'invalid_action' });
  } catch (error) {
    console.error('field-head-mobility workflow failed', error);
    return sendJson(res, 500, { error: 'temporary_failure' });
  }
}

module.exports = handler;
