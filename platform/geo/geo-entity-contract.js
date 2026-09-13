'use strict';
// ============================================================================
// SMART HSR GEO CORE — canonical GeoEntity contract.
//
// A GeoEntity is the ONE normalized shape every map surface (Operational Map
// or Twin) ever renders, regardless of which product or provider produced
// it. Business workflows never hand a raw Overture feature or a raw
// Firestore observation document straight to a map adapter — they go
// through one of the `from*()` factories below first, so every adapter only
// ever has to understand ONE shape.
//
// Fields (see the Phase 08 brief's "CANONICAL GEO ENTITY" section):
//   id                 stable internal reference (see idFor* below)
//   organizationId     municipality/tenant scope, or null for global
//                       reference data (a building/place is not tenant data)
//   entityType         one of ENTITY_TYPE
//   category           free-text category label already provided by the
//                       source (never invented)
//   geometry           GeoJSON geometry (Point/Polygon/etc.), verbatim
//   centroid           [lng, lat] — always present, computed if the source
//                       geometry is not itself a point
//   truthLevel         GEOGRAPHIC_REFERENCE | MUNICIPAL_AUTHORITY
//   source             provider/product key (see geo-source-truth.js)
//   sourceFeatureId    the source's own id for this feature, or null
//   sourceUpdatedAt    ISO string, or null if the source does not carry one
//   municipalRecordId  the SMART HSR product record this entity links to,
//                       or null if there is no municipal linkage yet
//   productId          which SMART HSR product owns municipalRecordId
//                       (e.g. 'field', 'lands', 'mobility'), or null
//   status             authoritative status string, ONLY ever set from a
//                       MUNICIPAL_AUTHORITY source — never inferred
//   metadata           a small, closed set of real fields only (see below)
//   linkedResources    array of { productId, recordId, kind } — never
//                       invented, only ever populated from a real linkage
//   createdAt/updatedAt ISO strings when known, else null
//
// This module is pure (no I/O, no Firebase, no map-engine dependency) so it
// can be required from both server (api/) and any future build step, and
// unit-tested directly — same convention as platform/contracts/*.
// ============================================================================

const { createDecision, deepFreeze } = require('../contracts/decision');
const { TRUTH_LEVEL, REFERENCE_PROVIDERS, MUNICIPAL_SOURCES, truthLevelForSource } = require('./geo-source-truth');

const ENTITY_TYPE = Object.freeze({
  COMMERCIAL_PLACE: 'commercial_place',
  BUILDING: 'building',
  FIELD_OBSERVATION: 'field_observation',
  LANDS_PARCEL: 'lands_parcel',
  MOBILITY_MISSION: 'mobility_mission',
  MOBILITY_INCIDENT: 'mobility_incident',
});
const ENTITY_TYPE_VALUES = Object.freeze(Object.values(ENTITY_TYPE));

// Closed metadata key allowlist — mirrors the codebase's existing pattern
// (platform/assignments' COMMON_DOMAIN_KEYS-style allowlists) of never
// accepting free-form JSON into a contract object, so a caller can never
// smuggle an invented field ("licenseStatus", "estimatedRevenue", ...) into
// a GeoEntity's metadata bag by accident.
const METADATA_KEYS = Object.freeze([
  'name', 'nameAr', 'confidence', 'heightMeters', 'heightSource',
  'numFloors', 'numFloorsSource', 'accuracyMeters', 'photoCount',
]);

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isFiniteCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidLngLat(pair) {
  return Array.isArray(pair) && pair.length >= 2 &&
    isFiniteCoordinate(pair[0]) && pair[0] >= -180 && pair[0] <= 180 &&
    isFiniteCoordinate(pair[1]) && pair[1] >= -90 && pair[1] <= 90;
}

// Centroid for the geometry types this phase actually needs (Point,
// Polygon, MultiPolygon). Deliberately does not attempt a geodesically
// correct centroid — a simple ring-vertex average is sufficient for map
// labeling/camera-focus purposes and this module never claims survey-grade
// precision.
function computeCentroid(geometry) {
  if (!geometry || typeof geometry !== 'object') return null;
  if (geometry.type === 'Point' && isValidLngLat(geometry.coordinates)) {
    return [geometry.coordinates[0], geometry.coordinates[1]];
  }
  const ring = geometry.type === 'Polygon' ? geometry.coordinates[0]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates[0][0]
    : null;
  if (!Array.isArray(ring) || !ring.length) return null;
  let sumLng = 0, sumLat = 0, count = 0;
  for (const point of ring) {
    if (!isValidLngLat(point)) continue;
    sumLng += point[0]; sumLat += point[1]; count += 1;
  }
  if (!count) return null;
  return [sumLng / count, sumLat / count];
}

function cleanMetadata(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const key of METADATA_KEYS) {
    if (raw[key] !== undefined && raw[key] !== null) out[key] = raw[key];
  }
  return out;
}

function validateGeoEntity(value) {
  if (!value || typeof value !== 'object') {
    return createDecision(false, 'GEO_ENTITY_REQUIRED', 'A geo entity is required.');
  }
  if (!normalizeId(value.id)) {
    return createDecision(false, 'GEO_ENTITY_ID_REQUIRED', 'A geo entity id is required.');
  }
  if (!ENTITY_TYPE_VALUES.includes(value.entityType)) {
    return createDecision(false, 'GEO_ENTITY_TYPE_UNSUPPORTED', 'The entity type is not supported.', { entityType: value.entityType });
  }
  if (!value.geometry || typeof value.geometry !== 'object' || !value.geometry.type) {
    return createDecision(false, 'GEO_ENTITY_GEOMETRY_REQUIRED', 'A GeoJSON geometry is required.');
  }
  const truthLevel = truthLevelForSource(value.source);
  if (!truthLevel) {
    return createDecision(false, 'GEO_ENTITY_SOURCE_UNRECOGNIZED', 'The entity source is not a recognized reference provider or municipal source.', { source: value.source });
  }
  if (truthLevel === TRUTH_LEVEL.GEOGRAPHIC_REFERENCE && value.status) {
    return createDecision(false, 'GEO_ENTITY_STATUS_REQUIRES_AUTHORITY', 'A geographic-reference entity must never carry an authoritative status — status may only come from a municipal-authority source.', { source: value.source });
  }
  return createDecision(true, 'GEO_ENTITY_VALID', 'The geo entity is structurally valid.');
}

function createGeoEntity(value) {
  const centroid = value.centroid && isValidLngLat(value.centroid) ? value.centroid : computeCentroid(value.geometry);
  const candidate = {
    id: normalizeId(value.id),
    organizationId: normalizeId(value.organizationId) || null,
    entityType: value.entityType,
    category: typeof value.category === 'string' && value.category ? value.category : null,
    geometry: value.geometry,
    centroid,
    truthLevel: truthLevelForSource(value.source),
    source: value.source,
    sourceFeatureId: normalizeId(value.sourceFeatureId) || null,
    sourceUpdatedAt: typeof value.sourceUpdatedAt === 'string' && value.sourceUpdatedAt ? value.sourceUpdatedAt : null,
    municipalRecordId: normalizeId(value.municipalRecordId) || null,
    productId: normalizeId(value.productId) || null,
    status: typeof value.status === 'string' && value.status ? value.status : null,
    metadata: cleanMetadata(value.metadata),
    linkedResources: Array.isArray(value.linkedResources)
      ? value.linkedResources
        .filter((r) => r && normalizeId(r.productId) && normalizeId(r.recordId) && normalizeId(r.kind))
        .map((r) => ({ productId: normalizeId(r.productId), recordId: normalizeId(r.recordId), kind: normalizeId(r.kind) }))
      : [],
    createdAt: typeof value.createdAt === 'string' && value.createdAt ? value.createdAt : null,
    updatedAt: typeof value.updatedAt === 'string' && value.updatedAt ? value.updatedAt : null,
  };
  const validation = validateGeoEntity(candidate);
  if (!validation.allowed) return { decision: validation, entity: null };
  return deepFreeze({ decision: validation, entity: deepFreeze(candidate) });
}

// --- Overture Places -> GeoEntity -------------------------------------------------
// `feature` is one raw Overture "place" theme GeoJSON feature as produced by
// the overturemaps extraction (see reference-data/*/SOURCE.md). Never
// infers a municipal license/department/status — those fields simply do
// not exist on a GEOGRAPHIC_REFERENCE entity.
function fromOverturePlace(feature) {
  if (!feature || typeof feature !== 'object' || !feature.properties) {
    return { decision: createDecision(false, 'GEO_SOURCE_FEATURE_REQUIRED', 'A source feature is required.'), entity: null };
  }
  const props = feature.properties;
  const sourceFeatureId = normalizeId(feature.id) || normalizeId(props.id);
  const names = props.names && typeof props.names === 'object' ? props.names : {};
  const categories = props.categories && typeof props.categories === 'object' ? props.categories : {};
  const primarySource = Array.isArray(props.sources) && props.sources[0] ? props.sources[0] : {};
  return createGeoEntity({
    id: `overture:place:${sourceFeatureId}`,
    organizationId: null,
    entityType: 'commercial_place',
    category: typeof categories.primary === 'string' ? categories.primary : null,
    geometry: feature.geometry,
    source: REFERENCE_PROVIDERS.OVERTURE,
    sourceFeatureId,
    sourceUpdatedAt: typeof primarySource.update_time === 'string' ? primarySource.update_time : null,
    metadata: {
      name: typeof names.primary === 'string' ? names.primary : null,
      confidence: typeof props.confidence === 'number' ? props.confidence : null,
    },
  });
}

// --- Overture Buildings -> GeoEntity -----------------------------------------------
// 3D-extrusion rule (Phase 08 brief): use a real source height when one
// exists; else a documented derived height from real source levels ONLY if
// that conversion is explicitly enabled by the caller (never by default in
// this module — the operational/twin adapters decide whether to show a
// derived value, and must label it as derived, never authoritative); else
// render the footprint with no invented height at all. This factory never
// invents either value itself — it only ever passes through what the
// source actually provided.
function fromOvertureBuilding(feature) {
  if (!feature || typeof feature !== 'object' || !feature.properties) {
    return { decision: createDecision(false, 'GEO_SOURCE_FEATURE_REQUIRED', 'A source feature is required.'), entity: null };
  }
  const props = feature.properties;
  const sourceFeatureId = normalizeId(feature.id) || normalizeId(props.id);
  const primarySource = Array.isArray(props.sources) && props.sources[0] ? props.sources[0] : {};
  const hasRealHeight = typeof props.height === 'number' && Number.isFinite(props.height);
  const hasRealLevels = typeof props.num_floors === 'number' && Number.isFinite(props.num_floors);
  return createGeoEntity({
    id: `overture:building:${sourceFeatureId}`,
    organizationId: null,
    entityType: 'building',
    category: typeof props.class === 'string' ? props.class : null,
    geometry: feature.geometry,
    source: REFERENCE_PROVIDERS.OVERTURE,
    sourceFeatureId,
    sourceUpdatedAt: typeof primarySource.update_time === 'string' ? primarySource.update_time : null,
    metadata: {
      heightMeters: hasRealHeight ? props.height : null,
      heightSource: hasRealHeight ? (primarySource.dataset || primarySource.provider || 'source') : null,
      numFloors: hasRealLevels ? props.num_floors : null,
      numFloorsSource: hasRealLevels ? (primarySource.dataset || primarySource.provider || 'source') : null,
    },
  });
}

// --- Field observation (already tenant-verified) -> GeoEntity ----------------------
// Callers MUST resolve/verify coordinates themselves first (see
// spatial-map.js's observationCoordinates(), which already performs the
// organizationId tenant check) — this factory only normalizes an
// already-trusted {lat, lng} pair plus the observation's own real fields.
// It never re-derives or re-checks tenant scope itself.
function fromFieldObservation(observation, { lat, lng }) {
  if (!isValidLngLat([lng, lat])) {
    return { decision: createDecision(false, 'GEO_ENTITY_COORDINATES_REQUIRED', 'Valid resolved coordinates are required.'), entity: null };
  }
  return createGeoEntity({
    id: `field:observation:${normalizeId(observation && observation.id)}`,
    organizationId: observation && observation.organizationId,
    entityType: 'field_observation',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    source: MUNICIPAL_SOURCES.FIELD_OBSERVATION,
    municipalRecordId: observation && observation.id,
    productId: 'field',
    status: observation && observation.status,
    metadata: {
      accuracyMeters: observation && typeof observation.locationAccuracyMeters === 'number' ? observation.locationAccuracyMeters : null,
      photoCount: observation && Array.isArray(observation.photos) ? observation.photos.length : null,
    },
    createdAt: observation && observation.createdAt,
    updatedAt: observation && observation.updatedAt,
  });
}

module.exports = Object.freeze({
  ENTITY_TYPE,
  ENTITY_TYPE_VALUES,
  METADATA_KEYS,
  validateGeoEntity,
  createGeoEntity,
  fromOverturePlace,
  fromOvertureBuilding,
  fromFieldObservation,
  computeCentroid,
  isValidLngLat,
});
