'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createLocalEntitySearchProvider, validateSearchProviderShape } = require('../platform/geo/geo-search-contract');

test('the local search provider conforms to the search provider interface', () => {
  const provider = createLocalEntitySearchProvider();
  assert.equal(validateSearchProviderShape(provider).allowed, true);
});

test('search matches an entity by name and by category, never returning entities that do not match', () => {
  const provider = createLocalEntitySearchProvider();
  const entities = [
    { id: 'a', category: 'restaurant', metadata: { name: 'مطعم الكورنيش' } },
    { id: 'b', category: 'pharmacy', metadata: { name: 'صيدلية النهضة' } },
  ];
  const byName = provider.search('الكورنيش', { entities });
  assert.equal(byName.results.length, 1);
  assert.equal(byName.results[0].target.entityId, 'a');

  const byCategory = provider.search('pharmacy', { entities });
  assert.equal(byCategory.results.length, 1);
  assert.equal(byCategory.results[0].target.entityId, 'b');
});

test('search also matches a configured municipality name', () => {
  const provider = createLocalEntitySearchProvider();
  const result = provider.search('القنفذة', { entities: [], organization: { organizationId: 'org-a', organizationName: 'بلدية القنفذة' } });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].kind, 'municipality');
});

test('an empty query is refused rather than returning everything', () => {
  const provider = createLocalEntitySearchProvider();
  const { decision, results } = provider.search('   ', { entities: [{ id: 'a', metadata: {} }] });
  assert.equal(decision.allowed, false);
  assert.deepEqual(results, []);
});
