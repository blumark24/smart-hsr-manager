/* Smart HSR Geo Core browser bundle. Deterministic build; no source map. */
(function(globalThis){'use strict';
const modules={
"platform/browser/geo-core-entry.js":function(module,exports,require){
'use strict';
// Browser entry point for the SMART HSR Geo Core's pure, client-safe
// contracts. Bundled by scripts/build-geo-core-bundle.js (same
// dependency-free local bundler already used for
// platform/browser/assignment-v2-preview-entry.js) into geo-core.bundle.js,
// loaded via a plain <script> tag by operational-map.html and twin.html.
//
// Server-only concerns (the file-reading static reference provider in
// geo-provider-contract.js, which uses Node's fs/path) are deliberately
// NOT included here — the browser fetches geo layer data from the existing
// trusted /api/organization/context endpoint instead of running a provider
// locally. Authorization decisions exposed here (geo-policy) are for
// CLIENT-SIDE UX only (e.g. hiding a layer toggle a role can't use) — the
// server independently re-enforces every one of them; the browser is never
// the authority.
const geoEntity = require("platform/geo/geo-entity-contract.js");
const geoSourceTruth = require("platform/geo/geo-source-truth.js");
const geoLayerRegistry = require("platform/geo/geo-layer-registry.js");
const geoCameraState = require("platform/geo/geo-camera-state.js");
const geoContinuity = require("platform/geo/geo-continuity.js");
const geoStyleTokens = require("platform/geo/geo-style-tokens.js");
const geoSearch = require("platform/geo/geo-search-contract.js");
const geoAttribution = require("platform/geo/geo-attribution-registry.js");
const geoWriteGuard = require("platform/geo/geo-write-guard.js");
const geoPolicy = require("platform/geo/geo-policy.js");

globalThis.SmartHSRGeoCore = Object.freeze({
  entity: geoEntity,
  sourceTruth: geoSourceTruth,
  layerRegistry: geoLayerRegistry,
  cameraState: geoCameraState,
  continuity: geoContinuity,
  styleTokens: geoStyleTokens,
  search: geoSearch,
  attribution: geoAttribution,
  writeGuard: geoWriteGuard,
  policy: geoPolicy,
});

},
"platform/contracts/decision.js":function(module,exports,require){
'use strict';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function createDecision(allowed, code, reason, metadata) {
  const value = { allowed: allowed === true, code: String(code), reason: String(reason) };
  if (metadata && typeof metadata === 'object' && Object.keys(metadata).length) {
    value.metadata = { ...metadata };
  }
  return deepFreeze(value);
}

function withDecisionMetadata(decision, metadata) {
  return createDecision(decision.allowed, decision.code, decision.reason, {
    ...(decision.metadata || {}),
    ...(metadata || {}),
  });
}

module.exports = Object.freeze({ createDecision, deepFreeze, withDecisionMetadata });

},
"platform/contracts/role-contract.js":function(module,exports,require){
'use strict';

const { createDecision } = require("platform/contracts/decision.js");

const ROLES = Object.freeze({
  OWNER: 'owner',
  MANAGER: 'manager',
  SUPERVISOR: 'supervisor',
  INSPECTOR: 'inspector',
  CONTRACTOR: 'contractor',
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

const ROLE_AUTHORITY = Object.freeze({
  owner: Object.freeze({
    organizationScope: 'platform',
    canCreateObservation: false,
    canEditObservation: false,
    canAssign: false,
    canReview: false,
    canReturn: false,
    canComplete: false,
  }),
  manager: Object.freeze({
    organizationScope: 'organization',
    canCreateObservation: false,
    canEditObservation: false,
    canAssign: true,
    canReview: true,
    canReturn: true,
    canComplete: true,
  }),
  supervisor: Object.freeze({
    organizationScope: 'organization',
    canCreateObservation: false,
    canEditObservation: false,
    canAssign: true,
    canReview: true,
    canReturn: true,
    canComplete: false,
  }),
  inspector: Object.freeze({
    organizationScope: 'organization',
    canCreateObservation: true,
    canEditObservation: true,
    canAssign: false,
    canReview: false,
    canReturn: false,
    canComplete: false,
  }),
  contractor: Object.freeze({
    organizationScope: 'organization',
    canCreateObservation: false,
    canEditObservation: false,
    canAssign: false,
    canReview: false,
    canReturn: false,
    canComplete: false,
  }),
});

function getRoleAuthority(role) {
  return ROLE_AUTHORITY[role] || null;
}

function evaluateRoleAuthority(role, capability) {
  const authority = getRoleAuthority(role);
  if (!authority) {
    return createDecision(false, 'ROLE_NOT_RECOGNIZED', 'The actor role is not a verified Smart HSR role.', { role });
  }
  if (authority[capability] !== true) {
    return createDecision(false, 'ROLE_AUTHORITY_DENIED', 'The actor role does not hold the requested authority.', { role, capability });
  }
  return createDecision(true, 'ROLE_AUTHORITY_CONFIRMED', 'The actor role holds the requested authority.', { role, capability });
}

module.exports = Object.freeze({ ROLES, ROLE_VALUES, ROLE_AUTHORITY, getRoleAuthority, evaluateRoleAuthority });

},
"platform/geo/geo-attribution-registry.js":function(module,exports,require){
'use strict';
// ============================================================================
// SMART HSR GEO CORE — attribution registry.
//
// Every open/third-party geographic dataset the platform renders must carry
// a visible, legally correct attribution (source, license, release/version
// where applicable) — see the Phase 08 brief's "ATTRIBUTION / LICENSING"
// section. This module is the single place that knows what those strings
// are, so the UI never invents or drops one.
//
// SMART HSR does not claim to have created any third-party geographic data
// listed here — it owns the product architecture, UX, Geo Core, municipal
// data model, and integrations built around it.
// ============================================================================

const { createDecision } = require("platform/contracts/decision.js");
const { REFERENCE_PROVIDERS } = require("platform/geo/geo-source-truth.js");

// Keyed by the same `source` values geo-source-truth.js recognizes as
// reference providers, plus the basemap tiles themselves (not a "provider"
// in the truth-classification sense, but still requires attribution).
const ATTRIBUTIONS = Object.freeze({
  [REFERENCE_PROVIDERS.OVERTURE]: Object.freeze({
    source: REFERENCE_PROVIDERS.OVERTURE,
    label: 'Overture Maps Foundation',
    labelAr: 'مؤسسة Overture Maps',
    url: 'https://overturemaps.org',
    license: 'CDLA Permissive 2.0 (places) / ODbL 1.0 (buildings, per-feature)',
  }),
  osm_basemap: Object.freeze({
    source: 'osm_basemap',
    label: 'OpenStreetMap contributors',
    labelAr: 'مساهمو OpenStreetMap',
    url: 'https://www.openstreetmap.org/copyright',
    license: 'ODbL 1.0',
  }),
});

function getAttribution(source) {
  return ATTRIBUTIONS[source] || null;
}

// Every entity rendered from a reference provider must resolve to a real
// attribution record — this is the enforcement point future layers/adapters
// call before rendering, so a newly-added open dataset can never silently
// ship without one.
function assertAttributed(source) {
  const attribution = getAttribution(source);
  if (!attribution) {
    return createDecision(false, 'GEO_ATTRIBUTION_MISSING', 'No registered attribution exists for this source.', { source });
  }
  return createDecision(true, 'GEO_ATTRIBUTION_PRESENT', 'A registered attribution exists for this source.', { source });
}

function listAttributions() {
  return Object.values(ATTRIBUTIONS);
}

module.exports = Object.freeze({
  ATTRIBUTIONS,
  getAttribution,
  assertAttributed,
  listAttributions,
});

},
"platform/geo/geo-camera-state.js":function(module,exports,require){
'use strict';
// ============================================================================
// SMART HSR GEO CORE — camera/viewport state contract.
//
// One normalized camera shape shared by both map experiences, so
// "Operational <-> Twin continuity" (Phase 08 brief) can hand a camera
// target from a 2D MapLibre view to a 3D Cesium view (and back) without
// either adapter needing to understand the other engine's native camera
// API. Adapters translate THIS shape to/from their engine's own camera call
// — this module never touches MapLibre or Cesium itself.
// ============================================================================

const { createDecision, deepFreeze } = require("platform/contracts/decision.js");
const { isValidLngLat } = require("platform/geo/geo-entity-contract.js");

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateCameraState(value) {
  if (!value || typeof value !== 'object') {
    return createDecision(false, 'GEO_CAMERA_STATE_REQUIRED', 'A camera state is required.');
  }
  if (!isValidLngLat(value.center)) {
    return createDecision(false, 'GEO_CAMERA_CENTER_INVALID', 'A valid [lng, lat] center is required.');
  }
  if (!isFiniteNumber(value.zoom) || value.zoom < 0 || value.zoom > 22) {
    return createDecision(false, 'GEO_CAMERA_ZOOM_INVALID', 'A zoom level between 0 and 22 is required.');
  }
  if (value.bearing !== undefined && (!isFiniteNumber(value.bearing) || value.bearing < 0 || value.bearing >= 360)) {
    return createDecision(false, 'GEO_CAMERA_BEARING_INVALID', 'Bearing must be a number in [0, 360).');
  }
  if (value.pitch !== undefined && (!isFiniteNumber(value.pitch) || value.pitch < 0 || value.pitch > 85)) {
    return createDecision(false, 'GEO_CAMERA_PITCH_INVALID', 'Pitch must be a number in [0, 85].');
  }
  return createDecision(true, 'GEO_CAMERA_STATE_VALID', 'The camera state is structurally valid.');
}

function createCameraState(value) {
  const candidate = {
    center: value.center,
    zoom: value.zoom,
    bearing: isFiniteNumber(value.bearing) ? value.bearing : 0,
    pitch: isFiniteNumber(value.pitch) ? value.pitch : 0,
    focusedEntityId: typeof value.focusedEntityId === 'string' && value.focusedEntityId ? value.focusedEntityId : null,
  };
  const validation = validateCameraState(candidate);
  if (!validation.allowed) return { decision: validation, camera: null };
  return deepFreeze({ decision: validation, camera: deepFreeze(candidate) });
}

// Derive a camera focused on one entity's centroid, at a reasonable
// close-in zoom — used by both "select on Operational Map" and "select in
// Twin" to converge on the same visual target.
function cameraFocusedOnEntity(entity, { zoom = 17 } = {}) {
  if (!entity || !entity.centroid) {
    return { decision: createDecision(false, 'GEO_CAMERA_ENTITY_CENTROID_REQUIRED', 'The entity has no centroid to focus on.'), camera: null };
  }
  return createCameraState({ center: entity.centroid, zoom, focusedEntityId: entity.id });
}

// Derive a camera reset to a municipality's configured context (from the
// EXISTING /api/organization/context mapCenter/mapDefaultZoom contract —
// this module does not invent a new municipality-config source).
function cameraForMunicipality(mapContext) {
  if (!mapContext || !mapContext.mapCenter || !isFiniteNumber(mapContext.mapDefaultZoom)) {
    return { decision: createDecision(false, 'GEO_CAMERA_MUNICIPALITY_CONTEXT_REQUIRED', 'A configured municipality map context is required.'), camera: null };
  }
  return createCameraState({
    center: [mapContext.mapCenter.lng, mapContext.mapCenter.lat],
    zoom: mapContext.mapDefaultZoom,
  });
}

module.exports = Object.freeze({
  validateCameraState,
  createCameraState,
  cameraFocusedOnEntity,
  cameraForMunicipality,
});

},
"platform/geo/geo-continuity.js":function(module,exports,require){
'use strict';
// ============================================================================
// SMART HSR GEO CORE — Operational <-> Twin continuity contract.
//
// "The user must feel this is ONE geographic system, not two disconnected
// pages" (Phase 08 brief). This module builds and parses the small,
// explicit context object carried across the "عرض في التوأم الرقمي" /
// "فتح في الخريطة التشغيلية" handoff: entity id, organizationId, layerId,
// and camera target. It is pure (no DOM, no URL API assumptions beyond
// URLSearchParams-compatible string encoding) so both operational-map.html
// and twin.html can require it identically.
// ============================================================================

const { createDecision, deepFreeze } = require("platform/contracts/decision.js");
const { validateCameraState } = require("platform/geo/geo-camera-state.js");

const CONTINUITY_PARAM = 'geoContext';

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateContinuityContext(value) {
  if (!value || typeof value !== 'object') {
    return createDecision(false, 'GEO_CONTINUITY_CONTEXT_REQUIRED', 'A continuity context is required.');
  }
  if (!normalizeId(value.organizationId)) {
    return createDecision(false, 'GEO_CONTINUITY_ORGANIZATION_REQUIRED', 'A continuity context must carry an organizationId.');
  }
  if (value.camera) {
    const cameraDecision = validateCameraState(value.camera);
    if (!cameraDecision.allowed) return cameraDecision;
  }
  return createDecision(true, 'GEO_CONTINUITY_CONTEXT_VALID', 'The continuity context is structurally valid.');
}

function createContinuityContext(value) {
  const candidate = {
    organizationId: normalizeId(value.organizationId),
    entityId: normalizeId(value.entityId) || null,
    layerId: normalizeId(value.layerId) || null,
    camera: value.camera || null,
  };
  const validation = validateContinuityContext(candidate);
  if (!validation.allowed) return { decision: validation, context: null };
  return deepFreeze({ decision: validation, context: deepFreeze(candidate) });
}

// Encodes to a single URL-safe query parameter value so a target page's URL
// stays a normal, bookmarkable link rather than a pile of loose params.
function encodeContinuityContext(context) {
  return encodeURIComponent(JSON.stringify(context));
}

function decodeContinuityContext(encoded) {
  if (!encoded) return { decision: createDecision(false, 'GEO_CONTINUITY_ENCODED_REQUIRED', 'An encoded continuity context is required.'), context: null };
  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(encoded));
  } catch (_) {
    return { decision: createDecision(false, 'GEO_CONTINUITY_DECODE_FAILED', 'The continuity context could not be decoded.'), context: null };
  }
  return createContinuityContext(parsed || {});
}

// Builds the target URL for a continuity handoff link, preserving any
// existing query params the destination page already needs (e.g.
// ?useEmulators=1 in non-production testing) rather than clobbering them.
function buildContinuityUrl(baseUrl, context) {
  const validation = validateContinuityContext(context);
  if (!validation.allowed) return { decision: validation, url: null };
  const url = new URL(baseUrl, 'http://localhost');
  url.searchParams.set(CONTINUITY_PARAM, encodeContinuityContext(context));
  return { decision: validation, url: url.pathname + url.search };
}

module.exports = Object.freeze({
  CONTINUITY_PARAM,
  validateContinuityContext,
  createContinuityContext,
  encodeContinuityContext,
  decodeContinuityContext,
  buildContinuityUrl,
});

},
"platform/geo/geo-entity-contract.js":function(module,exports,require){
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

const { createDecision, deepFreeze } = require("platform/contracts/decision.js");
const { TRUTH_LEVEL, REFERENCE_PROVIDERS, MUNICIPAL_SOURCES, truthLevelForSource } = require("platform/geo/geo-source-truth.js");

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

},
"platform/geo/geo-layer-registry.js":function(module,exports,require){
'use strict';
// ============================================================================
// SMART HSR GEO CORE — canonical layer registry.
//
// Every layer either map experience can show is declared exactly once here.
// A layer declares WHAT it is, WHO may see it by default, and WHERE it may
// appear — business/UI code asks this registry "may I show layer X to this
// actor", it never re-derives that answer itself. Adding a new future layer
// (Phase 08 explicitly excludes روads/sidewalks/trees/etc. — see
// FUTURE_ONLY_LAYER_IDS below) means adding one entry here, not touching
// the map engine or authorization code.
//
// Raw developer keys (layer ids) are never shown to end users — the UI
// always renders `labelAr`.
// ============================================================================

const { createDecision } = require("platform/contracts/decision.js");
const { ROLES } = require("platform/contracts/role-contract.js");
const { TRUTH_LEVEL } = require("platform/geo/geo-source-truth.js");
const { ENTITY_TYPE } = require("platform/geo/geo-entity-contract.js");

const SOURCE_TYPE = Object.freeze({
  OPEN_REFERENCE: 'open_reference',
  MUNICIPAL_TRUSTED: 'municipal_trusted',
});

// Layers explicitly named in the brief as FUTURE ONLY — never registered
// this phase. Kept here (not silently omitted) so a reviewer can see this
// was a deliberate scope decision, not an oversight.
const FUTURE_ONLY_LAYER_IDS = Object.freeze([
  'road_engineering', 'sidewalks', 'trees', 'street_lighting', 'cleanliness',
  'utilities', 'capital_projects', 'investment_simulation', 'cyber_scope',
  'drone_imagery', 'planning_simulation',
]);

const LAYERS = Object.freeze({
  commercial_places: Object.freeze({
    id: 'commercial_places',
    labelAr: 'المنشآت التجارية',
    product: 'geo-core',
    entityTypes: Object.freeze([ENTITY_TYPE.COMMERCIAL_PLACE]),
    minimumRole: ROLES.INSPECTOR, // any authenticated operational role and above
    defaultVisible: true,
    availableInOperational: true,
    availableInTwin: true,
    sourceType: SOURCE_TYPE.OPEN_REFERENCE,
    truthLevel: TRUTH_LEVEL.GEOGRAPHIC_REFERENCE,
    styleToken: 'geo-place',
    filters: Object.freeze(['category', 'search']),
  }),
  buildings: Object.freeze({
    id: 'buildings',
    labelAr: 'المباني',
    product: 'geo-core',
    entityTypes: Object.freeze([ENTITY_TYPE.BUILDING]),
    minimumRole: ROLES.INSPECTOR,
    defaultVisible: false,
    availableInOperational: true,
    availableInTwin: true,
    sourceType: SOURCE_TYPE.OPEN_REFERENCE,
    truthLevel: TRUTH_LEVEL.GEOGRAPHIC_REFERENCE,
    styleToken: 'geo-building',
    filters: Object.freeze(['category']),
  }),
  field_observations: Object.freeze({
    id: 'field_observations',
    labelAr: 'ملاحظات الحصر الميداني',
    product: 'field',
    entityTypes: Object.freeze([ENTITY_TYPE.FIELD_OBSERVATION]),
    minimumRole: ROLES.INSPECTOR,
    defaultVisible: true,
    availableInOperational: true,
    availableInTwin: true,
    sourceType: SOURCE_TYPE.MUNICIPAL_TRUSTED,
    truthLevel: TRUTH_LEVEL.MUNICIPAL_AUTHORITY,
    styleToken: 'geo-observation',
    filters: Object.freeze(['status', 'search']),
  }),
  lands_parcels: Object.freeze({
    id: 'lands_parcels',
    labelAr: 'الأراضي والقطع',
    product: 'lands',
    entityTypes: Object.freeze([ENTITY_TYPE.LANDS_PARCEL]),
    minimumRole: ROLES.MANAGER,
    defaultVisible: false,
    availableInOperational: true,
    availableInTwin: true,
    sourceType: SOURCE_TYPE.MUNICIPAL_TRUSTED,
    truthLevel: TRUTH_LEVEL.MUNICIPAL_AUTHORITY,
    styleToken: 'geo-parcel',
    // Lands parcels currently carry no geometry at all (see the Lands
    // repo's Phase 08 inventory) — this layer is registered so the
    // architecture is ready the moment real parcel geometry exists, but it
    // must render an honest "no spatial data yet" state, never a
    // fabricated boundary. See geo-provider-contract.js.
    filters: Object.freeze([]),
  }),
  mobility_missions: Object.freeze({
    id: 'mobility_missions',
    labelAr: 'مهام الحركة والسير',
    product: 'mobility',
    entityTypes: Object.freeze([ENTITY_TYPE.MOBILITY_MISSION]),
    minimumRole: ROLES.INSPECTOR,
    defaultVisible: false,
    availableInOperational: true,
    availableInTwin: false,
    sourceType: SOURCE_TYPE.MUNICIPAL_TRUSTED,
    truthLevel: TRUTH_LEVEL.MUNICIPAL_AUTHORITY,
    styleToken: 'geo-mission',
    filters: Object.freeze(['status']),
  }),
  mobility_incidents: Object.freeze({
    id: 'mobility_incidents',
    labelAr: 'حوادث الحركة والسير',
    product: 'mobility',
    entityTypes: Object.freeze([ENTITY_TYPE.MOBILITY_INCIDENT]),
    minimumRole: ROLES.INSPECTOR,
    defaultVisible: false,
    availableInOperational: true,
    availableInTwin: false,
    sourceType: SOURCE_TYPE.MUNICIPAL_TRUSTED,
    truthLevel: TRUTH_LEVEL.MUNICIPAL_AUTHORITY,
    styleToken: 'geo-incident',
    filters: Object.freeze(['status']),
  }),
});

const LAYER_IDS = Object.freeze(Object.keys(LAYERS));

// Role authority ordering re-used from role-contract.js's own organization
// scope model (owner > manager > supervisor > inspector/contractor as
// operational-only) — expressed here only as "may this role at least reach
// operational layers", never as a new authorization source. Twin-specific
// executive scoping is layered on top in geo-policy.js.
const ROLE_RANK = Object.freeze({
  [ROLES.OWNER]: 4,
  [ROLES.MANAGER]: 3,
  [ROLES.SUPERVISOR]: 2,
  [ROLES.INSPECTOR]: 1,
  [ROLES.CONTRACTOR]: 1,
});

function getLayer(layerId) {
  return LAYERS[layerId] || null;
}

function validateLayerRegistry() {
  for (const id of LAYER_IDS) {
    const layer = LAYERS[id];
    if (layer.id !== id) return createDecision(false, 'GEO_LAYER_ID_MISMATCH', 'A layer key does not match its own id field.', { id });
    if (!layer.labelAr) return createDecision(false, 'GEO_LAYER_LABEL_REQUIRED', 'A layer must declare an Arabic label.', { id });
    if (!Object.values(ROLES).includes(layer.minimumRole)) return createDecision(false, 'GEO_LAYER_ROLE_UNRECOGNIZED', 'A layer minimumRole is not a recognized Smart HSR role.', { id });
    if (!layer.availableInOperational && !layer.availableInTwin) return createDecision(false, 'GEO_LAYER_UNREACHABLE', 'A layer must be available in at least one map experience.', { id });
  }
  return createDecision(true, 'GEO_LAYER_REGISTRY_VALID', 'The layer registry is structurally valid.');
}

function isLayerVisibleToRole(layerId, role) {
  const layer = getLayer(layerId);
  if (!layer) return createDecision(false, 'GEO_LAYER_NOT_FOUND', 'The requested layer does not exist.', { layerId });
  const requiredRank = ROLE_RANK[layer.minimumRole];
  const actorRank = ROLE_RANK[role];
  if (!actorRank || actorRank < requiredRank) {
    return createDecision(false, 'GEO_LAYER_ROLE_DENIED', 'The actor role does not meet this layer\'s minimum role.', { layerId, role, minimumRole: layer.minimumRole });
  }
  return createDecision(true, 'GEO_LAYER_ROLE_ALLOWED', 'The actor role meets this layer\'s minimum role.', { layerId, role });
}

function layersForExperience(experience) {
  const key = experience === 'twin' ? 'availableInTwin' : 'availableInOperational';
  return LAYER_IDS.filter((id) => LAYERS[id][key]).map((id) => LAYERS[id]);
}

module.exports = Object.freeze({
  LAYERS,
  LAYER_IDS,
  SOURCE_TYPE,
  FUTURE_ONLY_LAYER_IDS,
  ROLE_RANK,
  getLayer,
  validateLayerRegistry,
  isLayerVisibleToRole,
  layersForExperience,
});

},
"platform/geo/geo-policy.js":function(module,exports,require){
'use strict';
// ============================================================================
// SMART HSR GEO CORE — geo authorization policy.
//
// This module introduces NO new role system. It is a thin, explicit mapping
// from the EXISTING institutional roles (platform/contracts/role-contract.js)
// and the EXISTING tenant-boundary contract
// (platform/policies/organization-scope-policy.js) onto the two Phase 08
// concepts that don't have a direct existing analogue:
//
//   1. Twin admission — may this actor open the executive/strategic
//      SMART HSR Twin at all (as opposed to only the Operational Map)?
//   2. Municipality/layer scope — which organizationId's data, and which
//      registered layers, may this actor's map session show?
//
// Per the Phase 08 brief's "TWIN AUTHORIZATION" section: current role names
// map as follows. `employeeAssignments`' SECTION_HEAD concept
// (platform/contracts/employee-assignment-contract.js) is explicitly NOT
// yet a live authorization source anywhere in this codebase (its own header
// says so) — so this module does not introduce it as one either. Everything
// here fails closed: an unrecognized role or missing organizationId is
// always denied, never defaulted to "allow".
//
//   Mayor / municipal highest authority  -> ROLES.MANAGER (Twin-admitted)
//   General Supervisor                   -> ROLES.SUPERVISOR — Twin
//                                            NOT admitted (see below)
//   Section Head                         -> ROLES.SUPERVISOR (operational
//                                            scope only, pending the
//                                            employeeAssignments cutover)
//   Employee                             -> ROLES.INSPECTOR (operational only)
//   Contractor                           -> ROLES.CONTRACTOR (operational only)
//   Platform owner                       -> ROLES.OWNER (Twin-admitted)
//
// PHASE 08.1 CLOSURE 4 — General Supervisor Twin admission, corrected.
// Phase 08 originally admitted ROLES.SUPERVISOR to the Twin unconditionally,
// reasoning that organization-scope-policy.js already treats supervisor as
// organization-wide scoped for OPERATIONAL capabilities (assign/review/
// return — see role-contract.js's ROLE_AUTHORITY). But EXECUTIVE Twin
// access is a materially different grant than day-to-day operational
// authority, and this codebase has no live trusted delegation source that
// proves a given supervisor actually holds executive-level authority (the
// only candidate, employeeAssignments' SECTION_HEAD, is explicitly not yet
// live — see above). Per Phase 08.1's explicit rule ("If no live trusted
// delegation source exists: FAIL CLOSED. Do not grant blanket executive
// access."), ROLES.SUPERVISOR is REMOVED from TWIN_ADMITTED_ROLES below.
// A supervisor still has full operational access via
// evaluateGeoResourceAccess()/the Operational Map — only the Twin is
// withheld until a real, live delegation source exists to check here.
const { createDecision } = require("platform/contracts/decision.js");
const { ROLES } = require("platform/contracts/role-contract.js");
const { evaluateOrganizationScope, PLATFORM_OWNER_ROLE } = require("platform/policies/organization-scope-policy.js");
const { isLayerVisibleToRole } = require("platform/geo/geo-layer-registry.js");

// Only these roles may ever open the Twin. Every other role (Supervisor
// included — see the Closure 4 note above) is Operational-Map-only.
const TWIN_ADMITTED_ROLES = Object.freeze([ROLES.OWNER, ROLES.MANAGER]);

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function evaluateTwinAdmission({ actor } = {}) {
  if (!actor || typeof actor !== 'object' || !actor.role) {
    return createDecision(false, 'GEO_TWIN_ACTOR_REQUIRED', 'An authenticated actor with a resolved role is required.');
  }
  if (!TWIN_ADMITTED_ROLES.includes(actor.role)) {
    return createDecision(false, 'GEO_TWIN_ROLE_DENIED', 'This role may only use the Operational Map, not the Twin.', { role: actor.role });
  }
  if (actor.role !== PLATFORM_OWNER_ROLE && !normalizeId(actor.organizationId)) {
    return createDecision(false, 'GEO_TWIN_ORGANIZATION_REQUIRED', 'A non-owner actor must have a resolved organizationId to open the Twin.');
  }
  return createDecision(true, 'GEO_TWIN_ADMITTED', 'The actor role may open the Twin.', { role: actor.role });
}

// Combines the existing tenant-boundary check with the layer registry's
// role-minimum check. `resource` is `{ organizationId, layerId }` — a map
// session is denied a layer/municipality pairing unless BOTH pass.
function evaluateGeoResourceAccess({ actor, resource } = {}) {
  const scopeDecision = evaluateOrganizationScope({ actor, resource });
  if (!scopeDecision.allowed) return scopeDecision;

  if (resource && resource.layerId) {
    const layerDecision = isLayerVisibleToRole(resource.layerId, actor.role);
    if (!layerDecision.allowed) return layerDecision;
  }

  return createDecision(true, 'GEO_RESOURCE_ACCESS_ALLOWED', 'The actor may access this organization/layer pairing.');
}

// Open/global reference data (commercial_places, buildings) is never
// tenant-scoped — see the brief's TENANT ISOLATION section: "Open/global
// basemap data may be globally visible." Still requires an authenticated,
// recognized role (never anonymous), and still goes through the layer
// registry's role-minimum check.
function evaluateReferenceLayerAccess({ actor, layerId } = {}) {
  if (!actor || typeof actor !== 'object' || !actor.role) {
    return createDecision(false, 'GEO_REFERENCE_ACTOR_REQUIRED', 'An authenticated actor with a resolved role is required.');
  }
  return isLayerVisibleToRole(layerId, actor.role);
}

module.exports = Object.freeze({
  TWIN_ADMITTED_ROLES,
  evaluateTwinAdmission,
  evaluateGeoResourceAccess,
  evaluateReferenceLayerAccess,
});

},
"platform/geo/geo-search-contract.js":function(module,exports,require){
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

const { createDecision } = require("platform/contracts/decision.js");

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

},
"platform/geo/geo-source-truth.js":function(module,exports,require){
'use strict';
// ============================================================================
// SMART HSR GEO CORE — source-of-truth classification.
//
// A geographic feature may carry TWO layers of truth (see the Phase 08
// brief's "SOURCE OF TRUTH MODEL"):
//
//   GEOGRAPHIC_REFERENCE  — open/third-party geographic data (a building
//                           footprint, a commercial place point/category).
//                           Authoritative for SHAPE/LOCATION only.
//
//   MUNICIPAL_AUTHORITY   — SMART HSR / municipality trusted data (a
//                           license, an inspection, a field observation, a
//                           parcel/grant linkage). Authoritative for
//                           STATUS/OWNERSHIP/COMPLIANCE.
//
// These must never be merged into one unverifiable source. A GeoEntity (see
// geo-entity-contract.js) always records which truth level backs it, and a
// consumer must never present reference-only geometry as if it carried
// municipal authority (e.g. never infer a license from a building shape).
// ============================================================================

const TRUTH_LEVEL = Object.freeze({
  GEOGRAPHIC_REFERENCE: 'GEOGRAPHIC_REFERENCE',
  MUNICIPAL_AUTHORITY: 'MUNICIPAL_AUTHORITY',
});
const TRUTH_LEVEL_VALUES = Object.freeze(Object.values(TRUTH_LEVEL));

// Recognized reference-data providers. Adding a new open provider means
// adding one entry here (and a matching attribution registry entry) — it
// must never require touching business/authorization logic.
const REFERENCE_PROVIDERS = Object.freeze({
  OVERTURE: 'overture',
});

// Recognized municipal-authority sources. These are never open/third-party
// — every one of them must trace back to a SMART HSR product's own trusted
// write path (see geo-write-guard.js).
const MUNICIPAL_SOURCES = Object.freeze({
  FIELD_OBSERVATION: 'field_observation',
  LANDS_PARCEL: 'lands_parcel',
  MOBILITY_MISSION: 'mobility_mission',
  MOBILITY_INCIDENT: 'mobility_incident',
});

function isReferenceProvider(source) {
  return Object.values(REFERENCE_PROVIDERS).includes(source);
}

function isMunicipalSource(source) {
  return Object.values(MUNICIPAL_SOURCES).includes(source);
}

function truthLevelForSource(source) {
  if (isReferenceProvider(source)) return TRUTH_LEVEL.GEOGRAPHIC_REFERENCE;
  if (isMunicipalSource(source)) return TRUTH_LEVEL.MUNICIPAL_AUTHORITY;
  return null;
}

module.exports = Object.freeze({
  TRUTH_LEVEL,
  TRUTH_LEVEL_VALUES,
  REFERENCE_PROVIDERS,
  MUNICIPAL_SOURCES,
  isReferenceProvider,
  isMunicipalSource,
  truthLevelForSource,
});

},
"platform/geo/geo-style-tokens.js":function(module,exports,require){
'use strict';
// ============================================================================
// SMART HSR GEO CORE — cartographic design tokens.
//
// "DATA COLORS != BRAND COLORS" (Phase 08 brief). BRAND tokens style map
// chrome/UI controls (sidebar, buttons, panels) and reuse the SAME palette
// already approved for the SMART HSR ecosystem (SMART HSR Owner Console,
// Phase 07B) and already present in this repo's own pages (manager.html's
// accent is already #059669; dashboard.html already uses #475569/#64748b/
// #e2e8f0/#f8fafc from the same neutral scale). DATA/status tokens instead
// reuse the EXISTING, already-shipped status colors from spatial-map.js's
// STATUS_META (never re-invented) so a pin means the same thing on the new
// Operational Map as it already does everywhere else in the app.
//
// This module exports plain data (hex strings) — it renders nothing itself
// and has no MapLibre/Cesium dependency, so it can be required by contracts,
// adapters, and tests alike.
// ============================================================================

const BRAND = Object.freeze({
  light: Object.freeze({
    appBg: '#F8FAFC',
    surface: '#FFFFFF',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    border: '#E2E8F0',
    borderSubtle: '#F1F5F9',
    green: '#059669',
    greenHover: '#047857',
    greenSoft: '#ECFDF5',
    warning: '#D97706',
    warningSoft: '#FFFBEB',
    danger: '#DC2626',
    dangerSoft: '#FEF2F2',
  }),
  dark: Object.freeze({
    appBg: '#0B1220',
    surface: '#111827',
    card: '#1E293B',
    textPrimary: '#F8FAFC',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    border: '#334155',
    green: '#059669',
    greenHover: '#047857',
    warning: '#D97706',
    danger: '#DC2626',
  }),
});

// Reused verbatim from spatial-map.js's STATUS_META — this module does not
// define a second, drifting copy of what these colors mean; it only
// re-exposes them for map-layer styling (e.g. MapLibre paint expressions,
// Cesium point/polygon color properties) that spatial-map.js's Leaflet-only
// divIcon approach cannot itself serve.
const DATA_STATUS = Object.freeze({
  PENDING: '#ef4444',
  IN_PROGRESS: '#f59e0b',
  PENDING_REVIEW: '#f59e0b',
  COMPLETED: '#10b981',
  NEUTRAL: '#64748b',
});

// One token per registered layer (geo-layer-registry.js's `styleToken`
// values) — map engine adapters look up a layer's paint color here, never
// hardcode one inline, so re-theming stays a one-file change.
const LAYER_STYLE = Object.freeze({
  'geo-place': '#0EA5E9',
  'geo-building': '#94A3B8',
  'geo-observation': DATA_STATUS.NEUTRAL, // actual per-feature color comes from its own status
  'geo-parcel': '#8B5CF6',
  'geo-mission': '#059669',
  'geo-incident': DATA_STATUS.PENDING,
});

const MOTION_MS = Object.freeze({ min: 150, max: 250 });

module.exports = Object.freeze({ BRAND, DATA_STATUS, LAYER_STYLE, MOTION_MS });

},
"platform/geo/geo-write-guard.js":function(module,exports,require){
'use strict';
// ============================================================================
// SMART HSR GEO CORE — write safety guard.
//
// "A map is NOT an authorization bypass" (Phase 08 brief). Selecting a
// building/place/observation on a map must never itself grant permission to
// mutate it. This module is the single allowlist of trusted mutation
// endpoints a map-triggered action may ever call — anything not on this
// list is refused before any network call is attempted, and there is
// deliberately no generic "write this map object" path.
//
// Phase 08 itself introduces NO new mutation endpoint: the Geo Entity
// Card's primary action is navigation ("عرض التفاصيل") to an existing
// product detail screen, never an inline map-triggered write. This guard
// exists so that stays true even as future layers are added — a future
// map-triggered action (e.g. "suspend this mission from the map") must be
// registered here explicitly, pointing at an EXISTING trusted product API,
// before any adapter is allowed to call it.
// ============================================================================

const { createDecision } = require("platform/contracts/decision.js");

// Every entry must be an existing, already-authorized trusted endpoint —
// never a raw Firestore collection path. Empty today by design (see above).
const ALLOWED_MAP_TRIGGERED_ACTIONS = Object.freeze({
  // Example shape for a future entry:
  // suspend_mobility_mission: { endpoint: '/api/admin/mobility', method: 'POST' },
});

function evaluateMapTriggeredWrite({ action, endpoint, method } = {}) {
  const registered = ALLOWED_MAP_TRIGGERED_ACTIONS[action];
  if (!registered) {
    return createDecision(false, 'GEO_WRITE_ACTION_NOT_REGISTERED', 'This map-triggered action is not a registered trusted mutation.', { action });
  }
  if (registered.endpoint !== endpoint || registered.method !== method) {
    return createDecision(false, 'GEO_WRITE_ENDPOINT_MISMATCH', 'The requested endpoint/method does not match the registered trusted mutation for this action.', { action });
  }
  return createDecision(true, 'GEO_WRITE_ACTION_ALLOWED', 'This map-triggered action is a registered trusted mutation.', { action });
}

// Defensive helper a map adapter can call before ever attempting a Firestore
// write directly — always denies, by design, until/unless a future phase
// deliberately introduces a real exception here (it never should: the
// pattern is "map calls the same trusted API a non-map screen would call").
function assertNoDirectFirestoreWrite() {
  return createDecision(false, 'GEO_DIRECT_FIRESTORE_WRITE_FORBIDDEN', 'Map surfaces must never write to Firestore directly — use an existing trusted product API.');
}

module.exports = Object.freeze({
  ALLOWED_MAP_TRIGGERED_ACTIONS,
  evaluateMapTriggeredWrite,
  assertNoDirectFirestoreWrite,
});

},
"platform/policies/organization-scope-policy.js":function(module,exports,require){
'use strict';

const PLATFORM_OWNER_ROLE = 'owner';

function decision(allowed, code, reason) {
  return Object.freeze({ allowed, reason, code });
}

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Pure tenant-boundary contract. The existing owner role is the only role
 * allowed to select organizations across the platform. Operational policies
 * may still deny an owner a specific action after this scope check succeeds.
 */
function evaluateOrganizationScope({ actor, resource } = {}) {
  if (!actor || typeof actor !== 'object') {
    return decision(false, 'AUTHENTICATED_CONTEXT_REQUIRED', 'An authenticated actor context is required.');
  }

  if (actor.role === PLATFORM_OWNER_ROLE) {
    return decision(true, 'PLATFORM_OWNER_SCOPE', 'The existing platform owner role may select an organization explicitly.');
  }

  const authenticatedOrganizationId = normalizeId(actor.organizationId);
  if (!authenticatedOrganizationId) {
    return decision(false, 'AUTHENTICATED_ORGANIZATION_REQUIRED', 'The authenticated context has no organizationId.');
  }

  const resourceOrganizationId = normalizeId(resource && resource.organizationId);
  if (!resourceOrganizationId) {
    return decision(false, 'RESOURCE_ORGANIZATION_REQUIRED', 'The resource has no organizationId.');
  }

  if (authenticatedOrganizationId !== resourceOrganizationId) {
    return decision(false, 'CROSS_ORGANIZATION_DENIED', 'The authenticated and resource organizations do not match.');
  }

  return decision(true, 'ORGANIZATION_MATCH', 'The authenticated and resource organizations match.');
}

module.exports = Object.freeze({
  PLATFORM_OWNER_ROLE,
  evaluateOrganizationScope,
});

}
};
const cache=Object.create(null);function require(id){if(cache[id])return cache[id].exports;if(!modules[id])throw new Error('Geo Core bundle module not found: '+id);const module={exports:{}};cache[id]=module;modules[id](module,module.exports,require);return module.exports;}
require("platform/browser/geo-core-entry.js");
})(globalThis);
