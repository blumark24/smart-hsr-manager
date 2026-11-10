'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');

function between(startMarker, endMarker) {
  const start = dashboard.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = dashboard.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return dashboard.slice(start, end);
}

test('first-page pagination remains bounded to 25 records', () => {
  assert.match(dashboard, /const OBSERVATIONS_PAGE_SIZE = 25;/);
  const subscribe = between('function subscribeObservations()', 'window.loadMoreObservations = async function()');
  assert.match(subscribe, /limit\(OBSERVATIONS_PAGE_SIZE\)/);
});

test('aggregate counters are scoped to the signed-in inspector and organization', () => {
  const aggregate = between('async function refreshInspectorServerCounts()', '// HEADER ELEMENTS');
  assert.match(aggregate, /where\('organizationId', '==', organizationId\)/);
  assert.match(aggregate, /where\('createdByUid', '==', uid\)/);
  assert.match(aggregate, /getCountFromServer/);
  assert.match(aggregate, /where\('status', '==', 'PENDING'\)/);
  assert.match(aggregate, /where\('status', '==', 'IN_PROGRESS'\)/);
  assert.match(aggregate, /where\('status', '==', 'COMPLETED'\)/);
});

test('aggregate refresh is read-only and cannot mutate observations', () => {
  const aggregate = between('async function refreshInspectorServerCounts()', '// HEADER ELEMENTS');
  for (const prohibited of ['setDoc(', 'updateDoc(', 'deleteDoc(', 'addDoc(']) {
    assert.equal(aggregate.includes(prohibited), false, `Aggregate counter must not call ${prohibited}`);
  }
});

test('server-confirmed snapshot refreshes aggregate counters', () => {
  const subscribe = between('function subscribeObservations()', 'window.loadMoreObservations = async function()');
  assert.match(subscribe, /observationsServerConfirmed = true;/);
  assert.match(subscribe, /void refreshInspectorServerCounts\(\);/);
});

test('inspector KPI surfaces use aggregate totals instead of loaded-array length', () => {
  const light = between('function renderInspectorLightDashboard(own)', 'function renderReferenceInspectorDashboard(own)');
  assert.match(light, /inspectorServerCounts\.total/);
  assert.match(light, /inspectorServerCounts\.pending/);
  assert.match(light, /inspectorServerCounts\.progress/);
  assert.match(light, /inspectorServerCounts\.completed/);
  assert.doesNotMatch(light, /String\(own\.length\)/);

  const reference = between('function renderReferenceInspectorDashboard(own)', "window.addEventListener('online'");
  assert.match(reference, /refTotalCount'.*inspectorServerCounts\.total/s);
  assert.doesNotMatch(reference, /refTotalCount'.*own\.length/s);
});

test('legacy KPI total/open/closed counters do not use the first loaded page as all-time total', () => {
  const kpis = between('function kpis()', 'function renderKPIs()');
  assert.match(kpis, /inspectorServerCounts\?\.total/);
  assert.match(kpis, /inspectorServerCounts \? inspectorServerCounts\.total - inspectorServerCounts\.completed/);
  assert.match(kpis, /inspectorServerCounts\?\.completed/);
  assert.doesNotMatch(kpis, /const totalReports = observationsData\.length/);
});

test('count failure fails visibly instead of reporting a false 25 total', () => {
  const aggregate = between('async function refreshInspectorServerCounts()', '// HEADER ELEMENTS');
  assert.match(aggregate, /inspectorServerCounts = null;/);
  const light = between('function renderInspectorLightDashboard(own)', 'function renderReferenceInspectorDashboard(own)');
  assert.match(light, /: '—'/);
});

test('load-more pagination still uses cursor pagination', () => {
  const loadMore = between('window.loadMoreObservations = async function()', '// كتابة مُعرَّفة');
  assert.match(loadMore, /startAfter\(oldestObservationCursor\)/);
  assert.match(loadMore, /limit\(OBSERVATIONS_PAGE_SIZE\)/);
});
