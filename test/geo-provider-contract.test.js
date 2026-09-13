'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createStaticReferenceExtractProvider, validateProviderShape, validateBbox, slugForOrganization,
} = require('../platform/geo/geo-provider-contract');

const AL_QUNFUDHAH_ORG_ID = 'CnlVlKC7UcDMp2NZzjjT';
const REAL_BBOX = [41.065, 19.118, 41.093, 19.136]; // matches reference-data/al-qunfudhah/SOURCE.md

test('the static reference provider conforms to the provider interface', () => {
  const provider = createStaticReferenceExtractProvider();
  assert.equal(validateProviderShape(provider).allowed, true);
});

test('an object missing queryBuildings does not conform', () => {
  const decision = validateProviderShape({ queryPlaces: () => {} });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_PROVIDER_SHAPE_INVALID');
});

test('validateBbox rejects a degenerate or out-of-range bbox', () => {
  assert.equal(validateBbox([41.1, 19.1, 41.0, 19.2]).allowed, false); // xmin > xmax
  assert.equal(validateBbox([200, 19.1, 201, 19.2]).allowed, false); // out of longitude range
  assert.equal(validateBbox(REAL_BBOX).allowed, true);
});

test('slugForOrganization resolves the known Al-Qunfudhah organizationId and nothing else', () => {
  assert.equal(slugForOrganization(AL_QUNFUDHAH_ORG_ID), 'al-qunfudhah');
  assert.equal(slugForOrganization('some-other-org'), null);
});

test('queryPlaces returns REAL, non-fabricated Overture places for the committed Al-Qunfudhah extract', () => {
  const provider = createStaticReferenceExtractProvider();
  const { decision, entities, attributions } = provider.queryPlaces({ municipality: 'al-qunfudhah', bbox: REAL_BBOX, limit: 500 });
  assert.equal(decision.allowed, true);
  assert.ok(entities.length > 0, 'expected at least one real place in the committed extract');
  assert.ok(attributions.length > 0 && attributions[0].source === 'overture');
  for (const entity of entities) {
    assert.equal(entity.truthLevel, 'GEOGRAPHIC_REFERENCE');
    assert.equal(entity.status, null, 'a reference entity must never carry a fabricated status/license');
    assert.equal(entity.organizationId, null, 'open reference data is not tenant-scoped');
  }
});

test('queryBuildings preserves the one real trusted height in the fixture and invents none for the rest', () => {
  const provider = createStaticReferenceExtractProvider();
  const { entities } = provider.queryBuildings({ municipality: 'al-qunfudhah', bbox: REAL_BBOX, limit: 2000 });
  const withHeight = entities.filter((e) => e.metadata.heightMeters !== undefined);
  const withoutHeight = entities.filter((e) => e.metadata.heightMeters === undefined);
  assert.equal(withHeight.length, 1, 'exactly one building in this real fixture carries a sourced height');
  assert.equal(withHeight[0].metadata.heightMeters, 5);
  assert.ok(withoutHeight.length > 100, 'the vast majority of real buildings here have no source height and must not have one invented');
});

test('an unmapped municipality gets an honest empty result, never a fabricated one', () => {
  const provider = createStaticReferenceExtractProvider();
  const { decision, entities } = provider.queryPlaces({ municipality: slugForOrganization('unknown-org'), bbox: REAL_BBOX, limit: 500 });
  assert.equal(decision.code, 'GEO_PROVIDER_NO_EXTRACT_FOR_MUNICIPALITY');
  assert.deepEqual(entities, []);
});

test('results are capped by limit — never one giant dump', () => {
  const provider = createStaticReferenceExtractProvider();
  const { entities } = provider.queryBuildings({ municipality: 'al-qunfudhah', bbox: REAL_BBOX, limit: 10 });
  assert.equal(entities.length, 10);
});

test('an invalid bbox is refused before any file read is attempted', () => {
  const provider = createStaticReferenceExtractProvider();
  const { decision, entities } = provider.queryPlaces({ municipality: 'al-qunfudhah', bbox: [1, 1], limit: 10 });
  assert.equal(decision.allowed, false);
  assert.deepEqual(entities, []);
});
