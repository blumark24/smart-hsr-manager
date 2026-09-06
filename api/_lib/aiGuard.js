'use strict';

const crypto = require('crypto');

const WINDOW_MS = 60 * 1000;
const LOCK_MS = 20 * 1000;
const OPERATION_TTL_MS = 24 * 60 * 60 * 1000;
const UID_LIMIT = 6;
const ORGANIZATION_LIMIT = 30;

function hash(value) { return crypto.createHash('sha256').update(value, 'utf8').digest('hex'); }
function stableOperationId({ organizationId, uid, observationId, imageReference }) {
  return hash([organizationId, uid, observationId, imageReference].join('\n'));
}
function milliseconds(value) {
  if (value?.toMillis) return value.toMillis();
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
function rateDecision(record, limit, now) {
  const windowStartedAt = milliseconds(record?.windowStartedAt);
  const active = windowStartedAt > 0 && now - windowStartedAt < WINDOW_MS;
  const count = active ? Number(record?.count || 0) : 0;
  return { allowed: count < limit, count, windowStartedAt: active ? windowStartedAt : now };
}

async function acquireAiOperation(db, input, now = Date.now()) {
  const operationId = stableOperationId(input);
  const operationRef = db.collection('aiOperations').doc(operationId);
  const uidRateRef = db.collection('aiRateWindows').doc(hash(`uid\n${input.organizationId}\n${input.uid}`));
  const orgRateRef = db.collection('aiRateWindows').doc(hash(`org\n${input.organizationId}`));
  return db.runTransaction(async transaction => {
    const [operationSnap, uidRateSnap, orgRateSnap] = await Promise.all([
      transaction.get(operationRef), transaction.get(uidRateRef), transaction.get(orgRateRef),
    ]);
    const operation = operationSnap.exists ? operationSnap.data() || {} : null;
    if (operation?.organizationId !== undefined && (operation.organizationId !== input.organizationId || operation.ownerUid !== input.uid)) {
      return { allowed:false, code:'AI_OPERATION_TENANT_DENIED' };
    }
    if (operation?.status === 'SUCCEEDED' && milliseconds(operation.expiresAt) > now && operation.response) {
      return { allowed:false, cached:true, operationId, response:operation.response };
    }
    if (operation?.status === 'RUNNING' && milliseconds(operation.lockExpiresAt) > now) {
      return { allowed:false, code:'AI_OPERATION_IN_PROGRESS', retryAfterSeconds:Math.max(1,Math.ceil((milliseconds(operation.lockExpiresAt)-now)/1000)) };
    }
    const uidRate = rateDecision(uidRateSnap.exists ? uidRateSnap.data() : null, UID_LIMIT, now);
    const orgRate = rateDecision(orgRateSnap.exists ? orgRateSnap.data() : null, ORGANIZATION_LIMIT, now);
    if (!uidRate.allowed || !orgRate.allowed) {
      const retryAt = Math.max(uidRate.windowStartedAt, orgRate.windowStartedAt) + WINDOW_MS;
      return { allowed:false, code:'AI_RATE_LIMITED', retryAfterSeconds:Math.max(1,Math.ceil((retryAt-now)/1000)) };
    }
    transaction.set(uidRateRef,{scope:'UID',organizationId:input.organizationId,ownerUid:input.uid,count:uidRate.count+1,windowStartedAt:new Date(uidRate.windowStartedAt),expiresAt:new Date(uidRate.windowStartedAt+WINDOW_MS*2)});
    transaction.set(orgRateRef,{scope:'ORGANIZATION',organizationId:input.organizationId,count:orgRate.count+1,windowStartedAt:new Date(orgRate.windowStartedAt),expiresAt:new Date(orgRate.windowStartedAt+WINDOW_MS*2)});
    transaction.set(operationRef,{organizationId:input.organizationId,ownerUid:input.uid,observationId:input.observationId,status:'RUNNING',attempts:Number(operation?.attempts||0)+1,lockExpiresAt:new Date(now+LOCK_MS),expiresAt:new Date(now+OPERATION_TTL_MS),updatedAt:new Date(now)});
    return { allowed:true, operationId };
  });
}

async function completeAiOperation(db, operationId, response, now = Date.now(), advisoryWrite = null) {
  const operationRef = db.collection('aiOperations').doc(operationId);
  if (!advisoryWrite) {
    await operationRef.set({status:'SUCCEEDED',response,lockExpiresAt:new Date(0),expiresAt:new Date(now+OPERATION_TTL_MS),updatedAt:new Date(now)},{merge:true});
    return;
  }
  await db.runTransaction(async transaction => {
    transaction.update(advisoryWrite.ref, advisoryWrite.patch);
    transaction.set(operationRef,{status:'SUCCEEDED',response,lockExpiresAt:new Date(0),expiresAt:new Date(now+OPERATION_TTL_MS),updatedAt:new Date(now)},{merge:true});
  });
}

async function releaseAiOperation(db, operationId, now = Date.now()) {
  await db.collection('aiOperations').doc(operationId).set({status:'FAILED',lockExpiresAt:new Date(0),updatedAt:new Date(now)},{merge:true});
}

module.exports = { WINDOW_MS, LOCK_MS, OPERATION_TTL_MS, UID_LIMIT, ORGANIZATION_LIMIT, stableOperationId, rateDecision, acquireAiOperation, completeAiOperation, releaseAiOperation };
