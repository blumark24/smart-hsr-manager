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
  const fn=vm.runInNewContext('(function(require,module,process,Buffer){'+source+'\n})',{});
  fn(mod,name=>{assert.ok(Object.hasOwn(dependencies,name),'unexpected dependency '+name);return dependencies[name];},
    {env:{VERCEL_ENV:'preview'}},Buffer);
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
