'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const analyze = require('../api/ai/analyze.js')._test;
const { evaluateAIStorageInput } = require('../platform/ai/ai-storage-boundary');
const { parseCanonicalObjectKey } = require('../platform/storage/object-key-policy');

const root = path.join(__dirname, '..');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const caller = Object.freeze({ uid: 'inspector-a', role: 'inspector', organizationId: 'org-a' });
const observationId = 'obs-1';
const imageObjectKey = 'observations/org-a/obs-1/before/image-1.jpg';

test('draft AI 200 contract survives save and persisted AI authorization', () => {
  const draft = { organizationId: caller.organizationId, createdByUid: caller.uid, imageObjectKey };
  assert.equal(analyze.evaluateObservationAccess(draft, caller).allowed, true);
  assert.equal(evaluateAIStorageInput({ organizationId: caller.organizationId, observationId, imageReference: imageObjectKey }).code, 'AI_STORAGE_CANONICAL_PRIVATE');

  const persisted = { ...draft, status: 'PENDING', assignmentId: null };
  assert.deepEqual(parseCanonicalObjectKey(persisted.imageObjectKey), {
    organizationId: 'org-a', observationId: 'obs-1', evidenceType: 'before', objectId: 'image-1.jpg'
  });
  assert.equal(analyze.evaluateObservationAccess(persisted, caller).allowed, true);
  assert.equal(evaluateAIStorageInput({ organizationId: caller.organizationId, observationId, imageReference: persisted.imageObjectKey }).allowed, true);
});

test('different inspector and cross-organization persisted analysis remain denied', () => {
  const observation = { organizationId: 'org-a', createdByUid: 'inspector-a', imageObjectKey };
  assert.equal(analyze.evaluateObservationAccess(observation, { ...caller, uid: 'inspector-b' }).code, 'AI_REPORT_OWNER_DENIED');
  assert.equal(analyze.evaluateObservationAccess(observation, { ...caller, organizationId: 'org-b' }).code, 'AI_CROSS_ORGANIZATION_DENIED');
  assert.equal(evaluateAIStorageInput({ organizationId: 'org-b', observationId, imageReference: imageObjectKey }).code, 'AI_STORAGE_SCOPE_DENIED');
});

test('new canonical parser remains traversal-safe', () => {
  assert.equal(parseCanonicalObjectKey('observations/org-a/obs-1/before/..jpg'), null);
  assert.equal(parseCanonicalObjectKey('observations/org-a/obs-1/before/image..jpg'), null);
});

test('Inspector save persists the canonical ownership fields used by analyze', () => {
  assert.match(dashboard, /imageObjectKey: isLocalDemoReference\(uploadedUrl\) \? null : uploadedUrl/);
  assert.match(dashboard, /organizationId: inspectorContext\.organizationId/);
  assert.match(dashboard, /createdByUid: auth\.currentUser\.uid/);
});

test('AI persistence cannot mutate workflow authority fields', () => {
  const source = fs.readFileSync(path.join(root, 'api/ai/analyze.js'), 'utf8');
  assert.match(source, /observationSnap\.ref\.update\(\{ aiAnalysis: persistedAiAnalysis \}\)/);
  const persistence = source.slice(source.indexOf('const persistedAiAnalysis'), source.indexOf('return sendJson', source.indexOf('const persistedAiAnalysis')));
  assert.doesNotMatch(persistence, /(?:status|assignment|completion|closure|closedAt)\s*:/i);
});
