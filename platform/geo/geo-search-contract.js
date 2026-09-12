'use strict';
// ============================================================================
// SMART HSR GEO CORE — search/geocoding provider abstraction.
//
// "Create provider abstraction for search/geocoding... Do NOT hard-code one
// proprietary provider into business logic" (Phase 08 brief). Business/UI
// code calls `search(query, { entities, organization })` on whichever
// provider is configured — it never imports a geocoder SDK itself.
//
// `createLocalEntitySearchProvider()` is the ONE provider this phase ships:
// a pure, no-network search over (a) the current municipality's own
// configured name/center and (b) the GeoEntity list already loaded into the
// current map session (commercial places, buildings, field observations,
// etc.) by name/category/id. It deliberately does not call any external
// geocoding API — this sandbox's outbound network policy also does not
// allow one (see reference-data SOURCE.md), and the brief itself warns
// against exposing a provider API key client-side. A future real geocoder
// integration is a drop-in replacement implementing the same `search()`
// method, never a change to consuming UI code.
// ============================================================================

const { createDecision } = require('../contracts/decision');

function validateSearchProviderShape(provider) {
  if (!provider || typeof provider.search !== 'function') {
    return createDecision(false, 'GEO_SEARCH_PROVIDER_SHAPE_INVALID', 'A search provider must implement search(query, context).');
  }
  return createDecision(true, 'GEO_SEARCH_PROVIDER_SHAPE_VALID', 'The search provider implements the required interface.');
}

function normalizeQuery(query) {
  return typeof query === 'string' ? query.trim().toLocaleLowerCase('ar') : '';
}

function entityMatchesQuery(entity, needle) {
  const name = entity.metadata && typeof entity.metadata.name === 'string' ? entity.metadata.name.toLocaleLowerCase('ar') : '';
  const category = typeof entity.category === 'string' ? entity.category.toLocaleLowerCase('ar') : '';
  return (name && name.includes(needle)) || (category && category.includes(needle)) || entity.id.toLowerCase().includes(needle.toLowerCase());
}

function createLocalEntitySearchProvider() {
  return Object.freeze({
    search(query, { entities = [], organization = null } = {}) {
      const needle = normalizeQuery(query);
      if (!needle) {
        return { decision: createDecision(false, 'GEO_SEARCH_QUERY_REQUIRED', 'A non-empty search query is required.'), results: [] };
      }
      const results = [];
      if (organization && typeof organization.organizationName === 'string' &&
        organization.organizationName.toLocaleLowerCase('ar').includes(needle)) {
        results.push({ kind: 'municipality', label: organization.organizationName, target: { organizationId: organization.organizationId } });
      }
      for (const entity of entities) {
        if (entityMatchesQuery(entity, needle)) {
          results.push({ kind: 'entity', label: (entity.metadata && entity.metadata.name) || entity.category || entity.id, target: { entityId: entity.id } });
        }
      }
      return { decision: createDecision(true, 'GEO_SEARCH_OK', 'Search completed.', { count: results.length }), results };
    },
  });
}

module.exports = Object.freeze({
  validateSearchProviderShape,
  createLocalEntitySearchProvider,
});
