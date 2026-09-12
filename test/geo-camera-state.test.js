'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createCameraState, cameraFocusedOnEntity, cameraForMunicipality } = require('../platform/geo/geo-camera-state');

test('a well-formed camera state is valid and defaults bearing/pitch to 0', () => {
  const { decision, camera } = createCameraState({ center: [41.07, 19.12], zoom: 14 });
  assert.equal(decision.allowed, true);
  assert.equal(camera.bearing, 0);
  assert.equal(camera.pitch, 0);
});

test('an out-of-range zoom is rejected', () => {
  const { decision } = createCameraState({ center: [41.07, 19.12], zoom: 99 });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_CAMERA_ZOOM_INVALID');
});

test('an invalid center is rejected', () => {
  const { decision } = createCameraState({ center: [200, 19.12], zoom: 10 });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_CAMERA_CENTER_INVALID');
});

test('cameraFocusedOnEntity derives a camera targeting the entity centroid', () => {
  const { decision, camera } = cameraFocusedOnEntity({ id: 'e1', centroid: [41.07, 19.12] });
  assert.equal(decision.allowed, true);
  assert.deepEqual(camera.center, [41.07, 19.12]);
  assert.equal(camera.focusedEntityId, 'e1');
});

test('cameraFocusedOnEntity refuses an entity with no centroid rather than inventing one', () => {
  const { decision } = cameraFocusedOnEntity({ id: 'e1', centroid: null });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_CAMERA_ENTITY_CENTROID_REQUIRED');
});

test('cameraForMunicipality reuses the existing organization map-context contract, never inventing a center', () => {
  const { decision, camera } = cameraForMunicipality({ mapCenter: { lat: 19.12639, lng: 41.07889 }, mapDefaultZoom: 13 });
  assert.equal(decision.allowed, true);
  assert.deepEqual(camera.center, [41.07889, 19.12639]);
  assert.equal(camera.zoom, 13);
});

test('cameraForMunicipality refuses an unconfigured municipality rather than fabricating a default view', () => {
  const { decision } = cameraForMunicipality({ mapCenter: null, mapDefaultZoom: null });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_CAMERA_MUNICIPALITY_CONTEXT_REQUIRED');
});
