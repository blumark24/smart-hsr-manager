'use strict';
// Preview-only synthetic HTTP contract. No real token, Firebase connection,
// external HTTP request, test user creation, or Production interaction.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'api/organization/context.js'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const STAGE = 'smart-hsr-staging-blumark24';
const expectedRoutes = Object.freeze({
  '/api/lands-health': 'health',
  '/api/lands-mutations': 'mutation',
  '/api/lands-membership-status': 'membership',
  '/api/lands-sso-register': 'sso-register',
  '/api/lands-sso-consume': 'sso-consume'
});

function harness(patch = {}) {
  const calls = { verified: 0, firestore: 0, embedded: [] };
  const env = {
    VERCEL_ENV: 'preview',
    FIREBASE_WEB_CONFIG: JSON.stringify({ projectId: STAGE }),
    LANDS_EMBEDDED_RUNTIME: '1',
    ...patch
  };
  const stubs = {
    '../_lib/firebaseAdmin': {
      getDb() { calls.firestore++; throw new Error('TEST_MUST_NOT_ACCESS_FIRESTORE'); },
      getAdmin() { return { app: { options: { projectId: STAGE } } }; }
    },
    '../_lib/authz': {
      async verifyRequestToken() {
        calls.verified++;
        const error = new Error('synthetic authorization missing');
        error.statusCode = 401;
        throw error;
      },
      activeIsNotFalse() { return false; }
    },
    '../_lib/landsBridge': {
      bridgeConfigured() { throw new Error('TEST_MUST_NOT_BRIDGE_SSO'); },
      callLandsSsoRegister() { throw new Error('TEST_MUST_NOT_REGISTER_SSO'); }
    },
    '../_lib/embeddedLandsRuntime': {
      handleEmbeddedLandsHttp(req, res, action) {
        calls.embedded.push(action);
        // A stub for dispatch contract ONLY, not actual API health.
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ synthetic: true, action }));
      }
    },
    '../../platform/geo/geo-policy': { evaluateReferenceLayerAccess() { throw new Error('TEST_NO_GEO'); } },
    '../../platform/geo/geo-provider-contract': {
      createStaticReferenceExtractProvider() { throw new Error('TEST_NO_GEO'); },
      validateBbox() { throw new Error('TEST_NO_GEO'); },
      slugForOrganization() { throw new Error('TEST_NO_GEO'); }
    },
    '../../platform/geo/geo-attribution-registry': { getAttribution() { throw new Error('TEST_NO_GEO'); } }
  };
  const context = {
    module: { exports: {} }, URL, console, process: { env },
    require(specifier) {
      if (!Object.hasOwn(stubs, specifier)) throw new Error('Unexpected import: ' + specifier);
      return stubs[specifier];
    }
  };
  vm.runInNewContext(source, context, { filename: 'api/organization/context.js', timeout: 1000 });
  async function run(method, relativeUrl, options = {}) {
    const url = new URL(relativeUrl, 'https://synthetic.example.test');
    let responseText = null;
    const headers = {};
    const req = {
      method, url: url.pathname + url.search,
      query: Object.fromEntries(url.searchParams),
      headers: options.headers || {}
    };
    const res = {
      statusCode: 200,
      setHeader(name, value) { headers[name.toLowerCase()] = value; },
      end(value) { responseText = value; }
    };
    await context.module.exports(req, res);
    assert.notEqual(responseText, null, 'handler must send a response');
    return { status: res.statusCode, body: JSON.parse(responseText), headers };
  }
  async function throughRewrite(route, method = 'GET') {
    const entries = vercel.rewrites.filter(v => v.source === route);
    assert.equal(entries.length, 1, 'each public Lands route must have exactly one rewrite: ' + route);
    return run(method, entries[0].destination);
  }
  return { run, throughRewrite, calls, env };
}

test('all five Lands endpoints use same-origin context rewrites, with no new serverless function', () => {
  const routes = Object.entries(expectedRoutes);
  for (const [route, action] of routes) {
    const entries = vercel.rewrites.filter(v => v.source === route);
    assert.equal(entries.length, 1, 'unique path: ' + route);
    assert.equal(entries[0].destination, '/api/organization/context?embeddedLandsAction=' + action);
    assert.equal(fs.existsSync(path.join(root, route.slice(1) + '.js')), false, 'avoid a thirteenth API function');
  }
});

test('synthetic Preview config gate is 4/4 ready without querying personal data', async () => {
  const x = harness();
  const res = await x.run('GET', '/api/organization/context?previewGate=lands-sso');
  assert.equal(res.status, 200);
  assert.equal(res.body.service, 'lands-sso');
  assert.equal(res.body.ready, true);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body.checks)),
    { preview: true, webStaging: true, adminStaging: true, embedded: true });
  assert.equal(res.headers['cache-control'], 'private, no-store');
  assert.deepEqual(x.calls, { verified: 0, firestore: 0, embedded: [] });
  assert.equal(JSON.stringify(res.body).includes(STAGE), false, 'no environment IDs exposed');
});

test('all protected embedded actions deny on mismatched staging before any runtime invocation', async () => {
  for (const [route, action] of Object.entries(expectedRoutes)) {
    if (action === 'health') continue;
    const x = harness({ LANDS_EMBEDDED_RUNTIME: '0' });
    const res = await x.throughRewrite(route, 'POST');
    assert.equal(res.status, 503, route);
    assert.equal(res.body.error, 'staging_lands_sso_gate_not_ready', route);
    assert.deepEqual(x.calls.embedded, [], route);
    assert.equal(x.calls.firestore, 0, route);
  }
});

test('only static health dispatch can proceed with a closed Preview config gate', async () => {
  const x = harness({ FIREBASE_WEB_CONFIG: JSON.stringify({ projectId: 'production-project' }) });
  const res = await x.throughRewrite('/api/lands-health');
  assert.equal(res.status, 200, 'synthetic dispatch response; NOT a live health proof');
  assert.equal(res.body.synthetic, true);
  assert.deepEqual(x.calls.embedded, ['health']);
  assert.equal(x.calls.firestore, 0);
});

test('unauthenticated organization GET and SSO POST are denied with no data or codes', async () => {
  const x = harness();
  for (const [method, url] of [
    ['GET', '/api/organization/context'],
    ['POST', '/api/organization/context']
  ]) {
    const r = await x.run(method, url);
    assert.equal(r.status, 401);
    assert.deepEqual(JSON.parse(JSON.stringify(r.body)), { error: 'unauthenticated' });
    assert.equal(r.headers['cache-control'], 'private, no-store');
  }
  assert.equal(x.calls.verified, 2);
  assert.equal(x.calls.firestore, 0);
  assert.deepEqual(x.calls.embedded, []);
});

test('Preview diagnostics are method-scoped and unavailable in Production', async () => {
  const x = harness();
  const invalidMethod = await x.run('POST', '/api/organization/context?previewGate=lands-sso');
  assert.equal(invalidMethod.status, 405);
  const wrongName = await x.run('GET', '/api/organization/context?previewGate=hidden-debug');
  assert.equal(wrongName.status, 400);
  const production = harness({ VERCEL_ENV: 'production' });
  const unavailable = await production.run('GET', '/api/organization/context?previewGate=lands-sso');
  assert.equal(unavailable.status, 404);
  assert.deepEqual(JSON.parse(JSON.stringify(unavailable.body)), { error: 'not_found' });
  assert.equal(production.calls.firestore, 0);
});
