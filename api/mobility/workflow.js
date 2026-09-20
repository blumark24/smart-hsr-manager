'use strict';

const { getDb, FieldValue } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, resolveMobilityRole, isValidMobilityAllocationTarget } = require('../_lib/authz');
const { evaluateMissionTransition } = require('../../platform/policies/mission-workflow-policy');
const { evaluateVehicleTransition } = require('../../platform/policies/vehicle-workflow-policy');

const ROLE_SET = Object.freeze(['mobility_head', 'administrative_affairs', 'employee']);

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

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const seconds = Number.isFinite(value.seconds) ? value.seconds : value._seconds;
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
}

function safeMission(id, data) {
  return {
    missionId: id,
    organizationId: data.organizationId || null,
    department: data.department || null,
    status: data.status || null,
    type: data.type || null,
    destination: data.destination || null,
    reason: data.reason || null,
    scope: data.scope || null,
    requestedEmployeeUid: data.requestedEmployeeUid || null,
    requestedEmployeeName: data.requestedEmployeeName || null,
    vehicleId: data.vehicleId || null,
    assignedEmployeeUid: data.assignedEmployeeUid || null,
    assignedEmployeeName: data.assignedEmployeeName || null,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

function safeVehicle(id, data) {
  return {
    vehicleId: id,
    plate: data.plate || null,
    type: data.type || null,
    make: data.make || null,
    model: data.model || null,
    status: data.status || null,
    assignedEmployeeUid: data.assignedEmployeeUid || null,
    currentMissionId: data.currentMissionId || null,
  };
}

async function resolveActor(req, db) {
  const decoded = await verifyRequestToken(req);
  const snap = await db.collection('users').doc(decoded.uid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const role = resolveMobilityRole(data);
  const organizationId = clean(data.organizationId, 160);
  if (!ROLE_SET.includes(role) || data.active === false || !organizationId) return null;
  return {
    uid: decoded.uid,
    role,
    organizationId,
    department: clean(data.department, 160),
    name: clean(data.name, 140),
  };
}

function auditData(actor, resourceType, resourceId, action, extra) {
  return Object.assign({
    organizationId: actor.organizationId,
    actorId: actor.uid,
    actorRole: actor.role,
    resourceType,
    resourceId,
    action,
    timestamp: FieldValue.serverTimestamp(),
  }, extra || {});
}

async function getScopedMissions(db, actor) {
  const snap = await db.collection('missions').where('organizationId', '==', actor.organizationId).get();
  const missions = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (actor.role === 'employee' && data.assignedEmployeeUid !== actor.uid) continue;
    missions.push(safeMission(doc.id, data));
  }
  missions.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return missions.slice(0, 150);
}

async function getScopedVehicles(db, actor) {
  if (actor.role !== 'mobility_head') return [];
  const snap = await db.collection('vehicles').where('organizationId', '==', actor.organizationId).get();
  return snap.docs.map(doc => safeVehicle(doc.id, doc.data() || {}));
}

async function decideMission(db, actor, missionId, toStatus) {
  if (actor.role !== 'administrative_affairs') return { ok: false, statusCode: 403, reason: 'administrative_affairs_required' };
  if (!['APPROVED', 'REJECTED', 'DRAFT'].includes(toStatus)) return { ok: false, statusCode: 400, reason: 'invalid_decision' };

  const ref = db.collection('missions').doc(clean(missionId, 180));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, statusCode: 404, reason: 'mission_not_found' };
  const mission = snap.data() || {};
  if (mission.organizationId !== actor.organizationId) return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };

  const decision = evaluateMissionTransition({ actor, mission, toStatus });
  if (!decision.allowed) return { ok: false, statusCode: 409, reason: decision.code };

  const batch = db.batch();
  batch.update(ref, {
    status: toStatus,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: actor.uid,
  });
  batch.set(db.collection('auditEvents').doc(), auditData(actor, 'mission', ref.id, 'administrative_decision', {
    fromStatus: mission.status,
    toStatus,
  }));
  await batch.commit();
  return { ok: true };
}

async function allocateVehicle(db, actor, body) {
  if (actor.role !== 'mobility_head') return { ok: false, statusCode: 403, reason: 'mobility_head_required' };

  const missionId = clean(body.missionId, 180);
  const vehicleId = clean(body.vehicleId, 180);
  const employeeUid = clean(body.employeeUid, 180);
  if (!missionId || !vehicleId || !employeeUid) return { ok: false, statusCode: 400, reason: 'mission_vehicle_employee_required' };

  const missionRef = db.collection('missions').doc(missionId);
  const vehicleRef = db.collection('vehicles').doc(vehicleId);
  const employeeRef = db.collection('users').doc(employeeUid);

  try {
    await db.runTransaction(async tx => {
      const [missionSnap, vehicleSnap, employeeSnap] = await Promise.all([
        tx.get(missionRef), tx.get(vehicleRef), tx.get(employeeRef),
      ]);
      if (!missionSnap.exists) throw Object.assign(new Error('mission_not_found'), { statusCode: 404 });
      if (!vehicleSnap.exists) throw Object.assign(new Error('vehicle_not_found'), { statusCode: 404 });
      if (!employeeSnap.exists) throw Object.assign(new Error('employee_not_found'), { statusCode: 404 });

      const mission = missionSnap.data() || {};
      const vehicle = vehicleSnap.data() || {};
      const employee = employeeSnap.data() || {};

      if (mission.organizationId !== actor.organizationId || vehicle.organizationId !== actor.organizationId) {
        throw Object.assign(new Error('cross_organization_denied'), { statusCode: 403 });
      }
      if (mission.requestedEmployeeUid && mission.requestedEmployeeUid !== employeeUid) {
        throw Object.assign(new Error('approved_employee_mismatch'), { statusCode: 409 });
      }
      if (!isValidMobilityAllocationTarget(employee, actor.organizationId)) {
        throw Object.assign(new Error('employee_not_vehicle_eligible'), { statusCode: 409 });
      }

      const missionDecision = evaluateMissionTransition({
        actor,
        mission,
        toStatus: 'VEHICLE_ALLOCATED',
        requestedFields: { vehicleId, assignedEmployeeUid: employeeUid },
      });
      if (!missionDecision.allowed) throw Object.assign(new Error(missionDecision.code), { statusCode: 409 });

      const vehicleDecision = evaluateVehicleTransition({
        actor,
        vehicle: { ...vehicle, vehicleId },
        toStatus: 'RESERVED',
        requestedFields: { assignedEmployeeUid: employeeUid, currentMissionId: missionId },
        assignedEmployee: {
          organizationId: employee.organizationId,
          active: employee.active,
          role: resolveMobilityRole(employee),
          vehicleEligible: employee.vehicleEligible,
        },
      });
      if (!vehicleDecision.allowed) throw Object.assign(new Error(vehicleDecision.code), { statusCode: 409 });

      const employeeName = clean(employee.name, 140);
      tx.update(missionRef, {
        status: 'VEHICLE_ALLOCATED',
        vehicleId,
        assignedEmployeeUid: employeeUid,
        assignedEmployeeName: employeeName,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: actor.uid,
      });
      tx.update(vehicleRef, {
        status: 'RESERVED',
        assignedEmployeeUid: employeeUid,
        currentMissionId: missionId,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: actor.uid,
      });
      tx.set(db.collection('auditEvents').doc(), auditData(actor, 'mission', missionId, 'allocate_vehicle', {
        fromStatus: mission.status,
        toStatus: 'VEHICLE_ALLOCATED',
        vehicleId,
        assignedEmployeeUid: employeeUid,
      }));
      tx.set(db.collection('auditEvents').doc(), auditData(actor, 'vehicle', vehicleId, 'reserve', {
        fromStatus: vehicle.status,
        toStatus: 'RESERVED',
        missionId,
      }));
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, statusCode: error.statusCode || 409, reason: error.message || 'allocation_failed' };
  }
}

async function mobilityTransition(db, actor, missionId, action) {
  if (actor.role !== 'mobility_head') return { ok: false, statusCode: 403, reason: 'mobility_head_required' };
  const missionRef = db.collection('missions').doc(clean(missionId, 180));
  const missionSnap = await missionRef.get();
  if (!missionSnap.exists) return { ok: false, statusCode: 404, reason: 'mission_not_found' };
  const mission = missionSnap.data() || {};
  if (mission.organizationId !== actor.organizationId) return { ok: false, statusCode: 403, reason: 'cross_organization_denied' };
  const vehicleId = clean(mission.vehicleId, 180);
  if (!vehicleId) return { ok: false, statusCode: 409, reason: 'mission_vehicle_required' };

  const vehicleRef = db.collection('vehicles').doc(vehicleId);
  if (action === 'handover') {
    try {
      await db.runTransaction(async tx => {
        const [mSnap, vSnap] = await Promise.all([tx.get(missionRef), tx.get(vehicleRef)]);
        if (!mSnap.exists || !vSnap.exists) throw Object.assign(new Error('mission_or_vehicle_missing'), { statusCode: 404 });
        const m = mSnap.data() || {};
        const v = vSnap.data() || {};
        const md = evaluateMissionTransition({ actor, mission: m, toStatus: 'HANDED_OVER' });
        const vd = evaluateVehicleTransition({ actor, vehicle: { ...v, vehicleId }, toStatus: 'IN_MISSION' });
        if (!md.allowed) throw Object.assign(new Error(md.code), { statusCode: 409 });
        if (!vd.allowed) throw Object.assign(new Error(vd.code), { statusCode: 409 });
        tx.update(missionRef, { status: 'HANDED_OVER', updatedAt: FieldValue.serverTimestamp(), updatedByUid: actor.uid });
        tx.update(vehicleRef, { status: 'IN_MISSION', updatedAt: FieldValue.serverTimestamp(), updatedByUid: actor.uid });
        tx.set(db.collection('auditEvents').doc(), auditData(actor, 'mission', missionId, 'handover', { fromStatus: m.status, toStatus: 'HANDED_OVER', vehicleId }));
        tx.set(db.collection('auditEvents').doc(), auditData(actor, 'vehicle', vehicleId, 'handover', { fromStatus: v.status, toStatus: 'IN_MISSION', missionId }));
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, statusCode: error.statusCode || 409, reason: error.message || 'handover_failed' };
    }
  }

  if (action === 'confirmReturn') {
    try {
      await db.runTransaction(async tx => {
        const [mSnap, vSnap] = await Promise.all([tx.get(missionRef), tx.get(vehicleRef)]);
        if (!mSnap.exists || !vSnap.exists) throw Object.assign(new Error('mission_or_vehicle_missing'), { statusCode: 404 });
        const m = mSnap.data() || {};
        const v = vSnap.data() || {};
        const md = evaluateMissionTransition({ actor, mission: m, toStatus: 'CLOSED' });
        const vd = evaluateVehicleTransition({ actor, vehicle: { ...v, vehicleId }, toStatus: 'AVAILABLE' });
        if (!md.allowed) throw Object.assign(new Error(md.code), { statusCode: 409 });
        if (!vd.allowed) throw Object.assign(new Error(vd.code), { statusCode: 409 });
        tx.update(missionRef, { status: 'CLOSED', updatedAt: FieldValue.serverTimestamp(), updatedByUid: actor.uid });
        tx.update(vehicleRef, {
          status: 'AVAILABLE',
          assignedEmployeeUid: FieldValue.delete(),
          currentMissionId: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedByUid: actor.uid,
        });
        tx.set(db.collection('auditEvents').doc(), auditData(actor, 'mission', missionId, 'confirm_return', { fromStatus: m.status, toStatus: 'CLOSED', vehicleId }));
        tx.set(db.collection('auditEvents').doc(), auditData(actor, 'vehicle', vehicleId, 'confirm_return', { fromStatus: v.status, toStatus: 'AVAILABLE', missionId }));
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, statusCode: error.statusCode || 409, reason: error.message || 'return_confirmation_failed' };
    }
  }

  return { ok: false, statusCode: 400, reason: 'invalid_mobility_action' };
}

async function employeeTransition(db, actor, body) {
  if (actor.role !== 'employee') return { ok: false, statusCode: 403, reason: 'employee_required' };
  const missionId = clean(body.missionId, 180);
  const toStatus = clean(body.toStatus, 80);
  if (!missionId || !['READY', 'IN_PROGRESS', 'INCIDENT_HOLD', 'COMPLETED'].includes(toStatus)) {
    return { ok: false, statusCode: 400, reason: 'invalid_employee_transition' };
  }

  const ref = db.collection('missions').doc(missionId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, statusCode: 404, reason: 'mission_not_found' };
  const mission = snap.data() || {};
  const decision = evaluateMissionTransition({ actor, mission, toStatus });
  if (!decision.allowed) return { ok: false, statusCode: 409, reason: decision.code };

  const batch = db.batch();
  batch.update(ref, { status: toStatus, updatedAt: FieldValue.serverTimestamp(), updatedByUid: actor.uid });
  batch.set(db.collection('auditEvents').doc(), auditData(actor, 'mission', missionId, 'employee_advance', {
    fromStatus: mission.status,
    toStatus,
  }));
  await batch.commit();
  return { ok: true };
}

async function employeeReturn(db, actor, missionId) {
  if (actor.role !== 'employee') return { ok: false, statusCode: 403, reason: 'employee_required' };
  const missionRef = db.collection('missions').doc(clean(missionId, 180));
  try {
    await db.runTransaction(async tx => {
      const missionSnap = await tx.get(missionRef);
      if (!missionSnap.exists) throw Object.assign(new Error('mission_not_found'), { statusCode: 404 });
      const mission = missionSnap.data() || {};
      if (mission.assignedEmployeeUid !== actor.uid) throw Object.assign(new Error('employee_not_assigned'), { statusCode: 403 });
      const vehicleId = clean(mission.vehicleId, 180);
      if (!vehicleId) throw Object.assign(new Error('mission_vehicle_required'), { statusCode: 409 });
      const vehicleRef = db.collection('vehicles').doc(vehicleId);
      const vehicleSnap = await tx.get(vehicleRef);
      if (!vehicleSnap.exists) throw Object.assign(new Error('vehicle_not_found'), { statusCode: 404 });
      const vehicle = vehicleSnap.data() || {};

      const md = evaluateMissionTransition({ actor, mission, toStatus: 'AWAITING_RETURN' });
      const vd = evaluateVehicleTransition({ actor, vehicle: { ...vehicle, vehicleId }, toStatus: 'RETURN_PENDING' });
      if (!md.allowed) throw Object.assign(new Error(md.code), { statusCode: 409 });
      if (!vd.allowed) throw Object.assign(new Error(vd.code), { statusCode: 409 });

      tx.update(missionRef, { status: 'AWAITING_RETURN', updatedAt: FieldValue.serverTimestamp(), updatedByUid: actor.uid });
      tx.update(vehicleRef, { status: 'RETURN_PENDING', updatedAt: FieldValue.serverTimestamp(), updatedByUid: actor.uid });
      tx.set(db.collection('auditEvents').doc(), auditData(actor, 'mission', missionRef.id, 'employee_return_vehicle', {
        fromStatus: mission.status,
        toStatus: 'AWAITING_RETURN',
        vehicleId,
      }));
      tx.set(db.collection('auditEvents').doc(), auditData(actor, 'vehicle', vehicleId, 'employee_return_vehicle', {
        fromStatus: vehicle.status,
        toStatus: 'RETURN_PENDING',
        missionId: missionRef.id,
      }));
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, statusCode: error.statusCode || 409, reason: error.message || 'return_failed' };
  }
}

async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  const db = getDb();
  let actor;
  try {
    actor = await resolveActor(req, db);
  } catch (_) {
    return sendJson(res, 401, { error: 'unauthenticated' });
  }
  if (!actor) return sendJson(res, 403, { error: 'forbidden', reason: 'mobility_role_required' });

  const body = await readJsonBody(req);

  try {
    if (body.action === 'list') return sendJson(res, 200, { role: actor.role, missions: await getScopedMissions(db, actor) });
    if (body.action === 'listVehicles') return sendJson(res, actor.role === 'mobility_head' ? 200 : 403, actor.role === 'mobility_head' ? { vehicles: await getScopedVehicles(db, actor) } : { error: 'forbidden' });

    let result;
    if (body.action === 'decide') result = await decideMission(db, actor, body.missionId, clean(body.toStatus, 80));
    else if (body.action === 'allocate') result = await allocateVehicle(db, actor, body);
    else if (body.action === 'handover') result = await mobilityTransition(db, actor, body.missionId, 'handover');
    else if (body.action === 'confirmReturn') result = await mobilityTransition(db, actor, body.missionId, 'confirmReturn');
    else if (body.action === 'employeeAdvance') result = await employeeTransition(db, actor, body);
    else if (body.action === 'employeeReturn') result = await employeeReturn(db, actor, body.missionId);
    else return sendJson(res, 400, { error: 'invalid_action' });

    if (!result.ok) return sendJson(res, result.statusCode || 400, { error: 'workflow_denied', reason: result.reason });
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('mobility workflow failed', error);
    return sendJson(res, 500, { error: 'temporary_failure' });
  }
}

module.exports = handler;
