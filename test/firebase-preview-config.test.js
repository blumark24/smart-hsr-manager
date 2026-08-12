'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

function loadHandler() {
  delete require.cache[require.resolve('../api/firebase-config')];
  return require('../api/firebase-config');
}

function invoke(environment = {}) {
  const previous = { VERCEL_ENV: process.env.VERCEL_ENV, FIREBASE_WEB_CONFIG: process.env.FIREBASE_WEB_CONFIG };
  Object.assign(process.env, environment);
  const result = {};
  const res = {
    status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; }
  };
  loadHandler()({ method: 'GET' }, res);
  for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  return result;
}

test('Preview endpoint returns only the approved isolated staging project', () => {
  const config = { projectId: 'smart-hsr-staging-blumark24', apiKey: 'public-key' };
  assert.deepEqual(invoke({ VERCEL_ENV: 'preview', FIREBASE_WEB_CONFIG: JSON.stringify(config) }), { status: 200, body: config });
});

test('Preview endpoint fails closed for Production or malformed project config', () => {
  assert.equal(invoke({ VERCEL_ENV: 'production', FIREBASE_WEB_CONFIG: '{}' }).status, 404);
  assert.equal(invoke({ VERCEL_ENV: 'preview', FIREBASE_WEB_CONFIG: '{' }).status, 503);
  assert.equal(invoke({ VERCEL_ENV: 'preview', FIREBASE_WEB_CONFIG: JSON.stringify({ projectId: 'smart-hsr-manager' }) }).status, 503);
});
