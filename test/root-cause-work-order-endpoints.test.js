'use strict';
// Endpoint auth/ownership/cross-org tests for api/report/root-cause.js and
// api/report/work-order.js. Exercises only what each endpoint exposes via
// module.exports._test (cleanId, resolveInspectorContext,
// evaluateObservationAccess, handler) -- the same proven Inspector
// authentication/organization/observation-access/ownership contract already
// used by api/ai/analyze.js. No mocking of getDb/verifyRequestToken is
// introduced, since those are not part of the _test surface; full-handler
// success and missing-aiAnalysis behavior are proven directly against the
// pure business-logic modules in test/root-cause-advisory.test.js and
// test/work-order-draft.test.js instead.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const rootCause = require('../api/report/root-cause');
const workOrder = require('../api/report/work-order');

function mockRes() {
  let statusCode = 0;
  let body = null;

  return {
    setHeader() {},
    end(payload) {
      body = JSON.parse(payload);
    },
    set statusCode(value) {
      statusCode = value;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

for (const [name, endpoint] of [['root-cause', rootCause], ['work-order', workOrder]]) {

  test(`${name}: handler rejects non-POST methods`, async () => {
    const res = mockRes();
    await endpoint._test.handler({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.body.ok, false);
  });

  test(`${name}: handler rejects an unauthenticated request before any Firestore read`, async () => {
    const res = mockRes();
    await endpoint._test.handler({ method: 'POST', headers: {}, body: { observationId: 'obs-1' } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.advisoryOnly, true);
  });

  test(`${name}: resolveInspectorContext returns null when the caller record does not exist`, async () => {
    const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) };
    assert.equal(await endpoint._test.resolveInspectorContext(db, 'uid-1'), null);
  });

  test(`${name}: resolveInspectorContext returns null for a non-inspector role`, async () => {
    const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: 'contractor', organizationId: 'org-a' }) }) }) }) };
    assert.equal(await endpoint._test.resolveInspectorContext(db, 'uid-1'), null);
  });

  test(`${name}: resolveInspectorContext returns null for an inactive inspector`, async () => {
    const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: 'inspector', organizationId: 'org-a', active: false }) }) }) }) };
    assert.equal(await endpoint._test.resolveInspectorContext(db, 'uid-1'), null);
  });

  test(`${name}: resolveInspectorContext returns null for an inspector with no organizationId`, async () => {
    const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: 'inspector', organizationId: '' }) }) }) }) };
    assert.equal(await endpoint._test.resolveInspectorContext(db, 'uid-1'), null);
  });

  test(`${name}: resolveInspectorContext returns a scoped context for an active inspector (identical contract to Vision)`, async () => {
    const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: 'inspector', organizationId: 'org-a' }) }) }) }) };
    const context = await endpoint._test.resolveInspectorContext(db, 'uid-1');
    assert.deepEqual(context, { uid: 'uid-1', role: 'inspector', organizationId: 'org-a' });
  });

  test(`${name}: evaluateObservationAccess denies cross-organization access`, () => {
    const decision = endpoint._test.evaluateObservationAccess(
      { organizationId: 'org-b', createdByUid: 'uid-1' },
      { uid: 'uid-1', organizationId: 'org-a' },
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, 'AI_CROSS_ORGANIZATION_DENIED');
  });

  test(`${name}: evaluateObservationAccess denies a non-owner in the same organization`, () => {
    const decision = endpoint._test.evaluateObservationAccess(
      { organizationId: 'org-a', createdByUid: 'uid-OTHER-inspector' },
      { uid: 'uid-1', organizationId: 'org-a' },
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, 'AI_REPORT_OWNER_DENIED');
  });

  test(`${name}: evaluateObservationAccess allows the same-org owning inspector`, () => {
    const decision = endpoint._test.evaluateObservationAccess(
      { organizationId: 'org-a', createdByUid: 'uid-1' },
      { uid: 'uid-1', organizationId: 'org-a' },
    );
    assert.equal(decision.allowed, true);
  });

  test(`${name}: cleanId behaves the same as the Vision endpoint (well-formed Firestore id)`, () => {
    assert.equal(endpoint._test.cleanId('obs-abc123_XYZ'), 'obs-abc123_XYZ');
    assert.equal(endpoint._test.cleanId('../etc/passwd'), '');
    assert.equal(endpoint._test.cleanId(''), '');
  });
}

test('root-cause.js contains no Firestore write call anywhere in the handler', () => {
  const source = fs.readFileSync(__dirname + '/../api/report/root-cause.js', 'utf8');
  assert.doesNotMatch(source, /\.set\(|\.update\(|\.add\(|\.delete\(/);
});

test('work-order.js contains no Firestore write call anywhere in the handler', () => {
  const source = fs.readFileSync(__dirname + '/../api/report/work-order.js', 'utf8');
  assert.doesNotMatch(source, /\.set\(|\.update\(|\.add\(|\.delete\(/);
});
