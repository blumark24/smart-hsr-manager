'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const demo = require('./fixtures/smart-hsr-field-case-demo.js');
const root = path.resolve(__dirname, 'fixtures');
const t = index => new Date(Date.parse('2026-11-01T00:00:00.000Z') + index * 60000).toISOString();
const actors = {
  supervisor: { id: 'DEMO-SUPERVISOR-01', role: 'supervisor', tenantId: demo.SYNTHETIC_TENANT },
  worker: { id: demo.SYNTHETIC_WORKER, role: 'field_worker', tenantId: demo.SYNTHETIC_TENANT },
  inspector: { id: 'DEMO-INSPECTOR-01', role: 'inspector', tenantId: demo.SYNTHETIC_TENANT },
};
const steps = [
  ['assign', 'supervisor', {}],
  ['start', 'worker', {}],
  ['submit', 'worker', { evidenceTag: 'SYNTHETIC-EVIDENCE-ONLY' }],
  ['verify', 'inspector', { humanApproved: true }],
];
function until(count) {
  return steps.slice(0, count).reduce((s, [action, actor, options], i) =>
    demo.act(s, action, actors[actor], t(i+1), options), demo.createDemo());
}
function assertParity(state) {
  const views = demo.project(state);
  for (const view of ['map','twin','detail']) {
    assert.equal(views[view].caseId, views.manager.caseId);
    assert.equal(views[view].status, views.manager.status);
    assert.equal(views[view].updatedAt, views.manager.updatedAt);
  }
  assert.equal(views.kpis[views.manager.status], 1);
  assert.equal(Object.values(views.kpis).reduce((a,b)=>a+b,0), 1);
  assert.equal(views.generalIncidentIds.includes(demo.SYNTHETIC_CASE), false);
  return views;
}

test('synthetic fixture has one isolated case and no invented geography or personal documents', () => {
  const s = demo.createDemo();
  const v = assertParity(s);
  assert.equal(v.manager.status, 'PENDING');
  assert.equal(v.map.position, null);
  assert.equal(v.map.hasVerifiedGPS, false);
  assert.equal(v.detail.evidence, null);
  assert.deepEqual(v.generalIncidentIds, []);
  assert.match(demo.SYNTHETIC_CASE, /^SYN-/);
});

test('each of five stages reads one immutable observation source across KPI, Manager, Map and Twin', () => {
  let s=demo.createDemo();
  const observed=['PENDING'];
  assertParity(s);
  for (let i=0;i<steps.length;i++) {
    const [action, role, options]=steps[i];
    const old=structuredClone(s);
    s=demo.act(s,action,actors[role],t(i+1),options);
    assert.deepEqual(old, until(i), 'previous state must not be mutated');
    const v=assertParity(s);
    assert.equal(v.audit.length,i+2);
    assert.equal(v.audit.at(-1).status,v.manager.status);
    assert.equal(v.manager.updatedAt,t(i+1));
    observed.push(v.manager.status);
  }
  assert.deepEqual(observed,['PENDING','ASSIGNED','IN_PROGRESS','PENDING_REVIEW','COMPLETED']);
});

test('out-of-order actions and repeated approvals fail closed', () => {
  assert.throws(()=>demo.act(until(0),'verify',actors.inspector,t(1),{humanApproved:true}),/INVALID_TRANSITION/);
  assert.throws(()=>demo.act(until(4),'verify',actors.inspector,t(5),{humanApproved:true}),/INVALID_TRANSITION/);
  assert.throws(()=>demo.act(until(3),'assign',actors.supervisor,t(4)),/INVALID_TRANSITION/);
});

test('cross-tenant, wrong role and unassigned personnel cannot operate the case', () => {
  assert.throws(()=>demo.act(until(0),'assign',{...actors.supervisor,tenantId:'OTHER-TENANT'},t(1)),/TENANT_DENIED/);
  assert.throws(()=>demo.act(until(0),'assign',actors.worker,t(1)),/ROLE_DENIED/);
  assert.throws(()=>demo.act(until(1),'start',{...actors.worker,id:'DEMO-WORKER-02'},t(2)),/ASSIGNEE_DENIED/);
  assert.throws(()=>demo.act(until(0),'assign',{...actors.supervisor,id:'OTHER-SUPERVISOR'},t(1)),/ACTOR_DENIED/);
});

test('submission requires explicit synthetic evidence, not an invented after photo', () => {
  assert.throws(()=>demo.act(until(2),'submit',actors.worker,t(3),{}),/SYNTHETIC_EVIDENCE_REQUIRED/);
  const accepted=demo.act(until(2),'submit',actors.worker,t(3),{evidenceTag:'SYNTHETIC-EVIDENCE-ONLY'});
  assert.equal(demo.project(accepted).detail.evidence.kind,'synthetic');
  assert.equal(demo.project(accepted).detail.evidence.tag,'SYNTHETIC-EVIDENCE-ONLY');
});

test('automated or role-incorrect closure is denied; only an inspector can verify', () => {
  assert.throws(()=>demo.act(until(3),'verify',actors.inspector,t(4),{humanApproved:false}),/HUMAN_VERIFICATION_REQUIRED/);
  assert.throws(()=>demo.act(until(3),'verify',actors.worker,t(4),{humanApproved:true}),/ROLE_DENIED/);
  assert.equal(demo.project(until(4)).manager.status,'COMPLETED');
});

test('event clocks cannot travel backward or reuse a previous timestamp', () => {
  assert.throws(()=>demo.act(until(1),'start',actors.worker,t(1)),/INVALID_EVENT_TIME/);
  assert.throws(()=>demo.act(until(1),'start',actors.worker,'not-a-date'),/INVALID_EVENT_TIME/);
});

test('visual distortion remains excluded from general incident feed and cross-tenant records', () => {
  const s=demo.createDemo();
  s.generalIncidents=[
    {caseId:demo.SYNTHETIC_CASE,type:'visual_distortion',tenantId:demo.SYNTHETIC_TENANT},
    {caseId:'SYN-GEN-0002',type:'general',tenantId:demo.SYNTHETIC_TENANT},
    {caseId:'SYN-OTHER-0003',type:'general',tenantId:'OTHER-TENANT'},
  ];
  assert.deepEqual(demo.project(s).generalIncidentIds,['SYN-GEN-0002']);
  s.tenantId='OTHER-TENANT';
  assert.throws(()=>demo.project(s),/INVALID_SYNTHETIC_SOURCE/);
});

test('offline Arabic HTML provides no network and exposes visibly synthetic Manager, Map, Twin views', () => {
  const html=fs.readFileSync(path.join(root,'smart-hsr-field-case-demo.html'),'utf8');
  const ui=fs.readFileSync(path.join(root,'smart-hsr-field-case-ui.js'),'utf8');
  const core=fs.readFileSync(path.join(root,'smart-hsr-field-case-demo.js'),'utf8');
  assert.match(html,/lang="ar" dir="rtl"/);
  assert.match(html,/بيانات اصطناعية 100%/);
  assert.match(html,/SMART HSR MAPS/);
  assert.match(html,/SMART HSR TWIN/);
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/smart-hsr-field-case-demo\.js/);
  assert.match(html,/smart-hsr-field-case-ui\.js/);
  assert.doesNotMatch(core+ui,/\bfetch\s*\(|\bnew\s+(WebSocket|XMLHttpRequest)\s*\(|\blocalStorage\s*\.|\bindexedDB\s*\.|document\.cookie\s*=/);
  assert.doesNotMatch(html,/<script[^>]*src=["']https?:/i);
  assert.match(ui,/textContent/);
});

test('Field live location display requires verified GPS and valid coordinates (source-backed, offline)', () => {
  const vm = require('node:vm');
  const src = fs.readFileSync(path.resolve(__dirname, '../field-head-runtime.js'), 'utf8');
  const labelStart = src.indexOf('  function locationLabel(o) {');
  const labelEnd = src.indexOf('  function firstEvidenceReference(', labelStart);
  const pointStart = src.indexOf('  function observationMapPoint(o) {');
  const pointEnd = src.indexOf('  function trustedObservations(instance) {', pointStart);
  assert.ok(labelStart !== -1 && labelEnd > labelStart && pointStart > labelEnd && pointEnd > pointStart);
  const extracted = src.slice(labelStart, labelEnd) + '\n' + src.slice(pointStart, pointEnd);
  const display = vm.runInNewContext('(() => { ' + extracted +
    '; return { locationLabel, verifiedCoordinatesLabel }; })()', {});
  // Contract of the actual Field case window, not merely a demo helper.
  assert.ok(src.includes("{k:'الإحداثيات',v:verifiedCoordinatesLabel(o)}"), 'Field case detail must use verified coordinates');
  const point = { location:'19.3300,41.1000', correctedLat:19.33, correctedLng:41.1 };
  assert.equal(display.locationLabel({ ...point, locationVerified:false }), 'إحداثيات غير موثقة');
  assert.equal(display.verifiedCoordinatesLabel({ ...point, locationVerified:false }), 'غير موثقة');
  assert.equal(display.locationLabel({ ...point, locationVerified:true }), 'موقع GPS موثّق');
  assert.equal(display.verifiedCoordinatesLabel({ ...point, locationVerified:true }), '19.330000، 41.100000');
  const missing = { ...point, correctedLat:null, correctedLng:null, locationVerified:true };
  assert.equal(display.locationLabel(missing), 'إحداثيات غير موثقة');
  assert.equal(display.verifiedCoordinatesLabel(missing), 'غير موثقة');
  assert.equal(display.verifiedCoordinatesLabel({ ...point, locationVerified:true, correctedLat:35, correctedLng:140 }), 'غير موثقة');
  assert.equal(display.verifiedCoordinatesLabel({ ...point, locationVerified:true, correctedLat:41.1, correctedLng:19.33 }), '19.330000، 41.100000');
  assert.equal(display.locationLabel({ location:'طريق الساحل', locationVerified:false }), 'طريق الساحل');
  assert.equal(display.locationLabel({ location:'', locationVerified:true }), 'الموقع غير موثق');
});

test('Field command center does not turn an unavailable response into zero cases', async () => {
  const vm = require('node:vm');
  const src = fs.readFileSync(path.resolve(__dirname, '../field-head-runtime.js'), 'utf8');
  const start = src.indexOf('  let fieldRefreshGeneration = 0;');
  const end = src.indexOf('  async function initAuth()',start);
  assert.ok(start >= 0 && end > start, 'real Field refresh contract present');
  const refreshSnippet = src.slice(start,end);
  const create = (visualResponse) => {
    const instance = {
      state:{orgId:'tenant-one'},
      updates:0,
      setState(update,cb){this.updates++;this.state={...this.state,...update};if(cb)cb();},
      applyMunicipalMapContext(){}
    };
    const ctx = {
      component:instance,
      currentUser:{uid:'user-one'},
      auth:{currentUser:{uid:'user-one'}},
      state:{organizationId:'tenant-one'},
      employeeApi:async()=>[],
      api:async(action)=>{
        if(action==='getFieldVisualDistortionCommand') {
          if(visualResponse instanceof Error) throw visualResponse;
          return visualResponse;
        }
        return action==='listDepartmentMissions' ? {missions:[]} : {events:[]};
      },
      requestAnimationFrame(fn){fn();},
      renderObservationMarkers(){},
    };
    const refresh=vm.runInNewContext('(function(){'+refreshSnippet+'\n return refresh;})()',ctx);
    return {refresh,instance,ctx};
  };
  const failure=create(new Error('offline'));
  await failure.refresh();
  assert.equal(failure.instance.state.fieldVisualDataReady,false);
  assert.equal(failure.instance.state.liveObservations.length,0);
  assert.equal(failure.instance.state.mapContext,null);
  const malformed=create({observations:null,contractors:[]});
  await malformed.refresh();
  assert.equal(malformed.instance.state.fieldVisualDataReady,false);
  const emptySuccess=create({observations:[],contractors:[],mapContext:null});
  await emptySuccess.refresh();
  assert.equal(emptySuccess.instance.state.fieldVisualDataReady,true);
  const loaded=create({observations:[{observationId:'SYN-1',status:'PENDING'}],contractors:[]});
  await loaded.refresh();
  assert.equal(loaded.instance.state.fieldVisualDataReady,true);
  assert.equal(loaded.instance.state.liveObservations.length,1);
});

test('Field refresh rejects stale responses after a tenant or user switch', async () => {
  const vm = require('node:vm');
  const src = fs.readFileSync(path.resolve(__dirname, '../field-head-runtime.js'), 'utf8');
  const start=src.indexOf('  let fieldRefreshGeneration = 0;');
  const end=src.indexOf('  async function initAuth()',start);
  const snippet=src.slice(start,end);
  for(const changed of ['uid','tenant']) {
    let release;
    const pending=new Promise(resolve=>{release=resolve;});
    const instance={
      state:{orgId:'tenant-one'},updates:0,
      setState(v,cb){this.updates++;this.state={...this.state,...v};cb?.();},
      applyMunicipalMapContext(){}
    };
    const ctx={
      component:instance,currentUser:{uid:'user-one'},
      auth:{currentUser:{uid:'user-one'}},state:{organizationId:'tenant-one'},
      employeeApi:async()=>[],
      api:async action=>action==='getFieldVisualDistortionCommand'?pending
        :action==='listDepartmentMissions'?{missions:[]}:{events:[]},
      requestAnimationFrame(fn){fn();},renderObservationMarkers(){}
    };
    const refresh=vm.runInNewContext('(function(){'+snippet+'\n return refresh;})()',ctx);
    const inFlight=refresh();
    if(changed==='uid')ctx.currentUser={uid:'user-two'};
    else ctx.state.organizationId='tenant-two';
    release({observations:[{observationId:'SYN-1'}],contractors:[]});
    await inFlight;
    assert.equal(instance.updates,0,changed+' must not accept stale response');
  }
});

test('Real Field KPI and case table expose unavailable state instead of false zero', () => {
  const src=fs.readFileSync(path.resolve(__dirname, '../field-head-runtime.js'), 'utf8');
  assert.match(src,/const caseFeedReady = instance\.state\.fieldVisualDataReady === true/);
  assert.match(src,/caseFeedReady \? count : '—'/);
  assert.match(src,/sideACount:caseFeedReady \? active\.length \+ ' حالة' : 'غير متاح'/);
  assert.match(src,/tCount:instance\.state\.fieldVisualDataReady === true \? observations\.length\+' بلاغ معروض' : 'بيانات الحصر غير متاحة'/);
  assert.match(src,/sourceNote = instance\.state\.fieldVisualDataReady === true \? '' : ' · بيانات الحصر غير متاحة'/);
});
