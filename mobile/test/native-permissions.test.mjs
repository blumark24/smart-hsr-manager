import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = fs.readFileSync(path.resolve(here, '../scripts/configure-native-permissions.mjs'), 'utf8');

test('native permission configurator declares iOS camera and required geolocation usage strings', () => {
  assert.match(script, /NSCameraUsageDescription/);
  assert.match(script, /NSLocationWhenInUseUsageDescription/);
  assert.match(script, /NSLocationAlwaysAndWhenInUseUsageDescription/);
});

test('native permission configurator uses foreground Android permissions only', () => {
  assert.match(script, /android\.permission\.CAMERA/);
  assert.match(script, /android\.permission\.ACCESS_FINE_LOCATION/);
  assert.match(script, /android\.permission\.ACCESS_COARSE_LOCATION/);
  assert.doesNotMatch(script, /ACCESS_BACKGROUND_LOCATION/);
});
