'use strict';
// PHASE 06 — read-only Mobility data adapter for the Municipality Manager's
// own dedicated إدارة الحركة والسير executive view inside the MAIN Manager
// dashboard (manager.html). Municipality Manager is NOT one of the four
// Mobility operational roles (mobility_head/department_head/
// administrative_affairs/employee) — this adapter never signs into the
// separate Mobility session app and never touches smart-mobility.html or
// smart-mobility-adapter.js, which remain the untouched operational tools
// for those four roles.
//
// Reuses the SAME authenticated Firebase app/session manager-dashboard-
// adapter.js already established ('smart-hsr-manager-session') — never a
// second Firebase app, never a second login, connected only once the
// manager explicitly opens this product (see manager.html's
// goMobilityGateway()).
//
// Reads ONLY the existing top-level missions/vehicles/incidents
// collections, org-scoped, under the existing, unmodified firestore.rules
// (`isActiveManager() && resource.data.organizationId == managerOrgId()` —
// already present on all three collections, verified, never a Rules
// change). No write, no mutation of any kind is performed here.

const isLocalPreview = () => ['localhost', '127.0.0.1'].includes(location.hostname)
  && new URLSearchParams(location.search).get('preview') === '1';

let activeComponent = null;
let stopMissions = null;
let stopVehicles = null;
let stopIncidents = null;

// Mirrors smart-mobility-adapter.js's own status vocabulary exactly — never
// invents a new status value.
const OPEN_MISSION_STATUSES = Object.freeze([
  'PENDING_APPROVAL', 'APPROVED', 'VEHICLE_ALLOCATED', 'HANDED_OVER',
  'READY', 'IN_PROGRESS', 'INCIDENT_HOLD', 'AWAITING_RETURN'
]);
const OPEN_INCIDENT_STATUSES = Object.freeze(['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS']);
const UNAVAILABLE_VEHICLE_STATUSES = Object.freeze(['MAINTENANCE', 'OUT_OF_SERVICE']);

function normalizeMission(entry) {
  const data = entry.data() || {};
  return { id: entry.id, status: data.status || null, department: data.department || 'غير محدد' };
}
function normalizeVehicle(entry) {
  const data = entry.data() || {};
  return { id: entry.id, status: data.status || null };
}
function normalizeIncident(entry) {
  const data = entry.data() || {};
  return { id: entry.id, status: data.status || null };
}

// PHASE 06 CLOSURE — DEFECT 3 fix: missions/vehicles/incidents are three
// INDEPENDENT listeners, and a read failure on one must never be erased by
// a later success on another. Each source now carries its own truthful
// 'loading' | 'ready' | 'error' state; a KPI field derived from a source
// that is not 'ready' renders '—' (the same honest-unavailable convention
// used elsewhere, e.g. the Lands executive view), never a fabricated zero
// computed from that source's stale/empty array. The single
// liveMobilityDataState/liveMobilityDataError slots manager.html already
// renders are now an HONEST AGGREGATE across all three sources — 'error' if
// any one has failed (even while the others are genuinely ready), 'loading'
// only while none have failed yet and at least one is still pending, and
// 'ready' only once all three are truthfully ready — so a real vehicles-read
// failure can never be masked by missions loading successfully afterward.
const SOURCE_LABELS = Object.freeze({ missions: 'بيانات المهام', vehicles: 'بيانات المركبات', incidents: 'بيانات الحوادث' });

function missionKpiFields(missions, state) {
  if (state !== 'ready') return { missionsTotal: '—', missionsActive: '—', missionsDraft: '—', missionsClosed: '—' };
  const activeMissions = missions.filter(m => OPEN_MISSION_STATUSES.includes(m.status));
  const closedMissions = missions.filter(m => m.status === 'CLOSED');
  const draftMissions = missions.filter(m => m.status === 'DRAFT');
  return {
    missionsTotal: String(missions.length), missionsActive: String(activeMissions.length),
    missionsDraft: String(draftMissions.length), missionsClosed: String(closedMissions.length)
  };
}
function vehicleKpiFields(vehicles, state) {
  if (state !== 'ready') return { vehiclesTotal: '—', vehiclesAvailable: '—', vehiclesInMission: '—', vehiclesUnavailable: '—' };
  const availableVehicles = vehicles.filter(v => v.status === 'AVAILABLE');
  const inMissionVehicles = vehicles.filter(v => v.status === 'IN_MISSION' || v.status === 'RESERVED');
  const unavailableVehicles = vehicles.filter(v => UNAVAILABLE_VEHICLE_STATUSES.includes(v.status));
  return {
    vehiclesTotal: String(vehicles.length), vehiclesAvailable: String(availableVehicles.length),
    vehiclesInMission: String(inMissionVehicles.length), vehiclesUnavailable: String(unavailableVehicles.length)
  };
}
function incidentKpiFields(incidents, state) {
  if (state !== 'ready') return { incidentsOpen: '—', incidentsResolved: '—' };
  const openIncidents = incidents.filter(i => OPEN_INCIDENT_STATUSES.includes(i.status));
  const resolvedIncidents = incidents.filter(i => i.status === 'RESOLVED');
  return { incidentsOpen: String(openIncidents.length), incidentsResolved: String(resolvedIncidents.length) };
}

function departmentsFrom(missions, state) {
  if (state !== 'ready') return [];
  const activeMissions = missions.filter(m => OPEN_MISSION_STATUSES.includes(m.status));
  const deptCounts = new Map();
  for (const m of activeMissions) deptCounts.set(m.department, (deptCounts.get(m.department) || 0) + 1);
  return Array.from(deptCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function buildViewData(sources) {
  const { missions, vehicles, incidents, missionsState, vehiclesState, incidentsState } = sources;
  const states = { missions: missionsState, vehicles: vehiclesState, incidents: incidentsState };
  const failedSources = Object.keys(states).filter(key => states[key] === 'error');
  const overallState = failedSources.length ? 'error'
    : Object.values(states).some(s => s !== 'ready') ? 'loading' : 'ready';
  const overallError = failedSources.length
    ? failedSources.map(key => `تعذر تحميل ${SOURCE_LABELS[key]}.`).join(' ')
    : '';

  return {
    kpi: {
      ...missionKpiFields(missions, missionsState),
      ...vehicleKpiFields(vehicles, vehiclesState),
      ...incidentKpiFields(incidents, incidentsState)
    },
    departments: departmentsFrom(missions, missionsState),
    overallState,
    overallError
  };
}

function publish(component, sources) {
  if (!component || component !== activeComponent) return;
  const payload = buildViewData(sources);
  component.liveMobilityKpi = payload.kpi;
  component.liveMobilityDepartments = payload.departments;
  component.liveMobilityDataState = payload.overallState;
  component.liveMobilityDataError = payload.overallError;
  component.setState(state => ({ mobilityRevision: (state.mobilityRevision || 0) + 1 }));
}

// Total connection-level failure (no organizationId, no active session, the
// initial Firebase module import itself rejecting) truthfully marks ALL
// THREE sources as failed — never silently drops back to a partial/'ready'
// aggregate for sources that were simply never attempted.
function failAll(component, message) {
  if (!component || component !== activeComponent) return;
  publish(component, {
    missions: [], vehicles: [], incidents: [],
    missionsState: 'error', vehiclesState: 'error', incidentsState: 'error'
  });
  component.liveMobilityDataError = message;
}

async function start(component) {
  const orgId = component.state?.orgId;
  if (!orgId) { failAll(component, 'تعذر تحديد هوية المنظمة الحالية.'); return; }

  const [appApi, firestoreApi] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
  ]);
  const app = appApi.getApps().find(item => item.name === 'smart-hsr-manager-session');
  if (!app) { failAll(component, 'لا توجد جلسة Firebase نشطة.'); return; }
  const db = firestoreApi.getFirestore(app);

  // Each source keeps its OWN truthful state — see buildViewData()'s header
  // comment. A later success on one source publishes an update that still
  // carries whatever state the OTHER two sources most recently and
  // genuinely reported, never resetting them to 'ready'/'loading'.
  const sources = {
    missions: [], vehicles: [], incidents: [],
    missionsState: 'loading', vehiclesState: 'loading', incidentsState: 'loading'
  };
  const update = () => publish(component, sources);

  stopMissions = firestoreApi.onSnapshot(
    firestoreApi.query(firestoreApi.collection(db, 'missions'), firestoreApi.where('organizationId', '==', orgId)),
    { includeMetadataChanges: true },
    snapshot => { if (snapshot.metadata.fromCache) return; sources.missions = snapshot.docs.map(normalizeMission); sources.missionsState = 'ready'; update(); },
    () => { sources.missionsState = 'error'; update(); }
  );
  stopVehicles = firestoreApi.onSnapshot(
    firestoreApi.query(firestoreApi.collection(db, 'vehicles'), firestoreApi.where('organizationId', '==', orgId)),
    { includeMetadataChanges: true },
    snapshot => { if (snapshot.metadata.fromCache) return; sources.vehicles = snapshot.docs.map(normalizeVehicle); sources.vehiclesState = 'ready'; update(); },
    () => { sources.vehiclesState = 'error'; update(); }
  );
  stopIncidents = firestoreApi.onSnapshot(
    firestoreApi.query(firestoreApi.collection(db, 'incidents'), firestoreApi.where('organizationId', '==', orgId)),
    { includeMetadataChanges: true },
    snapshot => { if (snapshot.metadata.fromCache) return; sources.incidents = snapshot.docs.map(normalizeIncident); sources.incidentsState = 'ready'; update(); },
    () => { sources.incidentsState = 'error'; update(); }
  );
}

window.SmartHSRMobilityAdapter = {
  connect(component) {
    if (activeComponent === component) return;
    this.disconnect();
    activeComponent = component;
    component.liveMobilityDataState = 'loading';
    component.liveMobilityDataError = '';
    if (isLocalPreview()) {
      publish(component, {
        missions: [], vehicles: [], incidents: [],
        missionsState: 'ready', vehiclesState: 'ready', incidentsState: 'ready'
      });
      return;
    }
    start(component).catch(() => failAll(component, 'تعذر تحميل بيانات إدارة الحركة والسير.'));
  },
  disconnect(component) {
    if (component && component !== activeComponent) return;
    stopMissions?.(); stopVehicles?.(); stopIncidents?.();
    stopMissions = stopVehicles = stopIncidents = null;
    activeComponent = null;
  }
};
