'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { getAttribution, assertAttributed, listAttributions } = require('../platform/geo/geo-attribution-registry');

test('overture has a registered attribution with a real source URL and license', () => {
  const attribution = getAttribution('overture');
  assert.ok(attribution);
  assert.equal(attribution.url, 'https://overturemaps.org');
  assert.ok(attribution.license && attribution.license.length > 0);
});

test('assertAttributed passes for a registered source and fails for an unregistered one', () => {
  assert.equal(assertAttributed('overture').allowed, true);
  const decision = assertAttributed('some_unlisted_vendor');
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_ATTRIBUTION_MISSING');
});

test('listAttributions returns at least the overture and basemap entries', () => {
  const all = listAttributions();
  assert.ok(all.some((a) => a.source === 'overture'));
  assert.ok(all.some((a) => a.source === 'osm_basemap'));
});
