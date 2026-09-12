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

const { createDecision, deepFreeze } = require('../contracts/decision');
const { isValidLngLat } = require('./geo-entity-contract');

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
