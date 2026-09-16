'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'operational-map.html'), 'utf8');

test('Operational Command Map is satellite-and-Night first while preserving an explicit Day choice', () => {
  assert.match(source, /applyTheme\(localStorage\.getItem\(THEME_KEY\) === 'light' \? 'light' : 'dark'\)/);
  assert.match(source, /id="themeToggleBtn"[^>]*aria-label="تفعيل الوضع النهاري"/);
  assert.doesNotMatch(source, /prefers-color-scheme:\s*dark/);
  assert.match(source, /main:after\{content:'';position:absolute;inset:0;pointer-events:none/);
});

test('Street and Satellite are real independent basemaps; Satellite is the approved default', () => {
  assert.match(source, /data-basemap="street"[^>]*aria-pressed="false"/);
  assert.match(source, /data-basemap="satellite"[^>]*aria-pressed="true"/);
  assert.match(source, /tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.doesNotMatch(source, /https:\/\/\{s\}\.tile\.openstreetmap\.org/);
  assert.match(source, /World_Imagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}/);
  assert.match(source, /let activeBasemap = localStorage\.getItem\(BASEMAP_KEY\) === 'street' \? 'street' : 'satellite'/);
  assert.match(source, /map\.setLayoutProperty\(STREET_BASEMAP_LAYER_ID/);
  assert.match(source, /map\.setLayoutProperty\(SATELLITE_BASEMAP_LAYER_ID/);
});

test('government command chrome exposes branded product navigation, search, layers and honest snapshot state', () => {
  assert.match(source, /class="brand-lockup"[^>]*><img src="Smart_HSR_Dashboard_Logo\.svg"/);
  assert.match(source, /class="nav-link active"[^>]*>الخريطة التشغيلية<\/span>/);
  assert.match(source, /class="nav-link" id="openTwinBtn"[^>]*>التوأم الرقمي<\/button>/);
  assert.match(source, /id="searchResults" role="listbox"/);
  assert.match(source, /function renderSearchResults\(query\)/);
  assert.match(source, /id="clearFiltersBtn"/);
  assert.match(source, /observationStatusFilter = 'ALL';[\s\S]*observationCategoryFilter = 'ALL';[\s\S]*observationPriorityFilter = 'ALL';/);
  assert.match(source, /id="visibleEntityCount"/);
  assert.match(source, /آخر تحميل/);
  assert.doesNotMatch(source, />[^<]*(مباشر|لحظي)[^<]*</);
});

test('Geo Command Center contains compact KPIs, intelligence, tabbed controls, heatmap and truthful timeline', () => {
  for (const id of ['kpiStrip', 'kpiTotal', 'kpiHigh', 'intelligencePanel', 'layersTab', 'filtersTab', 'heatmapToggle', 'timelinePanel', 'timelineRange']) {
    assert.match(source, new RegExp(`id="${id}"`));
  }
  assert.match(source, /type: 'heatmap', source: OBS_HEAT_SRC/);
  assert.match(source, /function configureTimeline\(\)/);
  assert.match(source, /timestampMillis\(data\.createdAt\)/);
  assert.match(source, /النطاق المرسوم مؤقت ومحلي وغير محفوظ/);
  assert.doesNotMatch(source, /الفرق الميدانية النشطة/);
  assert.doesNotMatch(source, /متوسط زمن الاستجابة/);
});

test('smart observation symbols encode category, status and real priority without generic-only pins', () => {
  assert.match(source, /iconPaths = \{/);
  assert.match(source, /--marker-status/);
  assert.match(source, /priority-badge/);
  assert.match(source, /category: data\.type \|\| 'UNKNOWN', priority/);
});

test('command cartography keeps MapLibre and the Twin boundary while glowing only real configured municipal bounds', () => {
  assert.match(source, /new maplibregl\.Map\(/);
  assert.match(source, /IMPLEMENTED_LAYER_IDS = \['commercial_places', 'buildings', 'field_observations'\]/);
  assert.match(source, /continuity\.buildContinuityUrl\('\/twin\.html'/);
  assert.match(source, /if \(!Array\.isArray\(bounds\) \|\| bounds\.length !== 2\) return;/);
  assert.match(source, /geo-municipal-boundary-glow-wide/);
  assert.match(source, /geo-municipal-boundary-glow/);
  assert.doesNotMatch(source, /raster-hue-rotate', dark \? 195/);
  assert.doesNotMatch(source, /employee_tracking|vehicle_gps|mobility_incidents.*coordinates|lands_parcels.*geometry/i);
});

test('reference language is implemented with switch toggles, luminous clusters and a light quick popup', () => {
  assert.match(source, /\.layer-row input\{appearance:none/);
  assert.match(source, /\.geo-cluster[\s\S]*var\(--cluster-ring\)/);
  assert.match(source, /\.maplibregl-popup-content\{background:#ffffff/);
  assert.match(source, /class="panel-close" id="panelCloseBtn"/);
  assert.match(source, /new maplibregl\.Popup\(/);
});
