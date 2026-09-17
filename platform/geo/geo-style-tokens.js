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
