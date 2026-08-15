'use strict';

const crypto = require('crypto');
const { getDb, FieldValue } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, activeIsNotFalse } = require('../_lib/authz');

const FINALIZABLE_UPLOAD_STATUSES = Object.freeze(['PENDING', 'FINALIZED']);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(payload));
}

function cleanId(value) {
  const clean = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9_-]{1,128}$/.test(clean) ? clean : '';
}

function pendingUploadId(objectKey) {
  return crypto.createHash('sha256').update(objectKey, 'utf8').digest('hex');
}

function canonicalBeforeEvidenceKey(objectKey, organizationId, observationId) {
  const key = typeof objectKey === 'string' ? objectKey.trim() : '';
  const prefix = `observations/${organizationId}/${observationId}/before/`;
  if (!key.startsWith(prefix) || key.length <= prefix.length || key.length > 512) return '';
  const filename = key.slice(prefix.length);
  if (filename.includes('/') || filename.includes('..') || filename.includes('\\')) return '';
  return /^[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(filename) ? key : '';
}

function evaluateFinalization(upload, observation, caller, observationId, objectKey) {
  if (upload?.organizationId !== caller.organizationId
      || observation?.organizationId !== caller.organizationId) {
    return { allowed: false, code: 'cross_organization_denied' };
  }
  if (upload?.ownerUid !== caller.uid || observation?.createdByUid !== caller.uid) {
    return { allowed: false, code: 'owner_denied' };
  }
  if (observation?.status !== 'PENDING') {
    return { allowed: false, code: 'observation_not_pending' };
  }
  if (upload?.objectKey !== objectKey || upload?.observationId !== observationId
      || !canonicalBeforeEvidenceKey(objectKey, caller.organizationId, observationId)) {
    return { allowed: false, code: 'evidence_binding_denied' };
  }
  if (!FINALIZABLE_UPLOAD_STATUSES.includes(upload?.status)) {
    return { allowed: false, code: 'upload_not_pending' };
  }

  const existingKeys = [observation?.imageObjectKey, observation?.imagePath]
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim());
  if (existingKeys.some(value => value !== objectKey)) {
    return { allowed: false, code: 'evidence_binding_denied' };
  }
  return { allowed: true, alreadyFinalized: upload.status === 'FINALIZED' };
}

async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  let decoded;
  try {
    decoded = await verifyRequestToken(req);
  } catch (error) {
    return sendJson(res, error.statusCode || 401, { error: 'unauthenticated' });
  }

  const db = getDb();
  const userSnap = await db.collection('users').doc(decoded.uid).get();
  const user = userSnap.exists ? userSnap.data() || {} : {};
  const organizationId = typeof user.organizationId === 'string' ? user.organizationId.trim() : '';
  if (user.role !== 'inspector' || !activeIsNotFalse(user) || !organizationId) {
    return sendJson(res, 403, { error: 'forbidden' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const observationId = cleanId(body.observationId);
  const objectKey = typeof body.objectKey === 'string' ? body.objectKey.trim() : '';
  if (!observationId || !objectKey) return sendJson(res, 400, { error: 'invalid_request' });

  const caller = { uid: decoded.uid, organizationId };
  const uploadRef = db.collection('pendingEvidenceUploads').doc(pendingUploadId(objectKey));
  const observationRef = db.collection('observations').doc(observationId);

  try {
    const outcome = await db.runTransaction(async transaction => {
      const [uploadSnap, observationSnap] = await Promise.all([
        transaction.get(uploadRef),
        transaction.get(observationRef),
      ]);
      if (!uploadSnap.exists || !observationSnap.exists) {
        return { allowed: false, code: 'record_not_found' };
      }

      const decision = evaluateFinalization(
        uploadSnap.data(), observationSnap.data(), caller, observationId, objectKey,
      );
      if (!decision.allowed) return decision;

      // Admin-only transaction is the binding boundary. The browser never gets
      // permission to mutate evidence or workflow fields on an existing record.
      transaction.set(observationRef, {
        imageObjectKey: objectKey,
        imagePath: objectKey,
      }, { merge: true });
      if (!decision.alreadyFinalized) {
        transaction.set(uploadRef, {
          status: 'FINALIZED',
          finalizedAt: FieldValue.serverTimestamp(),
          expiresAt: null,
        }, { merge: true });
      }
      return { allowed: true, alreadyFinalized: decision.alreadyFinalized };
    });
    if (!outcome.allowed) return sendJson(res, 403, { error: outcome.code });
    return sendJson(res, 200, { ok: true, finalized: true, idempotent: outcome.alreadyFinalized });
  } catch (_) {
    return sendJson(res, 500, { error: 'finalization_failed' });
  }
}

module.exports = handler;
module.exports._test = {
  cleanId,
  pendingUploadId,
  canonicalBeforeEvidenceKey,
  evaluateFinalization,
  handler,
};
