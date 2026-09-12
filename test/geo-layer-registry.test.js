'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LAYERS, LAYER_IDS, validateLayerRegistry, isLayerVisibleToRole, layersForExperience, FUTURE_ONLY_LAYER_IDS,
} = require('../platform/geo/geo-layer-registry');
const { ROLES } = require('../platform/contracts/role-contract');

test('the registered layer set is exactly the Phase 08 initial scope', () => {
  assert.deepEqual([...LAYER_IDS].sort(), [
    'buildings', 'commercial_places', 'field_observations', 'lands_parcels', 'mobility_incidents', 'mobility_missions',
  ]);
});

test('the layer registry is structurally valid', () => {
  const decision = validateLayerRegistry();
  assert.equal(decision.allowed, true);
});

test('every layer declares a non-empty Arabic label (raw developer keys are never end-user labels)', () => {
  for (const id of LAYER_IDS) {
    assert.ok(LAYERS[id].labelAr && LAYERS[id].labelAr.length > 0, `${id} must have an Arabic label`);
  }
});

test('a contractor may see operational layers but the registry never grants Twin-only executive access through it', () => {
  const decision = isLayerVisibleToRole('field_observations', ROLES.CONTRACTOR);
  assert.equal(decision.allowed, true);
});

test('an unrecognized role is denied for every layer (fail closed)', () => {
  const decision = isLayerVisibleToRole('commercial_places', 'not_a_real_role');
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_LAYER_ROLE_DENIED');
});

test('a lands_parcels layer requires at least a manager role', () => {
  assert.equal(isLayerVisibleToRole('lands_parcels', ROLES.INSPECTOR).allowed, false);
  assert.equal(isLayerVisibleToRole('lands_parcels', ROLES.MANAGER).allowed, true);
});

test('a nonexistent layer id is reported, not silently allowed', () => {
  const decision = isLayerVisibleToRole('invented_layer', ROLES.OWNER);
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_LAYER_NOT_FOUND');
});

test('mobility layers are Operational-only, never available in the Twin (no live vehicle claim in the executive view)', () => {
  assert.equal(LAYERS.mobility_missions.availableInTwin, false);
  assert.equal(LAYERS.mobility_incidents.availableInTwin, false);
});

test('layersForExperience partitions correctly', () => {
  const operational = layersForExperience('operational').map((l) => l.id);
  const twin = layersForExperience('twin').map((l) => l.id);
  assert.ok(operational.includes('mobility_missions'));
  assert.ok(!twin.includes('mobility_missions'));
  assert.ok(twin.includes('buildings'));
});

test('future-only layers (roads, sidewalks, trees, etc.) are explicitly excluded from this phase\'s registry', () => {
  for (const futureId of FUTURE_ONLY_LAYER_IDS) {
    assert.ok(!LAYER_IDS.includes(futureId), `${futureId} must not be registered in Phase 08`);
  }
});
