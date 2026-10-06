'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Final V5 public landing is static and free of bundler runtime', () => {
  const index = read('index.html');
  assert.doesNotMatch(index, /__bundler\//);
  assert.doesNotMatch(index, /__bundler_/);
  assert.doesNotMatch(index, /blob:/);
  assert.match(index, /public-r3-assets\/runtime\//);
  assert.match(index, /public-enhancements\.js/);
});

test('Final V5 Lands GIS runtime uses local pinned Leaflet and MarkerCluster assets', () => {
  const lands = read('lands/index.html');
  assert.match(lands, /\/vendor\/leaflet\/1\.9\.4\/leaflet\.css/);
  assert.match(lands, /\/vendor\/leaflet\/1\.9\.4\/leaflet\.js/);
  assert.match(lands, /\/vendor\/leaflet\.markercluster\/1\.5\.3\/MarkerCluster\.css/);
  assert.match(lands, /\/vendor\/leaflet\.markercluster\/1\.5\.3\/leaflet\.markercluster\.js/);
  assert.doesNotMatch(lands, /unpkg\.com\/leaflet@1\.9\.4/);
  assert.doesNotMatch(lands, /unpkg\.com\/leaflet\.markercluster@1\.5\.3/);
  for (const file of [
    'vendor/leaflet/1.9.4/leaflet.css',
    'vendor/leaflet/1.9.4/leaflet.js',
    'vendor/leaflet.markercluster/1.5.3/MarkerCluster.css',
    'vendor/leaflet.markercluster/1.5.3/leaflet.markercluster.js',
    'vendor/leaflet.markercluster/1.5.3/MIT-LICENCE.txt'
  ]) assert.ok(fs.existsSync(path.join(root, file)), file + ' must exist');
});

test('Final V5 runtime remains pinned to Node 22.x', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.engines && pkg.engines.node, '22.x');
});
