const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCXCiNeaO9lhM79tKb98x4oaNqNy5xKvWM',
  authDomain: 'smart-hsr-manager.firebaseapp.com',
  projectId: 'smart-hsr-manager',
  storageBucket: 'smart-hsr-manager.firebasestorage.app',
  messagingSenderId: '38965508031',
  appId: '1:38965508031:web:6fd0b6c6b0b63fa513930a'
};

const STATUS = Object.freeze({
  PENDING: { label: 'قيد الانتظار', color: '#ef4444' },
  IN_PROGRESS: { label: 'قيد المعالجة', color: '#f5a524' },
  COMPLETED: { label: 'تمت المعالجة', color: '#22c55e' }
});

const format = window.SmartHSRFormat || {
  integer: value => String(Number(value) || 0),
  decimal: value => Number(value || 0).toFixed(1),
  percent: value => `${Math.round(Number(value) || 0)}%`,
  dateTime: () => 'غير متاح'
};

let activeComponent = null;
let stopAuth = null;
let stopObservations = null;
let stopUsers = null;
let activeAuth = null;
let activeAuthApi = null;

const isLocalPreview = () => ['localhost', '127.0.0.1'].includes(location.hostname)
  && new URLSearchParams(location.search).get('preview') === '1';

const asMillis = value => value?.toMillis ? value.toMillis() : 0;
const number = value => format.integer(value);
const statusFor = value => STATUS[value] || STATUS.PENDING;

function readCoordinates(data) {
  let lat = typeof data.lat === 'number' ? data.lat : null;
  let lng = typeof data.lng === 'number' ? data.lng : null;
  if ((lat === null || lng === null) && typeof data.location === 'string') {
    const parts = data.location.split(',').map(value => Number.parseFloat(value.trim()));
    if (parts.length === 2 && parts.every(Number.isFinite)) [lat, lng] = parts;
  }
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function normalizeObservations(snapshot) {
  return snapshot.docs.map(entry => {
    const data = entry.data() || {};
    return {
      id: entry.id,
      displayId: data.displayId || data.id || entry.id,
      title: data.title || 'بلاغ دون عنوان',
      status: data.status || 'PENDING',
      inspector: data.inspector || 'غير متاح',
      contractor: data.contractor || 'غير مسند',
      type: data.type || data.category || 'غير مصنف',
      description: data.description || '',
      createdAt: asMillis(data.createdAt),
      updatedAt: asMillis(data.updatedAt),
      coordinates: readCoordinates(data)
    };
  }).sort((a, b) => b.createdAt - a.createdAt);
}

function toTwinObjects(observations) {
  const located = observations.filter(item => item.coordinates);
  if (!located.length) return [];
  const lats = located.map(item => item.coordinates.lat);
  const lngs = located.map(item => item.coordinates.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latRange = Math.max(maxLat - minLat, 0.0001);
  const lngRange = Math.max(maxLng - minLng, 0.0001);

  return located.map((item, index) => {
    const status = statusFor(item.status);
    const x = ((item.coordinates.lng - minLng) / lngRange - 0.5) * 1.15;
    const y = (0.5 - (item.coordinates.lat - minLat) / latRange) * 1.05;
    return {
      id: item.id,
      layer: 'report',
      x: Number.isFinite(x) ? x : (index % 2 ? 0.22 : -0.22),
      y: Number.isFinite(y) ? y : (index % 2 ? -0.18 : 0.18),
      col: status.color,
      title: item.title,
      kind: 'بلاغ موثّق الموقع',
      rows: [
        ['الحالة', status.label],
        ['المعرّف', item.displayId],
        ['المراقب', item.inspector],
        ['المقاول', item.contractor],
        ['الإحداثيات', `${item.coordinates.lat.toFixed(5)}, ${item.coordinates.lng.toFixed(5)}`]
      ],
      action: 'فتح البلاغ',
      route: 'report'
    };
  });
}

function buildViewData(observations, users) {
  const pending = observations.filter(item => item.status === 'PENDING');
  const inProgress = observations.filter(item => item.status === 'IN_PROGRESS');
  const completed = observations.filter(item => item.status === 'COMPLETED');
  const open = observations.filter(item => item.status !== 'COMPLETED' && item.createdAt > 0);
  const averageAge = open.length
    ? open.reduce((sum, item) => sum + (Date.now() - item.createdAt) / 86400000, 0) / open.length
    : 0;
  const activeUsers = users.filter(item => item.active !== false && ['inspector', 'contractor', 'supervisor'].includes(item.role));
  const total = observations.length;
  const statusRows = [
    ['قيد الانتظار', pending.length, '#ef4444'],
    ['قيد المعالجة', inProgress.length, '#f5a524'],
    ['تمت المعالجة', completed.length, '#22c55e']
  ];
  const maxStatus = Math.max(total, 1);
  const maxRole = Math.max(activeUsers.length, 1);
  const completionPercent = Math.round(total ? completed.length / total * 100 : 0);

  return {
    metrics: {
      totalReports: number(total),
      pending: number(pending.length),
      inProgress: number(inProgress.length),
      completed: number(completed.length),
      completionRate: format.percent(completionPercent),
      completionArcSmall: `${(232.5 * completionPercent / 100).toFixed(1)} 232.5`,
      completionArcLarge: `${(264 * completionPercent / 100).toFixed(1)} 264`,
      avgOpenDays: format.decimal(averageAge),
      activeTeams: number(activeUsers.length)
    },
    observations,
    users: users.map(item => ({
      id: item.id,
      name: item.name || item.displayName || item.email || item.id,
      role: item.role || 'غير محدد',
      active: item.active !== false,
      email: item.email || 'غير متاح'
    })),
    objects: toTwinObjects(observations),
    layers: [
      { id: 'survey', name: 'الحصر الميداني', col: '#22c55e', n: 'رابط' },
      { id: 'land', name: 'الأراضي', col: '#a78bfa', n: 'بانتظار الربط' },
      { id: 'report', name: 'البلاغات', col: '#ef4444', n: number(total) },
      { id: 'task', name: 'المهام', col: '#38bdf8', n: '—' }
    ],
    notifications: observations.slice(0, 4).map(item => ({
      title: item.title,
      meta: `${statusFor(item.status).label} · ${item.displayId}`,
      col: statusFor(item.status).color
    })),
    zones: [{ id: 'reports', name: 'بلاغات موثّقة الموقع', count: number(toTwinObjects(observations).length), col: '#ef4444', x: 0.03, y: -0.05 }],
    priorities: [...pending, ...inProgress].slice(0, 4).map(item => ({
      id: item.id,
      n: item.displayId,
      title: item.title,
      meta: statusFor(item.status).label,
      col: statusFor(item.status).color
    })),
    categories: statusRows.map(([name, count, color]) => ({
      name,
      n: number(count),
      p: `(${Math.round(count / maxStatus * 100)}%)`,
      col: color
    })),
    departments: ['inspector', 'contractor', 'supervisor'].map(role => {
      const count = activeUsers.filter(item => item.role === role).length;
      const labels = { inspector: 'المراقبون', contractor: 'المقاولون', supervisor: 'المشرفون' };
      return { name: labels[role], v: number(count), w: `${Math.max(8, count / maxRole * 100)}%` };
    })
  };
}

function publish(component, payload) {
  if (!component || component !== activeComponent) return;
  component.liveMetrics = payload.metrics;
  component.liveObjects = payload.objects;
  component.liveLayers = payload.layers;
  component.liveNotifications = payload.notifications;
  component.liveZones = payload.zones;
  component.livePriorities = payload.priorities;
  component.liveCategories = payload.categories;
  component.liveDepartments = payload.departments;
  component.liveObservations = payload.observations;
  component.liveUsers = payload.users;
  component.liveDataState = 'ready';
  component.liveDataError = '';
  component.setState(state => ({ liveRevision: (state.liveRevision || 0) + 1 }));
}

async function verifyManagerAccess(api, db, user) {
  if (!user) return null;
  const manager = await api.getDoc(api.doc(db, 'managers', user.uid));
  if (manager.exists()) {
    const data = manager.data() || {};
    const organizationId = typeof data.organizationId === 'string' ? data.organizationId.trim() : '';
    if (data.role === 'manager' && data.active !== false && organizationId) {
      return { role: 'manager', organizationId, organizationName: data.organizationName?.trim() || organizationId };
    }
  }
  const supervisor = await api.getDoc(api.doc(db, 'users', user.uid));
  if (!supervisor.exists()) return null;
  const data = supervisor.data() || {};
  const organizationId = typeof data.organizationId === 'string' ? data.organizationId.trim() : '';
  if (data.role !== 'supervisor' || data.active === false || !organizationId) return null;
  return { role: 'supervisor', organizationId, organizationName: data.organizationName?.trim() || organizationId };
}

async function start(component) {
  const [appApi, firestoreApi, authApi] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')
  ]);
  const app = appApi.getApps().find(item => item.name === 'smart-hsr-manager-session')
    || appApi.initializeApp(FIREBASE_CONFIG, 'smart-hsr-manager-session');
  const db = firestoreApi.getFirestore(app);
  const auth = authApi.getAuth(app);
  activeAuth = auth;
  activeAuthApi = authApi;
  await authApi.setPersistence(auth, authApi.browserLocalPersistence);

  stopAuth = authApi.onAuthStateChanged(auth, async user => {
    const context = await verifyManagerAccess(firestoreApi, db, user).catch(() => null);
    if (!context) {
      await authApi.signOut(auth).catch(() => undefined);
      location.replace('manager-login.html');
      return;
    }
    if (component !== activeComponent) return;
    component.setState({
      orgName: context.organizationName,
      sessionName: user.displayName || user.email || 'الحساب الموثق',
      sessionRole: context.role === 'manager' ? 'مدير البلدية' : 'مشرف البلدية',
      dataState: 'loading',
      dataError: ''
    });
    const filter = firestoreApi.query(firestoreApi.collection(db, 'observations'), firestoreApi.where('organizationId', '==', context.organizationId));
    const userFilter = firestoreApi.query(firestoreApi.collection(db, 'users'), firestoreApi.where('organizationId', '==', context.organizationId));
    let observations = [];
    let users = [];
    const update = () => publish(component, buildViewData(observations, users));
    stopObservations = firestoreApi.onSnapshot(filter, { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) return;
      observations = normalizeObservations(snapshot);
      update();
    }, () => {
      component.liveDataState = 'error';
      component.liveDataError = 'تعذر تحميل البلاغات الموثّقة.';
      component.setState({ dataState: 'error', dataError: component.liveDataError });
      component.flash(component.liveDataError);
    });
    stopUsers = firestoreApi.onSnapshot(userFilter, { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) return;
      users = snapshot.docs.map(entry => ({ id: entry.id, ...(entry.data() || {}) }));
      update();
    }, () => {
      component.liveDataState = 'error';
      component.liveDataError = 'تعذر تحميل الفرق التشغيلية.';
      component.setState({ dataState: 'error', dataError: component.liveDataError });
      component.flash(component.liveDataError);
    });
  });
}

function disconnect(component) {
  if (component && component !== activeComponent) return;
  stopAuth?.();
  stopObservations?.();
  stopUsers?.();
  stopAuth = stopObservations = stopUsers = null;
  activeAuth = null;
  activeAuthApi = null;
  activeComponent = null;
}

window.SmartHSRManagerAdapter = {
  connect(component) {
    if (activeComponent === component) return;
    disconnect();
    activeComponent = component;
    if (isLocalPreview()) {
      component.setState({
        orgName: 'معاينة محلية — لا بيانات تشغيلية',
        sessionName: 'معاينة محلية',
        sessionRole: 'بيانات تشغيلية غير متصلة',
        dataState: 'ready',
        dataError: ''
      });
      publish(component, buildViewData([], []));
      return;
    }
    start(component).catch(() => {
      component.liveDataState = 'error';
      component.liveDataError = 'تعذر بدء جلسة لوحة المدير بأمان.';
      component.setState({ dataState: 'error', dataError: component.liveDataError });
      component.flash('تعذر بدء جلسة لوحة المدير بأمان.');
      setTimeout(() => location.replace('manager-login.html'), 800);
    });
  },
  disconnect,
  async logout() {
    await activeAuthApi?.signOut(activeAuth);
    location.replace('manager-login.html');
  }
};

window.dispatchEvent(new Event('smart-hsr-manager-adapter-ready'));
