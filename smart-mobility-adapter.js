const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCXCiNeaO9lhM79tKb98x4oaNqNy5xKvWM',
  authDomain: 'smart-hsr-manager.firebaseapp.com',
  projectId: 'smart-hsr-manager',
  storageBucket: 'smart-hsr-manager.firebasestorage.app',
  messagingSenderId: '38965508031',
  appId: '1:38965508031:web:6fd0b6c6b0b63fa513930a'
};

// Roles recognized by the Smart Mobility module, mapped onto this design's
// internal role ids. municipality_manager reuses the existing manager
// account (managers/{uid}) rather than a new role value.
const MOBILITY_ROLE_TO_DESIGN_ID = Object.freeze({
  mobility_head: 'mobility',
  department_head: 'dept',
  administrative_affairs: 'admin',
  employee: 'employee'
});

// The mission/vehicle state machines (platform/policies/*.js, firestore.rules)
// store canonical English status values. The approved design's screens key
// their color map (ST) and every status comparison off the Arabic labels
// below, so live Firestore data is translated at the boundary — nothing
// downstream in smart-mobility.html needs to know English values exist.
const MISSION_STATUS_TO_ARABIC = Object.freeze({
  DRAFT: 'مسودة',
  PENDING_APPROVAL: 'بانتظار الاعتماد',
  APPROVED: 'بانتظار المركبة',
  REJECTED: 'ملغاة',
  VEHICLE_ALLOCATED: 'تم تخصيص المركبة',
  HANDED_OVER: 'تم التسليم',
  READY: 'جاهزة للبدء',
  IN_PROGRESS: 'قيد التنفيذ',
  INCIDENT_HOLD: 'متوقفة بسبب حادث',
  COMPLETED: 'مكتملة',
  AWAITING_RETURN: 'في انتظار إعادة المركبة',
  CLOSED: 'مغلقة'
});

const VEHICLE_STATUS_TO_ARABIC = Object.freeze({
  AVAILABLE: 'متاحة',
  RESERVED: 'محجوزة',
  IN_MISSION: 'في مهمة',
  RETURN_PENDING: 'عائدة',
  MAINTENANCE: 'صيانة',
  OUT_OF_SERVICE: 'خارج الخدمة'
});

const INCIDENT_STATUS_TO_ARABIC = Object.freeze({
  NEW: 'جديد',
  ACKNOWLEDGED: 'تم الاستلام',
  IN_PROGRESS: 'تحت المعالجة',
  RESOLVED: 'تم الحل'
});

let activeComponent = null;
let stopAuth = null;
let stopMissions = null;
let stopVehicles = null;
let stopEmployees = null;
let stopIncidents = null;
let activeAuth = null;
let activeAuthApi = null;
let activeDb = null;
let activeFirestoreApi = null;
let activeContext = null;

const isLocalPreview = () => ['localhost', '127.0.0.1'].includes(location.hostname)
  && new URLSearchParams(location.search).get('preview') === '1';

async function verifyMobilityAccess(api, db, user) {
  if (!user) return null;
  const manager = await api.getDoc(api.doc(db, 'managers', user.uid));
  if (manager.exists()) {
    const data = manager.data() || {};
    const organizationId = typeof data.organizationId === 'string' ? data.organizationId.trim() : '';
    if (data.role === 'manager' && data.active !== false && organizationId) {
      return {
        designRole: 'manager', organizationId, uid: user.uid,
        organizationName: data.organizationName?.trim() || organizationId
      };
    }
  }
  const orgUser = await api.getDoc(api.doc(db, 'users', user.uid));
  if (!orgUser.exists()) return null;
  const data = orgUser.data() || {};
  // PHASE 06A hotfix — Mobility's role may now live in the independent
  // mobilityAccess field instead of the legacy scalar `role` (see
  // firestore.rules' mobilityRoleValue() for the exact same dual-read,
  // server-side). Once mobilityAccess exists on a record at all, it is the
  // sole source of truth for Mobility purposes — only a record that has
  // never been touched by the new field falls back to the legacy `role`.
  const mobilityRole = ('mobilityAccess' in data)
    ? (data.mobilityAccess && data.mobilityAccess.enabled === true ? data.mobilityAccess.role : null)
    : data.role;
  const designRole = MOBILITY_ROLE_TO_DESIGN_ID[mobilityRole];
  const organizationId = typeof data.organizationId === 'string' ? data.organizationId.trim() : '';
  if (!designRole || data.active === false || !organizationId) return null;
  return {
    designRole, organizationId, uid: user.uid,
    organizationName: data.organizationName?.trim() || organizationId,
    department: typeof data.department === 'string' ? data.department.trim() : ''
  };
}

function normalizeMission(id, data) {
  return {
    id, no: id,
    type: data.type || 'مهمة ميدانية',
    dept: data.department || '—',
    emp: data.assignedEmployeeName || data.requestedEmployeeName || '—',
    dest: data.destination || '—',
    veh: data.vehicleId || '',
    status: MISSION_STATUS_TO_ARABIC[data.status] || data.status,
    when: data.whenLabel || '—',
    dur: data.durationLabel || '—',
    scope: data.scope || 'داخل النطاق',
    why: data.reason || '—',
    requester: data.requesterName || 'رئيس القسم',
    // PHASE 06A hotfix (GPS honesty) — this is mission-lifecycle context
    // only (is a real device in motion for this mission), never a claim
    // that real GPS/location data exists. smart-mobility.html's own
    // gpsLabel/gpsCol/gps-status rows are the honest, worded-accordingly
    // disclosure — this raw boolean must never be rendered as "GPS نشط"
    // or similar directly.
    gps: data.status === 'IN_PROGRESS' || data.status === 'HANDED_OVER',
    // Raw fields the adapter's action functions and rules-mirrored checks need.
    organizationId: data.organizationId, department: data.department,
    createdByUid: data.createdByUid, assignedEmployeeUid: data.assignedEmployeeUid || '',
    rawStatus: data.status
  };
}

function normalizeVehicle(id, data) {
  return {
    id, no: id, plate: data.plate || '—',
    type: data.type || 'مركبة', make: data.make || '—', model: data.model || '—', year: data.year || '—',
    dept: data.department || '—',
    status: VEHICLE_STATUS_TO_ARABIC[data.status] || data.status,
    odo: data.odo || 0, fuel: data.fuel || 0,
    last: data.updatedAtLabel || '—', maintLast: '—', maintNext: '—', note: '—',
    organizationId: data.organizationId, assignedEmployeeUid: data.assignedEmployeeUid || '',
    currentMissionId: data.currentMissionId || '', rawStatus: data.status
  };
}

// Incidents are plotted on the twin at a fixed position derived from their
// id (deterministic, not real geolocation — this system has no real GPS
// source; see the "مواقع تخطيطية" disclosure on the map screen).
function incidentPosition(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const angle = (h % 360) * Math.PI / 180;
  const r = 0.2 + (h % 100) / 100 * 0.3;
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

function normalizeIncident(id, data) {
  const pos = incidentPosition(id);
  return {
    id, cat: data.category || 'حادث',
    sev: { CRITICAL: 'حرجة', MEDIUM: 'متوسطة', LOW: 'منخفضة' }[data.severity] || 'متوسطة',
    status: INCIDENT_STATUS_TO_ARABIC[data.status] || data.status,
    mis: data.missionId || '—', veh: data.vehicleId || '—', emp: data.employeeName || '—',
    dept: data.department || '—', loc: data.location || '—', time: data.timeLabel || '—',
    note: data.note || '—', ev: 'بلا دليل مرفق', x: pos.x, y: pos.y,
    organizationId: data.organizationId, createdByUid: data.createdByUid, rawStatus: data.status
  };
}

function publishMissions(component, snapshot) {
  const missions = snapshot.docs.map(d => normalizeMission(d.id, d.data() || {}));
  component.setState({ liveMissions: missions });
}

function publishVehicles(component, snapshot) {
  const vehicles = snapshot.docs.map(d => normalizeVehicle(d.id, d.data() || {}));
  component.setState({ liveVehicles: vehicles });
}

function publishIncidents(component, snapshot) {
  const incidents = snapshot.docs.map(d => normalizeIncident(d.id, d.data() || {}));
  component.setState({ liveIncidents: incidents });
}

function subscribeMissions(firestoreApi, db, component, context) {
  const base = firestoreApi.collection(db, 'missions');
  const clauses = [firestoreApi.where('organizationId', '==', context.organizationId)];
  if (context.designRole === 'dept') clauses.push(firestoreApi.where('department', '==', context.department));
  if (context.designRole === 'employee') clauses.push(firestoreApi.where('assignedEmployeeUid', '==', context.uid));
  const q = firestoreApi.query(base, ...clauses);
  return firestoreApi.onSnapshot(q, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache) return;
    publishMissions(component, snapshot);
  }, () => component.setState({ liveMissions: [] }));
}

function subscribeVehicles(firestoreApi, db, component, context) {
  const clauses = [firestoreApi.where('organizationId', '==', context.organizationId)];
  if (context.designRole === 'employee') clauses.push(firestoreApi.where('assignedEmployeeUid', '==', context.uid));
  const q = firestoreApi.query(firestoreApi.collection(db, 'vehicles'), ...clauses);
  return firestoreApi.onSnapshot(q, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache) return;
    publishVehicles(component, snapshot);
  }, () => component.setState({ liveVehicles: [] }));
}

function subscribeIncidents(firestoreApi, db, component, context) {
  const clauses = [firestoreApi.where('organizationId', '==', context.organizationId)];
  if (context.designRole === 'dept') clauses.push(firestoreApi.where('department', '==', context.department));
  if (context.designRole === 'employee') clauses.push(firestoreApi.where('createdByUid', '==', context.uid));
  const q = firestoreApi.query(firestoreApi.collection(db, 'incidents'), ...clauses);
  return firestoreApi.onSnapshot(q, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache) return;
    publishIncidents(component, snapshot);
  }, () => component.setState({ liveIncidents: [] }));
}

// PHASE 06A.2 — employee discovery for the allocation drawer is no longer a
// client-side Firestore read of any kind (the PHASE 06A.1 two-query design
// was rejected on security review: raw same-org user documents — including
// a stale role:'employee' explicitly disabled via mobilityAccess, and any
// inactive employee — could still reach the browser before JavaScript
// filtered them, making client-side filtering the de facto authorization
// boundary). Instead this calls a narrow, trusted server action
// (POST /api/admin/users action:'listMobilityEmployees') that verifies the
// caller is an ACTIVE mobility_head server-side (api/_lib/authz.js
// getMobilityHeadCallerContext), derives organizationId ONLY from that
// verified server context (never from this request), and returns ONLY the
// minimal {uid, name} projection for same-org, active, canonically-resolved
// Mobility employees — see api/admin/users.js for the exact dual-read. The
// browser never receives a raw users/{uid} document, role, or
// mobilityAccess value for anyone but itself, so there is nothing left
// client-side to filter, correctly or otherwise. Rules
// (validMobilityAllocationTarget) remain the sole authority over whether an
// actual allocation to a returned uid succeeds.
async function fetchMobilityEmployees(component) {
  try {
    if (!activeAuth || !activeAuth.currentUser) {
      component.setState({ liveEmployees: [] });
      return;
    }
    const token = await activeAuth.currentUser.getIdToken();
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'listMobilityEmployees' })
    });
    if (!response.ok) {
      component.setState({ liveEmployees: [] });
      return;
    }
    const body = await response.json().catch(() => ({}));
    component.setState({ liveEmployees: Array.isArray(body.employees) ? body.employees : [] });
  } catch (_) {
    component.setState({ liveEmployees: [] });
  }
}

async function start(component) {
  const [appApi, firestoreApi, authApi] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')
  ]);
  const app = appApi.getApps().find(item => item.name === 'smart-hsr-mobility-session')
    || appApi.initializeApp(FIREBASE_CONFIG, 'smart-hsr-mobility-session');
  const db = firestoreApi.getFirestore(app);
  const auth = authApi.getAuth(app);
  // Test-only: connects to the local Firebase emulators instead of
  // production Firebase. Gated on localhost AND an explicit opt-in query
  // param, mirroring isLocalPreview() above — never reachable in
  // production, and inert for every existing/real usage of this file.
  if (['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('useEmulators') === '1') {
    authApi.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    firestoreApi.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  activeAuth = auth;
  activeAuthApi = authApi;
  activeDb = db;
  activeFirestoreApi = firestoreApi;
  await authApi.setPersistence(auth, authApi.browserLocalPersistence);

  stopAuth = authApi.onAuthStateChanged(auth, async user => {
    const context = await verifyMobilityAccess(firestoreApi, db, user).catch(() => null);
    if (!context) {
      await authApi.signOut(auth).catch(() => undefined);
      location.replace('login.html');
      return;
    }
    if (component !== activeComponent) return;
    activeContext = context;
    component.setState({
      role: context.designRole,
      screen: component.homeOf(context.designRole),
      orgName: context.organizationName,
      sessionName: user.displayName || user.email || 'الحساب الموثق',
      department: context.department || '',
      authPending: false,
      liveMissions: [], liveVehicles: [], liveEmployees: [], liveIncidents: []
    });

    stopMissions?.(); stopVehicles?.(); stopEmployees?.(); stopIncidents?.();
    stopMissions = subscribeMissions(firestoreApi, db, component, context);
    if (['manager', 'mobility', 'admin', 'employee'].includes(context.designRole)) {
      stopVehicles = subscribeVehicles(firestoreApi, db, component, context);
    }
    if (context.designRole === 'mobility') {
      // Not a live listener (see fetchMobilityEmployees) — nothing to
      // unsubscribe, so stopEmployees stays null; window.SmartHSRMobilityAdapter
      // .refreshMobilityEmployees() re-fetches on demand (e.g. when the
      // allocation drawer opens).
      stopEmployees = null;
      fetchMobilityEmployees(component);
    }
    stopIncidents = subscribeIncidents(firestoreApi, db, component, context);
  });
}

function disconnect(component) {
  if (component && component !== activeComponent) return;
  stopAuth?.(); stopMissions?.(); stopVehicles?.(); stopEmployees?.(); stopIncidents?.();
  stopAuth = stopMissions = stopVehicles = stopEmployees = stopIncidents = null;
  activeAuth = null;
  activeAuthApi = null;
  activeDb = null;
  activeFirestoreApi = null;
  activeContext = null;
  activeComponent = null;
}

function requireRole(...roles) {
  if (!activeContext || !roles.includes(activeContext.designRole)) {
    throw new Error('not_authorized');
  }
}

// PHASE 06 CLOSURE — DEFECT 1 fix: every mutation below writes its
// business-state change AND its required auditEvents/{eventId} record in
// ONE atomic commit — a Firestore writeBatch() for a single-document
// mutation, or the existing runTransaction() for the multi-document
// (mission+vehicle) ones further down. Firestore guarantees a batch/
// transaction commits all of its writes or none of them, so a forced audit
// failure (e.g. a malformed/spoofed audit document firestore.rules
// rejects) can never leave the business state changed with no audit trail,
// and the whole operation correctly reports failure rather than a false
// success. firestore.rules independently enforces that an actor may only
// ever record an event as themselves, in their own organization (see the
// auditEvents match block) — that guarantee holds exactly the same whether
// the write arrives via batch, transaction, or a lone setDoc.
function auditEventData(resourceType, resourceId, action, extra) {
  const ctx = activeContext;
  return Object.assign({
    organizationId: ctx.organizationId, actorId: ctx.uid, actorRole: rawRoleOf(ctx),
    resourceType, resourceId, action, timestamp: activeFirestoreApi.serverTimestamp()
  }, extra || {});
}

function rawRoleOf(ctx) {
  const reverse = { manager: 'manager', mobility: 'mobility_head', dept: 'department_head', admin: 'administrative_affairs', employee: 'employee' };
  return reverse[ctx.designRole] || ctx.designRole;
}

// PHASE 10 UAT FIX — this and createIncident() below are the only two
// places in this file where a resource's OWN audit event references that
// SAME resource being created in the SAME write. firestore.rules'
// auditReferencedResourceOk() requires exists(<resource path>) to already
// be true for the audit create to be allowed — but Security Rules resolve
// get()/exists() against the database's committed state, never a sibling
// document's still-in-flight data from the same batch/transaction, so a
// mission (or incident) can never "already exist" from that check's point
// of view while it is being created in the very same atomic write. Proven
// by direct reproduction: batching these two writes together reliably hit
// this rule graph's per-write expression-evaluation ceiling and the WHOLE
// batch was denied — so no department head could ever create a mission
// request at all, and no employee could ever report an incident. This is
// the same class of ceiling Phase 06B's vehicle-allocation cutover already
// hit and documented above; the difference here is the two writes are
// sequenced instead of moved server-side, which is sufficient once the
// audit event no longer needs to co-exist with its own referenced document
// inside one atomic unit. The one accepted tradeoff: if the second write
// (the audit event) fails after the first (the resource) already
// succeeded, the resource exists without its 'create' audit entry — the
// same "an audit-write failure must never block the mutation itself"
// tradeoff this product already accepts elsewhere (Owner Console's
// recordAuditEvent). Every other mutation in this file still uses ONE
// atomic batch/transaction, because every other one references a resource
// that already exists from a PRIOR write.
async function createMissionRequest({ type, destination, reason, scope, requestedEmployeeName, whenLabel, durationLabel }) {
  requireRole('dept');
  const api = activeFirestoreApi, db = activeDb, ctx = activeContext;
  const ref = api.doc(api.collection(db, 'missions'));
  await api.setDoc(ref, {
    organizationId: ctx.organizationId, department: ctx.department,
    createdByUid: ctx.uid, requesterName: ctx.sessionName || '',
    status: 'DRAFT',
    type: type || '', destination: destination || '', reason: reason || '',
    scope: scope || 'داخل النطاق', requestedEmployeeName: requestedEmployeeName || '',
    whenLabel: whenLabel || '', durationLabel: durationLabel || '',
    createdAt: api.serverTimestamp(), updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid
  });
  await api.setDoc(api.doc(api.collection(db, 'auditEvents')), auditEventData('mission', ref.id, 'create', { toStatus: 'DRAFT' }));
  return ref.id;
}

async function submitMissionForApproval(missionId) {
  requireRole('dept');
  const api = activeFirestoreApi, db = activeDb, ctx = activeContext;
  const batch = api.writeBatch(db);
  batch.update(api.doc(db, 'missions', missionId), {
    status: 'PENDING_APPROVAL', updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid
  });
  batch.set(api.doc(api.collection(db, 'auditEvents')),
    auditEventData('mission', missionId, 'submit_for_approval', { fromStatus: 'DRAFT', toStatus: 'PENDING_APPROVAL' }));
  await batch.commit();
}

async function decideMission(missionId, toStatus) {
  requireRole('admin');
  if (!['APPROVED', 'REJECTED', 'DRAFT'].includes(toStatus)) throw new Error('invalid_decision');
  const api = activeFirestoreApi, db = activeDb, ctx = activeContext;
  const batch = api.writeBatch(db);
  batch.update(api.doc(db, 'missions', missionId), {
    status: toStatus, updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid
  });
  batch.set(api.doc(api.collection(db, 'auditEvents')),
    auditEventData('mission', missionId, 'decide', { fromStatus: 'PENDING_APPROVAL', toStatus }));
  await batch.commit();
}

// Allocates a vehicle to an approved mission. Performed as one Firestore
// transaction so the mission update and the vehicle update commit together —
// this is what actually makes two racing allocation attempts against the
// same vehicle mutually exclusive (rules alone only guard one document at
// a time; see platform/policies/vehicle-workflow-policy.js).
// PHASE 06B — TRUSTED VEHICLE ALLOCATION CUTOVER. Vehicle allocation no
// longer writes missions/vehicles directly from the client at all (see
// firestore.rules — both the mission APPROVED->VEHICLE_ALLOCATED and the
// vehicle AVAILABLE->RESERVED client transitions are now denied outright).
// The prior Phase 06 closure proved that fully closing the direct-Firestore
// allocation bypass with mirrored getAfter() Rules checks exceeds this
// project's measured per-write expression-evaluation ceiling; moving the
// mutation itself to a trusted, authenticated server-side Admin SDK
// transaction (api/admin/users.js action:'allocateVehicle') sidesteps that
// ceiling entirely rather than trying to extend it further. This function
// now does nothing but ask that trusted endpoint to perform the allocation
// and waits for its authoritative result — no optimistic local state, no
// fallback to the old direct-Firestore transaction. The mission/vehicle
// documents the UI displays are still driven exclusively by the live
// Firestore subscriptions set up in start() (subscribeMissions/
// subscribeVehicles), so a real success is only ever reflected once the
// server's write is actually visible there.
async function allocateVehicle(missionId, vehicleId, assignedEmployeeUid) {
  requireRole('mobility');
  if (!activeAuth || !activeAuth.currentUser) throw new Error('not_authorized');
  const token = await activeAuth.currentUser.getIdToken();
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action: 'allocateVehicle', missionId, vehicleId, employeeUid: assignedEmployeeUid })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.reason || 'allocation_failed');
  }
}

async function handoverMission(missionId, vehicleId) {
  requireRole('mobility');
  const api = activeFirestoreApi, db = activeDb, ctx = activeContext;
  const missionRef = api.doc(db, 'missions', missionId);
  const vehicleRef = api.doc(db, 'vehicles', vehicleId);
  await api.runTransaction(db, async transaction => {
    const [missionSnap, vehicleSnap] = await Promise.all([transaction.get(missionRef), transaction.get(vehicleRef)]);
    if (!missionSnap.exists() || missionSnap.data().status !== 'VEHICLE_ALLOCATED') throw new Error('mission_not_allocated');
    if (!vehicleSnap.exists() || vehicleSnap.data().status !== 'RESERVED') throw new Error('vehicle_not_reserved');
    transaction.update(missionRef, { status: 'HANDED_OVER', updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid });
    transaction.update(vehicleRef, { status: 'IN_MISSION', updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid });
    transaction.set(api.doc(api.collection(db, 'auditEvents')),
      auditEventData('mission', missionId, 'handover', { fromStatus: 'VEHICLE_ALLOCATED', toStatus: 'HANDED_OVER', vehicleId }));
    transaction.set(api.doc(api.collection(db, 'auditEvents')),
      auditEventData('vehicle', vehicleId, 'handover', { fromStatus: 'RESERVED', toStatus: 'IN_MISSION', missionId }));
  });
}

async function confirmVehicleReturn(missionId, vehicleId) {
  requireRole('mobility');
  const api = activeFirestoreApi, db = activeDb, ctx = activeContext;
  const missionRef = api.doc(db, 'missions', missionId);
  const vehicleRef = api.doc(db, 'vehicles', vehicleId);
  await api.runTransaction(db, async transaction => {
    const [missionSnap, vehicleSnap] = await Promise.all([transaction.get(missionRef), transaction.get(vehicleRef)]);
    if (!missionSnap.exists() || missionSnap.data().status !== 'AWAITING_RETURN') throw new Error('mission_not_awaiting_return');
    if (!vehicleSnap.exists() || vehicleSnap.data().status !== 'RETURN_PENDING') throw new Error('vehicle_not_return_pending');
    transaction.update(missionRef, { status: 'CLOSED', updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid });
    transaction.update(vehicleRef, {
      status: 'AVAILABLE', assignedEmployeeUid: api.deleteField(), currentMissionId: api.deleteField(),
      updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid
    });
    transaction.set(api.doc(api.collection(db, 'auditEvents')),
      auditEventData('mission', missionId, 'confirm_return', { fromStatus: 'AWAITING_RETURN', toStatus: 'CLOSED', vehicleId }));
    transaction.set(api.doc(api.collection(db, 'auditEvents')),
      auditEventData('vehicle', vehicleId, 'confirm_return', { fromStatus: 'RETURN_PENDING', toStatus: 'AVAILABLE', missionId }));
  });
}

// Single-document mission transitions the assigned employee may request:
// receive (HANDED_OVER->READY), start (READY->IN_PROGRESS), report_incident
// (IN_PROGRESS->INCIDENT_HOLD), resume (INCIDENT_HOLD->IN_PROGRESS), finish
// (IN_PROGRESS->COMPLETED). No vehicle document is touched by any of these.
async function employeeAdvanceMission(missionId, toStatus) {
  requireRole('employee');
  const api = activeFirestoreApi, db = activeDb, ctx = activeContext;
  const batch = api.writeBatch(db);
  batch.update(api.doc(db, 'missions', missionId), {
    status: toStatus, updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid
  });
  batch.set(api.doc(api.collection(db, 'auditEvents')), auditEventData('mission', missionId, 'employee_advance', { toStatus }));
  await batch.commit();
}

// The employee's own act of handing the vehicle back — COMPLETED ->
// AWAITING_RETURN on the mission, IN_MISSION -> RETURN_PENDING on the
// vehicle. mobility_head then confirms the physical return separately
// (confirmVehicleReturn), which is the transition that actually frees the
// vehicle back to AVAILABLE.
async function employeeReturnVehicle(missionId, vehicleId) {
  requireRole('employee');
  const api = activeFirestoreApi, db = activeDb, ctx = activeContext;
  const missionRef = api.doc(db, 'missions', missionId);
  const vehicleRef = api.doc(db, 'vehicles', vehicleId);
  await api.runTransaction(db, async transaction => {
    const [missionSnap, vehicleSnap] = await Promise.all([transaction.get(missionRef), transaction.get(vehicleRef)]);
    if (!missionSnap.exists() || missionSnap.data().status !== 'COMPLETED' || missionSnap.data().assignedEmployeeUid !== ctx.uid) {
      throw new Error('mission_not_completed_or_not_assigned');
    }
    if (!vehicleSnap.exists() || vehicleSnap.data().status !== 'IN_MISSION') throw new Error('vehicle_not_in_mission');
    transaction.update(missionRef, { status: 'AWAITING_RETURN', updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid });
    transaction.update(vehicleRef, { status: 'RETURN_PENDING', updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid });
    transaction.set(api.doc(api.collection(db, 'auditEvents')),
      auditEventData('mission', missionId, 'employee_return_vehicle', { fromStatus: 'COMPLETED', toStatus: 'AWAITING_RETURN', vehicleId }));
    transaction.set(api.doc(api.collection(db, 'auditEvents')),
      auditEventData('vehicle', vehicleId, 'employee_return_vehicle', { fromStatus: 'IN_MISSION', toStatus: 'RETURN_PENDING', missionId }));
  });
}

// PHASE 10 UAT FIX — see the identical, fully explained fix on
// createMissionRequest() above: this is the same self-referencing
// create-plus-its-own-audit-event pattern, hitting the same rule-evaluation
// ceiling, closed the same way (sequential writes instead of one batch).
async function createIncident({ missionId, vehicleId, category, severity, note }) {
  requireRole('employee');
  const api = activeFirestoreApi, db = activeDb, ctx = activeContext;
  const ref = api.doc(api.collection(db, 'incidents'));
  await api.setDoc(ref, {
    organizationId: ctx.organizationId, missionId, vehicleId: vehicleId || '',
    createdByUid: ctx.uid, employeeName: ctx.sessionName || '', department: ctx.department || '',
    category: category || 'أخرى', severity: severity || 'MEDIUM', note: note || '',
    status: 'NEW', createdAt: api.serverTimestamp(), updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid
  });
  await api.setDoc(api.doc(api.collection(db, 'auditEvents')), auditEventData('incident', ref.id, 'create', { toStatus: 'NEW', missionId }));
  return ref.id;
}

async function mobilityProcessIncident(incidentId, toStatus) {
  requireRole('mobility');
  if (!['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'].includes(toStatus)) throw new Error('invalid_decision');
  const api = activeFirestoreApi, db = activeDb, ctx = activeContext;
  const batch = api.writeBatch(db);
  batch.update(api.doc(db, 'incidents', incidentId), {
    status: toStatus, updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid
  });
  batch.set(api.doc(api.collection(db, 'auditEvents')), auditEventData('incident', incidentId, 'process', { toStatus }));
  await batch.commit();
}

window.SmartHSRMobilityAdapter = {
  connect(component) {
    if (activeComponent === component) return;
    disconnect();
    activeComponent = component;
    if (isLocalPreview()) {
      component.setState({
        role: 'manager',
        screen: component.homeOf('manager'),
        orgName: 'معاينة محلية — لا بيانات تشغيلية',
        sessionName: 'معاينة محلية',
        authPending: false,
        liveMissions: [], liveVehicles: [], liveEmployees: [], liveIncidents: []
      });
      return;
    }
    start(component).catch(() => {
      component.setState({ authPending: false, role: null });
    });
  },
  disconnect,
  logout() {
    activeAuthApi?.signOut(activeAuth).catch(() => undefined).finally(() => {
      location.replace('login.html');
    });
  },
  createMissionRequest,
  submitMissionForApproval,
  decideMission,
  allocateVehicle,
  handoverMission,
  confirmVehicleReturn,
  employeeAdvanceMission,
  employeeReturnVehicle,
  createIncident,
  mobilityProcessIncident,
  // Re-fetches the trusted server-side employee list on demand (e.g. when
  // the allocation drawer opens) without waiting for the next sign-in.
  // No-op for any non-mobility_head session (activeComponent's liveEmployees
  // is simply never read there).
  refreshMobilityEmployees() {
    if (!activeComponent) return Promise.resolve();
    return fetchMobilityEmployees(activeComponent);
  }
};

window.dispatchEvent(new Event('smart-hsr-mobility-adapter-ready'));
