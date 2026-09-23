import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const bridge = fs.readFileSync(path.join(repoRoot, 'inspector-v2-native-bridge.js'), 'utf8');
const inspectorHtml = fs.readFileSync(path.join(repoRoot, 'inspector-v2.html'), 'utf8');
const inspectorJs = fs.readFileSync(path.join(repoRoot, 'inspector-v2.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(repoRoot, 'dashboard.html'), 'utf8');

test('native bridge is additive and fail-closed outside Capacitor', () => {
  assert.match(bridge, /Capacitor/);
  assert.match(bridge, /isNativePlatform/);
  assert.match(bridge, /hasGeolocation/);
  assert.match(bridge, /hasCamera/);
  assert.match(bridge, /captureImageFile/);
});

test('Inspector V2 loads the native bridge before its UI runtime', () => {
  const bridgeIndex = inspectorHtml.indexOf('inspector-v2-native-bridge.js');
  const uiIndex = inspectorHtml.indexOf('inspector-v2.js');
  assert.ok(bridgeIndex >= 0);
  assert.ok(uiIndex > bridgeIndex);
});

test('Inspector V2 prefers native GPS but retains browser fallback', () => {
  assert.match(inspectorJs, /SmartHsrNativeBridge/);
  assert.match(inspectorJs, /nativeBridge\.watchPosition/);
  assert.match(inspectorJs, /navigator\.geolocation\.watchPosition/);
  assert.match(inspectorJs, /locationWatchStop/);
});

test('native capture feeds the existing protected file pipeline', () => {
  assert.match(dashboard, /id="nativeCaptureBtn"/);
  assert.match(dashboard, /bridge\.captureImageFile/);
  assert.match(dashboard, /window\.handleFileUpload\(\{target:\{files:\[file\]/);
  assert.match(dashboard, /V2_CAPTURE_MODE&&bridge\?\.isNative&&bridge\?\.hasCamera/);
  assert.match(dashboard, /uploadedUrl = await uploadImageToStorage/);
  assert.match(dashboard, /saveObservationToFirestore\(clientRequestId, payload\)/);
});

test('capture GPS prefers native plugin without deleting browser recovery', () => {
  assert.match(dashboard, /function nativeLocationAvailable\(\)/);
  assert.match(dashboard, /function startInspectorGpsWatch/);
  assert.match(dashboard, /bridge\.watchPosition/);
  assert.match(dashboard, /navigator\.geolocation\.watchPosition/);
  assert.match(dashboard, /manualLocationBtn/);
});

test('native bridge uses Camera 8 takePhoto and never deprecated getPhoto', () => {
  assert.match(bridge, /camera\.takePhoto/);
  assert.doesNotMatch(bridge, /camera\.getPhoto/);
});
