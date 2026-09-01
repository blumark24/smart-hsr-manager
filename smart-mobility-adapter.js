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

let activeComponent = null;
let stopAuth = null;
let stopMissions = null;
let stopVehicles = null;
let stopEmployees = null;
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
  const designRole = MOBILITY_ROLE_TO_DESIGN_ID[data.role];
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
    route: 0,
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
    last: data.updatedAtLabel || '—', maintLast: '—', maintNext: '—', route: 0, phase: 0, note: '—',
    organizationId: data.organizationId, assignedEmployeeUid: data.assignedEmployeeUid || '',
    currentMissionId: data.currentMissionId || '', rawStatus: data.status
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

function subscribeEmployees(firestoreApi, db, component, context) {
  const q = firestoreApi.query(
    firestoreApi.collection(db, 'users'),
    firestoreApi.where('organizationId', '==', context.organizationId),
    firestoreApi.where('role', '==', 'employee')
  );
  return firestoreApi.onSnapshot(q, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache) return;
    const employees = snapshot.docs.map(d => ({ uid: d.id, name: (d.data() || {}).name || (d.data() || {}).email || d.id }));
    component.setState({ liveEmployees: employees });
  }, () => component.setState({ liveEmployees: [] }));
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
      liveMissions: [], liveVehicles: [], liveEmployees: []
    });

    stopMissions?.(); stopVehicles?.(); stopEmployees?.();
    stopMissions = subscribeMissions(firestoreApi, db, component, context);
    if (['manager', 'mobility', 'admin', 'employee'].includes(context.designRole)) {
      stopVehicles = subscribeVehicles(firestoreApi, db, component, context);
    }
    if (context.designRole === 'mobility') {
      stopEmployees = subscribeEmployees(firestoreApi, db, component, context);
    }
  });
}

function disconnect(component) {
  if (component && component !== activeComponent) return;
  stopAuth?.(); stopMissions?.(); stopVehicles?.(); stopEmployees?.();
  stopAuth = stopMissions = stopVehicles = stopEmployees = null;
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
  return ref.id;
}

async function submitMissionForApproval(missionId) {
  requireRole('dept');
  const api = activeFirestoreApi, db = activeDb, ctx = activeContext;
  await api.updateDoc(api.doc(db, 'missions', missionId), {
    status: 'PENDING_APPROVAL', updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid
  });
}

async function decideMission(missionId, toStatus) {
  requireRole('admin');
  if (!['APPROVED', 'REJECTED', 'DRAFT'].includes(toStatus)) throw new Error('invalid_decision');
  const api = activeFirestoreApi, db = activeDb, ctx = activeContext;
  await api.updateDoc(api.doc(db, 'missions', missionId), {
    status: toStatus, updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid
  });
}

// Allocates a vehicle to an approved mission. Performed as one Firestore
// transaction so the mission update and the vehicle update commit together —
// this is what actually makes two racing allocation attempts against the
// same vehicle mutually exclusive (rules alone only guard one document at
// a time; see platform/policies/vehicle-workflow-policy.js).
async function allocateVehicle(missionId, vehicleId, assignedEmployeeUid, assignedEmployeeName) {
  requireRole('mobility');
  const api = activeFirestoreApi, db = activeDb, ctx = activeContext;
  const missionRef = api.doc(db, 'missions', missionId);
  const vehicleRef = api.doc(db, 'vehicles', vehicleId);
  await api.runTransaction(db, async transaction => {
    const [missionSnap, vehicleSnap] = await Promise.all([transaction.get(missionRef), transaction.get(vehicleRef)]);
    if (!missionSnap.exists() || missionSnap.data().status !== 'APPROVED') throw new Error('mission_not_approved');
    if (!vehicleSnap.exists() || vehicleSnap.data().status !== 'AVAILABLE') throw new Error('vehicle_not_available');
    transaction.update(missionRef, {
      status: 'VEHICLE_ALLOCATED', vehicleId, assignedEmployeeUid,
      assignedEmployeeName: assignedEmployeeName || '',
      updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid
    });
    transaction.update(vehicleRef, {
      status: 'RESERVED', assignedEmployeeUid, currentMissionId: missionId,
      updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid
    });
  });
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
  });
}

// Single-document mission transitions the assigned employee may request:
// receive (HANDED_OVER->READY), start (READY->IN_PROGRESS), report_incident
// (IN_PROGRESS->INCIDENT_HOLD), resume (INCIDENT_HOLD->IN_PROGRESS), finish
// (IN_PROGRESS->COMPLETED). No vehicle document is touched by any of these.
async function employeeAdvanceMission(missionId, toStatus) {
  requireRole('employee');
  const api = activeFirestoreApi, db = activeDb, ctx = activeContext;
  await api.updateDoc(api.doc(db, 'missions', missionId), {
    status: toStatus, updatedAt: api.serverTimestamp(), updatedByUid: ctx.uid
  });
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
  });
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
        liveMissions: [], liveVehicles: [], liveEmployees: []
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
  employeeReturnVehicle
};

window.dispatchEvent(new Event('smart-hsr-mobility-adapter-ready'));
