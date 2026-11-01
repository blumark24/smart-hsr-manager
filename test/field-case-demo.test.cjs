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
  assert.doesNotMatch(core+ui,/\b(fetch|XMLHttpRequest|WebSocket|localStorage|indexedDB|document\.cookie)\b/);
  assert.doesNotMatch(html,/<script[^>]*src=["']https?:/i);
  assert.match(ui,/textContent/);
});
