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

const { createDecision } = require('../contracts/decision');
const { REFERENCE_PROVIDERS } = require('./geo-source-truth');

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
