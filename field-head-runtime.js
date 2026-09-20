'use strict';
(() => {
  let component = null;
  let auth = null;
  let currentUser = null;
  let state = { organizationId:null, department:null };

  const api = async (action, payload = {}) => {
    if (!currentUser) throw new Error('not_authenticated');
    const token = await currentUser.getIdToken();
    const res = await fetch('/api/admin/users', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({action, ...payload})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.reason || data.error || action + '_failed');
      err.code = data.reason || data.error || action + '_failed';
      throw err;
    }
    return data;
  };

  const employeeApi = async () => {
    const token = await currentUser.getIdToken();
    const res = await fetch('/api/admin/employees', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({action:'list',organizationId:state.organizationId})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.reason || data.error || 'employee_list_failed');
    return Array.isArray(data.employees) ? data.employees : [];
  };

  const refresh = async () => {
    if (!component || !currentUser) return;
    const [employees, visual, missions] = await Promise.all([
      employeeApi().catch(() => []),
      api('getFieldVisualDistortionCommand').catch(() => ({observations:[],contractors:[]})),
      api('listDepartmentMissions').catch(() => ({missions:[]}))
    ]);
    component.setState({
      liveEmployees: employees,
      liveObservations: Array.isArray(visual.observations) ? visual.observations : [],
      liveContractors: Array.isArray(visual.contractors) ? visual.contractors : [],
      liveMissions: Array.isArray(missions.missions) ? missions.missions : []
    });
  };

  async function initAuth() {
    const [{initializeApp,getApps},{getAuth,onAuthStateChanged,signOut},{getFirestore,doc,getDoc},{resolveFirebaseConfig}] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'),
      import('./firebase-runtime-config.js')
    ]);
    const cfg = await resolveFirebaseConfig();
    const app = getApps().find(a => a.name === '[DEFAULT]') || initializeApp(cfg);
    auth = getAuth(app);
    const db = getFirestore(app);
    onAuthStateChanged(auth, async user => {
      if (!user) { location.replace('login.html'); return; }
      const snap = await getDoc(doc(db,'users',user.uid));
      if (!snap.exists()) { await signOut(auth).catch(()=>{}); location.replace('login.html'); return; }
      const data = snap.data() || {};
      const role = data?.mobilityAccess?.enabled === true ? data.mobilityAccess.role : data.role;
      const dept = String(data.department || '');
      if (data.active === false || role !== 'department_head' || !/الحصر|ميداني|field/i.test(dept) || !data.organizationId) {
        await signOut(auth).catch(()=>{});
        location.replace('login.html');
        return;
      }
      currentUser = user;
      state.organizationId = data.organizationId;
      state.department = dept;
      if (component) {
        component.setState({
          authPending:false,
          role:'dept',
          screen:'deptops',
          orgName:data.organizationName || 'المؤسسة المسجلة',
          sessionName:data.name || user.email || 'رئيس قسم الحصر الميداني',
          department:dept,
          orgId:data.organizationId
        });
        await refresh();
      }
    });
  }

  window.SmartHSRMobilityAdapter = {
    connect(instance) {
      component = instance;
      instance.setState({authPending:true, role:'dept'});
      initAuth().catch(() => location.replace('login.html'));
    },
    disconnect(instance) {
      if (!instance || instance === component) component = null;
    },
    logout: async () => {
      if (auth) {
        const {signOut} = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');
        await signOut(auth).catch(()=>{});
      }
      location.replace('login.html');
    },
    refresh,
    createMissionRequest: payload => api('createMissionRequest', payload).then(x => x.missionId),
    submitMissionForApproval: missionId => api('submitMissionForApproval',{missionId}),
    assignFieldObservation: (observationId,contractorUid) => api('assignFieldObservation',{observationId,contractorUid}).then(refresh),
    closeFieldObservation: observationId => api('closeFieldObservation',{
      observationId,
      closureNote:'تم الإغلاق بعد تحقق المراقب واعتماد رئيس قسم الحصر الميداني.'
    }).then(refresh),
    upsertFieldContractorProfile: payload => api('upsertFieldContractorProfile',payload).then(refresh),
    resolveObservationEvidence: async reference => {
      if (!reference || !currentUser) return null;
      try {
        const { resolveObservationImage } = await import('./storage-adapter.js');
        const result = await resolveObservationImage({
          reference,
          context:{
            organizationId:state.organizationId,
            uid:currentUser.uid,
            role:'department_head',
            authUser:currentUser
          }
        });
        return result && result.available && result.url ? result.url : null;
      } catch (_) {
        return null;
      }
    }
  };
  window.dispatchEvent(new Event('smart-hsr-mobility-adapter-ready'));
})();