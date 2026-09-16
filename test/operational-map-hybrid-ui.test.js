'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'operational-map.html'), 'utf8');

test('Hybrid Municipal GIS is light-first and keeps Night as an explicit persisted choice', () => {
  assert.match(source, /applyTheme\(localStorage\.getItem\(THEME_KEY\) === 'dark' \? 'dark' : 'light'\)/);
  assert.match(source, /id="themeToggleBtn"[^>]*>الوضع الليلي<\/button>/);
  assert.doesNotMatch(source, /prefers-color-scheme:\s*dark/);
  assert.doesNotMatch(source, /radial-gradient\(1200px 700px/);
});

test('Street and Satellite are real independent basemaps; Street is the default', () => {
  assert.match(source, /data-basemap="street"[^>]*aria-pressed="true"/);
  assert.match(source, /data-basemap="satellite"[^>]*aria-pressed="false"/);
  assert.match(source, /tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.doesNotMatch(source, /https:\/\/\{s\}\.tile\.openstreetmap\.org/);
  assert.match(source, /World_Imagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}/);
  assert.match(source, /let activeBasemap = localStorage\.getItem\(BASEMAP_KEY\) === 'satellite' \? 'satellite' : 'street'/);
  assert.match(source, /map\.setLayoutProperty\(STREET_BASEMAP_LAYER_ID/);
  assert.match(source, /map\.setLayoutProperty\(SATELLITE_BASEMAP_LAYER_ID/);
});

test('operational chrome exposes search results, filter reset and honest snapshot summary', () => {
  assert.match(source, /id="searchResults" role="listbox"/);
  assert.match(source, /function renderSearchResults\(query\)/);
  assert.match(source, /id="clearFiltersBtn"/);
  assert.match(source, /observationStatusFilter = 'ALL';[\s\S]*observationCategoryFilter = 'ALL';[\s\S]*observationPriorityFilter = 'ALL';/);
  assert.match(source, /id="visibleEntityCount"/);
  assert.match(source, /آخر تحميل/);
  assert.doesNotMatch(source, />[^<]*(مباشر|لحظي)[^<]*</);
});

test('calm cartography removes decorative glow without changing MapLibre or the Twin boundary', () => {
  assert.match(source, /new maplibregl\.Map\(/);
  assert.match(source, /IMPLEMENTED_LAYER_IDS = \['commercial_places', 'buildings', 'field_observations'\]/);
  assert.match(source, /continuity\.buildContinuityUrl\('\/twin\.html'/);
  assert.doesNotMatch(source, /geo-municipal-boundary-glow/);
  assert.doesNotMatch(source, /raster-hue-rotate', dark \? 195/);
  assert.doesNotMatch(source, /box-shadow:inset 0 0 130px/);
});
