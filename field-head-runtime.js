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
    }, () => {
      // Live Visual Distortion data can arrive after the real map has already
      // completed its initial load. Repaint the same trusted state here so the
      // KPI/empty-state and marker layer cannot remain stuck at the pre-fetch 0.
      requestAnimationFrame(() => renderObservationMarkers(component));
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
  function workflowPhase(o) {
    if (!o) return {key:'new',label:'جديدة',color:'#ef4444',step:1};
    if (o.status === 'COMPLETED') return {key:'completed',label:'تمت المعالجة',color:'#22a06b',step:5};
    if (o.status === 'PENDING_REVIEW') return {key:'review',label:'بانتظار التحقق',color:'#38bdf8',step:4};
    if (o.status === 'IN_PROGRESS') return {key:'progress',label:'قيد التنفيذ',color:'#f59e0b',step:3};
    if (o.status === 'PENDING' && o.assignedContractorUid) return {key:'assigned',label:'تم الإسناد',color:'#7c6cf2',step:2};
    return {key:'new',label:'جديدة',color:'#ef4444',step:1};
  }
  function workflowSteps(o) {
    const current=workflowPhase(o).step;
    return [
      {key:'capture',label:'الرصد',state:current>1?'done':current===1?'current':'next'},
      {key:'assign',label:'الإسناد',state:current>2?'done':current===2?'current':'next'},
      {key:'execute',label:'التنفيذ',state:current>3?'done':current===3?'current':'next'},
      {key:'verify',label:'التحقق',state:current>4?'done':current===4?'current':'next'},
      {key:'close',label:'الإغلاق',state:current===5?'done':'next'}
    ];
  }
  function workflowProgressLabel(o) {
    const p=workflowPhase(o);
    return p.label + ' · ' + Math.round((p.step/5)*100) + '%';
  }
  function typeLabel(type) {
    const key=String(type||'').toUpperCase();
    return ({MAINTENANCE:'صيانة',LIGHTING:'إنارة',WASTE:'مخلفات',EXCAVATION:'حفريات',VISUAL_DISTORTION:'تشوه بصري'}[key] || type || 'تشوه بصري');
  }
  function verificationLabel(status) {
    return ({VERIFIED:'تم التحقق',RETURNED:'أعيد للمقاول',PENDING:'بانتظار التحقق'}[String(status||'').toUpperCase()] || status || 'لم يبدأ');
  }
  function locationLabel(o) {
    const raw=String(o?.location||'').trim();
    if (!raw) return o?.locationVerified===true ? 'موقع GPS موثّق' : 'الموقع غير موثق';
    if (/^-?\d+(?:\.\d+)?\s*[,،]\s*-?\d+(?:\.\d+)?$/.test(raw)) return 'موقع GPS موثّق';
    return raw;
  }
  function firstEvidenceReference(...values) {
    return values.find(v=>typeof v==='string' && v.trim())?.trim() || null;
  }
  function formatAuditTime(value) {
    if (!value) return '—';
    const d=new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    try {
      return new Intl.DateTimeFormat('ar-SA',{day:'2-digit',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}).format(d);
    } catch (_) { return String(value); }
  }
  function observationMapPoint(o) {
    const rawLat = Number(o?.correctedLat), rawLng = Number(o?.correctedLng);
    const globallyValid = Number.isFinite(rawLat) && Number.isFinite(rawLng) &&
      Math.abs(rawLat) <= 90 && Math.abs(rawLng) <= 180;
    if (!globallyValid) return null;
    const inSaudiEnvelope = (lat,lng) => lat >= 16 && lat <= 33.5 && lng >= 34 && lng <= 56.5;
    if (inSaudiEnvelope(rawLat,rawLng)) return {lat:rawLat,lng:rawLng,source:'canonical'};
    // Read-only compatibility recovery for a legacy/swapped pair. The record is
    // never mutated; the swap is accepted only when it is the sole Saudi-valid
    // orientation.
    if (inSaudiEnvelope(rawLng,rawLat)) return {lat:rawLng,lng:rawLat,source:'swapped_read_recovery'};
    return null;
  }
  function trustedObservations(instance) {
    const allowed = new Set(['PENDING','IN_PROGRESS','PENDING_REVIEW','COMPLETED']);
    return (instance.state.liveObservations || []).map(o => {
      if (!(allowed.has(o.status) && o.locationVerified === true)) return null;
      const point = observationMapPoint(o);
      return point ? Object.assign({},o,{_mapLat:point.lat,_mapLng:point.lng,_mapPointSource:point.source}) : null;
    }).filter(Boolean);
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
    observations.forEach(o => {
      const el = document.createElement('button');
      el.type = 'button';
      const phase=workflowPhase(o);
      el.title = 'فتح البلاغ ' + (o.displayId || o.observationId || '') + ' · ' + phase.label;
      el.setAttribute('aria-label', el.title);
      el.className='hsr-observation-marker phase-'+phase.key;
      el.dataset.phase=phase.key;
      el.style.setProperty('--phase-color',phase.color);
      el.style.cssText += ';width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.94);background:'+phase.color+';box-shadow:0 0 0 4px rgba(5,14,28,.24),0 6px 18px rgba(0,0,0,.38);cursor:pointer';
      el.addEventListener('click', e => {
        e.stopPropagation();
        instance.openFieldObservation(o.observationId);
      });
      const marker = new maplibregl.Marker({element:el,anchor:'center'})
        .setLngLat([Number(o._mapLng),Number(o._mapLat)])
        .addTo(map);
      instance._fieldObservationMarkers.push(marker);
    });
    if (observations.length) {
      // Keep the operational map at municipality scale instead of zooming out
      // across old/stale records that may exist far apart in the same tenant.
      // The API already returns newest first, so focus only when the newest
      // trusted observation changes; all trusted markers still remain on map.
      const newest = observations[0];
      const focusKey = String(newest.observationId || newest.displayId || '');
      if (focusKey && instance._fieldObservationFocusKey !== focusKey) {
        instance._fieldObservationFocusKey = focusKey;
        try {
          map.jumpTo({
            center:[Number(newest._mapLng),Number(newest._mapLat)],
            zoom:15
          });
        } catch (_) {}
      }
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
          { id:'missions', label:'التشوه البصري' },
          { id:'fieldmobility', label:'الحركة الميدانية' },
          { id:'map', label:'الخريطة التشغيلية' },
          { id:'employees', label:'موظفو القسم' },
          { id:'incidents', label:'البلاغات العامة' },
          { id:'audit', label:'سجل القسم' }
        ];
      };
    }

    const originalScreenDef = instance.screenDef?.bind(instance);
    if (originalScreenDef) {
      instance.screenDef = () => {
        const screen = instance.state.screen;
        if (instance.state.role === 'dept' && screen === 'missions') {
          return {ops:false,title:'التشوه البصري',sub:'إدارة دورة البلاغ من الرصد حتى الإغلاق',actions:[]};
        }
        if (instance.state.role === 'dept' && screen === 'incidents') {
          return {ops:false,title:'البلاغات العامة',sub:'بلاغات تشغيلية مستقلة لا تشمل حالات التشوه البصري، لمنع ازدواجية السجل والمسار',actions:[]};
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
        const active = observations.filter(o => workflowPhase(o).key !== 'completed');
        const team = (instance.state.liveEmployees || []).filter(e => e?.products?.field?.enabled === true && e?.products?.field?.role === 'inspector');
        const countPhase = key => observations.filter(o=>workflowPhase(o).key===key).length;
        const K = (label,value,color,on) => ({label,value:String(value),delta:'',col:color,on:on||(()=>{})});
        const openPhase = label => instance.setState({screen:'missions',tfilter:label});
        return Object.assign({}, base, {
          ops:true,
          bottom:false,
          title:'مركز قيادة القسم — ' + (instance.state.department || 'إدارة الحصر الميداني'),
          sub:'إدارة الحصر الميداني · المنتج النشط: التشوه البصري',
          actions:[],
          kpis:[
            K('إجمالي الحالات', observations.length, '#0f766e', ()=>openPhase('الكل')),
            K('جديدة', countPhase('new'), '#ef4444', ()=>openPhase('جديدة')),
            K('تم الإسناد', countPhase('assigned'), '#7c6cf2', ()=>openPhase('تم الإسناد')),
            K('قيد التنفيذ', countPhase('progress'), '#f59e0b', ()=>openPhase('قيد التنفيذ')),
            K('بانتظار التحقق', countPhase('review'), '#38bdf8', ()=>openPhase('بانتظار التحقق')),
            K('تمت المعالجة', countPhase('completed'), '#22a06b', ()=>openPhase('تمت المعالجة'))
          ],
          sideATitle:'الحالات التشغيلية الجارية',
          sideACount:active.length + ' حالة',
          sideA:active.slice(0,8).map(o => {
            const phase=workflowPhase(o);
            const company=(instance.state.liveContractors||[]).find(x=>x.uid===o.assignedContractorUid)?.profile?.companyName;
            return {
            badge:String(o.displayId || o.observationId || '—').slice(-4),
            title:typeLabel(o.title || o.type || 'تشوه بصري'),
            meta:company ? (company+' · '+locationLabel(o)) : locationLabel(o),
            tag:phase.label,
            col:phase.color,
            chipBg:instance.tint ? instance.tint(phase.color,.14) : 'transparent',
            bg:'var(--ctl,rgba(20,32,54,0.6))',
            bd:'var(--ctlBd,rgba(122,164,224,0.12))',
            on:()=>instance.openFieldObservation(o.observationId)
          }}),
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
      const beforeRef=firstEvidenceReference(o.imageObjectKey,o.imagePath,o.imageUrl,o.beforeImagePath);
      const afterRef=firstEvidenceReference(o.afterImagePath,o.afterImageUrl);
      const [before,after] = await Promise.all([
        window.SmartHSRMobilityAdapter.resolveObservationEvidence(beforeRef),
        window.SmartHSRMobilityAdapter.resolveObservationEvidence(afterRef)
      ]);
      if (instance.state.drawer === 'observation' && instance.state.drawerId === observationId) {
        instance.setState({observationEvidence:[
          ...(before ? [{kind:'before',label:'قبل المعالجة',url:before}] : []),
          ...(after ? [{kind:'after',label:'بعد المعالجة',url:after}] : [])
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
        if (st.role === 'dept' && screen === 'missions') {
          const q=(st.tq||'').trim().toLowerCase();
          const f=st.tfilter||'الكل';
          const observations=(instance.state.liveObservations||[])
            .filter(o=>f==='الكل'||workflowPhase(o).label===f)
            .filter(o=>!q||[o.displayId,o.observationId,o.title,o.type,o.location,o.createdByName,o.assignedContractorName].join(' ').toLowerCase().includes(q));
          const filters=['الكل','جديدة','تم الإسناد','قيد التنفيذ','بانتظار التحقق','تمت المعالجة'].map(label=>({
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
              {label:'الشركة',flex:'1',align:'right'},
              {label:'المرحلة',flex:'1.25',align:'right'},
              {label:'التحقق',flex:'0 0 100px',align:'left'}
            ],
            tRows:observations.map(o=>Object.assign({
              on:()=>instance.openFieldObservation(o.observationId),
              cells:[
                cell(o.displayId||o.observationId,'0 0 88px',{weight:'650',col:'var(--tx,#e9f1fb)'}),
                cell(typeLabel(o.type||o.title),'1.1'),
                cell(locationLabel(o),'1.4',{size:'11px'}),
                cell(o.createdByName||o.inspectorName,'1',{size:'11px'}),
                cell(((instance.state.liveContractors||[]).find(x=>x.uid===o.assignedContractorUid)?.profile?.companyName)||'غير مسند','1',{size:'11px'}),
                cell(workflowProgressLabel(o),'1.25',{size:'10.5px',weight:'600',col:workflowPhase(o).color}),
                cell(o.inspectorVerification?.status==='VERIFIED'?'متحقق':o.inspectorVerification?.status==='RETURNED'?'معاد للمقاول':'—','0 0 100px',{align:'left',size:'10.5px'})
              ]
            },{chip:workflowPhase(o).label,chipCol:workflowPhase(o).color,chipBg:'rgba(122,164,224,.10)',chipBd:workflowPhase(o).color}))),
            tEmpty:observations.length===0,tCount:observations.length+' بلاغ معروض'
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
              {label:'السيارة',flex:'0 0 100px',align:'left'},
              {label:'التفويض',flex:'0 0 130px',align:'left'}
            ],
            tRows:missions.map(m=>{
              const label=m.statusLabel||m.status||'—',col='#38bdf8';
              return {
                chip:label,chipCol:col,chipBg:'rgba(56,189,248,.10)',chipBd:'rgba(56,189,248,.35)',
                on:()=>instance.setState({drawer:'fieldMission',drawerId:m.missionId||m.id}),
                cells:[
                  cell(m.missionId||m.id,'0 0 90px',{weight:'650',col:'var(--tx,#e9f1fb)'}),
                  cell(m.type,'1.1'),cell(m.requestedEmployeeName||m.assignedEmployeeName,'1'),
                  cell(m.destination,'1.3'),
                  cell(m.vehicleId||'بانتظار الحركة','0 0 100px',{align:'left',size:'10.5px'}),
                  cell(({PENDING_AUTHORIZATION:'بانتظار الاعتماد',AUTHORIZED:'معتمد',ACTIVE:'ساري',EXPIRED:'منتهي',REJECTED:'مرفوض',REVOKED:'ملغي'}[m.vehicleAuthorizationStatus])||'لم يصدر','0 0 130px',{align:'left',size:'10.5px'})
                ]
              };
            }),
            tEmpty:missions.length===0,tCount:missions.length+' مهمة'
          };
        }
        if (st.role === 'dept' && screen === 'employees') {
          const employees=(instance.state.liveEmployees||[])
            .filter(e=>String(e.department||'')===String(instance.state.department||'')||e?.products?.field?.enabled===true)
            .filter(e=>e?.role!=='contractor' && e?.products?.field?.role!=='contractor');
          return {
            isTable:true,isHandover:false,isReports:false,isSettings:false,isEmp:false,
            tQ:'',setTQ:()=>{},tPlaceholder:'',tFilters:[],
            tCols:[
              {label:'الموظف',flex:'1.2',align:'right'},
              {label:'الصفة',flex:'0 0 110px',align:'right'},
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
                  cell(e?.products?.field?.role==='inspector'?'مراقب ميداني':'موظف داخلي','0 0 110px',{weight:'600',col:'var(--acc,#12855a)'}),
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
          const events=(instance.state.liveDepartmentAudit||[])
            .filter(e=>e.resourceType==='observation'||e.resourceType==='contractorProfile'||e.resourceType==='auditNote');
          const actionLabel=a=>({
            assign_contractor:'تم إسناد البلاغ لشركة متعاقدة',
            upsert_contractor_profile:'تم تحديث الملف التعاقدي',
            verify_contractor_work:'اعتمد المراقب معالجة المقاول',
            return_to_contractor:'أعاد المراقب البلاغ للمقاول',
            close_visual_distortion_case:'تم إغلاق بلاغ التشوه البصري',
            append_audit_note:'أضيفت ملاحظة إدارية على السجل'
          }[a]||'حدث تشغيلي');
          const resourceLabel=e=>e.resourceType==='observation'?'بلاغ تشوه بصري'
            :e.resourceType==='contractorProfile'?'ملف شركة متعاقدة'
            :e.resourceType==='auditNote'?'ملاحظة مرتبطة بسجل سابق':'سجل تشغيلي';
          return {
            isTable:true,isHandover:false,isReports:false,isSettings:false,isEmp:false,
            tQ:'',setTQ:()=>{},tPlaceholder:'',tFilters:[],
            tCols:[
              {label:'الوقت',flex:'0 0 170px',align:'right'},
              {label:'الحدث',flex:'1.4',align:'right'},
              {label:'السجل',flex:'1',align:'right'},
              {label:'من',flex:'0 0 110px',align:'left'},
              {label:'الحالة',flex:'0 0 105px',align:'left'}
            ],
            tRows:events.map(e=>({
              chip:e.resourceType==='auditNote'?'ملاحظة':'موثّق',
              chipCol:e.resourceType==='auditNote'?'#12688f':'#12855a',
              chipBg:e.resourceType==='auditNote'?'rgba(18,104,143,.10)':'rgba(18,133,90,.10)',
              chipBd:e.resourceType==='auditNote'?'rgba(18,104,143,.28)':'rgba(18,133,90,.28)',
              on:()=>instance.setState({drawer:'auditEvent',drawerId:e.auditId}),
              cells:[
                cell(formatAuditTime(e.timestamp),'0 0 170px',{size:'10.5px'}),
                cell(e.resourceType==='auditNote'?(e.note||actionLabel(e.action)):actionLabel(e.action),'1.4',{weight:'600',col:'var(--tx,#e9f1fb)'}),
                cell(resourceLabel(e),'1',{size:'10.5px'}),
                cell(e.actorRole==='department_head'?'رئيس القسم':e.actorRole||'النظام','0 0 110px',{align:'left'}),
                cell(e.toStatus?statusLabel(e.toStatus):(e.fromStatus?statusLabel(e.fromStatus):'—'),'0 0 105px',{align:'left'})
              ]
            })),
            tEmpty:events.length===0,tCount:events.length+' حدث موثّق'
          };
        }
        const out=originalExt(day,st);
        if (st.role === 'dept' && (screen === 'map' || screen === 'deptops')) {
          const trusted=trustedObservations(instance);
          out.showMapEmpty=trusted.length===0;
          out.liveCount=String(trusted.length);
          out.legend=[
            {label:'جديدة',col:'#ef4444'},
            {label:'تم الإسناد',col:'#7c6cf2'},
            {label:'قيد التنفيذ',col:'#f59e0b'},
            {label:'بانتظار التحقق',col:'#38bdf8'},
            {label:'تمت المعالجة',col:'#22a06b'}
          ];
        }
        return out;
      };
    }

    const originalDrawerData = instance.drawerData?.bind(instance);
    if (originalDrawerData) {
      instance.drawerData = () => {
        const kind = instance.state.drawer, id = instance.state.drawerId;
        if (kind === 'auditEvent') {
          const e=(instance.state.liveDepartmentAudit||[]).find(x=>x.auditId===id);
          if(!e) return {title:'تعذر تحديد السجل',sub:'',chip:'',chipCol:'',chipBg:'',chipBd:''};
          const actionLabel=({
            assign_contractor:'إسناد البلاغ لشركة متعاقدة',
            upsert_contractor_profile:'تحديث الملف التعاقدي',
            verify_contractor_work:'اعتماد معالجة المقاول',
            return_to_contractor:'إعادة البلاغ للمقاول',
            close_visual_distortion_case:'إغلاق بلاغ التشوه البصري',
            append_audit_note:'ملاحظة إدارية'
          }[e.action]||'حدث تشغيلي');
          const rows=[
            {k:'الحدث',v:actionLabel},
            {k:'الوقت',v:formatAuditTime(e.timestamp)},
            {k:'المنفذ',v:e.actorRole==='department_head'?'رئيس القسم':e.actorRole||'النظام'},
            {k:'الحالة السابقة',v:e.fromStatus?statusLabel(e.fromStatus):'—'},
            {k:'الحالة الجديدة',v:e.toStatus?statusLabel(e.toStatus):'—'}
          ];
          if(e.note) rows.push({k:'الملاحظة',v:e.note});
          return {
            title:'سجل القسم',sub:'سجل تدقيق محفوظ ولا يتم تعديل الحدث الأصلي',
            chip:e.resourceType==='auditNote'?'ملاحظة':'موثّق',
            chipCol:e.resourceType==='auditNote'?'#12688f':'#12855a',
            chipBg:'rgba(18,133,90,.10)',chipBd:'rgba(18,133,90,.28)',
            rows,
            actions:e.resourceType==='auditNote'?[]:[{
              label:'إضافة ملاحظة / تصحيح',
              on:()=>instance.setState({drawer:'auditNoteEdit',drawerId:e.auditId,chip:Object.assign({},instance.state.chip,{auditNote:''})}),
              tx:'var(--btnTx,#fff)',bg:'var(--btn)',bd:'var(--btnBd)'
            }]
          };
        }
        if (kind === 'auditNoteEdit') {
          const parent=(instance.state.liveDepartmentAudit||[]).find(x=>x.auditId===id);
          if(!parent) return {title:'تعذر تحديد السجل',sub:'',chip:'',chipCol:'',chipBg:'',chipBd:''};
          const value=instance.state.chip?.auditNote||'';
          return {
            title:'إضافة ملاحظة على سجل القسم',
            sub:'لن يتغير الحدث الأصلي؛ ستُضاف الملاحظة كسجل تدقيق جديد مرتبط به.',
            chip:'تصحيح موثّق',chipCol:'#12688f',chipBg:'rgba(18,104,143,.10)',chipBd:'rgba(18,104,143,.28)',
            form:true,formTitle:'الملاحظة الإدارية',
            fields:[{
              label:'الملاحظة أو التصحيح',value,on:e=>instance.setState({chip:Object.assign({},instance.state.chip,{auditNote:e.target.value})})
            }],
            actions:[{
              label:'حفظ الملاحظة',
              on:()=>{
                const note=String(instance.state.chip?.auditNote||'').trim();
                if(!note){instance.flash?.('اكتب الملاحظة أولاً');return;}
                window.SmartHSRMobilityAdapter.appendFieldDepartmentAuditNote(id,note)
                  .then(()=>{instance.setState({drawer:null});instance.flash?.('تمت إضافة الملاحظة إلى سجل القسم');})
                  .catch(()=>instance.flash?.('تعذر حفظ الملاحظة'));
              },
              tx:'var(--btnTx,#fff)',bg:'var(--btn)',bd:'var(--btnBd)'
            }]
          };
        }
        if (kind === 'observation') {
          const o = (instance.state.liveObservations || []).find(x => x.observationId === id);
          if (!o) return {title:'تعذر تحديد البلاغ',sub:'',chip:'',chipCol:'',chipBg:'',chipBd:''};
          const col = statusColor(o.status);
          const actions = [];
          const assignedContractor=(instance.state.liveContractors||[]).find(x=>x.uid===o.assignedContractorUid);
          const assignedProfile=assignedContractor?.profile||{};
          const activeContractors = (instance.state.liveContractors || []).filter(x => x.contractState === 'ACTIVE');
          if (o.status === 'PENDING' && activeContractors.length) {
            actions.push({
              label:'إسناد لشركة مقاول',
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
          const phase=workflowPhase(o);
          const assignmentCard=o.assignedContractorUid ? {
            state:'assigned',
            title:'الإسناد التنفيذي',
            company:assignedProfile.companyName || 'شركة متعاقدة',
            contact:assignedProfile.contactName || o.assignedContractorName || 'ممثل الشركة',
            contract:assignedProfile.contractNumber ? ('#'+assignedProfile.contractNumber) : 'بدون رقم عقد',
            status:assignedContractor?.contractState==='ACTIVE'?'عقد نشط':'راجع حالة العقد',
            assignedAt:formatAuditTime(o.assignedAt)
          } : {
            state:'unassigned',
            title:'الإسناد التنفيذي',
            company:'لم يتم الإسناد بعد',
            contact:'—',contract:'—',status:'بانتظار اختيار شركة متعاقدة',assignedAt:'—'
          };
          return {
            title:'بلاغ التشوه · ' + (o.displayId || o.observationId || '—'),
            sub:typeLabel(o.type || o.title),
            chip:phase.label,chipCol:phase.color,
            chipBg:instance.tint ? instance.tint(phase.color,.14) : 'transparent',
            chipBd:instance.tint ? instance.tint(phase.color,.30) : 'transparent',
            caseSteps:workflowSteps(o),
            assignmentCard,
            rows:[
              {k:'رقم الحالة',v:String(o.displayId || o.observationId || '—')},
              {k:'التصنيف',v:typeLabel(o.type || o.title)},
              {k:'الموقع',v:locationLabel(o)},
              {k:'الإحداثيات',v:(Number.isFinite(Number(o.correctedLat))&&Number.isFinite(Number(o.correctedLng)))?(Number(o.correctedLat).toFixed(6)+'، '+Number(o.correctedLng).toFixed(6)):'—'},
              {k:'الحالة',v:statusLabel(o.status)},
              {k:'المراقب',v:o.createdByName || o.inspectorName || 'غير مسند'},
              {k:'الشركة المتعاقدة',v:assignedProfile.companyName || (o.assignedContractorUid ? 'شركة متعاقدة' : 'غير مسند')},
              {k:'ممثل الشركة',v:assignedProfile.contactName || o.assignedContractorName || '—'},
              {k:'العقد',v:assignedProfile.contractNumber ? ('#'+assignedProfile.contractNumber+' · '+(assignedContractor?.contractState==='ACTIVE'?'نشط':'غير نشط')) : '—'},
              {k:'التحقق',v:verificationLabel(o.inspectorVerification?.status)}
            ],
            evidenceImages:instance.state.observationEvidence || [],
            evidenceCompare:true,
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
              {k:'رقم التفويض',v:m.vehicleAuthorizationNumber||'—'},
              {k:'حالة التفويض',v:({PENDING_AUTHORIZATION:'بانتظار الاعتماد',AUTHORIZED:'معتمد',ACTIVE:'ساري',EXPIRED:'منتهي',REJECTED:'مرفوض',REVOKED:'ملغي'}[m.vehicleAuthorizationStatus])||'لم يصدر'},
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
            actions:[{
              label:'تعديل الملف التعاقدي',
              on:()=>instance.setState({drawer:'contractorEdit',drawerId:x.uid,chip:Object.assign({},instance.state.chip,{
                companyName:p.companyName||'',contractNumber:p.contractNumber||'',contractScope:p.contractScope||'',
                contactName:p.contactName||'',contactPhone:p.contactPhone||'',startDate:p.startDate||'',endDate:p.endDate||'',
                contractStatus:p.status||'ACTIVE'
              })}),
              tx:'var(--btnTx,#eaf4ff)',bg:'var(--btn,rgba(76,131,236,.45))',bd:'var(--btnBd,rgba(120,170,255,.35))'
            }]
          };
        }
        if (kind === 'contractorEdit') {
          const x=(instance.state.liveContractors||[]).find(v=>v.uid===id);
          if(!x) return {title:'تعذر تحديد المقاول',sub:'',chip:'',chipCol:'',chipBg:'',chipBd:''};
          const value=(key,fallback='')=>instance.state.chip?.[key]??fallback;
          const set=(key,e)=>instance.setState({chip:Object.assign({},instance.state.chip,{[key]:e.target.value})});
          return {
            title:'تعديل الملف التعاقدي',sub:x.name||'مقاول',
            chip:'بيانات العقد',chipCol:'#38bdf8',chipBg:'rgba(56,189,248,.10)',chipBd:'rgba(56,189,248,.30)',
            form:true,formTitle:'بيانات العقد',
            fields:[
              {label:'اسم الشركة',value:value('companyName'),on:e=>set('companyName',e)},
              {label:'رقم العقد',value:value('contractNumber'),on:e=>set('contractNumber',e)},
              {label:'نطاق العقد',value:value('contractScope'),on:e=>set('contractScope',e)},
              {label:'جهة الاتصال',value:value('contactName'),on:e=>set('contactName',e)},
              {label:'رقم التواصل',value:value('contactPhone'),on:e=>set('contactPhone',e)},
              {label:'بداية العقد YYYY-MM-DD',value:value('startDate'),on:e=>set('startDate',e)},
              {label:'نهاية العقد YYYY-MM-DD',value:value('endDate'),on:e=>set('endDate',e)},
              {label:'حالة العقد',type:'select',value:value('contractStatus','ACTIVE'),options:[
                {value:'ACTIVE',label:'نشط'},{value:'SUSPENDED',label:'موقوف'},{value:'ENDED',label:'منتهي'}
              ],on:e=>set('contractStatus',e)}
            ],
            actions:[{
              label:'حفظ الملف التعاقدي',
              on:()=>{
                const ch=instance.state.chip||{};
                window.SmartHSRMobilityAdapter.upsertFieldContractorProfile({
                  contractorUid:x.uid,companyName:ch.companyName||'',contractNumber:ch.contractNumber||'',
                  contractScope:ch.contractScope||'',contactName:ch.contactName||'',contactPhone:ch.contactPhone||'',
                  startDate:ch.startDate||'',endDate:ch.endDate||'',status:ch.contractStatus||'ACTIVE'
                }).then(()=>{instance.setState({drawer:'contractorProfile',drawerId:x.uid});instance.flash?.('تم حفظ الملف التعاقدي');})
                  .catch(()=>instance.flash?.('تعذر حفظ الملف التعاقدي — تحقق من البيانات والتواريخ'));
              },
              tx:'var(--btnTx,#eaf4ff)',bg:'var(--btn,rgba(76,131,236,.45))',bd:'var(--btnBd,rgba(120,170,255,.35))'
            }]
          };
        }

        if (kind === 'observationAssign') {
          const o = (instance.state.liveObservations || []).find(x => x.observationId === id);
          const contractors = (instance.state.liveContractors || []).filter(x => x.contractState === 'ACTIVE');
          if (!o) return {title:'تعذر تحديد البلاغ',sub:'',chip:'',chipCol:'',chipBg:'',chipBd:''};
          return {
            title:'إسناد البلاغ لشركة مقاول',sub:String(o.displayId || o.observationId || ''),
            chip:'جديدة',chipCol:'#ef4444',chipBg:'rgba(239,68,68,.12)',chipBd:'rgba(239,68,68,.3)',
            form:true,formTitle:'شركة التنفيذ المتعاقدة — العقود النشطة فقط',
            fields:[{
              label:'شركة المقاول (عقد نشط)',type:'select',value:instance.state.chip?.contractorUid||'',ph:'اختر الشركة المتعاقدة',
              options:contractors.map(x=>({
                value:x.uid,
                label:[
                  x.profile?.companyName||x.name||'شركة مقاول',
                  'عقد نشط',
                  x.profile?.contractNumber ? 'عقد '+x.profile.contractNumber : '',
                  x.profile?.endDate ? 'حتى '+x.profile.endDate : ''
                ].filter(Boolean).join(' · ')
              })),
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
        vals.dHasCaseSteps = !!(dr.caseSteps && dr.caseSteps.length);
        vals.dCaseSteps = (dr.caseSteps || []).map(step=>({
          ...step,
          dotClass:'dh-case-step-dot '+step.state,
          stepClass:'dh-case-step '+step.state
        }));
        vals.dHasAssignmentCard = !!dr.assignmentCard;
        vals.dAssignment = dr.assignmentCard || {};
        vals.dAssignmentAssigned = dr.assignmentCard?.state === 'assigned';
        vals.dAssignmentPending = !!dr.assignmentCard && dr.assignmentCard.state !== 'assigned';
        vals.dAssignmentStateLabel = vals.dAssignmentAssigned ? 'مسند' : 'بانتظار الإسناد';

        vals.dHasEvidenceImages = !!(dr.evidenceImages && dr.evidenceImages.length);
        vals.dEvidenceImages = dr.evidenceImages || [];
        vals.dEvidenceCompare = dr.evidenceCompare === true;
        vals.dNoEvidenceCompare = dr.evidenceCompare !== true;
        vals.dEvidenceBefore = (dr.evidenceImages||[]).find(x=>x.kind==='before') || null;
        vals.dEvidenceAfter = (dr.evidenceImages||[]).find(x=>x.kind==='after') || null;
        vals.dHasEvidenceBefore = !!vals.dEvidenceBefore;
        vals.dHasEvidenceAfter = !!vals.dEvidenceAfter;
        vals.dNoEvidenceBefore = !vals.dEvidenceBefore;
        vals.dNoEvidenceAfter = !vals.dEvidenceAfter;
        vals.dEvidenceStatus = vals.dEvidenceBefore && vals.dEvidenceAfter ? 'مكتملة قبل / بعد'
          : vals.dEvidenceBefore ? 'قبل فقط' : 'غير مكتملة';
        vals.dEvidenceBoth = !!(vals.dEvidenceBefore && vals.dEvidenceAfter);
        vals.dEvidenceSplit = Number(instance.state.evidenceSplit || 50);
        vals.dEvidenceClip = (100 - vals.dEvidenceSplit) + '%';
        vals.setEvidenceSplit = e => instance.setState({evidenceSplit:Number(e.target.value||50)});
        vals.openBeforeEvidence = () => {
          if (vals.dEvidenceBefore?.url) instance.setState({evidenceLightbox:{url:vals.dEvidenceBefore.url,label:'قبل المعالجة'}});
        };
        vals.openAfterEvidence = () => {
          if (vals.dEvidenceAfter?.url) instance.setState({evidenceLightbox:{url:vals.dEvidenceAfter.url,label:'بعد المعالجة'}});
        };
        vals.openCompareEvidence = () => {
          const target=vals.dEvidenceSplit >= 50 ? vals.dEvidenceAfter : vals.dEvidenceBefore;
          if (target?.url) instance.setState({evidenceLightbox:{url:target.url,label:target.label||'دليل المعالجة'}});
        };
        vals.evidenceLightboxOpen = !!instance.state.evidenceLightbox?.url;
        vals.evidenceLightboxUrl = instance.state.evidenceLightbox?.url || '';
        vals.evidenceLightboxLabel = instance.state.evidenceLightbox?.label || '';
        vals.closeEvidenceLightbox = () => instance.setState({evidenceLightbox:null});
        if (instance.state.role === 'dept' && (instance.state.screen === 'map' || instance.state.screen === 'deptops')) {
          const trusted=trustedObservations(instance);
          vals.showMapEmpty=trusted.length===0;
          vals.mapPins=[];
          vals.zoneLabels=[];
          vals.layerList=[{
            name:'بلاغات التشوه البصري الموثقة',
            n:String(trusted.length),
            mark:'✓',
            bd:'#38bdf8',
            bg:'#38bdf8',
            on:()=>{}
          }];
          vals.layerCount='1/1';
          vals.liveCount=String(trusted.length);
          vals.legend=[
            {label:'جديدة',col:'#ef4444'},
            {label:'تم الإسناد',col:'#7c6cf2'},
            {label:'قيد التنفيذ',col:'#f59e0b'},
            {label:'بانتظار التحقق',col:'#38bdf8'},
            {label:'تمت المعالجة',col:'#22a06b'}
          ];
          requestAnimationFrame(()=>{
            const hud=document.querySelector('.dh-map-hud span:last-child');
            if(hud) hud.textContent=trusted.length+' بلاغ موثق على الخريطة';
          });
        }
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
    appendFieldDepartmentAuditNote: (parentAuditId,note) => api('appendFieldDepartmentAuditNote',{parentAuditId,note}).then(refresh),
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