'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createPreviewServer, safeStaticPath, apiReady, ROUTES, API_REWRITES } =
  require('../portable-preview-server.js');

function request(port, pathName, method='GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname:'127.0.0.1', port, path:pathName, method,
      headers: { Host:'localhost' },
    }, res => {
      const buffers=[];
      res.on('data',chunk=>buffers.push(chunk));
      res.on('end',()=>resolve({
        status:res.statusCode, headers:res.headers,
        body:Buffer.concat(buffers).toString('utf8'),
      }));
    });
    req.on('error',reject);req.end();
  });
}

test('Render blueprint is free, isolated, opt-in API and manually deployed', () => {
  const yaml = fs.readFileSync(path.join(__dirname,'../render.yaml'),'utf8');
  assert.match(yaml,/plan: free/);
  assert.match(yaml,/branch: deploy\/render-free-preview-v1/);
  assert.match(yaml,/autoDeployTrigger: off/);
  assert.match(yaml,/PREVIEW_API_ENABLED\s*\n\s*value: "false"/);
  assert.doesNotMatch(yaml,/PRIVATE_KEY|BEGIN PRIVATE KEY/);
  assert.doesNotMatch(yaml,/target: production/);
});

test('API routes preserve original Vercel handlers and rewrites', () => {
  for (const route of [
    '/api/admin/users','/api/admin/employees','/api/admin/platform-accounts',
    '/api/organization/context','/api/firebase-config','/api/ai/analyze',
    '/api/ai/bind-analysis','/api/storage/upload','/api/storage/read',
    '/api/storage/finalize','/api/report','/api/report/ai-review',
  ]) assert.equal(typeof ROUTES[route], 'function', route);
  for (const route of [
    '/api/lands-health','/api/lands-mutations','/api/lands-membership-status',
    '/api/lands-sso-register','/api/lands-sso-consume',
    '/api/report/root-cause','/api/report/work-order',
  ]) assert.ok(API_REWRITES[route], route);
});

test('API remains off until explicitly staged, with no fallback to production data', () => {
  const old=process.env.PREVIEW_API_ENABLED;
  const oldScope=process.env.SMART_HSR_PREVIEW_MODE;
  try {
    process.env.PREVIEW_API_ENABLED='false';
    process.env.SMART_HSR_PREVIEW_MODE='staging';
    assert.equal(apiReady(),false);
    process.env.PREVIEW_API_ENABLED='true';
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    assert.equal(apiReady(),false);
    process.env.SMART_HSR_PREVIEW_MODE='production';
    assert.equal(apiReady(),false);
  } finally {
    if (old === undefined) delete process.env.PREVIEW_API_ENABLED;
    else process.env.PREVIEW_API_ENABLED=old;
    if (oldScope === undefined) delete process.env.SMART_HSR_PREVIEW_MODE;
    else process.env.SMART_HSR_PREVIEW_MODE=oldScope;
  }
});

test('static file policy blocks hidden, server, config, and test paths', () => {
  for (const p of [
    '/api/admin/users.js','/.github/workflows/test.yml','/.env',
    '/package.json','/firebase.json','/firestore.rules','/test/suite.js',
    '/node_modules/dependency.js','/portable-preview-server.js.map',
    '/server.py','/%00/private.js','/../../api/_lib/firebaseAdmin.js',
  ]) assert.equal(safeStaticPath(p),null,p);
  assert.ok(safeStaticPath('/manager.html'));
  assert.ok(safeStaticPath('/manager-identity-command-center.css'));
  assert.ok(safeStaticPath('/vendor/react.production.min.js'));
  assert.ok(safeStaticPath('/lands/index.html'));
});

test('live Node HTTP smoke: previews work, municipal API disabled, secrets unavailable', async () => {
  const server=createPreviewServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  try {
    const health=await request(port,'/__preview/health');
    assert.equal(health.status,200);
    assert.equal(JSON.parse(health.body).mode,'preview');
    assert.equal(JSON.parse(health.body).apiEnabled,false);
    const manager=await request(port,'/manager.html');
    assert.equal(manager.status,200);
    assert.match(manager.body,/SMART HSR/);
    assert.match(manager.headers['content-type'],/text\/html/);
    const lands=await request(port,'/lands');
    assert.equal(lands.status,200);
    const archiveCSS=await request(port,'/manager-identity-command-center.css');
    assert.equal(archiveCSS.status,200);
    assert.match(archiveCSS.body,/icc-archive-search/);
    const disabled=await request(port,'/api/admin/users','GET');
    assert.equal(disabled.status,503);
    assert.equal(JSON.parse(disabled.body).error,'preview_api_disabled');
    for(const pathname of ['/api/organization/context','/api/lands-health','/package.json','/.env','/test/x.js']){
      const res=await request(port,pathname);
      assert.ok([404,503].includes(res.status),pathname+' status '+res.status);
      assert.doesNotMatch(res.body,/FIREBASE_SERVICE_ACCOUNT|PRIVATE KEY/);
    }
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
