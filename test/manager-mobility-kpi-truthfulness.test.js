'use strict';
// PHASE 06 CLOSURE — DEFECT 3 (Manager KPI/error truthfulness) executable
// proof. manager-mobility-adapter.js previously published ONE shared
// liveMobilityDataState across all three independent listeners
// (missions/vehicles/incidents): a later success on any one of them
// unconditionally reset the state to 'ready' and cleared the error, even
// while another source had genuinely failed — turning a real read failure
// into an indistinguishable fake zero. This runs the REAL extracted
// buildViewData()/publish()/failAll() functions (not a reimplementation)
// against a fake component to prove the fix.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const adapter = fs.readFileSync(path.join(__dirname, '..', 'manager-mobility-adapter.js'), 'utf8');

function loadKpiLogic() {
  const start = adapter.indexOf('const OPEN_MISSION_STATUSES');
  const end = adapter.indexOf('async function start(component)');
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const src = adapter.slice(start, end);
  const context = {};
  vm.runInNewContext(
    `${src}\nthis.buildViewData = buildViewData;\nthis.publish = publish;\nthis.failAll = failAll;\nthis.__setActiveComponent = c => { activeComponent = c; };`,
    context
  );
  return context;
}

function fakeComponent() {
  return {
    liveMobilityKpi: null, liveMobilityDepartments: null,
    liveMobilityDataState: 'loading', liveMobilityDataError: '',
    revisions: 0,
    setState(updater) { this.revisions += 1; Object.assign(this, updater(this)); }
  };
}

test('vehicles read fails, missions read later succeeds: vehicle KPI stays unavailable, mission KPI is real, overall state stays error', () => {
  const logic = loadKpiLogic();
  const component = fakeComponent();
  logic.__setActiveComponent(component);

  const sources = {
    missions: [], vehicles: [], incidents: [],
    missionsState: 'loading', vehiclesState: 'loading', incidentsState: 'loading'
  };

  // vehicles fails first
  sources.vehiclesState = 'error';
  logic.publish(component, sources);
  assert.equal(component.liveMobilityDataState, 'error');
  assert.match(component.liveMobilityDataError, /بيانات المركبات/);

  // missions succeeds AFTER the vehicles failure — must NOT erase it
  sources.missions = [
    { id: 'm1', status: 'IN_PROGRESS', department: 'الطرق' },
    { id: 'm2', status: 'DRAFT', department: 'الطرق' }
  ];
  sources.missionsState = 'ready';
  logic.publish(component, sources);

  assert.equal(component.liveMobilityDataState, 'error', 'a later mission success must never overwrite a real vehicles failure back to ready');
  assert.match(component.liveMobilityDataError, /بيانات المركبات/, 'the disclosed error must still name the failed source');
  assert.equal(component.liveMobilityKpi.vehiclesTotal, '—', 'vehicle KPI must stay unavailable, never a fabricated zero');
  assert.equal(component.liveMobilityKpi.vehiclesAvailable, '—');
  assert.equal(component.liveMobilityKpi.missionsTotal, '2', 'the unaffected mission KPI must show its real, ready value');
  assert.equal(component.liveMobilityKpi.missionsActive, '1');
});

test('incident read fails, vehicle read succeeds: incident KPI stays unavailable while vehicle KPI is real', () => {
  const logic = loadKpiLogic();
  const component = fakeComponent();
  logic.__setActiveComponent(component);

  const sources = {
    missions: [], vehicles: [], incidents: [],
    missionsState: 'ready', vehiclesState: 'loading', incidentsState: 'loading'
  };
  logic.publish(component, sources);

  sources.incidentsState = 'error';
  logic.publish(component, sources);

  sources.vehicles = [{ id: 'v1', status: 'AVAILABLE' }, { id: 'v2', status: 'IN_MISSION' }];
  sources.vehiclesState = 'ready';
  logic.publish(component, sources);

  assert.equal(component.liveMobilityDataState, 'error');
  assert.match(component.liveMobilityDataError, /بيانات الحوادث/);
  assert.equal(component.liveMobilityKpi.incidentsOpen, '—');
  assert.equal(component.liveMobilityKpi.incidentsResolved, '—');
  assert.equal(component.liveMobilityKpi.vehiclesTotal, '2', 'vehicles succeeded after the incidents failure — its KPI must be real');
  assert.equal(component.liveMobilityKpi.vehiclesAvailable, '1');
});

test('recovery of a previously failed source restores its truthful values and clears the aggregate error once every source is ready', () => {
  const logic = loadKpiLogic();
  const component = fakeComponent();
  logic.__setActiveComponent(component);

  const sources = {
    missions: [], vehicles: [], incidents: [],
    missionsState: 'ready', vehiclesState: 'error', incidentsState: 'ready'
  };
  logic.publish(component, sources);
  assert.equal(component.liveMobilityDataState, 'error');
  assert.equal(component.liveMobilityKpi.vehiclesTotal, '—');

  // the vehicles listener recovers on a later snapshot
  sources.vehicles = [{ id: 'v1', status: 'AVAILABLE' }];
  sources.vehiclesState = 'ready';
  logic.publish(component, sources);

  assert.equal(component.liveMobilityDataState, 'ready', 'once every source is truthfully ready the aggregate must clear');
  assert.equal(component.liveMobilityDataError, '');
  assert.equal(component.liveMobilityKpi.vehiclesTotal, '1');
  assert.equal(component.liveMobilityKpi.vehiclesAvailable, '1');
});

test('an empty but successful read is distinguishable from a failed read: real zero is "0", unavailable is "—"', () => {
  const logic = loadKpiLogic();
  const component = fakeComponent();
  logic.__setActiveComponent(component);

  // vehicles genuinely has zero documents (a real, ready, empty result)
  const readySources = {
    missions: [], vehicles: [], incidents: [],
    missionsState: 'ready', vehiclesState: 'ready', incidentsState: 'ready'
  };
  logic.publish(component, readySources);
  assert.equal(component.liveMobilityDataState, 'ready');
  assert.equal(component.liveMobilityKpi.vehiclesTotal, '0', 'a real empty collection must show a real zero');

  // now simulate the SAME empty array but from a failed read instead
  const component2 = fakeComponent();
  logic.__setActiveComponent(component2);
  const failedSources = {
    missions: [], vehicles: [], incidents: [],
    missionsState: 'ready', vehiclesState: 'error', incidentsState: 'ready'
  };
  logic.publish(component2, failedSources);
  assert.equal(component2.liveMobilityKpi.vehiclesTotal, '—', 'the identical empty array from a FAILED read must never render as the real zero');
  assert.notEqual(component2.liveMobilityKpi.vehiclesTotal, component.liveMobilityKpi.vehiclesTotal);
});

test('a total connection-level failure (failAll) truthfully marks every source as unavailable, never a partial-success illusion', () => {
  const logic = loadKpiLogic();
  const component = fakeComponent();
  logic.__setActiveComponent(component);

  logic.failAll(component, 'تعذر تحديد هوية المنظمة الحالية.');

  assert.equal(component.liveMobilityDataState, 'error');
  assert.equal(component.liveMobilityDataError, 'تعذر تحديد هوية المنظمة الحالية.');
  for (const key of ['missionsTotal', 'missionsActive', 'vehiclesTotal', 'vehiclesAvailable', 'incidentsOpen', 'incidentsResolved']) {
    assert.equal(component.liveMobilityKpi[key], '—', `${key} must be unavailable, never a fabricated zero, on total connection failure`);
  }
  assert.ok(Array.isArray(component.liveMobilityDepartments) && component.liveMobilityDepartments.length === 0);
});
