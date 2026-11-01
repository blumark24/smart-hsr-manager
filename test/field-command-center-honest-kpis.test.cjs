'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '../department-head.html'), 'utf8');
const start = src.indexOf("if (st.role === 'dept' && st.screen === 'deptops') {");
const end = src.indexOf("if (st.screen === 'map') {", start);
const section = start >= 0 && end > start ? src.slice(start, end) : '';

test('Field command center never claims zero visual-distortion cases without a verified feed', () => {
  assert.ok(section, 'Department command-center block missing');
  assert.doesNotMatch(section, /const observations = \[\]/, 'no invented empty case source');
  assert.doesNotMatch(section, /K\('(حالات التشوه|تحت المعالجة|بانتظار التحقق|مغلقة)',\s*0\s*,/, 'no fabricated zero case KPIs');
  assert.match(section, /unavailableCaseKpi\('حالات التشوه'/);
  assert.match(section, /sideACount:\s*'غير متاح'/);
  assert.match(section, /لا يعني ذلك عدم وجود بلاغات/);
});

test('UI repair keeps live team count and does not introduce authorization logic', () => {
  assert.match(section, /K\('مراقبو القسم', team\.length, 'متاحة'\)/);
  assert.match(section, /const team = this\.state\.liveEmployees \|\| \[\]/);
  assert.doesNotMatch(section, /firebase|Firestore|setCustomUserClaims|collection\(/i);
});


test('Field Head chooser follows actual department-first runtime contract without granting staff management', () => {
  const workspace=require('../workspace-access.js');
  const base={organizationId:'synthetic-tenant',active:true,institutionalRole:'department_head'};
  const resolve=(d)=>workspace.resolveWorkspaces({...base,...d});
  const fieldRoute=(d)=>{
    const result=resolve(d);
    return result.workspaces.find(x=>x.id==='field')?.route??null;
  };
  assert.equal(fieldRoute({administration:'الحصر الميداني',department:''}),'department-head.html',
    'HR administration-only Field Head must retain Field workspace');
  assert.equal(fieldRoute({administration:'الحركة الذكية',department:'الحصر الميداني'}),'department-head.html',
    'explicit Field department wins against unrelated HR administration');
  assert.equal(fieldRoute({administration:'الحصر الميداني',department:'الحركة الذكية'}),null,
    'conflicting explicit Mobility department must not receive Field Head link');
  assert.equal(fieldRoute({administration:'الحصر الميداني',department:'الأراضي'}),null,
    'conflicting explicit Lands department must not receive Field Head link');
  assert.equal(fieldRoute({administration:'الحصر الميداني',department:'الحصر الميداني'}),'department-head.html');
  assert.equal(fieldRoute({administration:'الحصر الميداني',department:'الحركة',
    mobilityAccess:{enabled:true,role:'department_head'}}),null,
    'legacy Mobility head is not a Field head when explicit department conflicts');
  assert.equal(fieldRoute({administration:'الحصر الميداني',department:'',
    active:false}),null,'inactive users receive no workspace');
  assert.equal(workspace.resolveWorkspaces({...base,organizationId:'',administration:'الحصر الميداني'}).workspaces.length,0,
    'users without tenant receive no workspace');
  assert.equal(workspace.resolveWorkspaces({...base,institutionalRole:'employee',role:'employee',
    administration:'الحصر الميداني',department:''}).workspaces.some(w=>w.id==='field'),false,
    'canonical HR employee cannot inherit Field Head rights by department text');
  assert.equal(workspace.resolveWorkspaces({...base,institutionalRole:'employee',role:'department_head',
    mobilityAccess:{enabled:false,role:null},administration:'الحصر الميداني'}).workspaces.some(w=>w.id==='field'),false,
    'disabled legacy Mobility head cannot recover Field through stale role');
  const authz=fs.readFileSync(path.resolve(__dirname,'../api/_lib/authz.js'),'utf8');
  assert.match(authz,/orgId && dept\)/,
    'employee registry department-head authorization remains distinct and unchanged');
});
