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

const { createDecision } = require('../contracts/decision');
const { ROLES } = require('../contracts/role-contract');
const { TRUTH_LEVEL } = require('./geo-source-truth');
const { ENTITY_TYPE } = require('./geo-entity-contract');

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
