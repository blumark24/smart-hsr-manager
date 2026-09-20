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
    const [employees, visual, missions, audit] = await Promise.all([
      employeeApi().catch(() => []),
      api('getFieldVisualDistortionCommand').catch(() => ({observations:[],contractors:[]})),
      api('listDepartmentMissions').catch(() => ({missions:[]})),
      api('listFieldDepartmentAudit').catch(() => ({events:[]}))
    ]);
    component.setState({
      liveEmployees: employees,
      liveObservations: Array.isArray(visual.observations) ? visual.observations : [],
      liveContractors: Array.isArray(visual.contractors) ? visual.contractors : [],
      liveMissions: Array.isArray(missions.missions) ? missions.missions : [],
      liveDepartmentAudit: Array.isArray(audit.events) ? audit.events : []
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


  function statusLabel(status) {
    return ({PENDING:'جديدة',IN_PROGRESS:'تحت المعالجة',PENDING_REVIEW:'بانتظار التحقق',COMPLETED:'مغلقة'}[status] || status || '—');
  }
  function statusColor(status) {
    return status === 'PENDING' ? '#ef4444' : status === 'IN_PROGRESS' ? '#22c55e' : status === 'PENDING_REVIEW' ? '#f5a524' : '#7d8ea6';
  }
  function trustedObservations(instance) {
    const allowed = new Set(['PENDING','IN_PROGRESS','PENDING_REVIEW','COMPLETED']);
    return (instance.state.liveObservations || []).filter(o => {
      const lat = Number(o.correctedLat), lng = Number(o.correctedLng);
      const globallyValid = Number.isFinite(lat) && Number.isFinite(lng) &&
        Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
      // SMART HSR is a Saudi municipal platform. Keep the map operationally
      // honest by refusing coordinates outside the Saudi service envelope;
      // this also catches common swapped lat/lng records without mutating them.
      const inSaudiEnvelope = globallyValid && lat >= 16 && lat <= 33.5 && lng >= 34 && lng <= 56.5;
      return allowed.has(o.status) && o.locationVerified === true && inSaudiEnvelope;
    });
  }
  function clearObservationMarkers(instance) {
    (instance._fieldObservationMarkers || []).splice(0).forEach(m => { try { m.remove(); } catch (_) {} });
  }
  function renderObservationMarkers(instance) {
    const map = instance._realMap;
    if (!map || typeof maplibregl === 'undefined' || instance.state.role !== 'dept') return;
    try { if (!map.loaded()) return; } catch (_) { return; }
    clearObservationMarkers(instance);
    instance._fieldObservationMarkers = instance._fieldObservationMarkers || [];
    const observations = trustedObservations(instance);
    const bounds = new maplibregl.LngLatBounds();
    observations.forEach(o => {
      const el = document.createElement('button');
      el.type = 'button';
      el.title = 'فتح البلاغ ' + (o.displayId || o.observationId || '');
      el.setAttribute('aria-label', el.title);
      el.style.cssText = 'width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.9);background:'+statusColor(o.status)+';box-shadow:0 0 0 4px rgba(5,14,28,.28),0 6px 18px rgba(0,0,0,.45);cursor:pointer';
      el.addEventListener('click', e => {
        e.stopPropagation();
        instance.openFieldObservation(o.observationId);
      });
      const marker = new maplibregl.Marker({element:el,anchor:'center'})
        .setLngLat([Number(o.correctedLng),Number(o.correctedLat)])
        .addTo(map);
      instance._fieldObservationMarkers.push(marker);
      bounds.extend([Number(o.correctedLng),Number(o.correctedLat)]);
    });
    if (observations.length && !bounds.isEmpty()) {
      try { map.fitBounds(bounds,{padding:70,maxZoom:16,duration:0}); } catch (_) {}
    }
  }
  function patchApprovedBoard(instance) {
    if (!instance || instance.__fieldHeadLivePatched) return;
    instance.__fieldHeadLivePatched = true;
    instance.state.liveObservations = instance.state.liveObservations || [];
    instance.state.liveContractors = instance.state.liveContractors || [];
    instance.state.observationEvidence = instance.state.observationEvidence || [];

    const originalNavFor = instance.navFor?.bind(instance);
    if (originalNavFor) {
      instance.navFor = role => {
        if (role !== 'dept') return originalNavFor(role);
        return [
          { id:'deptops', label:'مركز قيادة القسم' },
          { id:'visual', label:'التشوه البصري' },
          { id:'contractors', label:'المقاولون والعقود' },
          { id:'fieldmobility', label:'الحركة الميدانية' },
          { id:'map', label:'الخريطة التشغيلية' },
          { id:'employees', label:'موظفو القسم' },
          { id:'audit', label:'سجل القسم' }
        ];
      };
    }

    const originalScreenDef = instance.screenDef?.bind(instance);
    if (originalScreenDef) {
      instance.screenDef = () => {
        const screen = instance.state.screen;
        if (instance.state.role === 'dept' && screen === 'visual') {
          return {ops:false,title:'التشوه البصري',sub:'إدارة دورة البلاغ من الرصد حتى الإغلاق',actions:[]};
        }
        if (instance.state.role === 'dept' && screen === 'contractors') {
          return {ops:false,title:'المقاولون والعقود',sub:'سجل جهات التنفيذ والعقود النشطة للتشوه البصري',actions:[]};
        }
        if (instance.state.role === 'dept' && screen === 'fieldmobility') {
          return {ops:false,title:'الحركة الميدانية',sub:'مهام موظفي القسم ومسار الاعتماد وتخصيص المركبة',actions:[
            {label:'+ طلب مهمة',on:()=>instance.openDrawer('create',null),tx:'var(--btnTx,#eaf4ff)',bg:'var(--btn,rgba(76,131,236,.45))',bd:'var(--btnBd,rgba(120,170,255,.35))'}
          ]};
        }
        if (instance.state.role === 'dept' && screen === 'employees') {
          return {ops:false,title:'موظفو القسم',sub:'المراقبون والموظفون النشطون في إدارة الحصر الميداني',actions:[]};
        }
        const base = originalScreenDef();
        if (instance.state.role !== 'dept' || screen !== 'deptops') return base;
        const observations = instance.state.liveObservations || [];
        const active = observations.filter(o => ['PENDING','IN_PROGRESS','PENDING_REVIEW'].includes(o.status));
        const team = (instance.state.liveEmployees || []).filter(e => e?.products?.field?.enabled === true && e?.products?.field?.role === 'inspector');
        const K = (label,value,colorName) => ({label,value:String(value),delta:'',col:instance.sc ? instance.sc(colorName) : '#53d99a',on:()=>{}});
        return Object.assign({}, base, {
          ops:true,
          bottom:false,
          title:'مركز قيادة القسم — ' + (instance.state.department || 'إدارة الحصر الميداني'),
          sub:'إدارة الحصر الميداني · المنتج النشط: التشوه البصري',
          actions:[],
          kpis:[
            K('حالات التشوه', observations.length, 'جديد'),
            K('تحت المعالجة', observations.filter(o=>o.status==='IN_PROGRESS').length, 'قيد التنفيذ'),
            K('بانتظار التحقق', observations.filter(o=>o.status==='PENDING_REVIEW').length, 'بانتظار الاعتماد'),
            K('مغلقة', observations.filter(o=>o.status==='COMPLETED').length, 'مغلقة'),
            K('مراقبو القسم', team.length, 'متاحة')
          ],
          sideATitle:'حالات التشوه الجارية',
          sideACount:active.length + ' حالة',
          sideA:active.slice(0,8).map(o => ({
            badge:String(o.displayId || o.observationId || '—').slice(-4),
            title:o.title || o.type || 'تشوه بصري',
            meta:o.location || 'موقع موثق',
            tag:statusLabel(o.status),
            col:statusColor(o.status),
            chipBg:instance.tint ? instance.tint(statusColor(o.status),.14) : 'transparent',
            bg:'var(--ctl,rgba(20,32,54,0.6))',
            bd:'var(--ctlBd,rgba(122,164,224,0.12))',
            on:()=>instance.openFieldObservation(o.observationId)
          })),
          sideBTitle:'مراقبو القسم',
          sideBCount:String(team.length),
          sideB:team.slice(0,8).map(e => ({
            title:e.name || 'مراقب',
            meta:e.jobTitle || 'مراقب ميداني',
            tag:e.accountStatus === 'ACTIVE' ? 'نشط' : 'غير نشط',
            col:e.accountStatus === 'ACTIVE' ? '#22c55e' : '#7d8ea6',
            chipBg:'rgba(34,197,94,.14)',
            bg:'var(--ctl,rgba(20,32,54,0.6))',
            bd:'var(--ctlBd,rgba(122,164,224,0.12))',
            on:()=>{}
          }))
        });
      };
    }

    const originalBindRealMap = instance.bindRealMap?.bind(instance);
    if (originalBindRealMap) {
      instance.bindRealMap = () => {
        originalBindRealMap();
        const map = instance._realMap;
        if (map && !map.__fieldObservationBound) {
          map.__fieldObservationBound = true;
          map.on('load', () => renderObservationMarkers(instance));
        }
        renderObservationMarkers(instance);
      };
    }

    instance.openFieldObservation = async observationId => {
      const o = (instance.state.liveObservations || []).find(x => x.observationId === observationId);
      if (!o) return;
      instance.setState({drawer:'observation',drawerId:observationId,observationEvidence:[],notifOpen:false,layersOpen:false,mobNavOpen:false});
      const [before,after] = await Promise.all([
        window.SmartHSRMobilityAdapter.resolveObservationEvidence(o.imagePath),
        window.SmartHSRMobilityAdapter.resolveObservationEvidence(o.afterImagePath)
      ]);
      if (instance.state.drawer === 'observation' && instance.state.drawerId === observationId) {
        instance.setState({observationEvidence:[
          ...(before ? [{label:'قبل المعالجة',url:before}] : []),
          ...(after ? [{label:'بعد المعالجة',url:after}] : [])
        ]});
      }
    };


    const originalExt = instance.ext?.bind(instance);
    if (originalExt) {
      instance.ext = (day, st) => {
        const screen = st.screen;
        const cell = (v, flex, opt={}) => ({
          v:v == null || v === '' ? '—' : String(v),
          flex:String(flex),
          align:opt.align || 'right',
          size:opt.size || '11.5px',
          weight:opt.weight || '400',
          col:opt.col || 'var(--tx2,#a9bdd4)'
        });
        const chip = status => {
          const col=statusColor(status);
          return {chip:statusLabel(status),chipCol:col,chipBg:'rgba(122,164,224,.10)',chipBd:col};
        };
        if (st.role === 'dept' && screen === 'visual') {
          const q=(st.tq||'').trim().toLowerCase();
          const f=st.tfilter||'الكل';
          const observations=(instance.state.liveObservations||[])
            .filter(o=>f==='الكل'||statusLabel(o.status)===f)
            .filter(o=>!q||[o.displayId,o.observationId,o.title,o.type,o.location,o.createdByName,o.assignedContractorName].join(' ').toLowerCase().includes(q));
          const filters=['الكل','جديدة','تحت المعالجة','بانتظار التحقق','مغلقة'].map(label=>({
            label,on:()=>instance.setState({tfilter:label}),
            tx:f===label?'var(--tx,#e9f1fb)':'var(--tx3,#7d8ea6)',
            bg:f===label?'rgba(56,132,220,.22)':'var(--ctl,rgba(20,32,54,.5))',
            bd:f===label?'rgba(76,201,240,.4)':'var(--ctlBd,rgba(122,164,224,.14))'
          }));
          return {
            isTable:true,isHandover:false,isReports:false,isSettings:false,isEmp:false,
            tQ:st.tq||'',setTQ:e=>instance.setState({tq:e.target.value}),
            tPlaceholder:'رقم البلاغ، النوع، الموقع، المراقب، المقاول...',
            tFilters:filters,
            tCols:[
              {label:'البلاغ',flex:'0 0 88px',align:'right'},
              {label:'النوع',flex:'1.1',align:'right'},
              {label:'الموقع',flex:'1.4',align:'right'},
              {label:'المراقب',flex:'1',align:'right'},
              {label:'المقاول',flex:'1',align:'right'},
              {label:'التحقق',flex:'0 0 100px',align:'left'}
            ],
            tRows:observations.map(o=>Object.assign({
              on:()=>instance.openFieldObservation(o.observationId),
              cells:[
                cell(o.displayId||o.observationId,'0 0 88px',{weight:'650',col:'var(--tx,#e9f1fb)'}),
                cell(o.type||o.title||'تشوه بصري','1.1'),
                cell(o.location||'إحداثيات موثقة','1.4',{size:'11px'}),
                cell(o.createdByName||o.inspectorName,'1',{size:'11px'}),
                cell(o.assignedContractorName||'غير مسند','1',{size:'11px'}),
                cell(o.inspectorVerification?.status==='VERIFIED'?'متحقق':o.inspectorVerification?.status==='RETURNED'?'معاد للمقاول':'—','0 0 100px',{align:'left',size:'10.5px'})
              ]
            },chip(o.status))),
            tEmpty:observations.length===0,tCount:observations.length+' بلاغ معروض'
          };
        }
        if (st.role === 'dept' && screen === 'contractors') {
          const contractors=instance.state.liveContractors||[];
          return {
            isTable:true,isHandover:false,isReports:false,isSettings:false,isEmp:false,
            tQ:'',setTQ:()=>{},tPlaceholder:'',tFilters:[],
            tCols:[
              {label:'المقاول',flex:'1.1',align:'right'},
              {label:'الشركة',flex:'1.2',align:'right'},
              {label:'رقم العقد',flex:'1',align:'right'},
              {label:'نطاق العقد',flex:'1.3',align:'right'},
              {label:'انتهاء العقد',flex:'0 0 100px',align:'left'}
            ],
            tRows:contractors.map(x=>{
              const active=x.contractState==='ACTIVE',col=active?'#22c55e':'#f5a524';
              return {
                chip:active?'عقد نشط':(x.contractState||'غير مكتمل'),chipCol:col,chipBg:'rgba(122,164,224,.10)',chipBd:col,
                on:()=>instance.setState({drawer:'contractorProfile',drawerId:x.uid}),
                cells:[
                  cell(x.name,'1.1',{weight:'650',col:'var(--tx,#e9f1fb)'}),
                  cell(x.profile?.companyName,'1.2'),
                  cell(x.profile?.contractNumber,'1'),
                  cell(x.profile?.contractScope,'1.3'),
                  cell(x.profile?.endDate,'0 0 100px',{align:'left'})
                ]
              };
            }),
            tEmpty:contractors.length===0,tCount:contractors.length+' مقاول'
          };
        }
        if (st.role === 'dept' && screen === 'fieldmobility') {
          const missions=instance.state.liveMissions||[];
          return {
            isTable:true,isHandover:false,isReports:false,isSettings:false,isEmp:false,
            tQ:'',setTQ:()=>{},tPlaceholder:'',tFilters:[],
            tCols:[
              {label:'المهمة',flex:'0 0 90px',align:'right'},
              {label:'النوع',flex:'1.1',align:'right'},
              {label:'الموظف',flex:'1',align:'right'},
              {label:'الوجهة',flex:'1.3',align:'right'},
              {label:'السيارة',flex:'0 0 100px',align:'left'}
            ],
            tRows:missions.map(m=>{
              const label=m.statusLabel||m.status||'—',col='#38bdf8';
              return {
                chip:label,chipCol:col,chipBg:'rgba(56,189,248,.10)',chipBd:'rgba(56,189,248,.35)',
                on:()=>instance.setState({drawer:'fieldMission',drawerId:m.missionId||m.id}),
                cells:[
                  cell(m.missionId||m.id,'0 0 90px',{weight:'650',col:'var(--tx,#e9f1fb)'}),
                  cell(m.type,'1.1'),cell(m.requestedEmployeeName||m.assignedEmployeeName,'1'),
                  cell(m.destination,'1.3'),cell(m.vehicleId||'بانتظار الحركة','0 0 100px',{align:'left',size:'10.5px'})
                ]
              };
            }),
            tEmpty:missions.length===0,tCount:missions.length+' مهمة'
          };
        }
        if (st.role === 'dept' && screen === 'employees') {
          const employees=(instance.state.liveEmployees||[]).filter(e=>String(e.department||'')===String(instance.state.department||'')||e?.products?.field?.enabled===true);
          return {
            isTable:true,isHandover:false,isReports:false,isSettings:false,isEmp:false,
            tQ:'',setTQ:()=>{},tPlaceholder:'',tFilters:[],
            tCols:[
              {label:'الموظف',flex:'1.2',align:'right'},
              {label:'المسمى',flex:'1',align:'right'},
              {label:'الحساب',flex:'0 0 100px',align:'left'},
              {label:'التشغيل الميداني',flex:'0 0 120px',align:'left'}
            ],
            tRows:employees.map(e=>{
              const active=e.accountStatus==='ACTIVE'||e.active===true,col=active?'#22c55e':'#7d8ea6';
              return {
                chip:active?'نشط':'غير نشط',chipCol:col,chipBg:'rgba(122,164,224,.10)',chipBd:col,on:()=>{},
                cells:[
                  cell(e.name||e.employeeId||e.uid,'1.2',{weight:'650',col:'var(--tx,#e9f1fb)'}),
                  cell(e.jobTitle||'موظف ميداني','1'),
                  cell(e.accountStatus||'—','0 0 100px',{align:'left'}),
                  cell(e?.products?.mobility?.vehicleEligible===true?'مؤهل للمركبة':'—','0 0 120px',{align:'left'})
                ]
              };
            }),
            tEmpty:employees.length===0,tCount:employees.length+' موظف'
          };
        }
        if (st.role === 'dept' && screen === 'audit') {
          const events=instance.state.liveDepartmentAudit||[];
          const actionLabel=a=>({
            assign_contractor:'إسناد للمقاول',
            upsert_contractor_profile:'تحديث ملف المقاول',
            verify_contractor_work:'اعتماد معالجة المقاول',
            return_to_contractor:'إعادة للمقاول',
            close_visual_distortion_case:'إغلاق حالة التشوه',
            create:'إنشاء مهمة',
            submit_for_approval:'إرسال المهمة للاعتماد'
          }[a]||a||'حدث تشغيلي');
          return {
            isTable:true,isHandover:false,isReports:false,isSettings:false,isEmp:false,
            tQ:'',setTQ:()=>{},tPlaceholder:'',tFilters:[],
            tCols:[
              {label:'الوقت',flex:'0 0 150px',align:'right'},
              {label:'الحدث',flex:'1.3',align:'right'},
              {label:'المورد',flex:'1',align:'right'},
              {label:'الحالة السابقة',flex:'0 0 100px',align:'left'},
              {label:'الحالة الجديدة',flex:'0 0 100px',align:'left'}
            ],
            tRows:events.map(e=>({
              chip:'مسجّل',chipCol:'#7d8ea6',chipBg:'rgba(122,164,224,.10)',chipBd:'rgba(122,164,224,.25)',on:()=>{},
              cells:[
                cell(e.timestamp||'—','0 0 150px',{size:'10.5px'}),
                cell(actionLabel(e.action),'1.3',{weight:'600',col:'var(--tx,#e9f1fb)'}),
                cell((e.resourceType||'')+' · '+(e.resourceId||''),'1',{size:'10.5px'}),
                cell(e.fromStatus,'0 0 100px',{align:'left'}),
                cell(e.toStatus,'0 0 100px',{align:'left'})
              ]
            })),
            tEmpty:events.length===0,tCount:events.length+' حدث'
          };
        }
        const out=originalExt(day,st);
        if (st.role === 'dept' && screen === 'map') {
          const trusted=trustedObservations(instance);
          out.showMapEmpty=trusted.length===0;
          out.liveCount=String((instance.state.liveEmployees||[]).filter(e=>e.accountStatus==='ACTIVE'||e.active===true).length);
          out.legend=[
            {label:'جديدة',col:'#ef4444'},
            {label:'تحت المعالجة',col:'#22c55e'},
            {label:'بانتظار التحقق',col:'#f5a524'},
            {label:'مغلقة',col:'#7d8ea6'}
          ];
        }
        return out;
      };
    }

    const originalDrawerData = instance.drawerData?.bind(instance);
    if (originalDrawerData) {
      instance.drawerData = () => {
        const kind = instance.state.drawer, id = instance.state.drawerId;
        if (kind === 'observation') {
          const o = (instance.state.liveObservations || []).find(x => x.observationId === id);
          if (!o) return {title:'تعذر تحديد البلاغ',sub:'',chip:'',chipCol:'',chipBg:'',chipBd:''};
          const col = statusColor(o.status);
          const actions = [];
          const activeContractors = (instance.state.liveContractors || []).filter(x => x.contractState === 'ACTIVE');
          if (o.status === 'PENDING' && activeContractors.length) {
            actions.push({
              label:'إسناد للمقاول',
              on:()=>instance.setState({drawer:'observationAssign',drawerId:o.observationId,chip:Object.assign({},instance.state.chip,{contractorUid:activeContractors[0]?.uid||''})}),
              tx:'var(--btnTx,#eaf4ff)',bg:'var(--btn,rgba(76,131,236,.45))',bd:'var(--btnBd,rgba(120,170,255,.35))'
            });
          }
          if (o.status === 'PENDING_REVIEW' && o.inspectorVerification?.status === 'VERIFIED') {
            actions.push({
              label:'إغلاق الحالة',
              on:()=>window.SmartHSRMobilityAdapter.closeFieldObservation(o.observationId).then(()=>{instance.setState({drawer:null});instance.flash?.('تم إغلاق الحالة');}).catch(()=>instance.flash?.('تعذر إغلاق الحالة')),
              tx:'var(--btnTx,#eaf4ff)',bg:'var(--btn,rgba(76,131,236,.45))',bd:'var(--btnBd,rgba(120,170,255,.35))'
            });
          }
          return {
            title:'بلاغ التشوه · ' + (o.displayId || o.observationId || '—'),
            sub:o.type || o.title || 'تشوه بصري',
            chip:statusLabel(o.status),chipCol:col,
            chipBg:instance.tint ? instance.tint(col,.14) : 'transparent',
            chipBd:instance.tint ? instance.tint(col,.30) : 'transparent',
            rows:[
              {k:'رقم الحالة',v:String(o.displayId || o.observationId || '—')},
              {k:'الموقع',v:o.location || 'إحداثيات موثقة'},
              {k:'الحالة',v:statusLabel(o.status)},
              {k:'المراقب',v:o.createdByName || o.inspectorName || '—'},
              {k:'المقاول',v:o.assignedContractorName || 'غير مسند'},
              {k:'التحقق',v:o.inspectorVerification?.status || '—'}
            ],
            evidenceImages:instance.state.observationEvidence || [],
            actions
          };
        }
        if (kind === 'fieldMission') {
          const m=(instance.state.liveMissions||[]).find(x=>(x.missionId||x.id)===id);
          if(!m) return {title:'تعذر تحديد المهمة',sub:'',chip:'',chipCol:'',chipBg:'',chipBd:''};
          const label=m.statusLabel||m.status||'—';
          const col='#38bdf8';
          return {
            title:'مهمة ميدانية · '+String(m.missionId||m.id||''),
            sub:m.type||'مهمة ميدانية',
            chip:label,chipCol:col,chipBg:'rgba(56,189,248,.10)',chipBd:'rgba(56,189,248,.35)',
            rows:[
              {k:'الموظف',v:m.requestedEmployeeName||m.assignedEmployeeName||'—'},
              {k:'الوجهة',v:m.destination||'—'},
              {k:'السبب',v:m.reason||'—'},
              {k:'النطاق',v:m.scope||'—'},
              {k:'المركبة',v:m.vehicleId||'بانتظار إدارة الحركة'},
              {k:'الحالة',v:label}
            ],
            actions:[]
          };
        }

        if (kind === 'contractorProfile') {
          const x=(instance.state.liveContractors||[]).find(v=>v.uid===id);
          if(!x) return {title:'تعذر تحديد المقاول',sub:'',chip:'',chipCol:'',chipBg:'',chipBd:''};
          const p=x.profile||{},active=x.contractState==='ACTIVE',col=active?'#22c55e':'#f5a524';
          return {
            title:x.name||'مقاول',sub:p.companyName||'الملف التعاقدي',
            chip:active?'عقد نشط':(x.contractState||'غير مكتمل'),chipCol:col,chipBg:'rgba(122,164,224,.10)',chipBd:col,
            rows:[
              {k:'رقم العقد',v:p.contractNumber||'—'},
              {k:'نطاق العقد',v:p.contractScope||'—'},
              {k:'بداية العقد',v:p.startDate||'—'},
              {k:'نهاية العقد',v:p.endDate||'—'},
              {k:'جهة الاتصال',v:p.contactName||'—'},
              {k:'الجوال',v:p.contactPhone||'—'}
            ],
            actions:[]
          };
        }
        if (kind === 'observationAssign') {
          const o = (instance.state.liveObservations || []).find(x => x.observationId === id);
          const contractors = (instance.state.liveContractors || []).filter(x => x.contractState === 'ACTIVE');
          if (!o) return {title:'تعذر تحديد البلاغ',sub:'',chip:'',chipCol:'',chipBg:'',chipBd:''};
          return {
            title:'إسناد البلاغ للمقاول',sub:String(o.displayId || o.observationId || ''),
            chip:'جديدة',chipCol:'#ef4444',chipBg:'rgba(239,68,68,.12)',chipBd:'rgba(239,68,68,.3)',
            form:true,formTitle:'المقاول ذو العقد النشط',
            fields:[{
              label:'المقاول',type:'select',value:instance.state.chip?.contractorUid||'',ph:'اختر المقاول',
              options:contractors.map(x=>({value:x.uid,label:x.name||x.profile?.companyName||'مقاول'})),
              on:e=>instance.setState({chip:Object.assign({},instance.state.chip,{contractorUid:e.target.value})})
            }],
            actions:[{
              label:'تأكيد الإسناد',
              on:()=>{
                const uid=instance.state.chip?.contractorUid;
                if(!uid){instance.flash?.('اختر المقاول');return;}
                window.SmartHSRMobilityAdapter.assignFieldObservation(o.observationId,uid)
                  .then(()=>{instance.setState({drawer:null});instance.flash?.('تم إسناد الحالة للمقاول');})
                  .catch(()=>instance.flash?.('تعذر الإسناد — تحقق من العقد النشط'));
              },
              tx:'var(--btnTx,#eaf4ff)',bg:'var(--btn,rgba(76,131,236,.45))',bd:'var(--btnBd,rgba(120,170,255,.35))'
            }]
          };
        }
        return originalDrawerData();
      };
    }

    const originalRenderVals = instance.renderVals?.bind(instance);
    if (originalRenderVals) {
      instance.renderVals = () => {
        const vals = originalRenderVals();
        const dr = instance.drawerData?.() || {};
        vals.dHasEvidenceImages = !!(dr.evidenceImages && dr.evidenceImages.length);
        vals.dEvidenceImages = dr.evidenceImages || [];
        return vals;
      };
    }
  }

  window.SmartHSRMobilityAdapter = {
    connect(instance) {
      component = instance;
      patchApprovedBoard(instance);
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