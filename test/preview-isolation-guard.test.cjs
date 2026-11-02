'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const gate = require('../api/_lib/previewIsolationGuard');
const project = gate.STAGING_PROJECT_ID;
const firebase = () => ({
  VERCEL_ENV: 'preview',
  FIREBASE_WEB_CONFIG: JSON.stringify({ projectId: project }),
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: project, private_key: 'test-only' }),
  FIREBASE_PROJECT_ID: project
});
const b2 = () => ({
  VERCEL_ENV: 'preview',
  B2_BUCKET_NAME: 'only-synthetic-stage',
  SMART_HSR_PREVIEW_B2_BUCKET_NAME: 'only-synthetic-stage',
  SMART_HSR_PRODUCTION_B2_BUCKET_NAME: 'synthetic-prod-other',
  B2_KEY_ID: 'fake-key-id', B2_APPLICATION_KEY: 'fake-secret',
  B2_S3_ENDPOINT: 'synthetic.invalid', B2_REGION: 'test-region'
});
const cfg = () => ({ bucket: b2().B2_BUCKET_NAME, endpoint: b2().B2_S3_ENDPOINT, region: b2().B2_REGION });
const denied = (fn, type) => assert.throws(fn, (e) => e.code === 'PREVIEW_' + type + '_ISOLATION_DENIED' && e.statusCode === 503);
test('historical Production paths are unaffected by this Preview gate', () => {
  assert.equal(gate.assertPreviewFirebaseIsolation({VERCEL_ENV:'production'}), true);
  assert.equal(gate.isPreviewStorageIsolationConfigured({VERCEL_ENV:'production'}), true);
  assert.equal(gate.assertPreviewStorageClientConfig({}, {VERCEL_ENV:'production'}), true);
});
test('local emulator tests remain outside Preview guard', () => {
  assert.equal(gate.assertPreviewFirebaseIsolation({FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'}), true);
});
test('valid staged Firebase Web/Admin combination accepted', () => {
  assert.equal(gate.assertPreviewFirebaseIsolation(firebase(),[{options:{projectId:project}}]), true);
});
test('missing, malformed and mismatched Firebase Web configuration denied', () => {
  for (const input of ['', '{broken', JSON.stringify({projectId:'wrong'})]) {
    denied(() => gate.assertPreviewFirebaseIsolation({...firebase(), FIREBASE_WEB_CONFIG:input}), 'FIREBASE');
  }
});
test('wrong or missing Firebase service account denied', () => {
  for (const value of ['', JSON.stringify({project_id:'unapproved'})]) {
    denied(() => gate.assertPreviewFirebaseIsolation({...firebase(),FIREBASE_SERVICE_ACCOUNT:value}), 'FIREBASE');
  }
});
test('ADC fallback and mismatched GCP hints denied', () => {
  denied(() => gate.assertPreviewFirebaseIsolation({...firebase(), FIREBASE_SERVICE_ACCOUNT:undefined}), 'FIREBASE');
  denied(() => gate.assertPreviewFirebaseIsolation({...firebase(), GCLOUD_PROJECT:'wrong'}), 'FIREBASE');
});
test('hosted Preview may not use Firebase emulators', () => {
  denied(() => gate.assertPreviewFirebaseIsolation({...firebase(), FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'}), 'FIREBASE');
});
test('preinitialized foreign Firebase application is rejected', () => {
  denied(() => gate.assertPreviewFirebaseIsolation(firebase(),[{options:{projectId:'wrong'}}]), 'FIREBASE');
});
test('valid synthetic B2 configuration accepted', () => {
  assert.equal(gate.assertPreviewStorageIsolation(b2()), true);
  assert.equal(gate.isPreviewStorageIsolationConfigured(b2()), true);
  assert.equal(gate.assertPreviewStorageClientConfig(cfg(),b2()), true);
});
test('missing dedicated preview bucket or production comparison denied', () => {
  assert.equal(gate.isPreviewStorageIsolationConfigured({...b2(),SMART_HSR_PREVIEW_B2_BUCKET_NAME:''}), false);
  assert.equal(gate.isPreviewStorageIsolationConfigured({...b2(),SMART_HSR_PRODUCTION_B2_BUCKET_NAME:''}), false);
});
test('same Preview/Production bucket and swapped destinations denied', () => {
  denied(() => gate.assertPreviewStorageIsolation({...b2(),SMART_HSR_PRODUCTION_B2_BUCKET_NAME:'only-synthetic-stage'}), 'STORAGE');
  denied(() => gate.assertPreviewStorageIsolation({...b2(),B2_BUCKET_NAME:'synthetic-prod-other'}), 'STORAGE');
});
test('missing storage credentials fails as not configured', () => {
  assert.equal(gate.isPreviewStorageIsolationConfigured({...b2(),B2_APPLICATION_KEY:''}), false);
});
test('caller-supplied alternate endpoint, bucket and region denied', () => {
  for (const [field,value] of [['endpoint','other.invalid'],['bucket','synthetic-prod-other'],['region','another-region']]) {
    denied(() => gate.assertPreviewStorageClientConfig({...cfg(),[field]:value},b2()), 'STORAGE');
  }
});
test('invalid supplied configuration object is denied', () => {
  for (const value of [null, {}, [], {bucket:'only-synthetic-stage'}]) {
    denied(() => gate.assertPreviewStorageClientConfig(value,b2()), 'STORAGE');
  }
});
test('failure messages never include credentials or bucket identifiers', () => {
  const env = {...b2(),B2_BUCKET_NAME:'private-do-not-print',B2_APPLICATION_KEY:'top-secret-no-print'};
  try { gate.assertPreviewStorageIsolation(env); assert.fail('Expected denial'); }
  catch (e) { assert.equal(e.code,'PREVIEW_STORAGE_ISOLATION_DENIED'); assert.doesNotMatch(e.message,/private-do-not-print|top-secret-no-print/); }
});

test('Preview Web config rejects a mixed Production Auth or Storage endpoint', () => {
  for (const patch of [
    {authDomain:'smart-hsr-manager.firebaseapp.com'},
    {storageBucket:'smart-hsr-manager.firebasestorage.app'},
    {storageBucket:'smart-hsr-manager.appspot.com'},
    {storageBucket:'custom-unknown.appspot.com'},
    {authDomain:'unreviewed.firebaseapp.com'},
    {databaseURL:'https://smart-hsr-manager-default-rtdb.firebaseio.com'},
    {authDomain:''},
    {storageBucket:null}
  ]) {
    const input={...firebase(),FIREBASE_WEB_CONFIG:JSON.stringify({projectId:project,...patch})};
    denied(() => gate.assertPreviewFirebaseIsolation(input), 'FIREBASE');
  }
});
test('Preview Web config allows same-project Firebase Auth and default Storage only', () => {
  for (const bucket of [project+'.firebasestorage.app',project+'.appspot.com']) {
    const input={...firebase(),FIREBASE_WEB_CONFIG:JSON.stringify({
      projectId:project, authDomain:project+'.firebaseapp.com', storageBucket:bucket,
    })};
    assert.equal(gate.assertPreviewFirebaseIsolation(input),true);
  }
});
test('Preview Firebase Admin rejects mismatched service-account principal despite matching claimed project', () => {
  denied(() => gate.assertPreviewFirebaseIsolation({
    ...firebase(),
    FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
      project_id:project,client_email:'foreign@smart-hsr-manager.iam.gserviceaccount.com'
    })
  }), 'FIREBASE');
  assert.equal(gate.assertPreviewFirebaseIsolation({
    ...firebase(),
    FIREBASE_SERVICE_ACCOUNT:JSON.stringify({
      project_id:project,client_email:'reviewed@'+project+'.iam.gserviceaccount.com'
    })
  }),true);
});
test('actual /api/firebase-config Preview route rejects mixed resources before returning browser configuration', () => {
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../api/firebase-config.js'),'utf8');
  function invoke(method, env) {
    const mod={exports:{}};
    const fn=vm.runInNewContext('(function(module,require,process){'+source+'\n})',{});
    fn(mod, name=>{
      assert.equal(name,'./_lib/previewIsolationGuard');
      return gate;
    },{env});
    const response={
      statusCode:200, payload:null, headers:{},
      status(code){this.statusCode=code;return this;},
      setHeader(name,value){this.headers[name]=value;},
      json(value){this.payload=JSON.parse(JSON.stringify(value));return this;}
    };
    mod.exports({method},response);
    return response;
  }
  const valid={...firebase(),FIREBASE_WEB_CONFIG:JSON.stringify({
    projectId:project, authDomain:project+'.firebaseapp.com',
    storageBucket:project+'.firebasestorage.app'
  })};
  const ok=invoke('GET',valid);
  assert.equal(ok.statusCode,200);
  assert.equal(ok.payload.projectId,project);
  assert.equal(ok.headers['Cache-Control'],'private, no-store');
  const poisoned=invoke('GET',{...valid,FIREBASE_WEB_CONFIG:JSON.stringify({
    projectId:project,
    apiKey:'synthetic-public-firebase-web-key',
    authDomain:project+'.firebaseapp.com',
    storageBucket:project+'.firebasestorage.app',
    messagingSenderId:'12345',
    appId:'1:12345:web:synthetic',
    private_key:'synthetic-private-value-must-not-leak',
    client_secret:'synthetic-client-secret-must-not-leak',
    serviceAccount:{private_key:'synthetic-nested-value-must-not-leak'},
    __internal_admin_override:'synthetic-server-only-value',
  })});
  assert.equal(poisoned.statusCode,200);
  assert.deepEqual(Object.keys(poisoned.payload).sort(),[
    'apiKey','appId','authDomain','messagingSenderId','projectId','storageBucket'
  ]);
  assert.equal(poisoned.payload.apiKey,'synthetic-public-firebase-web-key');
  assert.doesNotMatch(JSON.stringify(poisoned.payload),
    /synthetic-private|synthetic-client-secret|synthetic-nested|synthetic-server-only/);
  assert.equal(poisoned.headers['Cache-Control'],'private, no-store');
  const typed=invoke('GET',{...valid,FIREBASE_WEB_CONFIG:JSON.stringify({
    projectId:project, authDomain:project+'.firebaseapp.com',
    storageBucket:project+'.firebasestorage.app',
    appId:{private_key:'synthetic-nested-value-must-not-leak'}
  })});
  assert.equal(typed.statusCode,503);
  assert.equal(typed.payload.error,'FIREBASE_PREVIEW_CONFIG_INVALID');
  for (const patch of [
    {storageBucket:'smart-hsr-manager.firebasestorage.app'},
    {authDomain:'smart-hsr-manager.firebaseapp.com'},
    {databaseURL:'https://foreign.firebaseio.com'},
  ]) {
    const rejected=invoke('GET',{...valid,FIREBASE_WEB_CONFIG:JSON.stringify({
      projectId:project,...patch
    })});
    assert.equal(rejected.statusCode,503);
    assert.equal(rejected.payload.error,'FIREBASE_PREVIEW_RESOURCE_DENIED');
    assert.doesNotMatch(JSON.stringify(rejected.payload),/smart-hsr-manager|private_key|apiKey/);
  }
  const production=invoke('GET',{VERCEL_ENV:'production'});
  assert.equal(production.statusCode,404);
  const method=invoke('POST',valid);
  assert.equal(method.statusCode,405);
});


test('evidence object read denies a foreign tenant key before Firestore or B2', async () => {
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../api/storage/read.js'),'utf8');
  const counters={observationQueries:0,b2Config:0,b2Client:0};
  const validOrg='alpha-municipality';
  const db={
    collection(name) {
      if(name==='managers')return {doc(){return {async get(){
        return {exists:true,data(){return {role:'manager',active:true,organizationId:validOrg};}};
      }};}};
      if(name==='users')return {doc(){throw Error('Unexpected user fallback');}};
      if(name==='observations'){
        counters.observationQueries++;
        return {where(){return {where(){return {limit(){return {async get(){
          return {empty:false};
        }};}};}};}};
      }
      throw Error('Unexpected DB collection: '+name);
    }
  };
  const dependencies={
    '../_lib/firebaseAdmin':{getDb(){return db;}},
    '../_lib/authz':{
      async verifyRequestToken(){return {uid:'synthetic-manager'};},
      activeIsNotFalse(d){return d?.active!==false;},
      resolveMobilityRole(){return null;},
    },
    '../_lib/b2Client':{
      b2Configuration(){counters.b2Config++;return null;},
      getS3Client(){counters.b2Client++;throw Error('B2 access forbidden in synthetic test');},
      safeStorageFailure(){return {name:'synthetic'};},
    },
  };
  const mod={exports:{}};
  const fn=vm.runInNewContext('(function(require,module,process,Buffer){'+source+'\n})',{URL});
  fn(name=>{assert.ok(Object.hasOwn(dependencies,name),'unexpected dependency '+name);return dependencies[name];},
    mod,{env:{VERCEL_ENV:'preview'}},Buffer);
  const {keyScopedToOrganization,keyBelongsToOrganization}=mod.exports._test;
  const good='observations/alpha-municipality/obs-1/before/synthetic.jpg';
  const other='observations/bravo-municipality/obs-1/before/synthetic.jpg';
  const spoofedPrefix='observations/alpha-municipality-extra/obs-1/before/synthetic.jpg';
  assert.equal(keyScopedToOrganization(good,validOrg),true);
  assert.equal(keyScopedToOrganization(other,validOrg),false);
  assert.equal(keyScopedToOrganization(spoofedPrefix,validOrg),false);
  assert.equal(keyScopedToOrganization(good,'other-tenant'),false);
  assert.equal(keyScopedToOrganization(good,'alpha/municipality'),false);
  assert.equal(keyScopedToOrganization('https://example.test/img.jpg',validOrg),false);
  assert.equal(await keyBelongsToOrganization(db,other,validOrg),false);
  assert.equal(counters.observationQueries,0,'no Firestore ownership query for foreign object');
  async function invoke(key) {
    const res={
      statusCode:200,headers:{},body:null,
      setHeader(name,value){this.headers[name]=value;},
      end(value){this.body=JSON.parse(value);},
    };
    await mod.exports({method:'GET',url:'/?key='+encodeURIComponent(key)},res);
    return res;
  }
  const denyForeign=await invoke(other);
  assert.equal(denyForeign.statusCode,403);
  assert.equal(denyForeign.body.error,'AUTH_ORGANIZATION_DENIED');
  const denySpoof=await invoke(spoofedPrefix);
  assert.equal(denySpoof.statusCode,403);
  assert.equal(denySpoof.body.error,'AUTH_ORGANIZATION_DENIED');
  assert.equal(counters.observationQueries,0,'no Firestore query for foreign keys');
  assert.equal(counters.b2Config,0,'no storage config before tenant prefix validation');
  assert.equal(counters.b2Client,0,'no S3 client before tenant prefix validation');
  // The valid tenant path proceeds to real observation ownership verification,
  // then safely stops because this test intentionally provides no B2 config.
  const own=await invoke(good);
  assert.equal(own.statusCode,502);
  assert.equal(own.body.error,'B2_READ_FAILED');
  assert.ok(counters.observationQueries>0);
  assert.equal(counters.b2Client,0);
});


test('Field Head evidence viewer honors verified institutional administration-only role', async () => {
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../api/storage/read.js'),'utf8');
  const dependencies={
    '../_lib/firebaseAdmin':{getDb(){throw Error('No actual Firebase calls permitted');}},
    '../_lib/authz':{
      async verifyRequestToken(){return {uid:'synthetic-head'};},
      activeIsNotFalse(d){return d && d.active!==false;},
      // Mirror the canonical mobilityAccess key's authority over stale legacy roles.
      resolveMobilityRole(d){
        if(Object.hasOwn(d,'mobilityAccess'))
          return d.mobilityAccess?.enabled===true ? d.mobilityAccess.role : null;
        return d.role==='department_head'?'department_head':null;
      },
    },
    '../_lib/b2Client':{
      b2Configuration(){throw Error('B2 is not used by the viewer resolver');},
      getS3Client(){throw Error('B2 is not used by the viewer resolver');},
      safeStorageFailure(){return {name:'synthetic'};},
    },
  };
  const mod={exports:{}};
  const fn=vm.runInNewContext('(function(require,module,process,Buffer){'+source+'\n})',{URL});
  fn(name=>{assert.ok(Object.hasOwn(dependencies,name),'Unexpected dependency: '+name);return dependencies[name];},
    mod,{env:{VERCEL_ENV:'preview'}},Buffer);
  const resolve=mod.exports._test.resolveViewerContext;
  async function check(user, exists=true) {
    let calls=0;
    const db={collection(name){
      if(name==='managers')return {doc(){return {async get(){return {exists:false};}};}};
      if(name==='users')return {doc(){return {async get(){
        calls++;return {exists,data(){return user;}};
      }};}};
      throw Error('Unexpected data source: '+name);
    }};
    const result=await resolve(db,'synthetic-head');
    assert.equal(calls,1);
    return result;
  }
  const base={active:true,organizationId:'alpha-municipality'};
  const canonical=await check({...base,institutionalRole:'department_head',administration:'إدارة الحصر الميداني'});
  assert.equal(canonical.role,'department_head');
  assert.equal(canonical.organizationId,'alpha-municipality');
  assert.equal(canonical.department,'إدارة الحصر الميداني');
  const legacy=await check({...base,mobilityAccess:{enabled:true,role:'department_head'},administration:'Field Survey'});
  assert.equal(legacy.role,'department_head');
  assert.equal(legacy.department,'Field Survey');
  const canonicalDisabledMobility=await check({...base,institutionalRole:'department_head',
    mobilityAccess:{enabled:false,role:null},administration:'الحصر الميداني'});
  assert.equal(canonicalDisabledMobility.role,'department_head',
    'institutional HR role is independent of Mobility fallback');
  const denied=[
    {...base,institutionalRole:'employee',administration:'الحصر الميداني'},
    {...base,role:'department_head',mobilityAccess:{enabled:false,role:null},administration:'الحصر الميداني'},
    {...base,institutionalRole:'department_head',administration:'إدارة الحركة'},
    {...base,institutionalRole:'department_head',department:'الحركة',administration:'الحصر الميداني'},
    {...base,institutionalRole:'department_head',administration:''},
    {...base,institutionalRole:'department_head',administration:'الحصر الميداني',active:false},
    {...base,institutionalRole:'department_head',administration:'الحصر الميداني',organizationId:''},
  ];
  for(const user of denied)assert.equal(await check(user),null,
    'wrong/inactive/conflicting Field Head metadata must not grant evidence access');
});

test('manager action in department-head resolves to the existing protected manager portal', () => {
  // Regression for the historical broken manager-operations.html#users URL.
  // This does not grant any role or bypass the manager portal auth guard.
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
  const managerAction = /label:\s*'إدارة المستخدمين والصلاحيات',\s*on:\s*\(\)\s*=>\s*\{\s*window\.location\.href\s*=\s*'([^']+)'/m.exec(source);
  assert.ok(managerAction, 'existing users-management toolbar action must remain present');
  assert.equal(managerAction[1], 'manager.html', 'navigate only to the real protected manager portal');
  assert.equal(fs.existsSync(path.join(root, managerAction[1])), true, 'navigation target must exist');
  assert.doesNotMatch(source, /manager-operations\.html#users/, 'legacy broken link must not return');
});


test('preview env metadata audit remains HOLD even when all required names appear', () => {
  const preflight = require('../scripts/preview-env-metadata-audit.cjs');
  const branch = 'fix/owner-upgrade-ledger-no-deploy-20261101';
  const rows = preflight.REQUIRED_KEYS.map(key => ({ key, target: ['preview'] }));
  const report = preflight.evaluate(rows, branch);
  assert.equal(report.configurationMetadata, 'KEY_NAMES_PRESENT_VALUES_UNVERIFIED');
  assert.deepEqual(report.missingKeys, []);
  assert.equal(report.decision, 'HOLD');
  assert.equal(report.previewDeploymentAuthorized, false);
  assert.equal(report.productionChangeAuthorized, false);
  assert.equal(report.effectiveResourceIsolationVerified, false);
  assert.equal(report.isolatedRestoreVerified, false);
});

test('preview env metadata audit catches missing B2 sentinels and an old-branch Lands runtime flag', () => {
  const preflight = require('../scripts/preview-env-metadata-audit.cjs');
  const branch = 'fix/owner-upgrade-ledger-no-deploy-20261101';
  const missing = new Set(['SMART_HSR_PREVIEW_B2_BUCKET_NAME',
    'SMART_HSR_PRODUCTION_B2_BUCKET_NAME', 'LANDS_EMBEDDED_RUNTIME']);
  const rows = preflight.REQUIRED_KEYS.filter(key => !missing.has(key))
    .map(key => ({ key, target: ['preview'] }));
  rows.push({ key: 'LANDS_EMBEDDED_RUNTIME', target: ['preview'],
    gitBranch: 'release/municipality-final-v6' });
  const report = preflight.evaluate(rows, branch);
  assert.deepEqual(report.missingKeys, [
    'SMART_HSR_PREVIEW_B2_BUCKET_NAME',
    'SMART_HSR_PRODUCTION_B2_BUCKET_NAME',
    'LANDS_EMBEDDED_RUNTIME'
  ]);
  assert.deepEqual(report.wrongBranchOnly, ['LANDS_EMBEDDED_RUNTIME']);
  assert.equal(report.configurationMetadata, 'MISSING_REQUIRED_PREVIEW_KEY_NAMES');
  assert.equal(report.decision, 'HOLD');
});

test('preview env metadata audit excludes production, development, and wrong-branch keys', () => {
  const preflight = require('../scripts/preview-env-metadata-audit.cjs');
  const rows = preflight.REQUIRED_KEYS.map((key, i) => ({
    key, target: [i % 2 ? 'production' : 'development'],
    gitBranch: 'release/municipality-final-v6'
  }));
  const report = preflight.evaluate(rows, 'fix/owner-upgrade-ledger-no-deploy-20261101');
  assert.equal(report.scopedKeysPresent, 0);
  assert.equal(report.missingKeys.length, preflight.REQUIRED_KEYS.length);
  assert.equal(report.decision, 'HOLD');
});

test('preview env metadata audit rejects unredacted values, never echoes secrets', () => {
  const preflight = require('../scripts/preview-env-metadata-audit.cjs');
  const syntheticSecret = 'FAKE_SECRET_NEVER_ECHO';
  assert.throws(() => preflight.evaluate([
    { key: 'B2_APPLICATION_KEY', target: ['preview'], value: syntheticSecret }
  ], 'fix/owner-upgrade-ledger-no-deploy-20261101'), error =>
    error.message === 'UNSANITIZED_OR_INVALID_METADATA' &&
    !error.message.includes(syntheticSecret));
});

test('preview env metadata audit refuses Production branch names', () => {
  const preflight = require('../scripts/preview-env-metadata-audit.cjs');
  for (const branch of ['main', 'master', '', 'a/../b']) {
    assert.throws(() => preflight.evaluate([], branch),
      /EXPLICIT_NON_PRODUCTION_BRANCH_REQUIRED/);
  }
});


test('primary SMART HSR page routes are backed by existing files', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const expected = [
    'index.html', 'Home.html', 'login.html', 'manager-login.html',
    'owner-login.html', 'owner.html', 'manager.html', 'workspace.html',
    'dashboard.html', 'admin-affairs.html', 'department-head.html',
    'mobile-map.html', 'operational-map.html', 'twin.html', 'lands/index.html'
  ];
  for (const route of expected) {
    const full = path.join(root, route);
    assert.ok(fs.existsSync(full) && fs.statSync(full).isFile(),
      'missing primary page: ' + route);
  }
});

test('every deployed SMART HSR lands and report rewrite resolves to a real same-origin handler', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const expected = new Map([
    ['/lands', '/lands/index.html'],
    ['/lands/', '/lands/index.html'],
    ['/api/lands-health', '/api/organization/context?embeddedLandsAction=health'],
    ['/api/lands-mutations', '/api/organization/context?embeddedLandsAction=mutation'],
    ['/api/lands-membership-status', '/api/organization/context?embeddedLandsAction=membership'],
    ['/api/lands-sso-register', '/api/organization/context?embeddedLandsAction=sso-register'],
    ['/api/lands-sso-consume', '/api/organization/context?embeddedLandsAction=sso-consume'],
    ['/api/report/root-cause', '/api/report?kind=root-cause'],
    ['/api/report/work-order', '/api/report?kind=work-order']
  ]);
  assert.ok(Array.isArray(config.rewrites), 'rewrites must be an array');
  assert.equal(config.rewrites.length, expected.size, 'unexpected route rewrite requires explicit review');
  for (const [source, destination] of expected) {
    const matching = config.rewrites.filter(item => item.source === source);
    assert.equal(matching.length, 1, 'missing/duplicate rewrite: ' + source);
    assert.equal(matching[0].destination, destination, 'unexpected rewrite target: ' + source);
    const pathname = new URL(destination, 'https://synthetic.example.test').pathname;
    const target = pathname.endsWith('.html') ? pathname : pathname + '.js';
    assert.ok(fs.existsSync(path.join(root, target.slice(1))),
      'missing deployed local target: ' + target);
  }
});

test('main entry pages have no broken literal HTML href destinations', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const pages = [
    'Home.html', 'login.html', 'manager-login.html', 'owner-login.html',
    'owner.html', 'manager.html', 'workspace.html', 'department-head.html'
  ];
  for (const page of pages) {
    const content = fs.readFileSync(path.join(root, page), 'utf8');
    const urls = [...content.matchAll(/\bhref\s*=\s*["']([^"']+\.html(?:[?#][^"']*)?)["']/gi)]
      .map(match => match[1]);
    for (const url of urls) {
      // No external resources are fetched; these checks cover local .html hrefs only.
      if (/^(?:https?:|\/\/|data:|javascript:)/i.test(url)) continue;
      const clean = url.split(/[?#]/, 1)[0];
      const target = clean.startsWith('/') ? clean.slice(1) :
        path.posix.join(path.posix.dirname(page), clean);
      assert.ok(fs.existsSync(path.join(root, target)),
        'broken literal HTML href in ' + page + ': ' + target);
    }
  }
});


test('B2 v4 audit only reports restricted staging scope and never authorizes release', () => {
  const B = require('../scripts/b2-key-scope-readonly-audit.cjs');
  const stage = 'a'.repeat(24), prod = 'b'.repeat(24);
  const r = B.evaluateAuthorization({
    apiInfo: { storageApi: { allowed: {
      buckets: [{id:stage,name:'secret-stage-bucket'}],
      capabilities: ['readFiles','writeFiles','listFiles'],
      namePrefix: 'secret-stage-prefix'
    }}},
    accountId:'secret-account-id',
    authorizationToken:'secret-provider-token',
    applicationKeyExpirationTimestamp:null
  },stage,prod);
  assert.equal(r.scopeStatus,'STAGING_ONLY_PROVIDER_SCOPE_REPORTED');
  assert.equal(r.allowedBucketCount,1);
  assert.equal(r.providerReportedStageOnly,true);
  assert.equal(r.filePrefixRestrictionDeclared,true);
  assert.equal(r.releaseDecision,'HOLD');
  assert.equal(r.productionChangeAuthorized,false);
  assert.equal(r.actualProductionAccessTested,false);
  assert.equal(r.backupRestoreVerified,false);
  assert.doesNotMatch(JSON.stringify(r),/secret|aaaaaaaa|bbbbbbbb/);
});

test('B2 v4 audit refuses unrestricted and multi-bucket keys including Production', () => {
  const B = require('../scripts/b2-key-scope-readonly-audit.cjs');
  const stage='a'.repeat(24),prod='b'.repeat(24);
  const policy = buckets => ({apiInfo:{storageApi:{allowed:{
    buckets,capabilities:['readFiles','writeFiles'],namePrefix:null
  }}}});
  assert.equal(B.evaluateAuthorization(policy(null),stage,prod).scopeStatus,
    'UNRESTRICTED_BUCKET_SCOPE_REPORTED');
  const cross=B.evaluateAuthorization(policy([{id:stage},{id:prod}]),stage,prod);
  assert.equal(cross.scopeStatus,'UNAPPROVED_OR_MULTIBUCKET_SCOPE');
  assert.equal(cross.providerReportedStageOnly,false);
  assert.equal(B.evaluateAuthorization(policy([{id:prod}]),stage,prod).scopeStatus,
    'UNAPPROVED_OR_MULTIBUCKET_SCOPE');
  assert.equal(cross.releaseDecision,'HOLD');
});

test('B2 v4 auditor flags privileged and insufficient file capabilities for manual review', () => {
  const B = require('../scripts/b2-key-scope-readonly-audit.cjs');
  const stage='a'.repeat(24),prod='b'.repeat(24);
  const result = caps => B.evaluateAuthorization({apiInfo:{storageApi:{allowed:{
    buckets:[{id:stage}],capabilities:caps,namePrefix:null
  }}}},stage,prod);
  const privileged=result(['readFiles','writeFiles','deleteFiles','writeKeys']);
  assert.equal(privileged.scopeStatus,'PRIVILEGED_CAPABILITIES_REQUIRE_REVIEW');
  assert.deepEqual(privileged.privilegedCapabilitiesForReview,['deleteFiles','writeKeys']);
  assert.equal(result(['readFiles']).scopeStatus,'REQUIRED_OPERATIONS_NOT_REPORTED');
  assert.equal(privileged.productionChangeAuthorized,false);
});

test('B2 v4 audit fails closed on old-format or malformed provider policies', () => {
  const B=require('../scripts/b2-key-scope-readonly-audit.cjs');
  const stage='a'.repeat(24),prod='b'.repeat(24);
  for (const response of [null,{}, {apiInfo:{storageApi:{bucketId:stage,capabilities:['readFiles']}}},
      {apiInfo:{storageApi:{allowed:{buckets:'all',capabilities:['readFiles']}}}},
      {apiInfo:{storageApi:{allowed:{buckets:[{id:stage}],capabilities:[null]}}}}]) {
    assert.equal(B.evaluateAuthorization(response,stage,prod).releaseDecision,'HOLD');
    assert.equal(B.evaluateAuthorization(response,stage,prod).scopeStatus,
      'INVALID_OR_INCOMPLETE_PROVIDER_METADATA');
  }
});

test('B2 audit treats new and bucket-management capabilities as non-routine', () => {
  const B = require('../scripts/b2-key-scope-readonly-audit.cjs');
  const stage='a'.repeat(24),prod='b'.repeat(24);
  const result = B.evaluateAuthorization({apiInfo:{storageApi:{allowed:{
    buckets:[{id:stage}], capabilities:['readFiles','writeFiles','shareFiles',
      'writeBucketRetentions','unrecognizedFuturePower'],
    namePrefix:null
  }}}},stage,prod);
  assert.equal(result.scopeStatus,'PRIVILEGED_CAPABILITIES_REQUIRE_REVIEW');
  assert.deepEqual(result.privilegedCapabilitiesForReview,
    ['shareFiles','writeBucketRetentions']);
  assert.equal(result.unrecognizedCapabilityCount,1);
  assert.doesNotMatch(JSON.stringify(result),/unrecognizedFuturePower/);
  assert.equal(result.releaseDecision,'HOLD');
  assert.equal(result.independentReviewerApproved,false);
});

test('B2 audit never echoes unknown provider capability text even if it resembles a secret', () => {
  const B = require('../scripts/b2-key-scope-readonly-audit.cjs');
  const stagingId = 'a'.repeat(24), productionId = 'b'.repeat(24);
  const marker = 'SECRET_NEVER_COPY_FROM_UNTRUSTED_PROVIDER_METADATA';
  const report = B.evaluateAuthorization({
    authorizationToken: 'SECRET_TOKEN_IN_PROVIDER_BODY',
    apiInfo: { storageApi: { allowed: {
      buckets: [{ id: stagingId }],
      capabilities: ['readFiles', 'writeFiles', marker],
      namePrefix: null
    } } }
  }, stagingId, productionId);
  assert.equal(report.scopeStatus, 'PRIVILEGED_CAPABILITIES_REQUIRE_REVIEW');
  assert.equal(report.unrecognizedCapabilityCount, 1);
  assert.deepEqual(report.privilegedCapabilitiesForReview, []);
  assert.equal(report.releaseDecision, 'HOLD');
  assert.doesNotMatch(JSON.stringify(report), /SECRET_NEVER_COPY|SECRET_TOKEN|aaaaaaaa|bbbbbbbb/);
});

test('B2 audit makes zero provider calls without explicit staging-only operator authorization', async () => {
  const B=require('../scripts/b2-key-scope-readonly-audit.cjs');
  const env={
    B2_KEY_ID:'synthetic-stage-key-id',B2_APPLICATION_KEY:'synthetic-do-not-print',
    SMART_HSR_B2_STAGING_BUCKET_ID:'a'.repeat(24),
    SMART_HSR_B2_PRODUCTION_BUCKET_ID:'b'.repeat(24),
    SMART_HSR_B2_SCOPE_AUDIT_TARGET:'staging'
  };
  let calls=0;
  const stub=async()=>{calls++;throw new Error('MUST_NOT_FETCH');};
  const first=await B.audit({env,fetchImpl:stub});
  assert.equal(first.scopeStatus,'AUTHORIZATION_OR_STAGING_INPUTS_MISSING');
  assert.equal(calls,0);
  const wrong=await B.audit({env:{...env,SMART_HSR_B2_SCOPE_AUDIT_APPROVED:'READ_ONLY_APPROVED',
    SMART_HSR_B2_STAGING_BUCKET_ID:env.SMART_HSR_B2_PRODUCTION_BUCKET_ID},fetchImpl:stub});
  assert.equal(wrong.scopeStatus,'AUTHORIZATION_OR_STAGING_INPUTS_MISSING');
  assert.equal(calls,0);
});

test('B2 authorized staging metadata audit performs exactly one pinned read-only GET',async()=>{
  const B=require('../scripts/b2-key-scope-readonly-audit.cjs');
  const stage='a'.repeat(24),prod='b'.repeat(24);
  const env={
    SMART_HSR_B2_SCOPE_AUDIT_APPROVED:'READ_ONLY_APPROVED',
    SMART_HSR_B2_SCOPE_AUDIT_TARGET:'staging',
    SMART_HSR_B2_STAGING_BUCKET_ID:stage,SMART_HSR_B2_PRODUCTION_BUCKET_ID:prod,
    B2_KEY_ID:'synthetic-stage-key-id',B2_APPLICATION_KEY:'synthetic-secret-never-log'
  };
  let calls=0;
  const fetchImpl=async(url,options)=>{
    calls++;
    assert.equal(url,'https://api.backblazeb2.com/b2api/v4/b2_authorize_account');
    assert.equal(options.method,'GET');
    assert.equal(options.redirect,'error');
    assert.equal(options.cache,'no-store');
    assert.match(options.headers.Authorization,/^Basic /);
    return {status:200,async json(){return {
      authorizationToken:'synthetic-returned-secret-never-log',
      apiInfo:{storageApi:{allowed:{buckets:[{id:stage}],
        capabilities:['readFiles','writeFiles'],namePrefix:null}}}
    };}};
  };
  const result=await B.audit({env,fetchImpl});
  assert.equal(calls,1);
  assert.equal(result.scopeStatus,'STAGING_ONLY_PROVIDER_SCOPE_REPORTED');
  assert.equal(result.releaseDecision,'HOLD');
  const clean=JSON.stringify(result);
  assert.doesNotMatch(clean,/synthetic-|aaaaaaaa|bbbbbbbb|Basic /);
});

test('B2 audit suppresses provider error messages and never prints tokens',async()=>{
  const B=require('../scripts/b2-key-scope-readonly-audit.cjs');
  const env={
    SMART_HSR_B2_SCOPE_AUDIT_APPROVED:'READ_ONLY_APPROVED',
    SMART_HSR_B2_SCOPE_AUDIT_TARGET:'staging',
    SMART_HSR_B2_STAGING_BUCKET_ID:'a'.repeat(24),
    SMART_HSR_B2_PRODUCTION_BUCKET_ID:'b'.repeat(24),
    B2_KEY_ID:'synthetic-key',B2_APPLICATION_KEY:'synthetic-secret'
  };
  const result=await B.audit({env,fetchImpl:async()=>{
    throw new Error('SECRET PROVIDER RESPONSE: synthetic-secret');
  }});
  assert.equal(result.scopeStatus,'INSPECTION_UNAVAILABLE');
  assert.equal(result.releaseDecision,'HOLD');
  assert.doesNotMatch(JSON.stringify(result),/SECRET|synthetic-/);
});
