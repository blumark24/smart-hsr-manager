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
  const TELEMETRY_ACTIVE_STATUSES = Object.freeze(['HANDED_OVER','READY','IN_PROGRESS','INCIDENT_HOLD']);
  const TELEMETRY_LIVE_MS = 90 * 1000;
  const TELEMETRY_STALE_MS = 5 * 60 * 1000;
  const TELEMETRY_REPORT_MIN_MS = 15 * 1000;

  let component = null;
  let auth = null;
  let currentUser = null;
  let refreshTimer = null;
  let geoWatchId = null;
  let trackedMissionId = null;
  let lastTelemetrySentAt = 0;
  let lastTelemetryPoint = null;
  let workspace = {
    role:null, organizationId:null, department:null, capabilities:[],
    missions:[], vehicles:[], incidents:[], authorizations:[], employees:[],
    telemetry:[], mapContext:null
  };

  function resolveMobilityRole(data) {
    // Unified identity: capability-aware shared resolver (display only — the
    // trusted API re-derives the actor's role on every action).
    if (window.SmartHSRWorkspaceAccess) return window.SmartHSRWorkspaceAccess.resolveMobilityRole(data);
    if (data && Object.prototype.hasOwnProperty.call(data, 'mobilityAccess')) {
      const access = data.mobilityAccess;
      if (!access || typeof access !== 'object' || access.enabled !== true || !ALLOWED_ROLES.includes(access.role)) return null;
      return access.role;
    }
    return data && ALLOWED_ROLES.includes(data.role) ? data.role : null;
  }

  function institutionalIdentity(data) {
    const orgId = String((data && data.organizationId) || '').trim();
    const organizationName = String(
      (data && (data.organizationName || data.municipalityName || data.organizationLabel)) || ''
    ).trim() || (orgId === 'CnlVlKC7UcDMp2NZzjjT' ? 'بلدية القنفذة' : 'المؤسسة المسجلة');

    const department = String(
      (data && (data.department || data.administration || data.departmentName || data.administrationName)) || ''
    ).trim() || 'إدارة حركة السير';

    return { organizationName, department };
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
      createdAt:m.createdAt || null,
      updatedAt:m.updatedAt || null,
      requestedUid:m.requestedEmployeeUid || null,
      assignedUid:m.assignedEmployeeUid || null,
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
    const location = i && i.location && typeof i.location === 'object' ? i.location : null;
    const lat = Number(location && (location.lat ?? location.latitude));
    const lng = Number(location && (location.lng ?? location.longitude));
    const hasCoordinate = Number.isFinite(lat) && Number.isFinite(lng);
    return {
      id:i.incidentId,
      cat:i.category || 'حالة تشغيلية',
      sev:SEVERITY[i.severity] || i.severity || '—',
      emp:i.employeeName || '—',
      mis:i.missionId || '—',
      veh:i.vehicleId || '—',
      dept:i.department || '—',
      // Preserve the trusted coordinate object for the operational map, while
      // keeping table/drawer text human-readable. Previously only `loc`
      // survived this view-model conversion, so mobilityIncidentCoordinate()
      // always received no location and real incident pins silently vanished.
      location: hasCoordinate ? { ...location, lat, lng } : null,
      loc: hasCoordinate ? (lat.toFixed(5) + ', ' + lng.toFixed(5)) : 'غير متاح',
      time:i.createdAt || '—',
      ev:'—',
      note:i.note || '',
      status:INCIDENT_STATUS[i.status] || i.status || '—',
      rawStatus:i.status || null,
    };
  }

  function telemetryView(t) {
    const reported = Date.parse(t.reportedAt || '');
    const ageMs = Number.isFinite(reported) ? Math.max(0, Date.now() - reported) : Infinity;
    const freshness = ageMs <= TELEMETRY_LIVE_MS ? 'LIVE' : ageMs <= TELEMETRY_STALE_MS ? 'STALE' : 'OFFLINE';
    return {
      id:t.telemetryId || t.missionId,
      missionId:t.missionId || null,
      vehicleId:t.vehicleId || null,
      employeeUid:t.employeeUid || null,
      employeeName:t.employeeName || '—',
      department:t.department || '—',
      lat:Number(t.lat),
      lng:Number(t.lng),
      accuracyMeters:Number.isFinite(Number(t.accuracyMeters)) ? Number(t.accuracyMeters) : null,
      headingDegrees:Number.isFinite(Number(t.headingDegrees)) ? Number(t.headingDegrees) : null,
      speedMps:Number.isFinite(Number(t.speedMps)) ? Number(t.speedMps) : null,
      reportedAt:t.reportedAt || null,
      ageSeconds:Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null,
      freshness,
    };
  }

  function stopTelemetryWatch() {
    if (geoWatchId !== null && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(geoWatchId); } catch (_) {}
    }
    geoWatchId = null;
    trackedMissionId = null;
    lastTelemetrySentAt = 0;
    lastTelemetryPoint = null;
  }

  function metersBetween(a, b) {
    if (!a || !b) return Infinity;
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const lat1 = a.lat * rad, lat2 = b.lat * rad;
    const h = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0,1-h)));
  }

  function activeTelemetryMission() {
    if (!Array.isArray(workspace.capabilities)
        || !workspace.capabilities.includes('vehicle.drive')) return null;
    return (workspace.missions || []).find(m =>
      m && m.assignedEmployeeUid === currentUser?.uid
      && m.vehicleId
      && TELEMETRY_ACTIVE_STATUSES.includes(m.status)
    ) || null;
  }

  async function reportTelemetryPosition(mission, pos) {
    if (!mission || !pos || !pos.coords) return;
    const now = Date.now();
    const point = { lat:Number(pos.coords.latitude), lng:Number(pos.coords.longitude) };
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
    const moved = metersBetween(lastTelemetryPoint, point);
    if (lastTelemetrySentAt && now - lastTelemetrySentAt < TELEMETRY_REPORT_MIN_MS && moved < 8) return;
    try {
      await api('reportMobilityTelemetry', {
        missionId:mission.missionId,
        lat:point.lat,
        lng:point.lng,
        accuracyMeters:Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : undefined,
        headingDegrees:Number.isFinite(pos.coords.heading) ? pos.coords.heading : undefined,
        speedMps:Number.isFinite(pos.coords.speed) ? pos.coords.speed : undefined,
      });
      lastTelemetrySentAt = now;
      lastTelemetryPoint = point;
    } catch (e) {
      if (['mission_not_tracking_active','operator_not_assigned','mission_vehicle_relationship_invalid'].includes(e.code)) {
        stopTelemetryWatch();
        refresh().catch(()=>{});
      }
    }
  }

  function syncTelemetryWatch() {
    const mission = activeTelemetryMission();
    if (!mission || !navigator.geolocation) {
      stopTelemetryWatch();
      return;
    }
    if (geoWatchId !== null && trackedMissionId === mission.missionId) return;
    stopTelemetryWatch();
    trackedMissionId = mission.missionId;
    geoWatchId = navigator.geolocation.watchPosition(
      pos => reportTelemetryPosition(mission, pos),
      () => {},
      { enableHighAccuracy:true, maximumAge:10000, timeout:15000 }
    );
  }

  function restartRefreshLoop() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => refresh().catch(()=>{}), 15000);
  }

  function publish() {
    if (!component) return;
    component.setState({
      runtimeMode:'mobility',
      workflowPolicy:workspace.workflowPolicy || 'FULL',
      mobilityCapabilities:Array.isArray(workspace.capabilities) ? workspace.capabilities.slice() : [],
      mapContext:workspace.mapContext || null,
      liveTelemetry:(workspace.telemetry || []).map(telemetryView),
      liveMissions:(workspace.missions || []).map(missionView),
      liveVehicles:(workspace.vehicles || []).map(vehicleView),
      liveIncidents:(workspace.incidents || []).map(incidentView),
      liveEmployees:(workspace.employees || []).filter(e => e.vehicleEligible === true).map(e => ({
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
    syncTelemetryWatch();
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
          const missions = instance.state.liveMissions || [];
          const vehicles = instance.state.liveVehicles || [];
          const incidents = instance.state.liveIncidents || [];
          const telemetry = instance.state.liveTelemetry || [];
          const liveNow = telemetry.filter(t => t.freshness === 'LIVE').length;
          const stale = telemetry.filter(t => t.freshness === 'STALE').length;
          const pendingAllocation = missions.filter(m => m.rawStatus === 'APPROVED').length;
          const openIncidents = incidents.filter(i => i.rawStatus && i.rawStatus !== 'RESOLVED').length;
          const inMission = vehicles.filter(v => v.status === 'في مهمة').length;
          const available = vehicles.filter(v => v.status === 'متاحة').length;

          out.title = 'مركز عمليات الحركة الذكية';
          out.sub = 'إدارة الأسطول والمهام والحوادث · ' + liveNow + ' موقع مباشر' + (stale ? ' · ' + stale + ' موقع متأخر' : '');
          out.kpis = [
            {label:'في مهمة الآن',value:String(inMission),delta:'',col:'#a78bfa',on:()=>instance.setState({screen:'fleet'})},
            {label:'مواقع مباشرة',value:String(liveNow),delta:stale ? ('+'+stale+' متأخر') : '',col:'#22c55e',on:()=>instance.setState({screen:'map'})},
            {label:'بانتظار التخصيص',value:String(pendingAllocation),delta:'',col:'#f5a524',on:()=>instance.setState({screen:'missions'})},
            {label:'حوادث مفتوحة',value:String(openIncidents),delta:'',col:'#ef4444',on:()=>instance.setState({screen:'incidents'})},
            {label:'مركبات متاحة',value:String(available),delta:'',col:'#38bdf8',on:()=>instance.setState({screen:'fleet'})},
          ];
          if ((instance.state.workflowPolicy || 'FULL') === 'DIRECT') {
            out.actions = [
              {label:'+ مهمة مباشرة',on:()=>instance.openDrawer('create',null),tx:'var(--btnTx,#fff)',bg:'var(--btn)',bd:'var(--btnBd)'},
              ...(out.actions || [])
            ];
          }
        }
        if (instance.state.role === 'dept' && instance.state.runtimeMode === 'mobility') {
          if (instance.state.screen === 'deptops') {
            const canDrive=(instance.state.mobilityCapabilities||[]).includes('vehicle.drive');
            const ownMission=(instance.state.liveMissions||[]).find(m =>
              (m.assignedUid===instance.state.sessionUid || m.requestedUid===instance.state.sessionUid)
              && !['CLOSED','REJECTED'].includes(m.rawStatus)
            );
            const actions=[
              {label:'+ طلب مهمة',on:()=>instance.setState(x=>({drawer:'create',form:{...(x.form||{}),cSelf:false,cEmpId:''}})),tx:'var(--btnTx,#fff)',bg:'var(--btn)',bd:'var(--btnBd)'}
            ];
            if(canDrive) actions.push({
              label:'طلب مركبة لي',
              on:()=>instance.setState(x=>({drawer:'create',form:{...(x.form||{}),cSelf:true,cEmpId:''}})),
              tx:'var(--tx2,#c3d6ea)',bg:'var(--ctl,rgba(20,32,54,0.6))',bd:'var(--ctlBd,rgba(122,164,224,0.16))'
            });
            if(canDrive && ownMission) actions.push({
              label:'مركبتي ومهمتي',
              on:()=>instance.setState({screen:'myvehicle'}),
              tx:'var(--tx2,#c3d6ea)',bg:'var(--ctl,rgba(20,32,54,0.6))',bd:'var(--ctlBd,rgba(122,164,224,0.16))'
            });
            return {
              ops:true,bottom:false,
              title:'الحركة الذكية — ' + (instance.state.department || 'القسم'),
              sub:'طلبات المركبات ومهام موظفي القسم',
              actions,
              kpis:[
                {label:'إجمالي المهام',value:String(instance.missions().length),delta:'',col:'#38bdf8',on:()=>instance.setState({screen:'missions'})},
                {label:'بانتظار الاعتماد',value:String(instance.missions().filter(m=>instance.missionStatus(m.id)==='بانتظار الاعتماد').length),delta:'',col:'#f5a524',on:()=>instance.setState({screen:'missions'})},
                {label:'قيد التنفيذ',value:String(instance.missions().filter(m=>instance.missionStatus(m.id)==='قيد التنفيذ').length),delta:'',col:'#22c55e',on:()=>instance.setState({screen:'missions'})},
                {label:'مغلقة',value:String(instance.missions().filter(m=>instance.missionStatus(m.id)==='مغلقة').length),delta:'',col:'#7d8ea6',on:()=>instance.setState({screen:'missions'})},
              ],
              sideATitle:'المهام الجارية',
              sideACount:String(instance.missions().filter(m=>!['مغلقة','ملغاة'].includes(instance.missionStatus(m.id))).length),
              sideAEmptyText:'لا توجد مهام جارية في القسم حالياً.',
              sideA:instance.missions()
                .filter(m=>!['مغلقة','ملغاة'].includes(instance.missionStatus(m.id)))
                .slice(0,8)
                .map(m=>{
                  const st=instance.missionStatus(m.id);
                  const chip=instance.chipOf(st);
                  return {
                    badge:instance.missionBadge(m.no),
                    title:(m.type||'مهمة')+' · '+(m.emp||'—'),
                    meta:(m.dest||'—')+' · '+(m.when||'—'),
                    tag:st,
                    col:chip.col,chipBg:chip.bg,
                    bg:'var(--ctl,rgba(20,32,54,0.6))',
                    bd:'var(--ctlBd,rgba(122,164,224,0.12))',
                    on:()=>instance.openDrawer('mission',m.id)
                  };
                }),
              sideBTitle:'الموظفون المؤهلون للمركبة',
              sideBCount:String((instance.state.liveEmployees||[]).filter(e=>e.vehicleEligible).length),
              sideBEmptyText:'لا يوجد موظفون مؤهلون لاستلام مركبة في هذا القسم حالياً.',
              sideB:(instance.state.liveEmployees||[])
                .filter(e=>e.vehicleEligible)
                .slice(0,8)
                .map(e=>({
                  title:e.name||e.employeeId,
                  meta:e.department||instance.state.department||'—',
                  tag:'مؤهل',
                  col:'#22c55e',
                  chipBg:'rgba(34,197,94,.12)',
                  bg:'var(--ctl,rgba(20,32,54,0.6))',
                  bd:'var(--ctlBd,rgba(122,164,224,0.12))',
                  on:()=>instance.setState(x=>({
                    drawer:'create',
                    form:{...(x.form||{}),cSelf:false,cEmpId:e.employeeId}
                  }))
                })),
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
          const out=[
            {id:'deptops',label:'الحركة الذكية'},
            {id:'missions',label:'طلبات ومهام القسم'},
          ];
          if((instance.state.mobilityCapabilities||[]).includes('vehicle.drive')){
            out.push({id:'myvehicle',label:'مركبتي ومهمتي'});
          }
          return out;
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
      const identity = institutionalIdentity(data);
      const department = identity.department;

      // Establish the authenticated runtime identity before calling the
      // authoritative workspace resolver. The API helper requires currentUser
      // so resolving before this assignment causes a false unauthenticated
      // result and a workspace redirect loop.
      currentUser = user;

      let resolution = null;
      try { resolution = await api('resolveWorkspaces', { workspace:'mobility' }); } catch (_) {}
      if (data.active === false || !data.organizationId) {
        await signOut(auth).catch(()=>{});
        location.replace('login.html');
        return;
      }
      if (!resolution || resolution.allowed !== true) {
        location.replace('workspace.html');
        return;
      }
      const role = resolveMobilityRole(data);
      if (!role || (role === 'department_head' && !department)) {
        location.replace('workspace.html');
        return;
      }
      const uiRole = UI_ROLE[role];
      if (component) {
        patchBoard(component);
        component.setState({
          authPending:false,
          runtimeMode:'mobility',
          role:uiRole,
          screen:component.homeOf(uiRole),
          orgName:identity.organizationName,
          sessionName:data.name || user.email || 'مستخدم الحركة الذكية',
          sessionUid:user.uid,
          department,
          orgId:data.organizationId,
        });
        document.title = 'SMART HSR - الحركة الذكية';
        await refresh();
        restartRefreshLoop();
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
      if (!instance || instance === component) {
        component = null;
        stopTelemetryWatch();
        if (refreshTimer) { window.clearInterval(refreshTimer); refreshTimer = null; }
      }
    },
    logout: async () => {
      stopTelemetryWatch();
      if (refreshTimer) { window.clearInterval(refreshTimer); refreshTimer = null; }
      if (auth) {
        const {signOut} = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');
        await signOut(auth).catch(()=>{});
      }
      location.replace('login.html');
    },
    refresh,
    refreshMobilityEmployees: refresh,
    createDirectMobilityMission: payload => withRefresh(api('createDirectMobilityMission',{...payload,clientRequestId:requestId('mission-direct')})).then(x=>x.missionId),
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
    createMobilityVehicle: payload => withRefresh(api('createMobilityVehicle',payload)).then(x=>x.vehicle),
    updateMobilityVehicle: (vehicleId,payload) => withRefresh(api('updateMobilityVehicle',{vehicleId,...payload})).then(x=>x.vehicle),
    setMobilityVehicleStatus: (vehicleId,toStatus) => withRefresh(api('setMobilityVehicleStatus',{vehicleId,toStatus})),
  };

  window.dispatchEvent(new Event('smart-hsr-mobility-adapter-ready'));
})();