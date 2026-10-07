'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(p) { return fs.readFileSync(path.join(process.cwd(), p), 'utf8'); }

test('embedded Lands runtime is explicitly gated and keeps the external bridge fallback', () => {
  const bridge = read('api/_lib/landsBridge.js');
  assert.match(bridge, /LANDS_EMBEDDED_RUNTIME === '1'/);
  assert.match(bridge, /embeddedMutation/);
  assert.match(bridge, /embeddedMembershipStatus/);
  assert.match(bridge, /embeddedSsoRegister/);
  assert.match(bridge, /LANDS_TRUSTED_API_URL/);
});

test('same-origin API routes reuse the existing organization context function', () => {
  const config = JSON.parse(read('vercel.json'));
  const map = new Map((config.rewrites || []).map(r => [r.source, r.destination]));
  assert.equal(map.get('/api/lands-mutations'), '/api/organization/context?embeddedLandsAction=mutation');
  assert.equal(map.get('/api/lands-membership-status'), '/api/organization/context?embeddedLandsAction=membership');
  assert.equal(map.get('/api/lands-sso-register'), '/api/organization/context?embeddedLandsAction=sso-register');
  assert.equal(map.get('/api/lands-sso-consume'), '/api/organization/context?embeddedLandsAction=sso-consume');
  assert.equal(map.get('/lands/'), '/lands/index.html');
});

test('workforce login routes Preview Lands users to same-origin embedded workspace', () => {
  const login = read('login.html');
  assert.match(login, /location\.origin\.replace/);
  assert.match(login, /landsUrl\.searchParams\.set\('code', handoffCode\)/);
});

test('latest Lands UI is embedded but Review Mode is opt-in only', () => {
  const ui = read('lands/index.html');
  const vm = require('node:vm');
  const start = ui.indexOf('function isReviewModeAllowed()');
  const end = ui.indexOf('function resolveLandsFirebaseConfig()', start);
  assert.ok(start >= 0 && end > start);
  const gate = ui.slice(start, end);
  const allowed = (hostname, search) => vm.runInNewContext(gate + '; isReviewModeAllowed()', {
    URLSearchParams, location: { hostname, search },
    LANDS_PRODUCTION_HOSTNAMES: ['lands-smart.vercel.app']
  });
  assert.equal(allowed('qa.vercel.app', '?review=1'), true);
  for (const [host, query] of [['qa.vercel.app',''],['qa.vercel.app','?review=0'],['lands-smart.vercel.app','?review=1'],['127.0.0.1','?review=1'],['smart-hsr.example.com','?review=1']]) {
    assert.equal(allowed(host, query), false);
  }
  assert.match(ui, /fetch\("\/api\/lands-sso-consume"/);
  assert.match(ui, /import\('\.\/client\/lands-client\.js'\)/);
});

test('embedded HTTP dispatcher is hosted inside the existing function surface', () => {
  const context = read('api/organization/context.js');
  const runtime = read('api/_lib/embeddedLandsRuntime.js');
  assert.match(context, /handleEmbeddedLandsHttp/);
  assert.match(runtime, /handleEmbeddedLandsHttp/);
  assert.match(runtime, /embeddedSsoConsume/);
  assert.match(runtime, /createTrustedLandsMutationService/);
});
