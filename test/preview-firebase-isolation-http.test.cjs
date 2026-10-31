'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const previewFailure = () => Object.assign(new Error('PREVIEW_FIREBASE_ISOLATION_DENIED'), {
  code: 'PREVIEW_FIREBASE_ISOLATION_DENIED', statusCode: 503,
});
function load(relative, deps) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const mod = { exports: {} };
  const execute = vm.runInNewContext('(function(require,module,Buffer,process){\n'+source+'\n})', {
    console: { warn() {}, error() {} },
  }, {timeout:3000});
  execute((id) => {
    if (!Object.hasOwn(deps, id)) throw new Error('Unexpected dependency: '+id);
    return deps[id];
  }, mod, Buffer, {env:{VERCEL_ENV:'preview'}});
  return mod.exports;
}
function makeAuthz(failure) {
  return load('api/_lib/authz.js', {
    './firebaseAdmin': {getAuth() { return { async verifyIdToken() {throw failure;} }; }, getDb() {throw Error('Unexpected DB connection');}},
    '../../workspace-access.js': {},
  });
}
function response() {
  return {statusCode:200,body:null,setHeader(){},end(text){this.body=JSON.parse(text);}};
}
function makeHandler(pathname, authz, stats) {
  const noDb={getDb(){ stats.dbCalls++; throw Error('No database access in rejected authentication');},FieldValue:{serverTimestamp(){return 0;}}};
  const fakeB2={b2Configuration(){stats.storageCalls++;throw Error('B2 should not be called');},getS3Client(){stats.storageCalls++;throw Error('B2 should not be called');},safeStorageFailure() { return {name:'denied'}; }};
  const deps={
    'crypto':crypto,
    '../_lib/firebaseAdmin':noDb,
    '../_lib/authz':{...authz,activeIsNotFalse(){return true;},resolveMobilityRole(){return null;}},
    '../_lib/previewIsolationGuard':{isPreviewStorageIsolationConfigured(){return false;},assertPreviewStorageClientConfig(){throw Error('Unexpected storage');}},
    '../_lib/imageValidation':{validateImage(){return {ok:false};}},
    '../_lib/b2Client':fakeB2,
    '../_lib/inspectorAccess':{resolveInspectorContext(){throw Error('Unexpected inspector lookup');},evaluateObservationAccess(){throw Error('Unexpected observation lookup');}},
    '../_lib/persistedAiAnalysis':{buildPersistedAiAnalysis(){throw Error('Unexpected AI persistence');}},
    '../../platform/ai/ai-storage-boundary':{evaluateAIStorageInput(){throw Error('Unexpected storage');}},
    '../../platform/ai/provider-router':{createProviderRouter(){throw Error('Unexpected provider');}},
    '../../platform/ai/server/active-vision-provider-selector':{createActiveVisionProviderRegistration(){throw Error('Unexpected provider');}},
    '../../platform/intelligence/municipal-intelligence-engine':{createMunicipalIntelligence(){throw Error('Unexpected AI');}},
    '../_lib/aiGuard':{acquireAiOperation(){throw Error('Unexpected AI');},completeAiOperation(){throw Error('Unexpected AI');},releaseAiOperation(){throw Error('Unexpected AI');}},
  };
  return load(pathname, deps);
}
const req=method=>({method,headers:{authorization:'Bearer synthetic.test.token'}});
test('real authz preserves reviewed 503 isolation error rather than inventing 401', async()=>{
  const authz=makeAuthz(previewFailure());
  await assert.rejects(authz.verifyRequestToken(req('POST')),e=>e.code==='PREVIEW_FIREBASE_ISOLATION_DENIED'&&e.statusCode===503);
});
test('real authz still rejects missing credentials as 401', async()=>{
  const authz=makeAuthz(previewFailure());
  await assert.rejects(authz.verifyRequestToken({headers:{}}),e=>e.code==='AUTH_HEADER_MISSING'&&e.statusCode===401);
});
test('real authz still maps ordinary verification errors to AUTH_TOKEN_INVALID 401', async()=>{
  const authz=makeAuthz(Object.assign(new Error('synthetic invalid'),{code:'auth/invalid-id-token',statusCode:503}));
  await assert.rejects(authz.verifyRequestToken(req('POST')),e=>e.code==='AUTH_TOKEN_INVALID'&&e.statusCode===401);
});
test('real authz still maps expired tokens to AUTH_TOKEN_EXPIRED 401', async()=>{
  const authz=makeAuthz(Object.assign(new Error('synthetic expired'),{code:'auth/id-token-expired'}));
  await assert.rejects(authz.verifyRequestToken(req('POST')),e=>e.code==='AUTH_TOKEN_EXPIRED'&&e.statusCode===401);
});
for(const [pathname,method,expectedKey,expectedValue] of [
  ['api/storage/upload.js','POST','error','backend_unavailable'],
  ['api/storage/read.js','GET','error','BACKEND_UNAVAILABLE'],
  ['api/ai/analyze.js','POST','errorCode','AI_BACKEND_UNAVAILABLE'],
]) {
  test(pathname+' returns safe 503 for backend isolation failure, before any resource call',async()=>{
    const stats={dbCalls:0,storageCalls:0};
    const handler=makeHandler(pathname,makeAuthz(previewFailure()),stats);
    const out=response();
    await handler(req(method),out);
    assert.equal(out.statusCode,503);
    assert.equal(out.body[expectedKey],expectedValue);
    assert.equal(stats.dbCalls,0);
    assert.equal(stats.storageCalls,0);
    assert.doesNotMatch(JSON.stringify(out.body),/synthetic\.test\.token|private_key|bucket_name/);
  });
}
for(const [pathname,method] of [
  ['api/storage/upload.js','POST'],
  ['api/storage/read.js','GET'],
  ['api/ai/analyze.js','POST'],
]) {
  test(pathname+' keeps unauthenticated HTTP 401 for invalid tokens',async()=>{
    const stats={dbCalls:0,storageCalls:0};
    const handler=makeHandler(pathname,makeAuthz(Object.assign(new Error('invalid'),{code:'auth/invalid-id-token'})),stats);
    const out=response();
    await handler(req(method),out);
    assert.equal(out.statusCode,401);
    assert.equal(stats.dbCalls,0);
    assert.equal(stats.storageCalls,0);
  });
}
