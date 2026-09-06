'use strict';
// Tests for the cache-only Vision binding endpoint (api/ai/bind-analysis.js)
// and the shared production auth contract it reuses (api/_lib/inspectorAccess.js).
// Vision executes once only: this endpoint must never be able to reach a
// provider/LLM call, whether the cache hits or misses.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bindAnalysis = require('../api/ai/bind-analysis');
const rootCause = require('../api/report/root-cause');
const workOrder = require('../api/report/work-order');
const analyze = require('../api/ai/analyze');
const inspectorAccess = require('../api/_lib/inspectorAccess');
const { buildPersistedAiAnalysis } = require('../api/_lib/persistedAiAnalysis');

function mockRes() {
  let statusCode = 0;
  let body = null;
  return {
    setHeader() {},
    end(payload) { body = JSON.parse(payload); },
    set statusCode(value) { statusCode = value; },
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
}

// Minimal in-memory Firestore-like db supporting collection/doc/get and
// runTransaction(get/update), matching the pattern already used in
// test/sprint2-ai-guard.test.js.
class Snap {
  constructor(value) { this.value = value; this.exists = value !== undefined; }
  data() { return this.value; }
}
class Ref {
  constructor(store, path) { this.store = store; this.path = path; }
  async get() { return new Snap(this.store.get(this.path)); }
}
class Db {
  constructor(seed = {}) { this.store = new Map(Object.entries(seed)); this.updateCalls = []; }
  collection(name) { return { doc: id => new Ref(this.store, `${name}/${id}`) }; }
  async runTransaction(fn) {
    const writes = [];
    const transaction = {
      get: async ref => new Snap(this.store.get(ref.path)),
      update: (ref, patch) => { this.updateCalls.push({ path: ref.path, patch }); writes.push(() => this.store.set(ref.path, { ...(this.store.get(ref.path) || {}), ...patch })); },
    };
    const result = await fn(transaction);
    writes.forEach(write => write());
    return result;
  }
}

const CALLER = { organizationId: 'org-a', uid: 'ins-a' };
const OBSERVATION_ID = 'obs-a';
const IMAGE_REFERENCE = 'observations/org-a/obs-a/before/a.jpg';
const ANALYSIS = { ok: true, provider: 'gemini', categoryCode: 'ASPHALT_POTHOLE', confidence: 0.9 };
const INTELLIGENCE = { primaryIssue: { issueCode: 'ASPHALT_POTHOLE', issueLabelAr: 'حفرة أسفلتية', severity: 'HIGH' }, prioritySuggestion: { prioritySuggestion: 'URGENT' } };

function observationRecord(overrides = {}) {
  return {
    organizationId: CALLER.organizationId,
    createdByUid: CALLER.uid,
    imageObjectKey: IMAGE_REFERENCE,
    ...overrides,
  };
}
function succeededOperation(overrides = {}) {
  return {
    status: 'SUCCEEDED',
    expiresAt: new Date(Date.now() + 60000),
    organizationId: CALLER.organizationId,
    ownerUid: CALLER.uid,
    observationId: OBSERVATION_ID,
    response: { ok: true, analysis: ANALYSIS, intelligence: INTELLIGENCE },
    ...overrides,
  };
}
function seedDb(observationOverrides = {}, operationOverrides = null) {
  const operationId = require('../api/_lib/aiGuard').stableOperationId({
    organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID, imageReference: IMAGE_REFERENCE,
  });
  const seed = { [`observations/${OBSERVATION_ID}`]: observationRecord(observationOverrides) };
  if (operationOverrides !== null) seed[`aiOperations/${operationId}`] = succeededOperation(operationOverrides);
  return new Db(seed);
}

// --- non-POST / unauthenticated ---

test('bind-analysis: handler rejects non-POST methods', async () => {
  const res = mockRes();
  await bindAnalysis._test.handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.ok, false);
});

test('bind-analysis: handler rejects an unauthenticated request', async () => {
  const res = mockRes();
  await bindAnalysis._test.handler({ method: 'POST', headers: {}, body: { observationId: OBSERVATION_ID } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.ok, false);
});

// --- shared auth contract: proves bind-analysis, root-cause, and work-order
// all import the SAME production module, not parallel copies ---

test('bind-analysis, root-cause, and work-order all import the identical resolveInspectorContext function', () => {
  assert.equal(bindAnalysis._test.resolveInspectorContext, inspectorAccess.resolveInspectorContext);
  assert.equal(rootCause._test.resolveInspectorContext, inspectorAccess.resolveInspectorContext);
  assert.equal(workOrder._test.resolveInspectorContext, inspectorAccess.resolveInspectorContext);
  assert.equal(analyze._test.resolveInspectorContext, inspectorAccess.resolveInspectorContext);
});
test('bind-analysis, root-cause, and work-order all import the identical evaluateObservationAccess function', () => {
  assert.equal(bindAnalysis._test.evaluateObservationAccess, inspectorAccess.evaluateObservationAccess);
  assert.equal(rootCause._test.evaluateObservationAccess, inspectorAccess.evaluateObservationAccess);
  assert.equal(workOrder._test.evaluateObservationAccess, inspectorAccess.evaluateObservationAccess);
  assert.equal(analyze._test.evaluateObservationAccess, inspectorAccess.evaluateObservationAccess);
});

test('shared resolveInspectorContext denies a non-inspector, inactive, or org-less caller', async () => {
  const dbNoUser = { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) };
  assert.equal(await inspectorAccess.resolveInspectorContext(dbNoUser, 'uid-1'), null);
  const dbNonInspector = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: 'contractor', organizationId: 'org-a' }) }) }) }) };
  assert.equal(await inspectorAccess.resolveInspectorContext(dbNonInspector, 'uid-1'), null);
  const dbInactive = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: 'inspector', organizationId: 'org-a', active: false }) }) }) }) };
  assert.equal(await inspectorAccess.resolveInspectorContext(dbInactive, 'uid-1'), null);
});
test('shared evaluateObservationAccess denies cross-org and non-owner, allows same-org owner', () => {
  assert.equal(inspectorAccess.evaluateObservationAccess({ organizationId: 'org-b', createdByUid: 'ins-a' }, CALLER).allowed, false);
  assert.equal(inspectorAccess.evaluateObservationAccess({ organizationId: 'org-a', createdByUid: 'someone-else' }, CALLER).allowed, false);
  assert.equal(inspectorAccess.evaluateObservationAccess({ organizationId: 'org-a', createdByUid: 'ins-a' }, CALLER).allowed, true);
});

// --- cache-only bind flow ---

test('bindCachedAnalysis: valid, fresh, matching cached operation binds aiAnalysis via buildPersistedAiAnalysis', async () => {
  const db = seedDb({}, {});
  const result = await bindAnalysis._test.bindCachedAnalysis(db, { organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID });
  assert.equal(result.ok, true);
  assert.equal(result.bound, true);
  assert.equal(db.updateCalls.length, 1);
  const written = db.updateCalls[0].patch.aiAnalysis;
  assert.deepEqual(written, buildPersistedAiAnalysis(ANALYSIS, INTELLIGENCE));
});

test('bindCachedAnalysis: no cached operation at all -> AI_CACHED_RESULT_NOT_AVAILABLE, no write', async () => {
  const db = seedDb({}, null);
  await assert.rejects(
    bindAnalysis._test.bindCachedAnalysis(db, { organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID }),
    err => err instanceof bindAnalysis._test.BindDenied && err.errorCode === 'AI_CACHED_RESULT_NOT_AVAILABLE',
  );
  assert.equal(db.updateCalls.length, 0);
});
test('bindCachedAnalysis: cached operation status RUNNING -> denied, no write', async () => {
  const db = seedDb({}, { status: 'RUNNING' });
  await assert.rejects(bindAnalysis._test.bindCachedAnalysis(db, { organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID }),
    err => err.errorCode === 'AI_CACHED_RESULT_NOT_AVAILABLE');
  assert.equal(db.updateCalls.length, 0);
});
test('bindCachedAnalysis: expired cached operation -> denied, no write', async () => {
  const db = seedDb({}, { expiresAt: new Date(Date.now() - 1000) });
  await assert.rejects(bindAnalysis._test.bindCachedAnalysis(db, { organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID }),
    err => err.errorCode === 'AI_CACHED_RESULT_NOT_AVAILABLE');
  assert.equal(db.updateCalls.length, 0);
});
test('bindCachedAnalysis: tenant-mismatched cached operation (wrong org) -> denied, no write', async () => {
  const db = seedDb({}, { organizationId: 'org-other' });
  await assert.rejects(bindAnalysis._test.bindCachedAnalysis(db, { organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID }),
    err => err.errorCode === 'AI_CACHED_RESULT_NOT_AVAILABLE');
  assert.equal(db.updateCalls.length, 0);
});
test('bindCachedAnalysis: tenant-mismatched cached operation (wrong uid) -> denied, no write', async () => {
  const db = seedDb({}, { ownerUid: 'someone-else' });
  await assert.rejects(bindAnalysis._test.bindCachedAnalysis(db, { organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID }),
    err => err.errorCode === 'AI_CACHED_RESULT_NOT_AVAILABLE');
  assert.equal(db.updateCalls.length, 0);
});
test('bindCachedAnalysis: cross-organization observation -> AI_CROSS_ORGANIZATION_DENIED, no write', async () => {
  const db = seedDb({ organizationId: 'org-other' }, {});
  await assert.rejects(bindAnalysis._test.bindCachedAnalysis(db, { organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID }),
    err => err.errorCode === 'AI_CROSS_ORGANIZATION_DENIED');
  assert.equal(db.updateCalls.length, 0);
});
test('bindCachedAnalysis: non-owner observation -> AI_REPORT_OWNER_DENIED, no write', async () => {
  const db = seedDb({ createdByUid: 'someone-else' }, {});
  await assert.rejects(bindAnalysis._test.bindCachedAnalysis(db, { organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID }),
    err => err.errorCode === 'AI_REPORT_OWNER_DENIED');
  assert.equal(db.updateCalls.length, 0);
});
test('bindCachedAnalysis: missing observation -> AI_OBSERVATION_NOT_FOUND, no write', async () => {
  const db = new Db({});
  await assert.rejects(bindAnalysis._test.bindCachedAnalysis(db, { organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID }),
    err => err.errorCode === 'AI_OBSERVATION_NOT_FOUND');
  assert.equal(db.updateCalls.length, 0);
});
test('bindCachedAnalysis: observation with no evidence image -> AI_PRIVATE_IMAGE_REQUIRED, no write', async () => {
  const db = seedDb({ imageObjectKey: undefined }, {});
  await assert.rejects(bindAnalysis._test.bindCachedAnalysis(db, { organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID }),
    err => err.errorCode === 'AI_PRIVATE_IMAGE_REQUIRED');
  assert.equal(db.updateCalls.length, 0);
});

// --- idempotency ---

test('bindCachedAnalysis: observation that already has aiAnalysis is a no-op success, no write performed', async () => {
  const db = seedDb({ aiAnalysis: { provider: 'gemini', category: 'ASPHALT_POTHOLE' } }, {});
  const result = await bindAnalysis._test.bindCachedAnalysis(db, { organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID });
  assert.equal(result.ok, true);
  assert.equal(result.alreadyBound, true);
  assert.equal(db.updateCalls.length, 0);
});
test('bindCachedAnalysis: repeated calls after a successful bind are safe no-ops', async () => {
  const db = seedDb({}, {});
  const first = await bindAnalysis._test.bindCachedAnalysis(db, { organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID });
  assert.equal(first.bound, true);
  const second = await bindAnalysis._test.bindCachedAnalysis(db, { organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID });
  assert.equal(second.alreadyBound, true);
  assert.equal(db.updateCalls.length, 1);
});

// --- write allowlist / no workflow mutation ---

test('bindCachedAnalysis writes only the aiAnalysis field, nothing else', async () => {
  const db = seedDb({}, {});
  await bindAnalysis._test.bindCachedAnalysis(db, { organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID });
  assert.deepEqual(Object.keys(db.updateCalls[0].patch), ['aiAnalysis']);
});
test('bindCachedAnalysis never writes a status/assignment/closure-mutating field', async () => {
  const db = seedDb({}, {});
  await bindAnalysis._test.bindCachedAnalysis(db, { organizationId: CALLER.organizationId, uid: CALLER.uid, observationId: OBSERVATION_ID });
  const serialized = JSON.stringify(db.updateCalls[0].patch);
  for (const forbidden of ['"status"', '"assignedContractorUid"', '"assignedToUid"', '"closedAt"', '"completedAt"']) {
    assert.equal(serialized.includes(forbidden), false, `patch must never include ${forbidden}`);
  }
});

// --- structural guarantee: zero provider capability ---

test('bind-analysis.js has no require() of any provider-router, vision-provider selector, storage boundary, or object-read helper', () => {
  const source = fs.readFileSync(path.join(__dirname, '../api/ai/bind-analysis.js'), 'utf8');
  const requireCalls = [...source.matchAll(/require\(['"][^'"]+['"]\)/g)].map(m => m[0]);
  for (const forbidden of ['provider-router', 'active-vision-provider-selector', 'ai-storage-boundary', 'b2Client', 'readObjectBytes', 'getS3Client', 'GetObjectCommand', '@aws-sdk']) {
    assert.equal(requireCalls.some(call => call.includes(forbidden)), false, `must not require anything matching "${forbidden}"`);
  }
});
test('bind-analysis.js writes only through buildPersistedAiAnalysis, never spreads raw analysis/intelligence', () => {
  const source = fs.readFileSync(path.join(__dirname, '../api/ai/bind-analysis.js'), 'utf8');
  assert.match(source, /buildPersistedAiAnalysis\(operation\.response\.analysis, operation\.response\.intelligence\)/);
  assert.doesNotMatch(source, /\.\.\.operation\.response/);
  assert.doesNotMatch(source, /\.\.\.analysis/);
  assert.doesNotMatch(source, /\.\.\.intelligence/);
});
