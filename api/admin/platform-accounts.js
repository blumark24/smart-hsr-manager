'use strict';

// SMART HSR platform account administration.
// Owner-only server API. No client writes to owners/platformAssistants.
// Product limits: max 3 Owner accounts + max 3 Administrative Assistant accounts.

const { getAuth, getDb, FieldValue } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, getCallerContext } = require('../_lib/authz');

const OWNER_COLLECTION = 'owners';
const ASSISTANT_COLLECTION = 'platformAssistants';
const AUDIT_COLLECTION = 'platformAdminAuditEvents';
const MAX_ACCOUNTS_PER_ROLE = 3;

const ASSISTANT_PERMISSION_KEYS = Object.freeze([
  'organizations.read',
  'organizations.manage',
  'support.read',
  'support.manage',
  'billing.read',
  'billing.manage',
  'reports.read',
  'integrations.read',
]);

const DEFAULT_ASSISTANT_PERMISSIONS = Object.freeze({
  'organizations.read': true,
  'organizations.manage': false,
  'support.read': true,
  'support.manage': true,
  'billing.read': false,
  'billing.manage': false,
  'reports.read': true,
  'integrations.read': false,
});

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
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
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { return {}; }
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validEmail(value) {
  const email = clean(value).toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function strongPassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) return false;
  return /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

function normalizePermissions(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const result = {};
  for (const key of ASSISTANT_PERMISSION_KEYS) result[key] = source[key] === true;
  return result;
}

async function audit(db, callerUid, action, targetUid, detail = {}) {
  const safeDetail = {};
  for (const [key, value] of Object.entries(detail || {})) {
    if (['password', 'newPassword', 'token', 'credential'].includes(key)) continue;
    safeDetail[key] = value;
  }
  await db.collection(AUDIT_COLLECTION).add({
    actorUid: callerUid,
    actorRole: 'owner',
    action,
    targetUid: targetUid || null,
    detail: safeDetail,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function requireOwner(req) {
  const decoded = await verifyRequestToken(req);
  const caller = await getCallerContext(decoded.uid);
  if (!caller || !caller.isOwner) {
    const error = new Error('owner_required');
    error.statusCode = 403;
    throw error;
  }
  return caller;
}

async function accountRecord(db, uid) {
  const [ownerSnap, assistantSnap] = await Promise.all([
    db.collection(OWNER_COLLECTION).doc(uid).get(),
    db.collection(ASSISTANT_COLLECTION).doc(uid).get(),
  ]);
  if (ownerSnap.exists) return { type: 'owner', ref: ownerSnap.ref, data: ownerSnap.data() || {} };
  if (assistantSnap.exists) return { type: 'assistant', ref: assistantSnap.ref, data: assistantSnap.data() || {} };
  return null;
}

async function activeOwnerCount(db) {
  const snap = await db.collection(OWNER_COLLECTION).get();
  return snap.docs.filter((doc) => (doc.data() || {}).active !== false).length;
}

async function collectionCount(db, type) {
  const name = type === 'owner' ? OWNER_COLLECTION : ASSISTANT_COLLECTION;
  const snap = await db.collection(name).get();
  return snap.size;
}

async function listAccounts(db, auth) {
  const [owners, assistants] = await Promise.all([
    db.collection(OWNER_COLLECTION).get(),
    db.collection(ASSISTANT_COLLECTION).get(),
  ]);
  const docs = [
    ...owners.docs.map((d) => ({ uid: d.id, type: 'owner', data: d.data() || {} })),
    ...assistants.docs.map((d) => ({ uid: d.id, type: 'assistant', data: d.data() || {} })),
  ];
  const accounts = [];
  for (const item of docs) {
    let user = null;
    try { user = await auth.getUser(item.uid); } catch (_) {}
    accounts.push({
      uid: item.uid,
      type: item.type,
      name: clean(item.data.name) || (user && user.displayName) || '',
      email: (user && user.email) || clean(item.data.email),
      active: item.data.active !== false && !(user && user.disabled),
      disabledInAuth: Boolean(user && user.disabled),
      permissions: item.type === 'assistant' ? normalizePermissions(item.data.permissions) : null,
      lastSignInTime: user && user.metadata ? user.metadata.lastSignInTime || null : null,
      createdAt: item.data.createdAt && typeof item.data.createdAt.toDate === 'function'
        ? item.data.createdAt.toDate().toISOString()
        : null,
    });
  }
  return accounts;
}

async function createAccount({ db, auth, caller, body }) {
  const type = body.type === 'assistant' ? 'assistant' : body.type === 'owner' ? 'owner' : '';
  const email = clean(body.email).toLowerCase();
  const name = clean(body.name);
  const password = body.password;
  if (!type) return { status: 400, body: { error: 'invalid_account_type' } };
  if (!validEmail(email)) return { status: 400, body: { error: 'invalid_email' } };
  if (!strongPassword(password)) return { status: 400, body: { error: 'weak_password', policy: '12+ chars with upper, lower, number and symbol' } };
  if (await collectionCount(db, type) >= MAX_ACCOUNTS_PER_ROLE) {
    return { status: 409, body: { error: 'account_limit_reached', max: MAX_ACCOUNTS_PER_ROLE, type } };
  }

  let createdUser = null;
  try {
    createdUser = await auth.createUser({ email, password, displayName: name || undefined, disabled: false, emailVerified: false });
    const now = FieldValue.serverTimestamp();
    if (type === 'owner') {
      await db.collection(OWNER_COLLECTION).doc(createdUser.uid).set({
        role: 'owner', active: true, name, email, createdAt: now, updatedAt: now, createdByUid: caller.uid,
      });
    } else {
      await db.collection(ASSISTANT_COLLECTION).doc(createdUser.uid).set({
        role: 'administrative_assistant', active: true, name, email,
        permissions: body.permissions ? normalizePermissions(body.permissions) : DEFAULT_ASSISTANT_PERMISSIONS,
        createdAt: now, updatedAt: now, createdByUid: caller.uid,
      });
    }
    await audit(db, caller.uid, 'platform_account_create', createdUser.uid, { type, email });
    return { status: 201, body: { ok: true, uid: createdUser.uid, type, email } };
  } catch (error) {
    if (createdUser) {
      try { await auth.deleteUser(createdUser.uid); } catch (_) {}
    }
    if (error && error.code === 'auth/email-already-exists') return { status: 409, body: { error: 'email_already_exists' } };
    throw error;
  }
}

async function updateEmail({ db, auth, caller, body }) {
  const uid = clean(body.uid);
  const email = clean(body.email).toLowerCase();
  if (!uid || !validEmail(email)) return { status: 400, body: { error: 'invalid_request' } };
  const record = await accountRecord(db, uid);
  if (!record) return { status: 404, body: { error: 'account_not_found' } };
  try {
    await auth.updateUser(uid, { email, emailVerified: false });
  } catch (error) {
    if (error && error.code === 'auth/email-already-exists') return { status: 409, body: { error: 'email_already_exists' } };
    throw error;
  }
  await record.ref.set({ email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await auth.revokeRefreshTokens(uid);
  await audit(db, caller.uid, 'platform_account_email_change', uid, { type: record.type, email });
  return { status: 200, body: { ok: true, reauthRequired: uid === caller.uid } };
}

async function setPassword({ db, auth, caller, body }) {
  const uid = clean(body.uid);
  const password = body.password;
  if (!uid || !strongPassword(password)) {
    return { status: 400, body: { error: 'weak_password', policy: '12+ chars with upper, lower, number and symbol' } };
  }
  const record = await accountRecord(db, uid);
  if (!record) return { status: 404, body: { error: 'account_not_found' } };
  await auth.updateUser(uid, { password });
  await auth.revokeRefreshTokens(uid);
  await record.ref.set({ passwordChangedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(db, caller.uid, 'platform_account_password_change', uid, { type: record.type });
  return { status: 200, body: { ok: true, reauthRequired: uid === caller.uid } };
}

async function setActive({ db, auth, caller, body }) {
  const uid = clean(body.uid);
  const active = body.active === true;
  if (!uid) return { status: 400, body: { error: 'uid_required' } };
  const record = await accountRecord(db, uid);
  if (!record) return { status: 404, body: { error: 'account_not_found' } };
  if (record.type === 'owner' && !active && record.data.active !== false) {
    if (await activeOwnerCount(db) <= 1) return { status: 409, body: { error: 'last_active_owner_protected' } };
  }
  await auth.updateUser(uid, { disabled: !active });
  await record.ref.set({ active, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (!active) await auth.revokeRefreshTokens(uid);
  await audit(db, caller.uid, active ? 'platform_account_activate' : 'platform_account_deactivate', uid, { type: record.type });
  return { status: 200, body: { ok: true } };
}

async function setAssistantPermissions({ db, caller, body }) {
  const uid = clean(body.uid);
  if (!uid) return { status: 400, body: { error: 'uid_required' } };
  const record = await accountRecord(db, uid);
  if (!record || record.type !== 'assistant') return { status: 404, body: { error: 'assistant_not_found' } };
  const permissions = normalizePermissions(body.permissions);
  await record.ref.set({ permissions, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(db, caller.uid, 'platform_assistant_permissions_change', uid, { permissions });
  return { status: 200, body: { ok: true, permissions } };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }
  try {
    const caller = await requireOwner(req);
    const body = await readJsonBody(req);
    const action = clean(body.action);
    const db = getDb();
    const auth = getAuth();

    if (action === 'list') {
      const accounts = await listAccounts(db, auth);
      return sendJson(res, 200, {
        ok: true,
        maxPerRole: MAX_ACCOUNTS_PER_ROLE,
        accounts,
        assistantPermissionKeys: ASSISTANT_PERMISSION_KEYS,
      });
    }

    let result;
    if (action === 'create') result = await createAccount({ db, auth, caller, body });
    else if (action === 'updateEmail') result = await updateEmail({ db, auth, caller, body });
    else if (action === 'setPassword') result = await setPassword({ db, auth, caller, body });
    else if (action === 'setActive') result = await setActive({ db, auth, caller, body });
    else if (action === 'setAssistantPermissions') result = await setAssistantPermissions({ db, caller, body });
    else if (action === 'revokeSessions') {
      const uid = clean(body.uid);
      const record = uid ? await accountRecord(db, uid) : null;
      if (!record) result = { status: 404, body: { error: 'account_not_found' } };
      else {
        await auth.revokeRefreshTokens(uid);
        await audit(db, caller.uid, 'platform_account_revoke_sessions', uid, { type: record.type });
        result = { status: 200, body: { ok: true } };
      }
    } else result = { status: 400, body: { error: 'unsupported_action' } };

    return sendJson(res, result.status, result.body);
  } catch (error) {
    const status = Number(error && error.statusCode) || 500;
    const message = status >= 500 ? 'internal_error' : clean(error.message) || 'request_failed';
    if (status >= 500) console.error('platform-accounts', error);
    return sendJson(res, status, { error: message });
  }
};
