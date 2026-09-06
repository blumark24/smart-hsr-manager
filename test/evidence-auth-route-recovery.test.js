'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..');
const authzPath = require.resolve(path.join(root, 'api/_lib/authz.js'));
const adminPath = require.resolve(path.join(root, 'api/_lib/firebaseAdmin.js'));
const b2Path = require.resolve(path.join(root, 'api/_lib/b2Client.js'));
const realAuthz = require(authzPath);

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value; },
    on() {},
  };
}

function document(data, exists = true) {
  return { exists, data: () => data };
}

function database() {
  return {
    collection(name) {
      if (name === 'observations') {
        const query = { where: () => query, limit: () => query, get: async () => ({ empty: false }) };
        return query;
      }
      return {
        doc: id => ({
          get: async () => {
            if (name === 'owners' || name === 'managers') return document({}, false);
            if (name === 'users') return document({ role: 'inspector', active: true, organizationId: 'org-a' });
            if (name === 'organizations' && id === 'org-a') return document({ name: 'Organization A' });
            return document({}, false);
          },
        }),
      };
    },
  };
}

async function verifyRouteToken(req) {
  return realAuthz.verifyRequestToken(req, async token => {
    if (token !== 'valid-token') {
      const error = new Error('invalid project');
      error.code = 'auth/argument-error';
      throw error;
    }
    return { uid: 'inspector-a', aud: 'smart-hsr-manager' };
  });
}

require.cache[authzPath] = { exports: { ...realAuthz, verifyRequestToken: verifyRouteToken } };
require.cache[adminPath] = { exports: { getDb: database } };
require.cache[b2Path] = { exports: {
  b2Configuration: () => ({ bucket: 'private-test', endpoint: 'private', region: 'test' }),
  getS3Client: () => ({ send: async () => ({ Body: { transformToByteArray: async () => [1, 2, 3] }, ContentLength: 3 }) }),
  safeStorageFailure: () => ({ name: 'safe', status: 500 }),
} };

const storageRead = require(path.join(root, 'api/storage/read.js'));
const organizationContext = require(path.join(root, 'api/organization/context.js'));

test('valid Firebase token reaches 200 through private evidence route', async () => {
  const res = response();
  await storageRead({ method: 'GET', headers: { authorization: 'Bearer valid-token' }, query: { key: 'organizations/org-a/observations/obs-a/before/image.jpg' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'image/jpeg');
  assert.deepEqual([...res.body], [1, 2, 3]);
});

test('the same valid Firebase token reaches organization context', async () => {
  const res = response();
  await organizationContext({ method: 'GET', headers: { authorization: 'Bearer valid-token' }, query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).organizationId, 'org-a');
});

test('wrong-project token is denied by both shared-auth routes', async () => {
  for (const [handler, req] of [
    [storageRead, { method: 'GET', headers: { authorization: 'Bearer wrong-project' }, query: { key: 'organizations/org-a/image.jpg' } }],
    [organizationContext, { method: 'GET', headers: { authorization: 'Bearer wrong-project' }, query: {} }],
  ]) {
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 401);
  }
});
