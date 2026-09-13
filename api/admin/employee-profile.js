'use strict';

// SMART HSR — Manager employee-profile maintenance.
// This endpoint deliberately owns only non-authorization HR profile fields.
// Department/administration/direct-manager moves continue to use the existing
// audited /api/admin/employees `transfer` action so transfer history is never
// bypassed. Product roles and account state continue to use their existing
// trusted actions.
const { getAuth, getDb, FieldValue } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, getCallerContext } = require('../_lib/authz');
const { validateEmployeeRecord } = require('../../platform/contracts/employee-registry-contract');

const ALLOWED_KEYS = new Set([
  'action',
  'employeeId',
  'name',
  'employeeRef',
  'email',
  'phone',
  'jobTitle',
  'employmentStatus',
]);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
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
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch (_) { return {}; }
}

function safeEmployee(id, data) {
  return {
    employeeId: id,
    organizationId: data.organizationId,
    name: data.name,
    employeeRef: data.employeeRef || null,
    email: data.email || null,
    phone: data.phone || null,
    administration: data.administration || null,
    department: data.department || null,
    jobTitle: data.jobTitle || null,
    employmentStatus: data.employmentStatus || 'active',
    directManagerEmployeeId: data.directManagerEmployeeId || null,
    accountStatus: data.accountStatus || 'NO_ACCOUNT',
    authUid: data.authUid || null,
    products: data.products || null,
  };
}

async function recordAudit(db, caller, employeeId, organizationId, changedFields) {
  await db.collection('adminAuditEvents').add({
    organizationId,
    actorId: caller.uid,
    actorRole: caller.role,
    targetEmployeeId: employeeId,
    action: 'employee_profile_update',
    detail: { changedFields },
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  let decoded;
  try {
    decoded = await verifyRequestToken(req);
  } catch (error) {
    return sendJson(res, error.statusCode || 401, { error: 'unauthenticated' });
  }

  const caller = await getCallerContext(decoded.uid);
  // Employee profile editing is an internal municipal-management authority.
  // Keep it manager-only in this preview remediation; department heads keep
  // their existing narrower employee actions and the SaaS owner does not gain
  // municipality-internal HR editing through this route.
  if (!caller.isManager || !isNonEmptyString(caller.organizationId)) {
    return sendJson(res, 403, { error: 'forbidden', reason: 'manager_required' });
  }

  const body = await readJsonBody(req);
  if (body.action !== 'updateProfile') {
    return sendJson(res, 400, { error: 'invalid_request', reason: 'unknown_action' });
  }
  if (Object.keys(body).some(key => !ALLOWED_KEYS.has(key))) {
    return sendJson(res, 400, { error: 'invalid_request', reason: 'protected_or_unknown_field' });
  }
  if (!isNonEmptyString(body.employeeId)) {
    return sendJson(res, 400, { error: 'invalid_request', reason: 'employeeId_required' });
  }

  const db = getDb();
  const auth = getAuth();
  const ref = db.collection('employees').doc(body.employeeId.trim());
  const snapshot = await ref.get();
  if (!snapshot.exists) return sendJson(res, 404, { error: 'employee_not_found' });

  const current = snapshot.data() || {};
  if (!isNonEmptyString(current.organizationId) || current.organizationId !== caller.organizationId) {
    return sendJson(res, 403, { error: 'forbidden', reason: 'cross_organization_denied' });
  }

  const patch = {};
  const changedFields = [];
  const has = key => Object.prototype.hasOwnProperty.call(body, key);
  const setNullableText = key => {
    if (!has(key)) return;
    if (body[key] !== null && typeof body[key] !== 'string') {
      const error = new Error(`invalid_${key}`);
      error.publicReason = `invalid_${key}`;
      throw error;
    }
    patch[key] = isNonEmptyString(body[key]) ? body[key].trim() : null;
    changedFields.push(key);
  };

  try {
    if (has('name')) {
      if (!isNonEmptyString(body.name)) return sendJson(res, 400, { error: 'invalid_request', reason: 'name_required' });
      patch.name = body.name.trim();
      changedFields.push('name');
    }
    setNullableText('employeeRef');
    setNullableText('phone');
    setNullableText('jobTitle');

    if (has('employmentStatus')) {
      patch.employmentStatus = body.employmentStatus;
      changedFields.push('employmentStatus');
    }

    if (has('email')) {
      if (body.email !== null && typeof body.email !== 'string') {
        return sendJson(res, 400, { error: 'invalid_request', reason: 'invalid_email' });
      }
      const nextEmail = isNonEmptyString(body.email) ? body.email.trim() : null;
      const currentEmail = isNonEmptyString(current.email) ? current.email.trim() : null;
      if (isNonEmptyString(current.authUid) && nextEmail !== currentEmail) {
        return sendJson(res, 409, { error: 'invalid_request', reason: 'linked_account_email_change_requires_account_flow' });
      }
      patch.email = nextEmail;
      changedFields.push('email');
    }
  } catch (error) {
    return sendJson(res, 400, { error: 'invalid_request', reason: error.publicReason || 'invalid_profile' });
  }

  if (!changedFields.length) {
    return sendJson(res, 400, { error: 'invalid_request', reason: 'no_changes_requested' });
  }

  const prospective = { ...current, ...patch };
  const validation = validateEmployeeRecord({
    organizationId: prospective.organizationId,
    name: prospective.name,
    employeeRef: prospective.employeeRef,
    email: prospective.email,
    phone: prospective.phone,
    administration: prospective.administration,
    department: prospective.department,
    jobTitle: prospective.jobTitle,
    employmentStatus: prospective.employmentStatus,
    directManagerEmployeeId: prospective.directManagerEmployeeId,
  });
  if (!validation.ok) {
    return sendJson(res, 400, { error: 'invalid_request', reason: validation.reason });
  }

  try {
    // Keep the linked operational identity's display name aligned with the
    // municipal employee registry. Login email is intentionally not changed
    // here; that requires a separate account-security workflow.
    if (isNonEmptyString(current.authUid) && Object.prototype.hasOwnProperty.call(patch, 'name')) {
      await auth.updateUser(current.authUid, { displayName: patch.name });
      await db.collection('users').doc(current.authUid).set({
        name: patch.name,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await recordAudit(db, caller, body.employeeId.trim(), current.organizationId, changedFields);
    const saved = await ref.get();
    return sendJson(res, 200, { employee: safeEmployee(saved.id, saved.data() || prospective) });
  } catch (_) {
    return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
  }
}

module.exports = handler;
module.exports._test = { safeEmployee, ALLOWED_KEYS };
