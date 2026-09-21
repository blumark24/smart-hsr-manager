(() => {
  'use strict';

  const ALLOWED_ROLES = Object.freeze(['mobility_head','department_head','administrative_affairs','employee']);
  const UI_ROLE = Object.freeze({
    mobility_head: 'mobility',
    department_head: 'dept',
    administrative_affairs: 'admin',
    employee: 'employee',
  });
  const MISSION_STATUS = Object.freeze({
    DRAFT:'مسودة',
    PENDING_APPROVAL:'بانتظار الاعتماد',
    APPROVED:'بانتظار المركبة',
    REJECTED:'ملغاة',
    VEHICLE_ALLOCATED:'تم تخصيص المركبة',
    HANDED_OVER:'تم التسليم',
    READY:'جاهزة للبدء',
    IN_PROGRESS:'قيد التنفيذ',
    INCIDENT_HOLD:'متوقفة بسبب حادث',
    COMPLETED:'مكتملة',
    AWAITING_RETURN:'في انتظار إعادة المركبة',
    CLOSED:'مغلقة',
  });
  const VEHICLE_STATUS = Object.freeze({
    AVAILABLE:'متاحة',
    RESERVED:'محجوزة',
    IN_MISSION:'في مهمة',
    RETURN_PENDING:'عائدة',
    MAINTENANCE:'صيانة',
    OUT_OF_SERVICE:'خارج الخدمة',
  });
  const INCIDENT_STATUS = Object.freeze({
    NEW:'جديد',
    ACKNOWLEDGED:'تم الاستلام',
    IN_PROGRESS:'تحت المعالجة',
    RESOLVED:'تم الحل',
  });
  const SEVERITY = Object.freeze({ LOW:'منخفضة', MEDIUM:'متوسطة', CRITICAL:'حرجة' });

  let component = null;
  let auth = null;
  let currentUser = null;
  let workspace = { role:null, organizationId:null, department:null, missions:[], vehicles:[], incidents:[], authorizations:[], employees:[] };

  function resolveMobilityRole(data) {
    if (data && Object.prototype.hasOwnProperty.call(data, 'mobilityAccess')) {
      const access = data.mobilityAccess;
      if (!access || typeof access !== 'object' || access.enabled !== true || !ALLOWED_ROLES.includes(access.role)) return null;
      return access.role;
    }
    return data && ALLOWED_ROLES.includes(data.role) ? data.role : null;
  }

  function requestId(prefix) {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const h = [...bytes].map(x => x.toString(16).padStart(2,'0')).join('');
      return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
    }
    return `${prefix || 'mob'}-${Date.now()}-request`;
  }

  async function api(action, payload={}) {
    if (!currentUser) throw new Error('unauthenticated');
    const token = await currentUser.getIdToken();
    const res = await fetch('/api/admin/users', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({action, ...payload}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.reason || data.error || action + '_failed');
      err.code = data.reason || data.error || action + '_failed';
      throw err;
    }
    return data;
  }

  function missionView(m) {
    return {
      id:m.missionId,
      no:m.missionId,
      type:m.type || 'مهمة بلدية',
      dept:m.department || '—',
      requester:'رئيس القسم',
      emp:m.assignedEmployeeName || m.requestedEmployeeName || 'بانتظار التحديد',
      dest:m.destination || '—',
      when:m.whenLabel || '—',
      dur:m.durationLabel || '—',
      scope:m.scope || 'داخل النطاق',
      veh:m.vehicleId || null,
      why:m.reason || '—',
      status:MISSION_STATUS[m.status] || m.status || '—',
      rawStatus:m.status || null,
      authorizationStatus:m.vehicleAuthorizationStatus || null,
      gps:false,
    };
  }

  function vehicleView(v) {
    return {
      id:v.vehicleId,
      no:v.internalNumber || String(v.vehicleId || '').slice(-6).toUpperCase(),
      plate:v.plate || '—',
      type:v.type || 'مركبة',
      make:v.make || '',
      model:v.model || '',
      year:v.year || '—',
      dept:v.department || 'أسطول البلدية',
      status:VEHICLE_STATUS[v.status] || v.status || '—',
      odo:Number.isFinite(v.odometer) ? v.odometer : 0,
      fuel:Number.isFinite(v.fuelLevel) ? v.fuelLevel : 0,
      last:'—',
      maintLast:v.lastMaintenance || '—',
      maintNext:v.nextMaintenance || '—',
      note:v.note || '',
    };
  }

  function incidentView(i) {
    return {
      id:i.incidentId,
      cat:i.category || 'حالة تشغيلية',
      sev:SEVERITY[i.severity] || i.severity || '—',
      emp:i.employeeName || '—',
      mis:i.missionId || '—',
      veh:i.vehicleId || '—',
      dept:i.department || '—',
      loc:i.location || 'غير متاح',
      time:i.createdAt || '—',
      ev:'—',
      note:i.note || '',
      status:INCIDENT_STATUS[i.status] || i.status || '—',
    };
  }

  function publish() {
    if (!component) return;
    component.setState({
      runtimeMode:'mobility',
      liveMissions:(workspace.missions || []).map(missionView),
      liveVehicles:(workspace.vehicles || []).map(vehicleView),
      liveIncidents:(workspace.incidents || []).map(incidentView),
      liveEmployees:(workspace.employees || []).map(e => ({
        employeeId:e.employeeId,
        uid:e.uid,
        name:e.name,
        department:e.department,
        vehicleEligible:e.vehicleEligible === true,
      })),
    });
  }

  async function refresh() {
    workspace = await api('getMobilityWorkspace');
    publish();
    return workspace;
  }

  function patchBoard(instance) {
    if (!instance || instance.__mobilityRuntimePatched) return;
    instance.__mobilityRuntimePatched = true;

    const originalScreenDef = instance.screenDef?.bind(instance);
    if (originalScreenDef) {
      instance.screenDef = () => {
        const out = originalScreenDef();
        if (instance.state.role === 'mobility' && instance.state.screen === 'ops') {
          out.title = 'مركز عمليات الحركة الذكية';
          out.sub = 'إدارة الأسطول والمهام والحوادث على مستوى البلدية';
        }
        if (instance.state.role === 'dept' && instance.state.runtimeMode === 'mobility') {
          if (instance.state.screen === 'deptops') {
            return {
              ops:true,bottom:false,
              title:'الحركة الذكية — ' + (instance.state.department || 'القسم'),
              sub:'طلبات المركبات ومهام موظفي القسم',
              actions:[{label:'+ طلب مهمة',on:()=>instance.openDrawer('create',null),tx:'var(--btnTx,#fff)',bg:'var(--btn)',bd:'var(--btnBd)'}],
              kpis:[
                {label:'إجمالي المهام',value:String(instance.missions().length),delta:'',col:'#38bdf8',on:()=>instance.setState({screen:'missions'})},
                {label:'بانتظار الاعتماد',value:String(instance.missions().filter(m=>instance.missionStatus(m.id)==='بانتظار الاعتماد').length),delta:'',col:'#f5a524',on:()=>instance.setState({screen:'missions'})},
                {label:'قيد التنفيذ',value:String(instance.missions().filter(m=>instance.missionStatus(m.id)==='قيد التنفيذ').length),delta:'',col:'#22c55e',on:()=>instance.setState({screen:'missions'})},
                {label:'مغلقة',value:String(instance.missions().filter(m=>instance.missionStatus(m.id)==='مغلقة').length),delta:'',col:'#7d8ea6',on:()=>instance.setState({screen:'missions'})},
              ],
              sideATitle:'المهام الجارية',
              sideACount:String(instance.missions().filter(m=>!['مغلقة','ملغاة'].includes(instance.missionStatus(m.id))).length),
              sideA:[],
              sideBTitle:'الموظفون المؤهلون للمركبة',
              sideBCount:String((instance.state.liveEmployees||[]).filter(e=>e.vehicleEligible).length),
              sideB:[],
            };
          }
        }
        return out;
      };
    }

    const originalNavFor = instance.navFor?.bind(instance);
    if (originalNavFor) {
      instance.navFor = role => {
        if (role === 'dept' && instance.state.runtimeMode === 'mobility') {
          return [
            {id:'deptops',label:'الحركة الذكية'},
            {id:'missions',label:'طلبات ومهام القسم'},
          ];
        }
        return originalNavFor(role);
      };
    }
  }

  async function initAuth() {
    const [{initializeApp,getApps},{getAuth,onAuthStateChanged,signOut},{getFirestore,doc,getDoc},{resolveFirebaseConfig}] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'),
      import('./firebase-runtime-config.js'),
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
      const role = resolveMobilityRole(data);
      const department = String(data.department || '').trim();
      if (data.active === false || !role || !data.organizationId || (role === 'department_head' && !department)) {
        await signOut(auth).catch(()=>{});
        location.replace('login.html');
        return;
      }
      currentUser = user;
      const uiRole = UI_ROLE[role];
      if (component) {
        patchBoard(component);
        component.setState({
          authPending:false,
          runtimeMode:'mobility',
          role:uiRole,
          screen:component.homeOf(uiRole),
          orgName:data.organizationName || 'المؤسسة المسجلة',
          sessionName:data.name || user.email || 'مستخدم الحركة الذكية',
          department,
          orgId:data.organizationId,
        });
        document.title = 'SMART HSR - الحركة الذكية';
        await refresh();
      }
    });
  }

  function withRefresh(promise) {
    return Promise.resolve(promise).then(async value => { await refresh(); return value; });
  }

  window.SmartHSRMobilityAdapter = {
    connect(instance) {
      component = instance;
      patchBoard(instance);
      instance.setState({authPending:true,runtimeMode:'mobility'});
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
    refreshMobilityEmployees: refresh,
    createMissionRequest: payload => {
      const exact = (workspace.employees || []).find(e =>
        (payload.requestedEmployeeId && e.employeeId === payload.requestedEmployeeId)
        || (!payload.requestedEmployeeId && payload.requestedEmployeeName && e.name === payload.requestedEmployeeName)
      );
      const body = {...payload, clientRequestId:requestId('mission')};
      if (exact) {
        body.requestedEmployeeId = exact.employeeId;
        body.requestedEmployeeName = exact.name;
      }
      return withRefresh(api('createMissionRequest',body)).then(x=>x.missionId);
    },
    submitMissionForApproval: missionId => withRefresh(api('submitMissionForApproval',{missionId})),
    decideMission: (missionId,toStatus) => withRefresh(api('decideMobilityMission',{missionId,toStatus})),
    allocateVehicle: (missionId,vehicleId,employeeUid) => withRefresh(api('allocateVehicle',{missionId,vehicleId,employeeUid})),
    handoverMission: missionId => withRefresh(api('handoverVehicle',{missionId})),
    confirmVehicleReturn: missionId => withRefresh(api('confirmVehicleReturn',{missionId})),
    employeeAdvanceMission: (missionId,toStatus) => withRefresh(api('employeeAdvanceMission',{missionId,toStatus})),
    employeeReturnVehicle: missionId => withRefresh(api('employeeReturnVehicle',{missionId})),
    createIncident: payload => withRefresh(api('createIncident',{...payload,clientRequestId:requestId('incident')})).then(x=>x.incidentId),
    mobilityProcessIncident: (incidentId,toStatus) => withRefresh(api('processMobilityIncident',{incidentId,toStatus})),
    decideVehicleAuthorization: (missionId,toStatus) => withRefresh(api('decideVehicleAuthorization',{missionId,toStatus})),
  };

  window.dispatchEvent(new Event('smart-hsr-mobility-adapter-ready'));
})();