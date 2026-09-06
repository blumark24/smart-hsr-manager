'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalBeforeEvidenceKey, evaluateFinalization } = require('../api/storage/finalize')._test;

const caller = { uid: 'ins-a', organizationId: 'org-a' };
const observationId = 'obs-a';
const objectKey = 'observations/org-a/obs-a/before/image-1.jpg';
const upload = {
  ownerUid: caller.uid,
  organizationId: caller.organizationId,
  observationId,
  objectKey,
  status: 'PENDING',
};
const observation = {
  createdByUid: caller.uid,
  organizationId: caller.organizationId,
  status: 'PENDING',
};

test('own PENDING evidence binding passes and preserves PENDING to FINALIZED path', () => {
  assert.equal(evaluateFinalization(upload, observation, caller, observationId, objectKey).allowed, true);
});

test('same-organization different-owner binding is denied', () => {
  assert.equal(evaluateFinalization({ ...upload, ownerUid: 'ins-b' }, observation, caller, observationId, objectKey).code, 'owner_denied');
  assert.equal(evaluateFinalization(upload, { ...observation, createdByUid: 'ins-b' }, caller, observationId, objectKey).code, 'owner_denied');
});

test('cross-organization binding is denied', () => {
  assert.equal(evaluateFinalization({ ...upload, organizationId: 'org-b' }, observation, caller, observationId, objectKey).code, 'cross_organization_denied');
  assert.equal(evaluateFinalization(upload, { ...observation, organizationId: 'org-b' }, caller, observationId, objectKey).code, 'cross_organization_denied');
});

test('forged object keys and prefixes are denied', () => {
  for (const forged of [
    'observations/org-b/obs-a/before/image-1.jpg',
    'observations/org-a/obs-b/before/image-1.jpg',
    'observations/org-a/obs-a/after/image-1.jpg',
    'observations/org-a/obs-a/before/../image-1.jpg',
    'https://example.test/image-1.jpg',
  ]) {
    assert.equal(canonicalBeforeEvidenceKey(forged, caller.organizationId, observationId), '');
    assert.equal(evaluateFinalization({ ...upload, objectKey: forged }, observation, caller, observationId, forged).allowed, false);
  }
});

test('workflow mutation is denied by requiring an unchanged PENDING observation', () => {
  for (const status of ['IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED']) {
    assert.equal(evaluateFinalization(upload, { ...observation, status }, caller, observationId, objectKey).code, 'observation_not_pending');
  }
});

test('existing different evidence binding is denied', () => {
  const changed = { ...observation, imageObjectKey: 'observations/org-a/obs-a/before/other.jpg' };
  assert.equal(evaluateFinalization(upload, changed, caller, observationId, objectKey).code, 'evidence_binding_denied');
});

test('exact finalized retry is idempotently accepted', () => {
  const bound = { ...observation, imageObjectKey: objectKey, imagePath: objectKey };
  const decision = evaluateFinalization({ ...upload, status: 'FINALIZED' }, bound, caller, observationId, objectKey);
  assert.deepEqual(decision, { allowed: true, alreadyFinalized: true });
});
