'use strict';

const { FieldValue } = require('./firebaseAdmin');

const CHANGE_EMAIL_KEYS = new Set(['action', 'employeeId', 'email', 'confirmEmail']);
const HISTORY_KEYS = new Set(['action', 'employeeId']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENSITIVE_DETAIL_KEY = /(password|token|secret|credential|authorization)/i;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeEmail(value) {
  return isNonEmptyString(value) ? value.trim().toLowerCase() : '';
}

function validEmail(value) {
  return value.length <= 254 && EMAIL_RE.test(value);
}

function safeAuthFailure(error) {
  const code = error && (error.code || (error.errorInfo && error.errorInfo.code));
  if (code === 'auth/email-already-exists' || code === 'auth/email-already-in-use') return { statusCode: 409, reason: 'email_already_exists' };
  if (code === 'auth/invalid-email') return { statusCode: 400, reason: 'invalid_email' };
  if (code === 'auth/user-not-found') return { statusCode: 409, reason: 'linked_auth_user_not_found' };
  return { statusCode: 500, reason: 'temporary_failure' };
}

function sanitizeDetail(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 25).map(item => sanitizeDetail(item, depth + 1));
  if (typeof value !== 'object') return String(value).slice(0, 500);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_DETAIL_KEY.test(key)) continue;
    out[key] = sanitizeDetail(item, depth + 1);
  }
  return out;
}

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  return null;
}

function eventFromDoc(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    action: typeof data.action === 'string' ? data.action : 'unknown',
    actorId: typeof data.actorId === 'string' ? data.actorId : null,
    actorRole: typeof data.actorRole === 'string' ? data.actorRole : null,
    createdAt: timestampToIso(data.createdAt),
    detail: sanitizeDetail(data.detail || null),
  };
}

async function changeLoginEmail({ res, body, db, auth, caller, employeeId, employeeRef, current, sendJson }) {
  if (Object.keys(body).some(key => !CHANGE_EMAIL_KEYS.has(key))) {
    return sendJson(res, 400, { error: 'invalid_request', reason: 'protected_or_unknown_field' });
  }
  if (!isNonEmptyString(current.authUid)) {
    return sendJson(res, 409, { error: 'invalid_request', reason: 'no_linked_account' });
  }

  const email = normalizeEmail(body.email);
  const confirmEmail = normalizeEmail(body.confirmEmail);
  if (!email || !validEmail(email)) return sendJson(res, 400, { error: 'invalid_request', reason: 'invalid_email' });
  if (!confirmEmail || email !== confirmEmail) return sendJson(res, 400, { error: 'invalid_request', reason: 'email_confirmation_mismatch' });

  let authUser;
  try {
    authUser = await auth.getUser(current.authUid);
  } catch (error) {
    const failure = safeAuthFailure(error);
    return sendJson(res, failure.statusCode, { error: 'invalid_request', reason: failure.reason });
  }

  const oldAuthEmail = normalizeEmail(authUser.email);
  const oldEmployeeEmail = normalizeEmail(current.email);
  if (email === oldAuthEmail && email === oldEmployeeEmail) {
    return sendJson(res, 400, { error: 'invalid_request', reason: 'no_changes_requested' });
  }

  try {
    await auth.updateUser(current.authUid, { email });
  } catch (error) {
    const failure = safeAuthFailure(error);
    return sendJson(res, failure.statusCode, { error: 'invalid_request', reason: failure.reason });
  }

  try {
    await auth.revokeRefreshTokens(current.authUid);
  } catch (_) {
    try { if (oldAuthEmail) await auth.updateUser(current.authUid, { email: oldAuthEmail }); } catch (_) {}
    return sendJson(res, 502, { error: 'request_failed', reason: 'session_revocation_failed' });
  }

  const userRef = db.collection('users').doc(current.authUid);
  const auditRef = db.collection('adminAuditEvents').doc();
  try {
    await db.runTransaction(async tx => {
      tx.set(userRef, { email, updatedAt: FieldValue.serverTimestamp(), sessionsRevokedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(employeeRef, { email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(auditRef, {
        organizationId: caller.organizationId,
        actorId: caller.uid,
        actorRole: caller.role,
        targetEmployeeId: employeeId,
        targetUid: current.authUid,
        action: 'employee_login_email_change',
        detail: { oldEmail: oldAuthEmail || oldEmployeeEmail || null, newEmail: email, sessionsRevoked: true },
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (_) {
    let rolledBack = false;
    if (oldAuthEmail) {
      try {
        await auth.updateUser(current.authUid, { email: oldAuthEmail });
        rolledBack = true;
      } catch (_) {}
    }
    if (!rolledBack && oldAuthEmail) {
      try {
        await db.collection('adminAuditEvents').add({
          organizationId: caller.organizationId,
          actorId: caller.uid,
          actorRole: caller.role,
          targetEmployeeId: employeeId,
          targetUid: current.authUid,
          action: 'employee_login_email_reconciliation_required',
          detail: { expectedEmail: oldAuthEmail, authEmail: email },
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (_) {}
      return sendJson(res, 500, { error: 'request_failed', reason: 'reconciliation_required' });
    }
    return sendJson(res, 500, { error: 'request_failed', reason: 'temporary_failure' });
  }

  return sendJson(res, 200, { employeeId, authUid: current.authUid, email, sessionsRevoked: true });
}

async function listHistory({ res, body, db, caller, current, employeeId, sendJson }) {
  if (Object.keys(body).some(key => !HISTORY_KEYS.has(key))) {
    return sendJson(res, 400, { error: 'invalid_request', reason: 'protected_or_unknown_field' });
  }

  const snapshots = [];
  snapshots.push(await db.collection('adminAuditEvents').where('targetEmployeeId', '==', employeeId).get());
  if (isNonEmptyString(current.authUid)) {
    snapshots.push(await db.collection('adminAuditEvents').where('targetUid', '==', current.authUid).get());
  }

  const seen = new Set();
  const events = [];
  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs || []) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      const data = doc.data() || {};
      if (data.organizationId !== caller.organizationId) continue;
      events.push(eventFromDoc(doc));
    }
  }

  events.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return sendJson(res, 200, { employeeId, events: events.slice(0, 200) });
}

async function handleExtendedUserCenterAction(context) {
  const { body } = context;
  if (body.action === 'userCenter.changeLoginEmail') return changeLoginEmail(context);
  if (body.action === 'userCenter.listHistory') return listHistory(context);
  return context.sendJson(context.res, 400, { error: 'invalid_request', reason: 'unknown_action' });
}

module.exports = {
  handleExtendedUserCenterAction,
  _test: { normalizeEmail, validEmail, sanitizeDetail, timestampToIso, CHANGE_EMAIL_KEYS, HISTORY_KEYS },
};
