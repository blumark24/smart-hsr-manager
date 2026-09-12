'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ENTITY_TYPE, createGeoEntity, validateGeoEntity,
  fromOverturePlace, fromOvertureBuilding, fromFieldObservation, computeCentroid,
} = require('../platform/geo/geo-entity-contract');

function basePlaceEntity(overrides = {}) {
  return {
    id: 'overture:place:abc', entityType: ENTITY_TYPE.COMMERCIAL_PLACE,
    geometry: { type: 'Point', coordinates: [41.07, 19.12] },
    source: 'overture', ...overrides,
  };
}

test('a well-formed geographic-reference entity is valid', () => {
  const { decision, entity } = createGeoEntity(basePlaceEntity());
  assert.equal(decision.allowed, true);
  assert.equal(entity.truthLevel, 'GEOGRAPHIC_REFERENCE');
  assert.deepEqual(entity.centroid, [41.07, 19.12]);
});

test('an unrecognized source is rejected', () => {
  const decision = validateGeoEntity(basePlaceEntity({ source: 'google_maps' }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_ENTITY_SOURCE_UNRECOGNIZED');
});

test('an unsupported entity type is rejected', () => {
  const decision = validateGeoEntity(basePlaceEntity({ entityType: 'invented_type' }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_ENTITY_TYPE_UNSUPPORTED');
});

test('a missing geometry is rejected', () => {
  const decision = validateGeoEntity(basePlaceEntity({ geometry: null }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_ENTITY_GEOMETRY_REQUIRED');
});

test('a geographic-reference entity must never carry an authoritative status — no fabricated license/status', () => {
  const decision = validateGeoEntity(basePlaceEntity({ status: 'LICENSED' }));
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_ENTITY_STATUS_REQUIRES_AUTHORITY');
});

test('a municipal-authority entity (field observation) may carry a real status', () => {
  const { decision, entity } = createGeoEntity({
    id: 'field:observation:o1', entityType: ENTITY_TYPE.FIELD_OBSERVATION,
    geometry: { type: 'Point', coordinates: [41.07, 19.12] },
    source: 'field_observation', status: 'PENDING',
  });
  assert.equal(decision.allowed, true);
  assert.equal(entity.truthLevel, 'MUNICIPAL_AUTHORITY');
  assert.equal(entity.status, 'PENDING');
});

test('metadata is a closed allowlist — an invented field is silently dropped, never smuggled through', () => {
  const { entity } = createGeoEntity(basePlaceEntity({ metadata: { name: 'مطعم', licenseStatus: 'ساري', estimatedRevenue: 999999 } }));
  assert.equal(entity.metadata.name, 'مطعم');
  assert.equal('licenseStatus' in entity.metadata, false);
  assert.equal('estimatedRevenue' in entity.metadata, false);
});

test('computeCentroid averages a polygon ring', () => {
  const centroid = computeCentroid({ type: 'Polygon', coordinates: [[[0, 0], [0, 2], [2, 2], [2, 0]]] });
  assert.deepEqual(centroid, [1, 1]);
});

test('computeCentroid returns null for an unsupported/empty geometry', () => {
  assert.equal(computeCentroid({ type: 'LineString', coordinates: [] }), null);
  assert.equal(computeCentroid(null), null);
});

test('fromOverturePlace normalizes a real Overture place feature, never inferring a municipal relationship', () => {
  const feature = {
    id: 'ov-place-1',
    geometry: { type: 'Point', coordinates: [41.073, 19.129] },
    properties: {
      categories: { primary: 'restaurant' },
      names: { primary: 'مطعم القنفذة' },
      sources: [{ dataset: 'Meta', update_time: '2026-08-01T00:00:00.000Z' }],
      confidence: 0.87,
    },
  };
  const { decision, entity } = fromOverturePlace(feature);
  assert.equal(decision.allowed, true);
  assert.equal(entity.id, 'overture:place:ov-place-1');
  assert.equal(entity.category, 'restaurant');
  assert.equal(entity.metadata.name, 'مطعم القنفذة');
  assert.equal(entity.municipalRecordId, null);
  assert.equal(entity.status, null);
});

test('fromOvertureBuilding uses a real source height when present, and omits it entirely when absent (no invented height)', () => {
  const withHeight = fromOvertureBuilding({
    id: 'ov-bld-1', geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0]]] },
    properties: { height: 12.5, sources: [{ dataset: 'OpenStreetMap' }] },
  });
  assert.equal(withHeight.entity.metadata.heightMeters, 12.5);
  assert.equal(withHeight.entity.metadata.heightSource, 'OpenStreetMap');

  const withoutHeight = fromOvertureBuilding({
    id: 'ov-bld-2', geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0]]] },
    properties: { sources: [{ dataset: 'Microsoft ML Buildings' }] },
  });
  assert.equal('heightMeters' in withoutHeight.entity.metadata, false);
  assert.equal('numFloors' in withoutHeight.entity.metadata, false);
});

test('fromFieldObservation requires already-resolved, valid coordinates and never re-derives tenant scope itself', () => {
  const rejected = fromFieldObservation({ id: 'obs1', organizationId: 'org-a' }, { lat: NaN, lng: NaN });
  assert.equal(rejected.decision.allowed, false);
  assert.equal(rejected.decision.code, 'GEO_ENTITY_COORDINATES_REQUIRED');

  const { decision, entity } = fromFieldObservation(
    { id: 'obs1', organizationId: 'org-a', status: 'PENDING', createdAt: '2026-01-01T00:00:00.000Z' },
    { lat: 19.12, lng: 41.07 },
  );
  assert.equal(decision.allowed, true);
  assert.equal(entity.organizationId, 'org-a');
  assert.equal(entity.status, 'PENDING');
  assert.equal(entity.productId, 'field');
});
