'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const project = 'smart-hsr-staging-blumark24';
const staging = () => ({
  VERCEL_ENV: 'preview',
  FIREBASE_WEB_CONFIG: JSON.stringify({ projectId: project }),
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: project, private_key: 'fake' }),
  FIREBASE_PROJECT_ID: project,
  B2_KEY_ID: 'synthetic-id',
  B2_APPLICATION_KEY: 'synthetic-secret',
  B2_BUCKET_NAME: 'synthetic-stage-only',
  SMART_HSR_PREVIEW_B2_BUCKET_NAME: 'synthetic-stage-only',
  SMART_HSR_PRODUCTION_B2_BUCKET_NAME: 'synthetic-prod-other',
  B2_S3_ENDPOINT: 'synthetic.invalid',
  B2_REGION: 'synthetic-region',
});
const location = (env) => ({bucket:env.B2_BUCKET_NAME, endpoint:env.B2_S3_ENDPOINT, region:env.B2_REGION});
function load(relative, env, dependencies={}) {
  const src = fs.readFileSync(path.join(root,relative),'utf8');
  const mod={exports:{}};
  const wrapped = vm.runInNewContext('(function (require, module, process, Buffer) {\n'+src+'\n})', {}, {timeout:3000});
  wrapped((id) => {
    if (!(id in dependencies)) throw new Error('Unexpected dependency: '+id);
    return dependencies[id];
  },mod,{env},Buffer);
  return mod.exports;
}
function setup(env=staging(), opts={}) {
  const guard = load('api/_lib/previewIsolationGuard.js',env);
  const apps=opts.apps??[], stats={apps:0,clients:0,requests:0};
  const sdk={
    'firebase-admin/app':{
      initializeApp(options) {stats.apps++;return {options};},
      getApps(){return apps;}, cert(value){return {kind:'cert',value};},
      applicationDefault(){return {kind:'adc'};}
    },
    'firebase-admin/auth':{getAuth(){return {};}},
    'firebase-admin/firestore':{getFirestore(){return {};},FieldValue:{serverTimestamp(){return 1;}}},
    '@aws-sdk/client-s3':{
      S3Client: class {constructor(options){stats.clients++;this.options=options;} async send(){stats.requests++;}},
      PutObjectCommand: class {constructor(x){this.options=x;}}
    },
    './previewIsolationGuard':guard,
    '../_lib/previewIsolationGuard':guard,
    '../_lib/firebaseAdmin':{getDb(){return opts.db??{collection(){return {doc(){return {async get(){return {exists:true,data(){return {role:'inspector',active:true,organizationId:'synthetic_tenant'};}};}};}};}};},FieldValue:{serverTimestamp(){return 1;}}},
    '../_lib/authz':{async verifyRequestToken(){if(opts.tokenDenied)throw Object.assign(new Error('invalid'),{statusCode:401});return {uid:'synthetic-user'};},activeIsNotFalse(){return true;}},
    '../_lib/imageValidation':{validateImage(){return {ok:true};}},
    crypto:require('node:crypto')
  };
  return {guard,stats,fb:()=>load('api/_lib/firebaseAdmin.js',env,sdk),b2:()=>load('api/_lib/b2Client.js',env,sdk),upload:()=>load('api/storage/upload.js',env,sdk)};
}
function denied(fn, resource) {
  assert.throws(fn, error=>error.code==='PREVIEW_'+resource+'_ISOLATION_DENIED'&&error.statusCode===503);
}
test('Firebase Admin actual module denies wrong Preview backend before SDK initialization',()=>{
  const env={...staging(),FIREBASE_SERVICE_ACCOUNT:JSON.stringify({project_id:'synthetic-prod-other'})};
  const x=setup(env),fb=x.fb();
  denied(()=>fb.getAdmin(),'FIREBASE');assert.equal(x.stats.apps,0);
});
test('Firebase Admin actual module permits synthetic approved staging project',()=>{
  const x=setup(), fb=x.fb();
  assert.equal(fb.getAdmin().app.options.projectId,project);
  assert.equal(x.stats.apps,1);
});
test('Firebase Admin actual module denies pre-existing foreign app even when env is valid',()=>{
  const x=setup(staging(),{apps:[{options:{projectId:'synthetic-prod-other'}}]});
  denied(()=>x.fb().getAdmin(),'FIREBASE');assert.equal(x.stats.apps,0);
});
test('Shared B2 configuration preserves null on unsafe Preview bucket',()=>{
  const env={...staging(),SMART_HSR_PREVIEW_B2_BUCKET_NAME:'different-stage'};
  const x=setup(env);assert.equal(x.b2().b2Configuration(),null);assert.equal(x.stats.clients,0);
});
test('Shared B2 real module denies caller-supplied endpoint before SDK construction',()=>{
  const x=setup(),b2=x.b2(),cfg=b2.b2Configuration();
  denied(()=>b2.getS3Client({...cfg,endpoint:'unapproved.invalid'}),'STORAGE');
  assert.equal(x.stats.clients,0);
});
test('Shared B2 real module re-checks config before using cached S3 client',()=>{
  const x=setup(),b2=x.b2(),cfg=b2.b2Configuration();
  b2.getS3Client(cfg);assert.equal(x.stats.clients,1);
  denied(()=>b2.getS3Client({...cfg,bucket:'synthetic-prod-other'}),'STORAGE');
  assert.equal(x.stats.clients,1);
});
test('Upload module fails closed with unavailable Preview B2 configuration',()=>{
  const env={...staging(),B2_BUCKET_NAME:'synthetic-prod-other'};
  const x=setup(env);
  assert.equal(x.upload()._test.b2Configuration(),null);
  assert.equal(x.stats.clients,0);
});
test('Upload module retains usable config for isolated synthetic B2',()=>{
  const x=setup();const c=x.upload()._test.b2Configuration();
  assert.equal(c.bucket,'synthetic-stage-only');
  assert.equal(x.stats.clients,0);
});
test('Upload HTTP handler responds 401 to synthetic invalid Firebase token',async()=>{
  const x=setup(staging(),{tokenDenied:true});
  const output={statusCode:200,setHeader(){},end(body){this.body=JSON.parse(body);}};
  await x.upload()({method:'POST'},output);
  assert.equal(output.statusCode,401);
  assert.equal(output.body.error,'unauthenticated');
  assert.equal(x.stats.clients,0);
});
test('Upload HTTP handler returns safe 503 and does not call S3 on misconfigured Preview bucket',async()=>{
  const env={...staging(),SMART_HSR_PREVIEW_B2_BUCKET_NAME:'unapproved'};
  const x=setup(env);
  const output={statusCode:200,setHeader(){},end(body){this.body=JSON.parse(body);}};
  const syntheticJpeg=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,0]);
  await x.upload()({method:'POST',body:{contentType:'image/jpeg',dataBase64:syntheticJpeg.toString('base64')}},output);
  assert.equal(output.statusCode,503);
  assert.equal(output.body.error,'storage_not_configured');
  assert.equal(x.stats.clients,0);
});
