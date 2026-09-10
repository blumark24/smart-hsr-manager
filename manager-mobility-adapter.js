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

function buildViewData(missions, vehicles, incidents) {
  const activeMissions = missions.filter(m => OPEN_MISSION_STATUSES.includes(m.status));
  const closedMissions = missions.filter(m => m.status === 'CLOSED');
  const draftMissions = missions.filter(m => m.status === 'DRAFT');
  const availableVehicles = vehicles.filter(v => v.status === 'AVAILABLE');
  const inMissionVehicles = vehicles.filter(v => v.status === 'IN_MISSION' || v.status === 'RESERVED');
  const unavailableVehicles = vehicles.filter(v => UNAVAILABLE_VEHICLE_STATUSES.includes(v.status));
  const openIncidents = incidents.filter(i => OPEN_INCIDENT_STATUSES.includes(i.status));
  const resolvedIncidents = incidents.filter(i => i.status === 'RESOLVED');

  const deptCounts = new Map();
  for (const m of activeMissions) {
    deptCounts.set(m.department, (deptCounts.get(m.department) || 0) + 1);
  }
  const departments = Array.from(deptCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    kpi: {
      missionsTotal: String(missions.length),
      missionsActive: String(activeMissions.length),
      missionsDraft: String(draftMissions.length),
      missionsClosed: String(closedMissions.length),
      vehiclesTotal: String(vehicles.length),
      vehiclesAvailable: String(availableVehicles.length),
      vehiclesInMission: String(inMissionVehicles.length),
      vehiclesUnavailable: String(unavailableVehicles.length),
      incidentsOpen: String(openIncidents.length),
      incidentsResolved: String(resolvedIncidents.length)
    },
    departments
  };
}

function publish(component, payload) {
  if (!component || component !== activeComponent) return;
  component.liveMobilityKpi = payload.kpi;
  component.liveMobilityDepartments = payload.departments;
  component.liveMobilityDataState = 'ready';
  component.liveMobilityDataError = '';
  component.setState(state => ({ mobilityRevision: (state.mobilityRevision || 0) + 1 }));
}

function fail(component, message) {
  if (!component || component !== activeComponent) return;
  component.liveMobilityDataState = 'error';
  component.liveMobilityDataError = message;
  component.setState(state => ({ mobilityRevision: (state.mobilityRevision || 0) + 1 }));
}

async function start(component) {
  const orgId = component.state?.orgId;
  if (!orgId) { fail(component, 'تعذر تحديد هوية المنظمة الحالية.'); return; }

  const [appApi, firestoreApi] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
  ]);
  const app = appApi.getApps().find(item => item.name === 'smart-hsr-manager-session');
  if (!app) { fail(component, 'لا توجد جلسة Firebase نشطة.'); return; }
  const db = firestoreApi.getFirestore(app);

  let missions = [], vehicles = [], incidents = [];
  const update = () => publish(component, buildViewData(missions, vehicles, incidents));

  stopMissions = firestoreApi.onSnapshot(
    firestoreApi.query(firestoreApi.collection(db, 'missions'), firestoreApi.where('organizationId', '==', orgId)),
    { includeMetadataChanges: true },
    snapshot => { if (snapshot.metadata.fromCache) return; missions = snapshot.docs.map(normalizeMission); update(); },
    () => fail(component, 'تعذر تحميل بيانات المهام.')
  );
  stopVehicles = firestoreApi.onSnapshot(
    firestoreApi.query(firestoreApi.collection(db, 'vehicles'), firestoreApi.where('organizationId', '==', orgId)),
    { includeMetadataChanges: true },
    snapshot => { if (snapshot.metadata.fromCache) return; vehicles = snapshot.docs.map(normalizeVehicle); update(); },
    () => fail(component, 'تعذر تحميل بيانات المركبات.')
  );
  stopIncidents = firestoreApi.onSnapshot(
    firestoreApi.query(firestoreApi.collection(db, 'incidents'), firestoreApi.where('organizationId', '==', orgId)),
    { includeMetadataChanges: true },
    snapshot => { if (snapshot.metadata.fromCache) return; incidents = snapshot.docs.map(normalizeIncident); update(); },
    () => fail(component, 'تعذر تحميل بيانات الحوادث.')
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
      component.liveMobilityDataState = 'ready';
      publish(component, buildViewData([], [], []));
      return;
    }
    start(component).catch(() => fail(component, 'تعذر تحميل بيانات إدارة الحركة والسير.'));
  },
  disconnect(component) {
    if (component && component !== activeComponent) return;
    stopMissions?.(); stopVehicles?.(); stopIncidents?.();
    stopMissions = stopVehicles = stopIncidents = null;
    activeComponent = null;
  }
};
