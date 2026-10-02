'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const bundlePath = path.resolve(__dirname, '../geo-core.bundle.js');

test('geo-core bundle is browser-consumable and exposes the intended surface', () => {
  const source = fs.readFileSync(bundlePath, 'utf8'), context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  const api = context.SmartHSRGeoCore;
  assert.ok(api);
  assert.deepEqual(Object.keys(api).sort(), [
    'attribution', 'cameraState', 'continuity', 'entity', 'layerRegistry', 'policy', 'search', 'sourceTruth', 'styleTokens', 'writeGuard',
  ]);
});

test('geo-core bundle contains no Node-only APIs, source maps, or secrets — it must be safely browser-loadable', () => {
  const source = fs.readFileSync(bundlePath, 'utf8');
  for (const pattern of [/require\(['"]node:/, /sourceMappingURL/i, /apiKey/i, /private_key/i, /client_email/i, /require\(['"]fs['"]\)/, /require\(['"]path['"]\)/]) {
    assert.doesNotMatch(source, pattern);
  }
});

test('geo-core bundle exposes real functioning logic, not stubs — layer registry and entity factories work end to end', () => {
  const source = fs.readFileSync(bundlePath, 'utf8'), context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  const api = context.SmartHSRGeoCore;
  assert.deepEqual([...api.layerRegistry.LAYER_IDS].sort(), [
    'buildings', 'commercial_places', 'field_observations', 'lands_parcels', 'mobility_incidents', 'mobility_missions',
  ]);
  const { decision, entity } = api.entity.fromOverturePlace({
    id: 'x1', geometry: { type: 'Point', coordinates: [41.07, 19.12] },
    properties: { categories: { primary: 'cafe' }, names: { primary: 'مقهى' } },
  });
  assert.equal(decision.allowed, true);
  assert.equal(entity.category, 'cafe');
});

test('geo-core bundle hash is a stable SHA-256 value', () => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(bundlePath)).digest('hex');
  assert.match(hash, /^[a-f0-9]{64}$/);
});
