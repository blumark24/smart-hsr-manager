'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateMapTriggeredWrite, assertNoDirectFirestoreWrite, ALLOWED_MAP_TRIGGERED_ACTIONS } = require('../platform/geo/geo-write-guard');

test('Phase 08 registers no map-triggered mutation — the Entity Card is navigation-only this phase', () => {
  assert.deepEqual(Object.keys(ALLOWED_MAP_TRIGGERED_ACTIONS), []);
});

test('an unregistered map-triggered action is always refused, never defaulted to allow', () => {
  const decision = evaluateMapTriggeredWrite({ action: 'delete_building', endpoint: '/api/anything', method: 'POST' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_WRITE_ACTION_NOT_REGISTERED');
});

test('a map surface may never write to Firestore directly', () => {
  const decision = assertNoDirectFirestoreWrite();
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_DIRECT_FIRESTORE_WRITE_FORBIDDEN');
});
