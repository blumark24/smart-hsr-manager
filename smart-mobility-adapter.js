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

let activeComponent = null;
let stopAuth = null;
let activeAuth = null;
let activeAuthApi = null;

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
        designRole: 'manager', organizationId,
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
    designRole, organizationId,
    organizationName: data.organizationName?.trim() || organizationId
  };
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
  await authApi.setPersistence(auth, authApi.browserLocalPersistence);

  stopAuth = authApi.onAuthStateChanged(auth, async user => {
    const context = await verifyMobilityAccess(firestoreApi, db, user).catch(() => null);
    if (!context) {
      await authApi.signOut(auth).catch(() => undefined);
      location.replace('login.html');
      return;
    }
    if (component !== activeComponent) return;
    component.setState({
      role: context.designRole,
      screen: component.homeOf(context.designRole),
      orgName: context.organizationName,
      sessionName: user.displayName || user.email || 'الحساب الموثق',
      authPending: false
    });
  });
}

function disconnect(component) {
  if (component && component !== activeComponent) return;
  stopAuth?.();
  stopAuth = null;
  activeAuth = null;
  activeAuthApi = null;
  activeComponent = null;
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
        authPending: false
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
  }
};

window.dispatchEvent(new Event('smart-hsr-mobility-adapter-ready'));
