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
