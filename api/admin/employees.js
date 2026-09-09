'use strict';
// ============================================================================
// POST /api/admin/employees — Phase 03B Unified User Center: municipal
// EMPLOYEE MASTER REGISTRY + account activation.
//
// An employee record (employees/{employeeId}) is the durable HR-shaped fact
// that "this person works for this organization". It can exist with NO
// Firebase Auth account at all (accountStatus NO_ACCOUNT) — the normal state
// for most of an eventual Excel-imported roster until a manager/department
// head activates the ones who actually need to sign in. This is a SEPARATE
// collection and a SEPARATE endpoint from api/admin/users.js — that endpoint
// and its authorization model are completely untouched by this file.
//
// Auth:   Authorization: Bearer <Firebase ID token>   (verified, revoke-checked)
// Authz:  owner (any organization), organization manager (own organizationId,
//         any department), or department_head (own organizationId AND own
//         department only, users/{uid} role 'department_head'). See
//         api/_lib/authz.js assertCanManageEmployee/getCallerContext.
// Body:   { action, ...params }
//
// Actions: list | create | activateAccount | setAccountStatus |
//          assignProducts | setVehicleEligible | transfer
//
// SECURITY: passwords are never returned, never logged, never stored in
// Firestore. Contractors are never represented in this registry — this
// endpoint has no code path that can create or return a contractor record.
// jobTitle/administration/department are free-text HR data, never treated
// as an authorization role anywhere in this file.
// ============================================================================
const { getAuth, getDb, FieldValue } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, getCallerContext, assertCanManageEmployee } = require('../_lib/authz');
const {
  validateFieldSelection,
  validateLandsSelection,
  passwordPolicyReason,
} = require('../_lib/serviceEntitlements');
const { resolveProductEntitlements } = require('../../platform/contracts/product-entitlement-contract');
const {
  ACCOUNT_STATUS,
  canTransitionAccountStatus,
  validateEmployeeRecord,
} = require('../../platform/contracts/employee-registry-contract');

function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }

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

// Append-only audit trail — same collection, same shape, same Admin-SDK-only
// write path as api/admin/users.js's recordAdminAudit (see firestore.rules
// adminAuditEvents match block, allow write: if false for clients).
async function recordAdminAudit(db, { caller, organizationId, targetEmployeeId, action, detail }) {
  const doc = {
    organizationId,
    actorId: caller.uid,
    actorRole: caller.role,
    targetEmployeeId,
    action,
    createdAt: FieldValue.serverTimestamp(),
  };
  if (detail && typeof detail === 'object') doc.detail = detail;
  await db.collection('adminAuditEvents').add(doc);
}

function safeAdminFailure(error) {
  const code = error && error.errorInfo && error.errorInfo.code;
  if (code === 'auth/email-already-exists') return { statusCode: 409, reason: 'email_already_exists' };
  if (code === 'auth/invalid-email') return { statusCode: 400, reason: 'invalid_email' };
  if (code === 'auth/invalid-password') return { statusCode: 400, reason: 'invalid_password' };
  return { statusCode: 500, reason: 'temporary_failure' };
}

// Only ever expose safe, non-sensitive employee fields — never a password,
// never a raw Auth token.
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
    accountStatus: data.accountStatus || ACCOUNT_STATUS.NO_ACCOUNT,
    authUid: data.authUid || null,
    products: data.products || {
      field: { enabled: false, role: null },
      lands: { enabled: false, role: null },
      // Phase 03B.1 hotfix: fail-safe default — not eligible until explicit.
      mobility: { enabled: false, role: null, vehicleEligible: false },
    },
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

async function findEmployee(db, employeeId) {
  const ref = db.collection('employees').doc(employeeId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { ref, data: snap.data() || {} };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  let decoded;
  try {
    decoded = await verifyRequestToken(req);
  } catch (e) {
    return sendJson(res, e.statusCode || 401, { error: 'unauthenticated' });
  }

  const caller = await getCallerContext(decoded.uid);
  if (!caller.isOwner && !caller.isManager && !caller.isDepartmentHead) {
    return sendJson(res, 403, { error: 'forbidden', reason: 'owner_manager_or_department_head_required' });
  }

  const body = await readJsonBody(req);
  const action = body.action;
  const auth = getAuth();
  const db = getDb();

  try {
    switch (action) {
      // ---- list employees the caller may see ----
      case 'list': {
        const organizationId = body.organizationId;
        if (!isNonEmptyString(organizationId)) return sendJson(res, 400, { error: 'organizationId_required' });
        if (!caller.isOwner && organizationId !== caller.organizationId) {
          return sendJson(res, 403, { error: 'forbidden', reason: 'cross_organization_denied' });
        }
        const snap = await db.collection('employees').where('organizationId', '==', organizationId).get();
        const out = [];
        for (const doc of snap.docs) {
          const data = doc.data() || {};
          if (caller.isDepartmentHead && data.department !== caller.department) continue;
          out.push(safeEmployee(doc.id, data));
        }
        return sendJson(res, 200, { employees: out });
      }

      // ---- create an employee record ONLY — never a Firebase Auth account ----
      case 'create': {
        const { organizationId, name, employeeRef, email, phone, administration, department, jobTitle, employmentStatus, directManagerEmployeeId } = body;
        const validation = validateEmployeeRecord({ organizationId, name, email, phone, administration, department, jobTitle, employmentStatus, directManagerEmployeeId });
        if (!validation.ok) return sendJson(res, 400, { error: 'invalid_request', reason: validation.reason });

        const decision = assertCanManageEmployee(caller, { targetOrganizationId: organizationId, targetDepartment: department });
        if (!decision.allowed) return sendJson(res, 403, { error: 'forbidden', reason: decision.reason });

        const doc = {
          organizationId,
          name: name.trim(),
          employeeRef: isNonEmptyString(employeeRef) ? employeeRef.trim() : null,
          email: isNonEmptyString(email) ? email.trim() : null,
          phone: isNonEmptyString(phone) ? phone.trim() : null,
          administration: isNonEmptyString(administration) ? administration.trim() : null,
          department: isNonEmptyString(department) ? department.trim() : null,
          jobTitle: isNonEmptyString(jobTitle) ? jobTitle.trim() : null,
          employmentStatus: employmentStatus || 'active',
          directManagerEmployeeId: isNonEmptyString(directManagerEmployeeId) ? directManagerEmployeeId.trim() : null,
          accountStatus: ACCOUNT_STATUS.NO_ACCOUNT,
          authUid: null,
          products: {
            field: { enabled: false, role: null },
            lands: { enabled: false, role: null },
            // Phase 03B.1 hotfix: fail-safe default — not eligible until explicit.
            mobility: { enabled: false, role: null, vehicleEligible: false },
          },
          createdBy: caller.uid,
          createdAt: FieldValue.serverTimestamp(),
        };
        const ref = db.collection('employees').doc();
        await ref.set(doc);
        await recordAdminAudit(db, { caller, organizationId, targetEmployeeId: ref.id, action: 'employee_create' });
        return sendJson(res, 200, { employee: safeEmployee(ref.id, doc) });
      }

      // ---- create the real Firebase Auth account for an existing employee record ----
      // Never a fake success: if the Firebase Auth account is created but the
      // Firestore linking write then fails, the employee record is left in
      // an honest PENDING_ACTIVATION (with activationError) rather than a
      // silently-fabricated ACTIVE state — see ACCOUNT_STATUS_TRANSITIONS.
      case 'activateAccount': {
        const { employeeId, email, password, field, lands, vehicleEligible } = body;
        if (!isNonEmptyString(employeeId) || !isNonEmptyString(email)) {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'employeeId_and_email_required' });
        }
        const employee = await findEmployee(db, employeeId);
        if (!employee) return sendJson(res, 404, { error: 'employee_not_found' });

        const decision = assertCanManageEmployee(caller, {
          targetOrganizationId: employee.data.organizationId, targetDepartment: employee.data.department,
        });
        if (!decision.allowed) return sendJson(res, 403, { error: 'forbidden', reason: decision.reason });

        const currentStatus = employee.data.accountStatus || ACCOUNT_STATUS.NO_ACCOUNT;
        if (!canTransitionAccountStatus(currentStatus, ACCOUNT_STATUS.PENDING_ACTIVATION)) {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'account_already_active_or_invalid_state' });
        }

        const fieldSel = validateFieldSelection(field);
        if (!fieldSel.ok) return sendJson(res, 400, { error: 'invalid_request', reason: fieldSel.reason });
        const landsSel = validateLandsSelection(lands);
        if (!landsSel.ok) return sendJson(res, 400, { error: 'invalid_request', reason: landsSel.reason });
        if (isNonEmptyString(password)) {
          const policyFailure = passwordPolicyReason(password, { email, name: employee.data.name });
          if (policyFailure) return sendJson(res, 400, { error: 'invalid_request', reason: policyFailure });
        }
        if (vehicleEligible !== undefined && typeof vehicleEligible !== 'boolean') {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'invalid_vehicle_eligible' });
        }

        await employee.ref.set({ accountStatus: ACCOUNT_STATUS.PENDING_ACTIVATION, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

        const createParams = { email: email.trim(), disabled: false, displayName: employee.data.name || undefined };
        if (isNonEmptyString(password)) createParams.password = password; // set, never stored
        let userRecord;
        try {
          userRecord = await auth.createUser(createParams);
        } catch (e) {
          // Auth account itself never got created — honest rollback to
          // NO_ACCOUNT, never left stuck in PENDING_ACTIVATION.
          await employee.ref.set({ accountStatus: ACCOUNT_STATUS.NO_ACCOUNT, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          throw e;
        }

        const products = {
          field: { enabled: fieldSel.enabled, role: fieldSel.enabled ? fieldSel.role : null },
          lands: { enabled: landsSel.enabled, role: landsSel.enabled ? landsSel.role : null },
          mobility: {
            enabled: fieldSel.enabled && ['mobility_head', 'department_head', 'administrative_affairs', 'employee'].includes(fieldSel.role),
            role: fieldSel.enabled && ['mobility_head', 'department_head', 'administrative_affairs', 'employee'].includes(fieldSel.role) ? fieldSel.role : null,
            // Phase 03B.1 hotfix: fail-safe default — an activation that
            // doesn't explicitly grant vehicleEligible leaves it false.
            vehicleEligible: vehicleEligible === true,
          },
        };

        try {
          await db.runTransaction(async (tx) => {
            const userDoc = {
              uid: userRecord.uid,
              email: email.trim(),
              name: employee.data.name || '',
              role: fieldSel.enabled ? fieldSel.role : null,
              organizationId: employee.data.organizationId,
              department: employee.data.department || null,
              active: true,
              employeeId,
              vehicleEligible: products.mobility.vehicleEligible,
              createdBy: caller.uid,
              createdAt: FieldValue.serverTimestamp(),
              ...(isNonEmptyString(password) ? { mustChangePassword: true } : {}),
              ...(landsSel.enabled ? { landsAccess: { enabled: true, role: landsSel.role, requestedBy: caller.uid, requestedAt: FieldValue.serverTimestamp(), syncStatus: 'pending_trusted_sync' } } : {}),
            };
            tx.set(db.collection('users').doc(userRecord.uid), userDoc);
            tx.set(employee.ref, {
              accountStatus: ACCOUNT_STATUS.ACTIVE,
              authUid: userRecord.uid,
              products,
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          });
        } catch (linkError) {
          // The Auth account DOES exist at this point, but the Firestore
          // linking write failed — an honest degraded state, not a fake
          // success. The Auth account can be re-linked by retrying
          // activateAccount for the same employee once the underlying
          // failure is fixed; it is never silently reported as ACTIVE.
          await employee.ref.set({
            accountStatus: ACCOUNT_STATUS.PENDING_ACTIVATION,
            activationError: (linkError && linkError.message) || 'activation_link_failed',
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          await recordAdminAudit(db, { caller, organizationId: employee.data.organizationId, targetEmployeeId: employeeId, action: 'employee_activate_partial_failure' });
          return sendJson(res, 502, { error: 'activation_incomplete', reason: 'firestore_link_failed', employeeId, authUid: userRecord.uid });
        }

        await recordAdminAudit(db, {
          caller, organizationId: employee.data.organizationId, targetEmployeeId: employeeId, action: 'employee_activate',
          detail: { field: products.field, lands: products.lands },
        });

        return sendJson(res, 200, {
          employeeId, authUid: userRecord.uid, accountStatus: ACCOUNT_STATUS.ACTIVE,
          mustChangePassword: isNonEmptyString(password), products,
        });
      }

      // ---- suspend / reactivate an already-activated account ----
      case 'setAccountStatus': {
        const { employeeId, status } = body;
        if (!isNonEmptyString(employeeId) || (status !== ACCOUNT_STATUS.ACTIVE && status !== ACCOUNT_STATUS.SUSPENDED)) {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'employeeId_and_valid_status_required' });
        }
        const employee = await findEmployee(db, employeeId);
        if (!employee) return sendJson(res, 404, { error: 'employee_not_found' });

        const decision = assertCanManageEmployee(caller, {
          targetOrganizationId: employee.data.organizationId, targetDepartment: employee.data.department, targetAuthUid: employee.data.authUid,
        });
        if (!decision.allowed) return sendJson(res, 403, { error: 'forbidden', reason: decision.reason });

        const currentStatus = employee.data.accountStatus || ACCOUNT_STATUS.NO_ACCOUNT;
        if (!canTransitionAccountStatus(currentStatus, status)) {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'illegal_account_status_transition' });
        }
        if (!isNonEmptyString(employee.data.authUid)) {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'no_linked_account' });
        }

        const activate = status === ACCOUNT_STATUS.ACTIVE;
        await auth.updateUser(employee.data.authUid, { disabled: !activate });
        await db.collection('users').doc(employee.data.authUid).set({ active: activate, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await employee.ref.set({ accountStatus: status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

        await recordAdminAudit(db, { caller, organizationId: employee.data.organizationId, targetEmployeeId: employeeId, action: activate ? 'employee_reactivate' : 'employee_suspend' });
        return sendJson(res, 200, { employeeId, accountStatus: status });
      }

      // ---- change an active employee's product entitlements ----
      case 'assignProducts': {
        const { employeeId, field, lands, vehicleEligible } = body;
        if (!isNonEmptyString(employeeId)) return sendJson(res, 400, { error: 'employeeId_required' });
        const employee = await findEmployee(db, employeeId);
        if (!employee) return sendJson(res, 404, { error: 'employee_not_found' });

        // Authorization is checked BEFORE any business-state validity check
        // (e.g. "no linked account"), so a caller without scope over this
        // employee never learns anything about the employee's state.
        const decision = assertCanManageEmployee(caller, {
          targetOrganizationId: employee.data.organizationId, targetDepartment: employee.data.department, targetAuthUid: employee.data.authUid,
        });
        if (!decision.allowed) return sendJson(res, 403, { error: 'forbidden', reason: decision.reason });

        if (!isNonEmptyString(employee.data.authUid)) {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'no_linked_account' });
        }

        const fieldSel = validateFieldSelection(field);
        if (!fieldSel.ok) return sendJson(res, 400, { error: 'invalid_request', reason: fieldSel.reason });
        const landsSel = validateLandsSelection(lands);
        if (!landsSel.ok) return sendJson(res, 400, { error: 'invalid_request', reason: landsSel.reason });
        if (!fieldSel.present && !landsSel.present && vehicleEligible === undefined) {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'no_changes_requested' });
        }
        if (vehicleEligible !== undefined && typeof vehicleEligible !== 'boolean') {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'invalid_vehicle_eligible' });
        }

        const userRef = db.collection('users').doc(employee.data.authUid);
        const userUpdate = { updatedAt: FieldValue.serverTimestamp() };
        if (fieldSel.present) userUpdate.role = fieldSel.role;
        if (landsSel.present) {
          userUpdate.landsAccess = landsSel.enabled
            ? { enabled: true, role: landsSel.role, requestedBy: caller.uid, requestedAt: FieldValue.serverTimestamp(), syncStatus: 'pending_trusted_sync' }
            : FieldValue.delete();
        }
        if (vehicleEligible !== undefined) userUpdate.vehicleEligible = vehicleEligible;
        await userRef.set(userUpdate, { merge: true });

        const existingProducts = employee.data.products || { field: {}, lands: {}, mobility: {} };
        const nextFieldEnabled = fieldSel.present ? fieldSel.enabled : Boolean(existingProducts.field && existingProducts.field.enabled);
        const nextFieldRole = fieldSel.present ? (fieldSel.enabled ? fieldSel.role : null) : (existingProducts.field && existingProducts.field.role) || null;
        const isMobilityRole = ['mobility_head', 'department_head', 'administrative_affairs', 'employee'].includes(nextFieldRole);
        const products = {
          field: { enabled: nextFieldEnabled && !isMobilityRole, role: nextFieldEnabled && !isMobilityRole ? nextFieldRole : null },
          lands: {
            enabled: landsSel.present ? landsSel.enabled : Boolean(existingProducts.lands && existingProducts.lands.enabled),
            role: landsSel.present ? (landsSel.enabled ? landsSel.role : null) : (existingProducts.lands && existingProducts.lands.role) || null,
          },
          mobility: {
            enabled: nextFieldEnabled && isMobilityRole,
            role: nextFieldEnabled && isMobilityRole ? nextFieldRole : null,
            // Phase 03B.1 hotfix: fail-safe default — preserve the
            // existing REAL value (only true stays eligible) when this
            // call doesn't explicitly change it; never invent eligibility.
            vehicleEligible: vehicleEligible !== undefined ? vehicleEligible : (existingProducts.mobility ? existingProducts.mobility.vehicleEligible === true : false),
          },
        };
        await employee.ref.set({ products, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

        await recordAdminAudit(db, {
          caller, organizationId: employee.data.organizationId, targetEmployeeId: employeeId, action: 'employee_assign_products',
          detail: { field: fieldSel.present ? { enabled: fieldSel.enabled, role: fieldSel.role } : undefined, lands: landsSel.present ? { enabled: landsSel.enabled, role: landsSel.role } : undefined, vehicleEligible },
        });
        return sendJson(res, 200, { employeeId, products });
      }

      // ---- change ONLY vehicle eligibility, without touching role/products ----
      case 'setVehicleEligible': {
        const { employeeId, vehicleEligible } = body;
        if (!isNonEmptyString(employeeId) || typeof vehicleEligible !== 'boolean') {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'employeeId_and_vehicleEligible_boolean_required' });
        }
        const employee = await findEmployee(db, employeeId);
        if (!employee) return sendJson(res, 404, { error: 'employee_not_found' });

        const decision = assertCanManageEmployee(caller, {
          targetOrganizationId: employee.data.organizationId, targetDepartment: employee.data.department, targetAuthUid: employee.data.authUid,
        });
        if (!decision.allowed) return sendJson(res, 403, { error: 'forbidden', reason: decision.reason });

        if (!isNonEmptyString(employee.data.authUid)) {
          return sendJson(res, 400, { error: 'invalid_request', reason: 'no_linked_account' });
        }

        await db.collection('users').doc(employee.data.authUid).set({ vehicleEligible, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        const existingProducts = employee.data.products || {};
        const products = { ...existingProducts, mobility: { ...(existingProducts.mobility || {}), vehicleEligible } };
        await employee.ref.set({ products, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

        await recordAdminAudit(db, { caller, organizationId: employee.data.organizationId, targetEmployeeId: employeeId, action: 'employee_set_vehicle_eligible', detail: { vehicleEligible } });
        return sendJson(res, 200, { employeeId, vehicleEligible });
      }

      // ---- transfer department/administration/direct manager — manager/owner only ----
      case 'transfer': {
        const { employeeId, administration, department, directManagerEmployeeId } = body;
        if (!isNonEmptyString(employeeId)) return sendJson(res, 400, { error: 'employeeId_required' });
        const employee = await findEmployee(db, employeeId);
        if (!employee) return sendJson(res, 404, { error: 'employee_not_found' });

        // Cross-department moves are a manager/owner authority only —
        // a department_head is explicitly denied here (they may not
        // transfer employees across departments).
        if (!caller.isOwner && !caller.isManager) {
          return sendJson(res, 403, { error: 'forbidden', reason: 'transfer_requires_manager_or_owner' });
        }
        const decision = assertCanManageEmployee(caller, { targetOrganizationId: employee.data.organizationId, targetDepartment: employee.data.department });
        if (!decision.allowed) return sendJson(res, 403, { error: 'forbidden', reason: decision.reason });

        const before = {
          administration: employee.data.administration || null,
          department: employee.data.department || null,
          directManagerEmployeeId: employee.data.directManagerEmployeeId || null,
        };
        const update = { updatedAt: FieldValue.serverTimestamp() };
        if (administration !== undefined) update.administration = isNonEmptyString(administration) ? administration.trim() : null;
        if (department !== undefined) update.department = isNonEmptyString(department) ? department.trim() : null;
        if (directManagerEmployeeId !== undefined) update.directManagerEmployeeId = isNonEmptyString(directManagerEmployeeId) ? directManagerEmployeeId.trim() : null;

        // History is append-only (a new subcollection doc per transfer) —
        // the employee's current fields are updated, but the prior state is
        // never destroyed.
        const historyRef = db.collection(`employees/${employeeId}/transferHistory`).doc();
        await historyRef.set({
          before, after: { administration: update.administration !== undefined ? update.administration : before.administration, department: update.department !== undefined ? update.department : before.department, directManagerEmployeeId: update.directManagerEmployeeId !== undefined ? update.directManagerEmployeeId : before.directManagerEmployeeId },
          changedBy: caller.uid, changedAt: FieldValue.serverTimestamp(),
        });
        await employee.ref.set(update, { merge: true });
        // Keep the linked users/{uid} department in sync so Mobility's own
        // department-scoped rules see the same department immediately.
        if (department !== undefined && isNonEmptyString(employee.data.authUid)) {
          await db.collection('users').doc(employee.data.authUid).set({ department: update.department, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }

        await recordAdminAudit(db, { caller, organizationId: employee.data.organizationId, targetEmployeeId: employeeId, action: 'employee_transfer', detail: { before, after: update } });
        return sendJson(res, 200, { employeeId, administration: update.administration, department: update.department, directManagerEmployeeId: update.directManagerEmployeeId });
      }

      default:
        return sendJson(res, 400, { error: 'unknown_action' });
    }
  } catch (e) {
    const failure = safeAdminFailure(e);
    return sendJson(res, failure.statusCode, { error: 'request_failed', reason: failure.reason });
  }
}

module.exports = handler;
module.exports._test = { safeEmployee, resolveProductEntitlements };
