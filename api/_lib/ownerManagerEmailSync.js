'use strict';

// Owner-only manager email reconciliation. Caller authorization is enforced
// upstream by handleOwnerOpsSupport after verifying the Firebase ID token.
// Never identify a manager by display name or email: only organizations/{id}.managerUid.
class ManagerEmailSyncError extends Error {
  constructor(reason, status = 409) {
    super(reason);
    this.name = 'ManagerEmailSyncError';
    this.reason = reason;
    this.status = status;
  }
}

const trimmed = value => typeof value === 'string' ? value.trim() : '';
const normalizeEmail = value => trimmed(value).toLowerCase();
const emailValid = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 240;

async function syncManagerLoginEmail({ db, auth, FieldValue, ownerUid, organizationId, requestedEmail }) {
  const orgId = trimmed(organizationId);
  const email = normalizeEmail(requestedEmail);
  if (!orgId || !emailValid(email)) throw new ManagerEmailSyncError('invalid_email_or_organization', 400);

  const orgRef = db.collection('organizations').doc(orgId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) throw new ManagerEmailSyncError('organization_not_found', 404);
  const organization = orgSnap.data() || {};
  if (organization.status !== 'active' && organization.status !== 'trial') {
    throw new ManagerEmailSyncError('organization_not_active');
  }
  const managerUid = trimmed(organization.managerUid);
  if (!managerUid) throw new ManagerEmailSyncError('manager_identity_unlinked');
  const managerRef = db.collection('managers').doc(managerUid);
  const managerSnap = await managerRef.get();
  const manager = managerSnap.exists ? managerSnap.data() || {} : null;
  if (!manager || manager.organizationId !== orgId || manager.role !== 'manager' || manager.active === false) {
    throw new ManagerEmailSyncError('manager_tenant_binding_invalid');
  }

  let user;
  try { user = await auth.getUser(managerUid); }
  catch (error) {
    if (error && error.code === 'auth/user-not-found') {
      throw new ManagerEmailSyncError('manager_auth_missing');
    }
    throw error;
  }
  if (user.disabled) throw new ManagerEmailSyncError('manager_auth_disabled');
  const previousAuthEmail = normalizeEmail(user.email);
  if (!emailValid(previousAuthEmail)) throw new ManagerEmailSyncError('manager_auth_email_missing');

  // Firebase Auth is authoritative for login; reject a target email held by
  // another UID. Do not create a duplicate user or change another tenant.
  if (email !== previousAuthEmail) {
    try {
      const existing = await auth.getUserByEmail(email);
      if (existing && existing.uid !== managerUid) {
        throw new ManagerEmailSyncError('login_email_already_in_use');
      }
    } catch (error) {
      if (!error || error.code !== 'auth/user-not-found') throw error;
    }
  }

  const previousOrgEmail = normalizeEmail(organization.email);
  const previousManagerEmail = normalizeEmail(manager.email);
  const authNeedsUpdate = email !== previousAuthEmail;
  const metadataNeedsUpdate = email !== previousOrgEmail || email !== previousManagerEmail;
  if (!authNeedsUpdate && !metadataNeedsUpdate) {
    return { ok: true, managerUid, email, changed: false, sessionsRevoked: false };
  }

  if (authNeedsUpdate) {
    try { await auth.updateUser(managerUid, { email }); }
    catch (error) {
      if (error && error.code === 'auth/email-already-exists') {
        throw new ManagerEmailSyncError('login_email_already_in_use');
      }
      throw error;
    }
  }

  try {
    await db.runTransaction(async transaction => {
      const freshOrg = await transaction.get(orgRef);
      const freshManager = await transaction.get(managerRef);
      const currentOrg = freshOrg.exists ? freshOrg.data() || {} : {};
      const currentManager = freshManager.exists ? freshManager.data() || {} : {};
      if (!freshOrg.exists || currentOrg.managerUid !== managerUid
        || currentOrg.status !== organization.status
        || normalizeEmail(currentOrg.email) !== previousOrgEmail
        || !freshManager.exists || currentManager.organizationId !== orgId
        || currentManager.role !== 'manager' || currentManager.active === false
        || normalizeEmail(currentManager.email) !== previousManagerEmail) {
        throw new ManagerEmailSyncError('identity_changed_during_update');
      }
      const now = FieldValue.serverTimestamp();
      transaction.update(orgRef, { email, updatedAt: now });
      transaction.update(managerRef, { email, updatedAt: now });
      transaction.create(db.collection('platformAdminAuditEvents').doc(), {
        actorUid: ownerUid,
        actorRole: 'owner',
        action: 'manager_login_email_change',
        organizationId: orgId,
        targetUid: managerUid,
        resourceType: 'manager',
        resourceId: managerUid,
        detail: { previousAuthEmail, email, authChanged: authNeedsUpdate, metadataReconciled: metadataNeedsUpdate },
        createdAt: now,
      });
    });
  } catch (error) {
    if (authNeedsUpdate) {
      try { await auth.updateUser(managerUid, { email: previousAuthEmail }); }
      catch (_) {
        // Do not misreport an inconsistent cross-system state as success.
        throw new ManagerEmailSyncError('reconciliation_required_after_partial_failure', 503);
      }
    }
    throw error;
  }

  let sessionsRevoked = false;
  if (authNeedsUpdate) {
    try {
      await auth.revokeRefreshTokens(managerUid);
      sessionsRevoked = true;
    } catch (_) {
      // Successful identity change must not be described as failed or retried
      // blindly: the email is now committed in Auth + Firestore.
      return { ok: true, managerUid, email, changed: true, sessionsRevoked: false, warning: 'session_revocation_pending' };
    }
  }
  return { ok: true, managerUid, email, changed: true, sessionsRevoked };
}

module.exports = { syncManagerLoginEmail, ManagerEmailSyncError };
