'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE_PATH = path.join(__dirname, '..', 'firebase-runtime-config.js');

function loadModule({ hostname, fetchImpl }) {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8');
  const transpiled = source
    .replace('export async function resolveFirebaseConfig()', 'async function resolveFirebaseConfig()')
    + '\nmodule.exports = { resolveFirebaseConfig, PRODUCTION_FIREBASE_CONFIG };\n';

  const calls = [];
  const wrappedFetch = (...args) => {
    calls.push(args);
    return fetchImpl(...args);
  };

  const sandbox = {
    module: { exports: {} },
    location: { hostname },
    fetch: wrappedFetch,
    Object,
    Error,
    console
  };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(transpiled, sandbox, { filename: SOURCE_PATH });
  return { exportsObj: sandbox.module.exports, calls };
}

function neverCalledFetch() {
  throw new Error('fetch should not be called for this hostname');
}

test('production alias smart-hsr-manager.vercel.app resolves the hardcoded production config without calling fetch', async () => {
  const { exportsObj, calls } = loadModule({ hostname: 'smart-hsr-manager.vercel.app', fetchImpl: neverCalledFetch });
  const config = await exportsObj.resolveFirebaseConfig();
  assert.equal(config.projectId, 'smart-hsr-manager');
  assert.equal(calls.length, 0);
});

test('production alias smart-hsr-manager-blumark24-os.vercel.app resolves the hardcoded production config without calling fetch', async () => {
  const { exportsObj, calls } = loadModule({ hostname: 'smart-hsr-manager-blumark24-os.vercel.app', fetchImpl: neverCalledFetch });
  const config = await exportsObj.resolveFirebaseConfig();
  assert.equal(config.projectId, 'smart-hsr-manager');
  assert.equal(calls.length, 0);
});

test('non-vercel.app hostnames (custom domain / local dev) resolve the hardcoded production config without calling fetch', async () => {
  const { exportsObj, calls } = loadModule({ hostname: 'localhost', fetchImpl: neverCalledFetch });
  const config = await exportsObj.resolveFirebaseConfig();
  assert.equal(config.projectId, 'smart-hsr-manager');
  assert.equal(calls.length, 0);
});

test('other *.vercel.app preview hostnames still fetch /api/firebase-config and return the staging config', async () => {
  const stagingConfig = { projectId: 'smart-hsr-staging-blumark24', apiKey: 'preview-key' };
  const { exportsObj, calls } = loadModule({
    hostname: 'smart-hsr-manager-8f3lomc1s-blumark24-os.vercel.app',
    fetchImpl: async () => ({ ok: true, json: async () => stagingConfig })
  });
  const config = await exportsObj.resolveFirebaseConfig();
  assert.deepEqual(config, stagingConfig);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/firebase-config');
});

test('preview path still throws FIREBASE_PREVIEW_CONFIG_UNAVAILABLE on non-ok response', async () => {
  const { exportsObj } = loadModule({
    hostname: 'smart-hsr-manager-8f3lomc1s-blumark24-os.vercel.app',
    fetchImpl: async () => ({ ok: false, json: async () => ({}) })
  });
  await assert.rejects(exportsObj.resolveFirebaseConfig(), /FIREBASE_PREVIEW_CONFIG_UNAVAILABLE/);
});

test('preview path still throws FIREBASE_PREVIEW_PROJECT_DENIED on wrong projectId', async () => {
  const { exportsObj } = loadModule({
    hostname: 'smart-hsr-manager-8f3lomc1s-blumark24-os.vercel.app',
    fetchImpl: async () => ({ ok: true, json: async () => ({ projectId: 'smart-hsr-manager' }) })
  });
  await assert.rejects(exportsObj.resolveFirebaseConfig(), /FIREBASE_PREVIEW_PROJECT_DENIED/);
});
