'use strict';

// SMART HSR owner operations + support CRM helpers.
// This module lives under api/_lib, so it does NOT create another Vercel Function.
// All reads/writes execute through api/admin/users.js after Firebase token verification.

const { passwordPolicyReason } = require('./serviceEntitlements');

const OWNER_ACTIONS = new Set([
  'ownerOpsSnapshot',
  'ownerAuditTenantIdentity',
  'ownerCreateOrganizationWithManager',
  'ownerSetManagerPassword',
  'ownerSupportList',
  'ownerSupportThreadGet',
  'ownerSupportReply',
  'ownerSupportSetStatus',
  'ownerArchiveOrganization',
  'ownerRestoreOrganization',
  'ownerSetOrganizationSpatialContext',
  'ownerInvoiceUpdate',
  'ownerInvoiceArchive',
  'ownerInvoiceDelete',
]);

const MANAGER_SUPPORT_ACTIONS = new Set([
  'supportThreadOpen',
  'supportThreadGet',
  'supportThreadSend',
  'supportThreadMarkRead',
]);

const MAX_MESSAGE_LENGTH = 4000;
const MAX_AUDIT_EVENTS = 120;
const SUPPORT_THREAD_LIMIT = 60;
const SUPPORT_MESSAGE_LIMIT = 120;

function cleanText(value, max = MAX_MESSAGE_LENGTH) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function timestampIso(value) {
  if (!value) return null;
  try {
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch (_) {
    return null;
  }
}

function safeEvent(doc, source) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    source,
    action: cleanText(data.action, 120) || 'unknown',
    actorId: cleanText(data.actorId || data.actorUid, 160) || null,
    actorRole: cleanText(data.actorRole, 80) || null,
    organizationId: cleanText(data.organizationId, 160) || null,
    targetUid: cleanText(data.targetUid, 160) || null,
    resourceType: cleanText(data.resourceType, 100) || null,
    resourceId: cleanText(data.resourceId, 160) || null,
    fromStatus: cleanText(data.fromStatus, 80) || null,
    toStatus: cleanText(data.toStatus, 80) || null,
    at: timestampIso(data.createdAt || data.timestamp || data.updatedAt),
  };
}

function safeThread(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    organizationId: cleanText(data.organizationId, 160) || doc.id,
    organizationName: cleanText(data.organizationName, 180),
    managerUid: cleanText(data.managerUid, 160) || null,
    status: ['open', 'pending', 'resolved'].includes(data.status) ? data.status : 'open',
    lastMessagePreview: cleanText(data.lastMessagePreview, 240),
    lastSenderRole: cleanText(data.lastSenderRole, 40) || null,
    unreadOwner: Math.max(0, number(data.unreadOwner)),
    unreadManager: Math.max(0, number(data.unreadManager)),
    createdAt: timestampIso(data.createdAt),
    updatedAt: timestampIso(data.updatedAt || data.lastMessageAt),
  };
}

function safeMessage(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    senderRole: ['manager', 'owner', 'system'].includes(data.senderRole) ? data.senderRole : 'system',
    text: cleanText(data.text),
    kind: cleanText(data.kind, 40) || 'message',
    createdAt: timestampIso(data.createdAt),
  };
}

async function getMessages(threadRef) {
  const snap = await threadRef.collection('messages')
    .orderBy('createdAt', 'asc')
    .limit(SUPPORT_MESSAGE_LIMIT)
    .get();
  return snap.docs.map(safeMessage);
}

async function requireCaller(decoded, getCallerContext) {
  const caller = await getCallerContext(decoded.uid);
  return caller || {};
}

async function requireOwner(decoded, getCallerContext, sendJson, res) {
  const caller = await requireCaller(decoded, getCallerContext);
  if (!caller.isOwner) {
    sendJson(res, 403, { error: 'forbidden', reason: 'owner_required' });
    return null;
  }
  return caller;
}

async function requireManager(decoded, getCallerContext, sendJson, res) {
  const caller = await requireCaller(decoded, getCallerContext);
  if (!caller.isManager || !cleanText(caller.organizationId, 160)) {
    sendJson(res, 403, { error: 'forbidden', reason: 'manager_required' });
    return null;
  }
  return caller;
}

async function readLimited(db, collectionName, limit) {
  try {
    const snap = await db.collection(collectionName).limit(limit).get();
    return { ok: true, docs: snap.docs };
  } catch (error) {
    return { ok: false, docs: [], error: cleanText(error && error.code || error && error.message, 160) || 'read_failed' };
  }
}

async function buildOwnerOpsSnapshot({ db, auth, decoded, FieldValue }) {
  const [
    organizationsResult,
    invoicesResult,
    ownersResult,
    managersResult,
    usersResult,
    platformAuditResult,
    adminAuditResult,
    workflowAuditResult,
  ] = await Promise.all([
    readLimited(db, 'organizations', 500),
    readLimited(db, 'invoices', 1000),
    readLimited(db, 'owners', 20),
    readLimited(db, 'managers', 1000),
    readLimited(db, 'users', 3000),
    readLimited(db, 'platformAdminAuditEvents', 50),
    readLimited(db, 'adminAuditEvents', 50),
    readLimited(db, 'auditEvents', 80),
  ]);

  const organizations = organizationsResult.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const invoices = invoicesResult.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const owners = ownersResult.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const managers = managersResult.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const users = usersResult.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));

  const orgIds = new Set(organizations.map((org) => org.id));
  const planCounts = {};
  const orgStatusCounts = {};
  for (const org of organizations) {
    const plan = cleanText(org.plan, 80) || 'unspecified';
    const status = cleanText(org.status, 80) || 'unspecified';
    planCounts[plan] = (planCounts[plan] || 0) + 1;
    orgStatusCounts[status] = (orgStatusCounts[status] || 0) + 1;
  }

  const invoiceStatusCounts = {};
  let invoiceTotal = 0;
  let paidTotal = 0;
  let pendingTotal = 0;
  for (const invoice of invoices) {
    const status = cleanText(invoice.status, 80) || 'unspecified';
    const total = number(invoice.total);
    invoiceStatusCounts[status] = (invoiceStatusCounts[status] || 0) + 1;
    invoiceTotal += total;
    if (status === 'paid') paidTotal += total;
    else pendingTotal += total;
  }

  const managerOrgCounts = {};
  for (const manager of managers) {
    const orgId = cleanText(manager.organizationId, 160);
    if (orgId) managerOrgCounts[orgId] = (managerOrgCounts[orgId] || 0) + 1;
  }

  const orphanManagers = managers.filter((item) => {
    const orgId = cleanText(item.organizationId, 160);
    return orgId && !orgIds.has(orgId);
  }).length;
  const orphanUsers = users.filter((item) => {
    const orgId = cleanText(item.organizationId, 160);
    return orgId && !orgIds.has(orgId);
  }).length;
  const duplicateManagerOrganizations = Object.values(managerOrgCounts).filter((count) => count > 1).length;

  let currentOwnerAuth = null;
  try {
    const user = await auth.getUser(decoded.uid);
    currentOwnerAuth = {
      uid: user.uid,
      disabled: user.disabled === true,
      emailVerified: user.emailVerified === true,
      lastSignInTime: user.metadata && user.metadata.lastSignInTime || null,
      tokensValidAfterTime: user.tokensValidAfterTime || null,
    };
  } catch (_) {
    currentOwnerAuth = { uid: decoded.uid, lookupFailed: true };
  }

  const audit = [
    ...platformAuditResult.docs.map((doc) => safeEvent(doc, 'platform-admin')),
    ...adminAuditResult.docs.map((doc) => safeEvent(doc, 'admin')),
    ...workflowAuditResult.docs.map((doc) => safeEvent(doc, 'workflow')),
  ]
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    .slice(0, MAX_AUDIT_EVENTS);

  const active = (item) => item.active !== false;
  const healthReads = {
    organizations: organizationsResult.ok,
    invoices: invoicesResult.ok,
    owners: ownersResult.ok,
    managers: managersResult.ok,
    users: usersResult.ok,
    platformAdminAuditEvents: platformAuditResult.ok,
    adminAuditEvents: adminAuditResult.ok,
    auditEvents: workflowAuditResult.ok,
  };
  const readFailures = Object.entries(healthReads).filter(([, ok]) => !ok).map(([name]) => name);

  return {
    ok: true,
    observedAt: new Date().toISOString(),
    audit,
    security: {
      owners: { total: owners.length, active: owners.filter(active).length, inactive: owners.filter((x) => !active(x)).length },
      managers: { total: managers.length, active: managers.filter(active).length, inactive: managers.filter((x) => !active(x)).length },
      users: { total: users.length, active: users.filter(active).length, inactive: users.filter((x) => !active(x)).length },
      orphanManagers,
      orphanUsers,
      duplicateManagerOrganizations,
      ownerLimitExceeded: owners.length > 3,
      currentOwnerAuth,
    },
    reports: {
      organizations: {
        total: organizations.length,
        active: organizations.filter((o) => cleanText(o.status, 80) === 'active').length,
        trial: organizations.filter((o) => cleanText(o.status, 80) === 'trial').length,
        expired: organizations.filter((o) => cleanText(o.status, 80) === 'expired').length,
        plans: planCounts,
        statuses: orgStatusCounts,
      },
      invoices: {
        total: invoices.length,
        grossTotal: invoiceTotal,
        paidTotal,
        outstandingTotal: pendingTotal,
        statuses: invoiceStatusCounts,
      },
      workforce: {
        managers: managers.length,
        operationalUsers: users.length,
        total: managers.length + users.length,
      },
    },
    health: {
      firebaseAdmin: true,
      firestoreReads: healthReads,
      readFailures,
      allCoreReadsHealthy: readFailures.length === 0,
      ownerIdentityHealthy: Boolean(currentOwnerAuth && !currentOwnerAuth.lookupFailed && !currentOwnerAuth.disabled),
      auditSourcesReadable: [platformAuditResult, adminAuditResult, workflowAuditResult].filter((x) => x.ok).length,
      serverTime: new Date().toISOString(),
      functionArchitecture: 'shared-admin-api',
    },
  };
}

async function openManagerThread({ db, caller, decoded, FieldValue }) {
  const threadRef = db.collection('supportThreads').doc(caller.organizationId);
  const snap = await threadRef.get();
  if (!snap.exists) {
    const organizationSnap = await db.collection('organizations').doc(caller.organizationId).get();
    const orgData = organizationSnap.exists ? (organizationSnap.data() || {}) : {};
    const now = FieldValue.serverTimestamp();
    await threadRef.set({
      organizationId: caller.organizationId,
      organizationName: cleanText(orgData.name, 180),
      managerUid: decoded.uid,
      status: 'open',
      unreadOwner: 0,
      unreadManager: 0,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
      lastMessagePreview: '',
      lastSenderRole: 'system',
    });
    await threadRef.collection('messages').add({
      senderRole: 'system',
      kind: 'system',
      text: 'تم فتح قناة الدعم الفني الخاصة بمؤسستك. اكتب المشكلة أو الملاحظة وسيتم حفظها ومتابعتها من فريق SMART HSR.',
      createdAt: now,
    });
  } else {
    await threadRef.set({ managerUid: decoded.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  const current = await threadRef.get();
  return { threadRef, thread: safeThread(current) };
}

async function handleManagerSupport({ action, body, decoded, db, FieldValue, caller, sendJson, res }) {
  const { threadRef, thread } = await openManagerThread({ db, caller, decoded, FieldValue });

  if (action === 'supportThreadOpen') {
    return sendJson(res, 200, { ok: true, thread });
  }

  if (action === 'supportThreadGet' || action === 'supportThreadMarkRead') {
    await threadRef.set({ unreadManager: 0 }, { merge: true });
    const messages = await getMessages(threadRef);
    const fresh = await threadRef.get();
    return sendJson(res, 200, { ok: true, thread: safeThread(fresh), messages });
  }

  if (action === 'supportThreadSend') {
    const text = cleanText(body.text);
    if (!text) return sendJson(res, 400, { error: 'invalid_request', reason: 'message_required' });
    const now = FieldValue.serverTimestamp();
    await threadRef.collection('messages').add({
      senderRole: 'manager',
      senderUid: decoded.uid,
      kind: 'message',
      text,
      createdAt: now,
    });
    await threadRef.set({
      status: 'open',
      updatedAt: now,
      lastMessageAt: now,
      lastMessagePreview: text.slice(0, 240),
      lastSenderRole: 'manager',
      unreadOwner: FieldValue.increment(1),
      unreadManager: 0,
    }, { merge: true });
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 400, { error: 'unknown_action' });
}


async function handleOwnerProvisioning({ action, body, decoded, db, auth, FieldValue, sendJson, res }) {
  if (action === 'ownerCreateOrganizationWithManager') {
    const organization = body && body.organization && typeof body.organization === 'object' ? body.organization : {};
    const manager = body && body.manager && typeof body.manager === 'object' ? body.manager : {};

    const name = cleanText(organization.name, 180);
    const phone = cleanText(organization.phone, 80);
    const plan = cleanText(organization.plan, 80) || 'Trial';
    const billingCycle = cleanText(organization.billingCycle, 40) || 'monthly';
    const status = cleanText(organization.status, 40) || (plan === 'Trial' ? 'trial' : 'active');
    const expiresAt = cleanText(organization.expiresAt, 40);
    const notes = cleanText(organization.notes, 1200);

    const managerName = cleanText(manager.name, 180);
    const email = cleanText(manager.email, 240).toLowerCase();
    const password = typeof manager.password === 'string' ? manager.password : '';

    if (!name || !managerName || !email || !phone || !expiresAt) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'organization_and_manager_fields_required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'manager_email_invalid' });
    }
    if (!['Trial','Basic','Pro','Enterprise'].includes(plan) ||
        !['monthly','yearly'].includes(billingCycle) ||
        !['active','expired','trial'].includes(status)) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'organization_plan_or_status_invalid' });
    }
    const passwordFailure = passwordPolicyReason(password, { email, name: managerName });
    if (passwordFailure) {
      return sendJson(res, 400, { error: 'invalid_request', reason: passwordFailure });
    }

    try {
      await auth.getUserByEmail(email);
      return sendJson(res, 409, { error: 'conflict', reason: 'manager_email_already_exists' });
    } catch (error) {
      if (!error || error.code !== 'auth/user-not-found') throw error;
    }

    const orgRef = db.collection('organizations').doc();
    let managerUser = null;
    try {
      managerUser = await auth.createUser({
        email,
        password,
        displayName: managerName,
        disabled: false,
      });

      const now = FieldValue.serverTimestamp();
      const managerRef = db.collection('managers').doc(managerUser.uid);
      const auditRef = db.collection('platformAdminAuditEvents').doc();

      await db.runTransaction(async transaction => {
        transaction.create(orgRef, {
          name,
          manager: managerName,
          managerUid: managerUser.uid,
          email,
          phone,
          plan,
          billingCycle,
          status,
          expiresAt,
          ...(notes ? { notes } : {}),
          createdByOwnerUid: decoded.uid,
          createdAt: now,
          updatedAt: now,
        });
        transaction.create(managerRef, {
          uid: managerUser.uid,
          email,
          name: managerName,
          role: 'manager',
          organizationId: orgRef.id,
          active: true,
          mustChangePassword: false,
          createdBy: decoded.uid,
          createdAt: now,
          updatedAt: now,
        });
        transaction.create(auditRef, {
          actorUid: decoded.uid,
          actorRole: 'owner',
          action: 'organization_manager_create',
          organizationId: orgRef.id,
          targetUid: managerUser.uid,
          resourceType: 'organization',
          resourceId: orgRef.id,
          detail: { managerCreated: true, managerEmail: email, plan, billingCycle, status },
          createdAt: now,
        });
      });

      return sendJson(res, 200, {
        ok: true,
        organizationId: orgRef.id,
        organizationName: name,
        managerUid: managerUser.uid,
        managerEmail: email,
        managerCreated: true,
      });
    } catch (error) {
      if (managerUser && managerUser.uid) {
        try { await auth.deleteUser(managerUser.uid); } catch (_) { /* best-effort rollback */ }
      }
      if (error && error.code === 'auth/email-already-exists') {
        return sendJson(res, 409, { error: 'conflict', reason: 'manager_email_already_exists' });
      }
      throw error;
    }
  }

  if (action === 'ownerSetManagerPassword') {
    const organizationId = cleanText(body.organizationId, 160);
    const managerUid = cleanText(body.managerUid, 160);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!organizationId || !managerUid || !password) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'organization_manager_password_required' });
    }

    const managerRef = db.collection('managers').doc(managerUid);
    const managerSnap = await managerRef.get();
    if (!managerSnap.exists) return sendJson(res, 404, { error: 'manager_not_found' });
    const manager = managerSnap.data() || {};
    if (cleanText(manager.organizationId, 160) !== organizationId || cleanText(manager.role, 40) !== 'manager') {
      return sendJson(res, 403, { error: 'forbidden', reason: 'manager_organization_mismatch' });
    }

    const passwordFailure = passwordPolicyReason(password, { email: manager.email, name: manager.name });
    if (passwordFailure) {
      return sendJson(res, 400, { error: 'invalid_request', reason: passwordFailure });
    }

    await auth.updateUser(managerUid, { password, disabled: false });
    await auth.revokeRefreshTokens(managerUid);
    const now = FieldValue.serverTimestamp();
    await managerRef.set({
      active: true,
      mustChangePassword: false,
      passwordUpdatedAt: now,
      sessionsRevokedAt: now,
      updatedAt: now,
    }, { merge: true });
    await db.collection('platformAdminAuditEvents').add({
      actorUid: decoded.uid,
      actorRole: 'owner',
      action: 'manager_password_change',
      organizationId,
      targetUid: managerUid,
      resourceType: 'manager',
      resourceId: managerUid,
      detail: { sessionsRevoked: true },
      createdAt: now,
    });
    return sendJson(res, 200, { ok: true, organizationId, managerUid, sessionsRevoked: true });
  }

  return sendJson(res, 400, { error: 'unknown_action' });
}


async function handleOwnerSpatialContext({ body, decoded, db, FieldValue, sendJson, res }) {
  const organizationId = cleanText(body.organizationId, 160);
  const lat = Number(body.mapCenter && body.mapCenter.lat);
  const lng = Number(body.mapCenter && body.mapCenter.lng);
  const zoom = Number(body.mapDefaultZoom);

  if (!organizationId) return sendJson(res, 400, { error: 'invalid_request', reason: 'organizationId_required' });
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lng) || lng < -180 || lng > 180 ||
      !Number.isInteger(zoom) || zoom < 4 || zoom > 19) {
    return sendJson(res, 400, { error: 'invalid_request', reason: 'spatial_context_invalid' });
  }

  const orgRef = db.collection('organizations').doc(organizationId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) return sendJson(res, 404, { error: 'organization_not_found' });

  const now = FieldValue.serverTimestamp();
  await orgRef.set({
    mapCenter: { lat, lng },
    mapDefaultZoom: zoom,
    updatedAt: now,
  }, { merge: true });

  await db.collection('platformAdminAuditEvents').add({
    actorUid: decoded.uid,
    actorRole: 'owner',
    action: 'organization_spatial_context_set',
    organizationId,
    resourceType: 'organization',
    resourceId: organizationId,
    detail: { mapCenter: { lat, lng }, mapDefaultZoom: zoom },
    createdAt: now,
  });

  return sendJson(res, 200, {
    ok: true,
    organizationId,
    mapCenter: { lat, lng },
    mapDefaultZoom: zoom,
  });
}


async function handleOwnerOrganizationLifecycle({ action, body, decoded, db, FieldValue, sendJson, res }) {
  const organizationId = cleanText(body.organizationId, 160);
  if (!organizationId) return sendJson(res, 400, { error: 'invalid_request', reason: 'organizationId_required' });

  const orgRef = db.collection('organizations').doc(organizationId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) return sendJson(res, 404, { error: 'organization_not_found' });

  if (action === 'ownerArchiveOrganization') {
    const [managers, users] = await Promise.all([
      db.collection('managers').where('organizationId', '==', organizationId).limit(5).get(),
      db.collection('users').where('organizationId', '==', organizationId).limit(5).get(),
    ]);
    const now = FieldValue.serverTimestamp();
    await orgRef.set({
      status: 'archived',
      archivedAt: now,
      archivedByUid: decoded.uid,
      updatedAt: now,
    }, { merge: true });
    await db.collection('platformAdminAuditEvents').add({
      actorUid: decoded.uid,
      actorRole: 'owner',
      action: 'organization_archive',
      organizationId,
      targetUid: null,
      detail: {
        managerRecordsPresent: managers.size,
        userRecordsPresent: users.size,
        destructiveDelete: false,
      },
      createdAt: now,
    });
    return sendJson(res, 200, {
      ok: true,
      organizationId,
      status: 'archived',
      destructiveDelete: false,
      linkedRecordsPreserved: true,
    });
  }

  if (action === 'ownerRestoreOrganization') {
    const requestedStatus = cleanText(body.status, 40);
    const status = ['active', 'trial', 'expired'].includes(requestedStatus) ? requestedStatus : 'active';
    const now = FieldValue.serverTimestamp();
    await orgRef.set({
      status,
      archivedAt: null,
      archivedByUid: null,
      restoredAt: now,
      restoredByUid: decoded.uid,
      updatedAt: now,
    }, { merge: true });
    await db.collection('platformAdminAuditEvents').add({
      actorUid: decoded.uid,
      actorRole: 'owner',
      action: 'organization_restore',
      organizationId,
      targetUid: null,
      detail: { status },
      createdAt: now,
    });
    return sendJson(res, 200, { ok: true, organizationId, status });
  }

  return sendJson(res, 400, { error: 'unknown_action' });
}


async function handleOwnerInvoiceLifecycle({ action, body, decoded, db, FieldValue, sendJson, res }) {
  const invoiceId = cleanText(body.invoiceId, 160);
  if (!invoiceId) return sendJson(res, 400, { error: 'invalid_request', reason: 'invoiceId_required' });

  const ref = db.collection('invoices').doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) return sendJson(res, 404, { error: 'invoice_not_found' });
  const current = snap.data() || {};
  const now = FieldValue.serverTimestamp();

  if (action === 'ownerInvoiceUpdate') {
    const plan = cleanText(body.plan, 80);
    const billingCycle = cleanText(body.billingCycle, 40);
    const status = cleanText(body.status, 40);
    const amount = Number(body.amount);
    if (!plan || !['monthly','yearly'].includes(billingCycle) ||
        !['paid','pending','overdue','cancelled','archived'].includes(status) ||
        !Number.isFinite(amount) || amount < 0) {
      return sendJson(res, 400, { error: 'invalid_request', reason: 'invalid_invoice_update' });
    }
    const vat = +(amount * 0.15).toFixed(2);
    const total = +(amount + vat).toFixed(2);
    await ref.set({
      plan, billingCycle, status, amount, vat, total,
      updatedAt: now, updatedByUid: decoded.uid,
    }, { merge: true });
    await db.collection('platformAdminAuditEvents').add({
      actorUid: decoded.uid, actorRole: 'owner', action: 'invoice_update',
      organizationId: cleanText(current.organization_id, 160) || null,
      resourceType: 'invoice', resourceId: invoiceId,
      detail: { plan, billingCycle, status, amount, vat, total },
      createdAt: now,
    });
    return sendJson(res, 200, { ok: true, invoiceId, plan, billingCycle, status, amount, vat, total });
  }

  if (action === 'ownerInvoiceArchive') {
    await ref.set({
      status: 'archived', archivedAt: now, archivedByUid: decoded.uid,
      updatedAt: now,
    }, { merge: true });
    await db.collection('platformAdminAuditEvents').add({
      actorUid: decoded.uid, actorRole: 'owner', action: 'invoice_archive',
      organizationId: cleanText(current.organization_id, 160) || null,
      resourceType: 'invoice', resourceId: invoiceId,
      createdAt: now,
    });
    return sendJson(res, 200, { ok: true, invoiceId, status: 'archived' });
  }

  if (action === 'ownerInvoiceDelete') {
    await ref.delete();
    await db.collection('platformAdminAuditEvents').add({
      actorUid: decoded.uid, actorRole: 'owner', action: 'invoice_delete',
      organizationId: cleanText(current.organization_id, 160) || null,
      resourceType: 'invoice', resourceId: invoiceId,
      detail: { invoiceNumber: cleanText(current.invoiceId, 120) || null },
      createdAt: now,
    });
    return sendJson(res, 200, { ok: true, invoiceId, deleted: true });
  }

  return sendJson(res, 400, { error: 'unknown_action' });
}

async function handleOwnerSupport({ action, body, decoded, db, FieldValue, sendJson, res }) {
  if (action === 'ownerSupportList') {
    const snap = await db.collection('supportThreads').orderBy('updatedAt', 'desc').limit(SUPPORT_THREAD_LIMIT).get();
    return sendJson(res, 200, { ok: true, threads: snap.docs.map(safeThread) });
  }

  const organizationId = cleanText(body.organizationId, 160);
  if (!organizationId) return sendJson(res, 400, { error: 'invalid_request', reason: 'organizationId_required' });
  const threadRef = db.collection('supportThreads').doc(organizationId);
  const snap = await threadRef.get();
  if (!snap.exists) return sendJson(res, 404, { error: 'support_thread_not_found' });

  if (action === 'ownerSupportThreadGet') {
    await threadRef.set({ unreadOwner: 0 }, { merge: true });
    const messages = await getMessages(threadRef);
    const fresh = await threadRef.get();
    return sendJson(res, 200, { ok: true, thread: safeThread(fresh), messages });
  }

  if (action === 'ownerSupportReply') {
    const text = cleanText(body.text);
    if (!text) return sendJson(res, 400, { error: 'invalid_request', reason: 'message_required' });
    const now = FieldValue.serverTimestamp();
    await threadRef.collection('messages').add({
      senderRole: 'owner',
      senderUid: decoded.uid,
      kind: 'message',
      text,
      createdAt: now,
    });
    await threadRef.set({
      status: 'open',
      updatedAt: now,
      lastMessageAt: now,
      lastMessagePreview: text.slice(0, 240),
      lastSenderRole: 'owner',
      unreadManager: FieldValue.increment(1),
      unreadOwner: 0,
    }, { merge: true });
    return sendJson(res, 200, { ok: true });
  }

  if (action === 'ownerSupportSetStatus') {
    const status = ['open', 'pending', 'resolved'].includes(body.status) ? body.status : '';
    if (!status) return sendJson(res, 400, { error: 'invalid_request', reason: 'invalid_support_status' });
    await threadRef.set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return sendJson(res, 200, { ok: true, status });
  }

  return sendJson(res, 400, { error: 'unknown_action' });
}


async function handleOwnerTenantIdentityAudit({ body, db, auth, sendJson, res }) {
  // Read-only identity reconciliation for an existing tenant. The owner guard
  // is enforced by handleOwnerOpsSupport BEFORE entering this function.
  const organizationId = cleanText(body.organizationId, 160);
  if (!organizationId) return sendJson(res, 400, { error: 'organization_id_required' });
  const orgSnap = await db.collection('organizations').doc(organizationId).get();
  if (!orgSnap.exists) return sendJson(res, 404, { error: 'organization_not_found' });
  const organization = orgSnap.data() || {};
  const managerUid = cleanText(organization.managerUid, 160);
  const displayManagerEmail = cleanText(organization.email, 240).toLowerCase();
  const managerSnap = managerUid
    ? await db.collection('managers').doc(managerUid).get()
    : null;
  const managerDoc = managerSnap && managerSnap.exists ? managerSnap.data() || {} : null;
  const managerEmail = cleanText(managerDoc && managerDoc.email, 240).toLowerCase();

  async function authState(uid, recordEmail) {
    if (!uid) return { state: 'unlinked', email: null, disabled: null, emailMatchesRecord: null };
    try {
      const u = await auth.getUser(uid);
      const email = cleanText(u.email, 240).toLowerCase();
      return {
        state: u.disabled === true ? 'disabled' : 'present',
        email,
        disabled: u.disabled === true,
        emailMatchesRecord: recordEmail ? email === recordEmail : null,
      };
    } catch (error) {
      if (error && error.code === 'auth/user-not-found') {
        return { state: 'missing', email: null, disabled: null, emailMatchesRecord: null };
      }
      return { state: 'lookup_failed', email: null, disabled: null, emailMatchesRecord: null };
    }
  }

  const managerAuth = await authState(managerUid, managerEmail);
  const managerRecordLinked = Boolean(
    managerDoc && managerDoc.organizationId === organizationId &&
    managerDoc.role === 'manager' && managerDoc.active !== false
  );
  // A missing managerUid MUST NOT be guessed from matching display names or
  // emails; a tenant may have a legitimately distinct manager identity.
  const workforceSnap = await db.collection('users')
    .where('organizationId', '==', organizationId).limit(50).get();
  const workforce = { scanned: workforceSnap.docs.length, scanLimit: 50,
    missingAuth: 0, disabledAuth: 0, emailMismatch: 0, lookupFailed: 0,
    missingAccounts: [], scannedAccounts: [] };
  for (const record of workforceSnap.docs) {
    const data = record.data() || {};
    const state = await authState(record.id, cleanText(data.email, 240).toLowerCase());
    if (state.state === 'missing') {
      workforce.missingAuth++;
      workforce.missingAccounts.push(cleanText(data.email, 240) || record.id);
    } else if (state.state === 'disabled') workforce.disabledAuth++;
    else if (state.state === 'lookup_failed') workforce.lookupFailed++;
    if (state.emailMatchesRecord === false) workforce.emailMismatch++;
    workforce.scannedAccounts.push({
      uid: record.id, email: cleanText(data.email, 240),
      authState: state.state, linkedOrganization: data.organizationId === organizationId,
      emailMatchesAuth: state.emailMatchesRecord,
    });
  }

  return sendJson(res, 200, {
    ok: true, readOnly: true,
    organization: {
      id: organizationId, name: cleanText(organization.name, 180),
      status: cleanText(organization.status, 40),
      managerUid, displayManagerEmail,
    },
    manager: {
      uid: managerUid, firestoreRecordExists: Boolean(managerDoc),
      managerRecordLinked, recordEmail: managerEmail,
      auth: managerAuth,
      displayEmailMatchesAuth: managerAuth.email && displayManagerEmail
        ? displayManagerEmail === managerAuth.email : null,
    },
    workforce,
  });
}

async function handleOwnerOpsSupport({ action, body, decoded, db, auth, FieldValue, getCallerContext, sendJson, res }) {
  if (!OWNER_ACTIONS.has(action) && !MANAGER_SUPPORT_ACTIONS.has(action)) return false;

  if (MANAGER_SUPPORT_ACTIONS.has(action)) {
    const caller = await requireManager(decoded, getCallerContext, sendJson, res);
    if (!caller) return true;
    try {
      await handleManagerSupport({ action, body, decoded, db, FieldValue, caller, sendJson, res });
    } catch (error) {
      console.error('manager-support', cleanText(error && error.code || error && error.message, 200));
      sendJson(res, 500, { error: 'request_failed', reason: 'support_temporarily_unavailable' });
    }
    return true;
  }

  const owner = await requireOwner(decoded, getCallerContext, sendJson, res);
  if (!owner) return true;

  try {
    if (action === 'ownerAuditTenantIdentity') {
      await handleOwnerTenantIdentityAudit({ body, db, auth, sendJson, res });
      return true;
    }
    if (action === 'ownerOpsSnapshot') {
      const snapshot = await buildOwnerOpsSnapshot({ db, auth, decoded, FieldValue });
      sendJson(res, 200, snapshot);
      return true;
    }
    if (action === 'ownerCreateOrganizationWithManager' || action === 'ownerSetManagerPassword') {
      await handleOwnerProvisioning({ action, body, decoded, db, auth, FieldValue, sendJson, res });
      return true;
    }
    if (action === 'ownerArchiveOrganization' || action === 'ownerRestoreOrganization') {
      await handleOwnerOrganizationLifecycle({ action, body, decoded, db, FieldValue, sendJson, res });
      return true;
    }
    if (action === 'ownerSetOrganizationSpatialContext') {
      await handleOwnerSpatialContext({ body, decoded, db, FieldValue, sendJson, res });
      return true;
    }
    if (action === 'ownerInvoiceUpdate' || action === 'ownerInvoiceArchive' || action === 'ownerInvoiceDelete') {
      await handleOwnerInvoiceLifecycle({ action, body, decoded, db, FieldValue, sendJson, res });
      return true;
    }
    await handleOwnerSupport({ action, body, decoded, db, FieldValue, sendJson, res });
  } catch (error) {
    console.error('owner-ops-support', cleanText(error && error.code || error && error.message, 200));
    sendJson(res, 500, { error: 'request_failed', reason: 'owner_ops_temporarily_unavailable' });
  }
  return true;
}

module.exports = {
  handleOwnerOpsSupport,
  _test: {
    cleanText,
    timestampIso,
    safeEvent,
    safeThread,
    safeMessage,
  },
};
