'use strict';
// Execute the real Lands browser bootstrap snippet, not a separately copied
// implementation. All Firebase functions are local, synthetic stubs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname,'..','lands/client/lands-client.js'),'utf8');
const start = source.indexOf('  const defaultApp = getApps().find(');
const end = source.indexOf('\n  const auth = getAuth(app);',start);
assert.ok(start >= 0 && end > start,'expected reviewed browser bootstrap snippet');
const snippet = source.slice(start,end);
const fn = vm.runInNewContext('(function(getApps,initializeApp,firebaseConfig){\n'+snippet+'\nreturn app;\n})',{}, {timeout:2000});
const STAGING='smart-hsr-staging-blumark24',PROD='smart-hsr-manager';
const existing=(name,projectId)=>({name,options:{projectId}});
function bootstrap(apps,projectId=STAGING){
  const observed={initializations:0,config:null};
  const app=fn(()=>apps,(config)=>{observed.initializations++;observed.config=config;return existing('[DEFAULT]',config.projectId)},{projectId});
  return {app,...observed};
}
test('refuse preinitialized DEFAULT application from a foreign project before resource access',()=>{
  for(const projectId of [PROD,'unexpected-project',undefined]){
    assert.throws(()=>bootstrap([existing('[DEFAULT]',projectId)]),/LANDS_FIREBASE_APP_PROJECT_MISMATCH/);
  }
});
test('reuse only matching DEFAULT staging application',()=>{
  const same=existing('[DEFAULT]',STAGING);
  const out=bootstrap([same]);assert.equal(out.app,same);assert.equal(out.initializations,0);
});
test('do not silently reuse a Manager-named app if no default app exists',()=>{
  const out=bootstrap([existing('smart-hsr-manager-session',PROD)]);
  assert.equal(out.app.options.projectId,STAGING);assert.equal(out.initializations,1);
});
test('select matching DEFAULT app even when another named Firebase app was initialized first',()=>{
  const defaultApp=existing('[DEFAULT]',STAGING);
  const out=bootstrap([existing('other-manager',PROD),defaultApp]);
  assert.equal(out.app,defaultApp);assert.equal(out.initializations,0);
});
test('initialize exactly one new default app when no Firebase apps exist',()=>{
  const out=bootstrap([]);assert.equal(out.initializations,1);
  assert.equal(out.config.projectId,STAGING);
});
test('existing Production app is reusable only with Production configuration',()=>{
  const same=existing('[DEFAULT]',PROD);
  const out=bootstrap([same],PROD);assert.equal(out.app,same);assert.equal(out.initializations,0);
});
test('Production boot refuses a stale staging default app',()=>{
  assert.throws(()=>bootstrap([existing('[DEFAULT]',STAGING)],PROD),/LANDS_FIREBASE_APP_PROJECT_MISMATCH/);
});
