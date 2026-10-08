'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'api', 'admin', 'users.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'mobility-runtime.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');

test('Mobility telemetry is trusted, assignment-bound and capability-gated', () => {
  assert.match(api, /action === 'reportMobilityTelemetry'/);
  assert.match(api, /getMobilityAssignedOperatorCallerContext/);
  assert.match(api, /actor\.capabilities\.includes\('vehicle\.drive'\)/);
  assert.match(api, /mission\.assignedEmployeeUid !== actor\.uid/);
  assert.match(api, /vehicle\.currentMissionId !== missionId/);
  assert.match(api, /vehicle\.status !== 'IN_MISSION'/);
  assert.match(api, /mobilityTelemetry/);
});

test('Mobility workspace returns trusted municipal map context and last-known telemetry', () => {
  assert.match(api, /safeMobilityMapContext/);
  assert.match(api, /mapContext,/);
  assert.match(api, /telemetry,/);
  assert.match(api, /mapBounds/);
  assert.match(api, /mapCenter/);
});

test('Runtime publishes privacy-bounded telemetry and refreshes command center', () => {
  assert.match(runtime, /navigator\.geolocation\.watchPosition/);
  assert.match(runtime, /TELEMETRY_REPORT_MIN_MS = 15 \* 1000/);
  assert.match(runtime, /reportMobilityTelemetry/);
  assert.match(runtime, /LIVE/);
  assert.match(runtime, /STALE/);
  assert.match(runtime, /OFFLINE/);
  assert.match(runtime, /setInterval\(\(\) => refresh\(\)\.catch/);
});

test('Mobility map no longer uses a hard-coded center or synthetic mobility layer counts', () => {
  assert.doesNotMatch(page, /center:\s*\[41\.07889,\s*19\.12639\]/);
  assert.match(page, /applyMunicipalMapContext/);
  assert.match(page, /syncMobilityRealMap/);
  assert.match(page, /trustedMobilityLayers/);
  assert.match(page, /SMART HSR SATELLITE/);
  assert.doesNotMatch(page, /SMART HSR TWIN — التوأم البلدي الرقمي/);
});
