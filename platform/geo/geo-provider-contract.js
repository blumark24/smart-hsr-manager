'use strict';
// ============================================================================
// SMART HSR GEO CORE — geographic reference provider abstraction.
//
// Business/UI code never talks to Overture, a tile server, or any specific
// open-data vendor directly (Phase 08 brief: "avoid hard vendor lock-in...
// preserve provider abstraction"). It calls a PROVIDER that implements this
// shape:
//
//   queryPlaces({ bbox, limit })    -> { entities: GeoEntity[], attributions }
//   queryBuildings({ bbox, limit }) -> { entities: GeoEntity[], attributions }
//
// `createStaticReferenceExtractProvider()` below is the ONE concrete
// implementation this phase ships: it reads the small, real, versioned
// Overture extract committed under reference-data/al-qunfudhah/ (see that
// directory's SOURCE.md for exactly what it is and is not). It is
// explicitly documented as a stand-in for a future scalable, tiled/indexed
// production store — swapping it for one later means writing a new object
// with the same two methods, never touching a consumer.
//
// Every response is capped (see DEFAULT_LIMIT) and bbox-filtered — "do not
// load all Saudi commercial places into browser memory... avoid one giant
// GeoJSON" (Phase 08 brief).
// ============================================================================

const fs = require('fs');
const path = require('path');
const { createDecision } = require('../contracts/decision');
const { fromOverturePlace, fromOvertureBuilding } = require('./geo-entity-contract');
const { REFERENCE_PROVIDERS, MUNICIPAL_SOURCES } = require('./geo-source-truth');
const { getAttribution } = require('./geo-attribution-registry');

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

// Maps a real organizationId to the reference-data slug that carries a real
// extract for it. Deliberately a closed, explicit list — an organizationId
// not listed here has NO reference extract, and callers must get an honest
// empty result for it, never a fabricated one. This is the only place a new
// municipality's reference-data slug needs registering once a real extract
// for it exists (see reference-data/al-qunfudhah/SOURCE.md for how one is
// produced).
const ORGANIZATION_REFERENCE_SLUGS = Object.freeze({
  CnlVlKC7UcDMp2NZzjjT: 'al-qunfudhah', // Al-Qunfudhah (القنفذة) — see api/organization/context.js
});

function slugForOrganization(organizationId) {
  return ORGANIZATION_REFERENCE_SLUGS[organizationId] || null;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(isFiniteNumber)) {
    return createDecision(false, 'GEO_PROVIDER_BBOX_INVALID', 'bbox must be [xmin, ymin, xmax, ymax] of finite numbers.');
  }
  const [xmin, ymin, xmax, ymax] = bbox;
  if (xmin >= xmax || ymin >= ymax) {
    return createDecision(false, 'GEO_PROVIDER_BBOX_DEGENERATE', 'bbox min values must be strictly less than max values.');
  }
  if (xmin < -180 || xmax > 180 || ymin < -90 || ymax > 90) {
    return createDecision(false, 'GEO_PROVIDER_BBOX_OUT_OF_RANGE', 'bbox must lie within valid longitude/latitude ranges.');
  }
  return createDecision(true, 'GEO_PROVIDER_BBOX_VALID', 'bbox is valid.');
}

function geometryIntersectsBbox(geometry, bbox) {
  const [xmin, ymin, xmax, ymax] = bbox;
  const points = geometry.type === 'Point' ? [geometry.coordinates]
    : geometry.type === 'Polygon' ? geometry.coordinates[0]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat(1).flat(1)
    : [];
  return points.some((p) => Array.isArray(p) && p[0] >= xmin && p[0] <= xmax && p[1] >= ymin && p[1] <= ymax);
}

function loadGeoJson(filePath) {
  if (!fs.existsSync(filePath)) return { type: 'FeatureCollection', features: [] };
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Simple in-process memo — this is small, static, versioned reference data
// (see SOURCE.md), not a live feed, so caching for the life of the server
// process is correct, not stale.
const fileCache = new Map();
function loadCached(filePath) {
  if (!fileCache.has(filePath)) fileCache.set(filePath, loadGeoJson(filePath));
  return fileCache.get(filePath);
}

function createStaticReferenceExtractProvider({ baseDir } = {}) {
  const root = baseDir || path.join(__dirname, 'reference-data');

  function queryTheme({ municipality, fileName, normalize, bbox, limit }) {
    const bboxDecision = validateBbox(bbox);
    if (!bboxDecision.allowed) return { decision: bboxDecision, entities: [], attributions: [] };
    const cappedLimit = Math.min(isFiniteNumber(limit) && limit > 0 ? limit : DEFAULT_LIMIT, MAX_LIMIT);

    if (!municipality) {
      // No real extract registered for this municipality yet — an honest
      // empty result, never a fabricated one.
      return {
        decision: createDecision(true, 'GEO_PROVIDER_NO_EXTRACT_FOR_MUNICIPALITY', 'No reference extract is registered for this municipality yet.'),
        entities: [],
        attributions: [],
      };
    }

    const filePath = path.join(root, municipality, fileName);
    const collection = loadCached(filePath);
    const entities = [];
    for (const feature of collection.features || []) {
      if (!geometryIntersectsBbox(feature.geometry, bbox)) continue;
      const { decision, entity } = normalize(feature);
      if (decision.allowed && entity) entities.push(entity);
      if (entities.length >= cappedLimit) break;
    }
    return {
      decision: createDecision(true, 'GEO_PROVIDER_QUERY_OK', 'Query completed.', { municipality, count: entities.length, truncated: entities.length >= cappedLimit }),
      entities,
      attributions: [getAttribution(REFERENCE_PROVIDERS.OVERTURE)].filter(Boolean),
    };
  }

  return Object.freeze({
    source: REFERENCE_PROVIDERS.OVERTURE,
    queryPlaces({ municipality, bbox, limit }) {
      return queryTheme({ municipality, fileName: 'places.geojson', normalize: fromOverturePlace, bbox, limit });
    },
    queryBuildings({ municipality, bbox, limit }) {
      return queryTheme({ municipality, fileName: 'buildings.geojson', normalize: fromOvertureBuilding, bbox, limit });
    },
    // Which municipalities currently have a real committed extract. Any
    // municipality NOT in this list gets an honest empty result — never a
    // fabricated one. See geo-provider-contract.test.js.
    availableMunicipalities: fs.existsSync(root)
      ? fs.readdirSync(root).filter((name) => fs.statSync(path.join(root, name)).isDirectory())
      : [],
  });
}

// Validates that an object at least exposes the two required methods —
// used by tests to prove any future provider (a real tile/index-backed one)
// still conforms to the same shape before it can be wired in.
function validateProviderShape(provider) {
  if (!provider || typeof provider.queryPlaces !== 'function' || typeof provider.queryBuildings !== 'function') {
    return createDecision(false, 'GEO_PROVIDER_SHAPE_INVALID', 'A provider must implement queryPlaces() and queryBuildings().');
  }
  return createDecision(true, 'GEO_PROVIDER_SHAPE_VALID', 'The provider implements the required interface.');
}

module.exports = Object.freeze({
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ORGANIZATION_REFERENCE_SLUGS,
  slugForOrganization,
  validateBbox,
  geometryIntersectsBbox,
  createStaticReferenceExtractProvider,
  validateProviderShape,
  MUNICIPAL_SOURCES,
});
