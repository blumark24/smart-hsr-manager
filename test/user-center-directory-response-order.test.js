'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync(require('node:path').join(__dirname,'../manager-phase11c-user-center-core.js'),'utf8');
const start = src.indexOf('let directoryRequestGeneration=0;');
const end = src.indexOf('\nU.why=',start);
assert.ok(start>=0&&end>start,'isolated directory logic must be found');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function setup(){
  const requests=[];
  const U={cache:{org:'tenant-A',at:0,employees:[],users:[]},session:async()=>({uid:'u-1'}),org:async()=> 'tenant-A',
    post:async(url)=>{const d=deferred();requests.push({url,d});return d.promise;}};
  vm.runInNewContext(src.slice(start,end),{U,Date});
  return {U,requests};
}
async function tick(){for(let i=0;i<5;i++)await Promise.resolve()}
test('older directory responses cannot replace a newer refresh result',async()=>{
  const {U,requests}=setup();
  const first=U.dir(true);await tick();
  const second=U.dir(true);await tick();
  assert.equal(requests.length,4);
  requests[2].d.resolve({employees:[{name:'new'}]});
  requests[3].d.resolve({users:[{name:'new'}]});
  await second;
  requests[0].d.resolve({employees:[{name:'old'}]});
  requests[1].d.resolve({users:[{name:'old'}]});
  await first;
  assert.equal(U.cache.employees[0].name,'new');
  assert.equal(U.cache.users[0].name,'new');
});
test('invalidating the cache prevents a stale in-flight response from repopulating it',async()=>{
  const {U,requests}=setup();
  const pending=U.dir(true);await tick();
  U.stale();
  requests[0].d.resolve({employees:[{name:'old'}]});
  requests[1].d.resolve({users:[{name:'old'}]});
  await pending;
  assert.equal(U.cache.at,0);
  assert.equal(U.cache.employees.length,0);
});
test('failed directory request cannot clear previously displayed records',async()=>{
  const {U,requests}=setup();
  U.cache.employees=[{name:'existing'}];U.cache.users=[{name:'existing'}];
  const pending=U.dir(true);await tick();
  requests[0].d.reject(new Error('temporary_network_failure'));
  requests[1].d.resolve({users:[]});
  await assert.rejects(pending,/temporary_network_failure/);
  assert.equal(U.cache.employees[0].name,'existing');
  assert.equal(U.cache.users[0].name,'existing');
});

const enhancements = fs.readFileSync(require('node:path').join(__dirname,'../manager-phase11d-user-center-enhancements.js'),'utf8');
const helperStart = enhancements.indexOf('function showUserCenterLoadFailure(app, error, denied, retry)');
const helperEnd = enhancements.indexOf('\nasync function renderCenter(force=false)',helperStart);
assert.ok(helperStart > -1 && helperEnd > helperStart, 'load-error helper is present');
function buildFailureSurface(loaded=true) {
  const app={warning:null,html:loaded?'<div class="ucv2-header">Header</div><table>Previous users</table>':'',retries:0,
    prepend(node){this.warning=node},
    querySelector(selector){
      if(selector.includes('[data-ucv2-refresh-warning]'))return this.warning;
      if(selector.includes('.ucv2-header'))return loaded?{}:null;
      if(selector.includes('[data-retry]'))return {addEventListener:()=>this.retries++};
      return null;
    },
    get innerHTML(){return this.html},
    set innerHTML(v){this.html=v},
  };
  const doc={createElement:()=>({dataset:{},setAttribute(){},querySelector(selector){
    return selector==='[data-retry]'?{addEventListener:()=>app.retries++}:null;
  }})};
  const handler=vm.runInNewContext('('+enhancements.slice(helperStart,helperEnd)+')',
    {document:doc,esc:v=>String(v).replace(/</g,'&lt;'),U:{why:()=> 'خطأ مؤقت'}});
  return {app,handler};
}
test('temporary 503 response preserves last successfully rendered User Center and offers retry',()=>{
  const {app,handler}=buildFailureSurface();
  const before=app.innerHTML;
  assert.equal(handler(app,{status:503,message:'temporary'},false,()=>{}),'preserved');
  assert.equal(app.innerHTML,before);
  assert.match(app.warning.innerHTML,/آخر نسخة محمّلة/);
  assert.equal(app.retries,1);
});
test('403 or expired 401 session clears prior personal records instead of preserving stale UI',()=>{
  for(const status of [401,403]){
    const {app,handler}=buildFailureSurface();
    assert.equal(handler(app,{status,message:'forbidden'},true,()=>{}),'replaced');
    assert.doesNotMatch(app.innerHTML,/Previous users/);
    assert.match(app.innerHTML,/ucv2-state-denied/);
    assert.equal(app.warning,null);
  }
  assert.match(enhancements,/error.status===401\|\|error.status===403/);
});
test('first-load network error shows retry state, not an empty apparent success',()=>{
  const {app,handler}=buildFailureSurface(false);
  assert.equal(handler(app,{message:'offline'},false,()=>{}),'replaced');
  assert.match(app.innerHTML,/إعادة المحاولة/);
});

const classifierStart=enhancements.indexOf('function isUserCenterAccessDenied(error)');
const classifierEnd=enhancements.indexOf('\n// Keep the last successful directory visible',classifierStart);
assert.ok(classifierStart>-1&&classifierEnd>classifierStart,'auth denial classifier must exist');
const isDenied=vm.runInNewContext('('+enhancements.slice(classifierStart,classifierEnd)+')');
test('expired Firebase auth, missing manager session, tenant denial and 401/403 are fail-closed',()=>{
  for(const error of [
    {message:'no_session'}, {reason:'not_authenticated'}, {reason:'cross_organization_denied'},
    {code:'auth/user-token-expired'}, {code:'auth/user-disabled'},
    {status:401,message:'expired'}, {status:403,message:'forbidden'}
  ])assert.equal(isDenied(error),true,JSON.stringify(error));
  for(const error of [{status:503,message:'server'}, {reason:'request_timeout'},{message:'offline'}])
    assert.equal(isDenied(error),false,JSON.stringify(error));
});
const coreSessionStart=src.indexOf('U.session=async()=>{');
const coreSessionEnd=src.indexOf('\nU.fetchTimed=',coreSessionStart);
assert.ok(coreSessionStart>-1&&coreSessionEnd>coreSessionStart);
test('Manager UID switch or logout invalidates cached personnel records, without reusing old session',async()=>{
  const window={SmartHSRManagerSession:{getCurrentUser:()=>window.current}};
  const U={cache:{org:'tenant-A',at:123,employees:[{name:'A'}],users:[{uid:'u-a'}]}};
  const source='let sessionUid=\'\';let directoryRequestGeneration=0;'
    +src.slice(coreSessionStart,coreSessionEnd)+';this.expose=U.session;';
  vm.runInNewContext(source,{window,U});
  window.current={uid:'u-a'};
  await U.session();
  U.cache={org:'tenant-A',at:123,employees:[{name:'A'}],users:[]};
  window.current={uid:'u-b'};
  assert.equal((await U.session()).uid,'u-b');
  assert.equal(U.cache.employees.length,0);
  assert.equal(U.cache.at,0);
  U.cache={org:'tenant-B',at:99,employees:[{name:'B'}],users:[]};
  window.current=null;
  await assert.rejects(U.session(),/no_session/);
  assert.equal(U.cache.employees.length,0);
});
test('successful User Center cache is tied to user UID and tenant, even on cache-hit path',()=>{
  assert.match(enhancements,/const user=await U\.session\(\)/);
  assert.match(enhancements,/directoryCacheUid!==uid \|\| directoryCache\.org!==U\.cache\.org/);
  assert.match(enhancements,/currentUser\.uid!==uid \|\| base\.org!==U\.cache\.org/);
  assert.match(enhancements,/directoryCacheUid=uid/);
  assert.match(src,/await U\.session\(\);if\(!force&&U\.cache\.at/);
});
