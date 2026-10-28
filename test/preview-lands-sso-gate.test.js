'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { _test: { previewLandsSsoGate } } = require('../api/organization/context');

const staging = 'smart-hsr-staging-blumark24';
const env = overrides => ({
  VERCEL_ENV: 'preview',
  FIREBASE_WEB_CONFIG: JSON.stringify({ projectId: staging }),
  LANDS_EMBEDDED_RUNTIME: '1',
  ...overrides,
});

const app = projectId => ({ options: { projectId } });
const run = (overrides, id = staging) =>
  previewLandsSsoGate({ env: env(overrides), appFactory: () => app(id) });

test('Preview handoff gate passes only when both Firebase projects and embedded mode match staging', () => {
  const ok = run({});
  assert.equal(ok.ready, true);
  assert.deepEqual(ok.checks, { preview:true, webStaging:true, adminStaging:true, embedded:true });
});

test('Preview gate fails closed when frontend, backend, or embedded mode diverges', () => {
  const cases = [
    [{ FIREBASE_WEB_CONFIG: JSON.stringify({ projectId:'smart-hsr-manager' }) }, staging],
    [{ FIREBASE_WEB_CONFIG: '{"bad_json":' }, staging],
    [{ FIREBASE_WEB_CONFIG: '' }, staging],
    [{ LANDS_EMBEDDED_RUNTIME: undefined }, staging],
    [{ LANDS_EMBEDDED_RUNTIME: '0' }, staging],
    [{}, 'smart-hsr-manager'],
    [{ VERCEL_ENV: 'production' }, staging],
    [{ VERCEL_ENV: 'development' }, staging],
  ];
  for (const [envPatch, adminProject] of cases) {
    const result = run(envPatch, adminProject);
    assert.equal(result.ready, false, JSON.stringify(envPatch));
  }
  const invalidAdmin = previewLandsSsoGate({
    env: env({}),
    appFactory() { throw new Error('invalid-admin'); },
  });
  assert.equal(invalidAdmin.ready, false);
  assert.equal(invalidAdmin.checks.adminStaging, false);
});

test('Preview gate discloses no credentials, tenant data, service account, or identifiers', () => {
  const result = run({});
  assert.deepEqual(Object.keys(result).sort(), ['checks', 'ready']);
  assert.deepEqual(Object.keys(result.checks).sort(), ['adminStaging', 'embedded', 'preview', 'webStaging']);
  assert.equal(JSON.stringify(result).includes(staging), false);
});

test('Same-origin embedded actions and SSO registration must fail closed on mismatched Preview settings', () => {
  const source = read('api/organization/context.js');
  const start = source.indexOf('async function handler(req, res) {');
  assert.ok(start > -1);
  const handler = source.slice(start);
  assert.match(source, /async function handleLandsSsoHandoff[\s\S]*staging_lands_sso_gate_not_ready/);
  assert.match(handler, /embeddedLandsAction !== 'health' && !previewLandsSsoGate\(\)\.ready/);
  assert.match(handler, /staging_lands_sso_gate_not_ready/);
  assert.match(handler, /gateRequested !== 'lands-sso'/);
  assert.match(handler, /process\.env\.VERCEL_ENV !== 'preview'/);
  assert.match(handler, /gate\.ready \? 200 : 503/);
  assert.ok(handler.indexOf('if (gateRequested)') < handler.indexOf('if (embeddedLandsAction)'));
  assert.doesNotMatch(source.slice(start, handler.indexOf('const weatherRequested') + start), /setDoc\(|updateDoc\(|createUser\(|signInWith/);
});

test('Production preflight remains inaccessible without mutating live identities', async () => {
  const handler = require('../api/organization/context');
  const old = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  try {
    let status = null, payload = null;
    const res = {
      setHeader() {},
      end(body) { payload = JSON.parse(body); },
      set statusCode(v) { status = v; },
    };
    await handler({method:'GET',query:{previewGate:'lands-sso'},url:'/?previewGate=lands-sso'},res);
    assert.equal(status,404);
    assert.deepEqual(payload,{error:'not_found'});
  } finally {
    if (old === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = old;
  }
});
