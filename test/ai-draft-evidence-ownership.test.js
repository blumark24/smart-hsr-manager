'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateDraftOwnership, evaluateObservationAccess } = require('../api/ai/analyze.js')._test;

const caller = { uid: 'inspector-a', organizationId: 'org-a' };
const key = 'observations/org-a/obs-a/before/image.jpg';
const record = { ownerUid: caller.uid, organizationId: caller.organizationId, observationId: 'obs-a', objectKey: key, expiresAt: new Date(Date.now() + 60000) };

test('same-owner draft AI ownership passes and supports retry', () => {
  assert.equal(evaluateDraftOwnership(record, caller, 'obs-a', key).allowed, true);
  assert.equal(evaluateDraftOwnership(record, caller, 'obs-a', key).allowed, true);
});

test('same-org different-owner draft is denied', () => {
  assert.equal(evaluateDraftOwnership({ ...record, ownerUid: 'inspector-b' }, caller, 'obs-a', key).code, 'AI_REPORT_OWNER_DENIED');
});

test('cross-org draft is denied', () => {
  assert.equal(evaluateDraftOwnership({ ...record, organizationId: 'org-b' }, caller, 'obs-a', key).code, 'AI_CROSS_ORGANIZATION_DENIED');
});

test('mismatched, missing, or expired ownership is denied', () => {
  assert.equal(evaluateDraftOwnership({ ...record, objectKey: `${key}.other` }, caller, 'obs-a', key).allowed, false);
  assert.equal(evaluateDraftOwnership({ ...record, expiresAt: new Date(0) }, caller, 'obs-a', key).allowed, false);
});

test('saved-observation owner and tenant policy is preserved', () => {
  assert.equal(evaluateObservationAccess({ organizationId: 'org-a', createdByUid: 'inspector-a' }, caller).allowed, true);
  assert.equal(evaluateObservationAccess({ organizationId: 'org-a', createdByUid: 'inspector-b' }, caller).allowed, false);
  assert.equal(evaluateObservationAccess({ organizationId: 'org-b', createdByUid: 'inspector-a' }, caller).allowed, false);
});
