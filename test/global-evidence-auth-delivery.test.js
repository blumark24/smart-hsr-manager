'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const storagePromise = import(pathToFileURL(path.join(root, 'storage-adapter.js')).href);
const authz = require('../api/_lib/authz.js');
const storageRead = require('../api/storage/read.js')._test;

function jwt(project) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode({ aud: project, iss: `https://securetoken.google.com/${project}` })}.signature`;
}

test('Firebase token audience and issuer must identify the same project', () => {
  assert.equal(authz.tokenProject(jwt('smart-hsr-manager')), 'smart-hsr-manager');
  const mismatched = jwt('wrong-project').split('.');
  mismatched[1] = Buffer.from(JSON.stringify({ aud: 'wrong-project', iss: 'https://securetoken.google.com/smart-hsr-manager' })).toString('base64url');
  assert.equal(authz.tokenProject(mismatched.join('.')), '');
  assert.equal(authz.tokenProject('not-a-token'), '');
});

test('valid token is accepted by Firebase Admin even when local app project metadata differs', async () => {
  const token = jwt('smart-hsr-manager');
  const calls = [];
  const decoded = await authz.verifyRequestToken({ headers: { authorization: `Bearer ${token}` } }, async (received, checkRevoked) => {
    calls.push({ received, checkRevoked });
    return { uid: 'valid-user', aud: 'smart-hsr-manager' };
  });
  assert.equal(decoded.uid, 'valid-user');
  assert.deepEqual(calls, [{ received: token, checkRevoked: true }]);
});

test('wrong-project token remains denied by Firebase Admin verification', async () => {
  const token = jwt('wrong-project');
  await assert.rejects(authz.verifyRequestToken({ headers: { authorization: `Bearer ${token}` } }, async () => {
    const error = new Error('project mismatch');
    error.code = 'auth/argument-error';
    throw error;
  }), error => error.code === 'AUTH_TOKEN_INVALID' && error.statusCode === 401);
});

test('storage read and organization context share the recovered Admin auth path', () => {
  const authzSource = read('api/_lib/authz.js');
  assert.doesNotMatch(authzSource, /tokenProject\(m\[1\]\)[\s\S]{0,200}getProjectId/);
  assert.match(authzSource, /return await verifyIdToken\(m\[1\], true\)/);
  for (const file of ['api/storage/read.js', 'api/organization/context.js']) {
    assert.match(read(file), /verifyRequestToken\(req\)/);
  }
});

test('missing Authorization fails closed with a safe code', async () => {
  await assert.rejects(authz.verifyRequestToken({ headers: {} }), error => {
    assert.equal(error.statusCode, 401);
    assert.equal(error.code, 'AUTH_HEADER_MISSING');
    return true;
  });
});

test('canonical and every legacy evidence field share tenant-scoped authorization', () => {
  assert.deepEqual([...storageRead.EVIDENCE_FIELDS], [
    'imageObjectKey', 'imagePath', 'imageUrl', 'beforeImagePath', 'afterImagePath', 'afterImageUrl'
  ]);
  assert.match(read('api/storage/upload.js'), /objectKey/);
  assert.match(read('api/storage/read.js'), /where\('organizationId', '==', organizationId\)/);
  assert.match(read('api/storage/read.js'), /AUTH_ORGANIZATION_DENIED/);
});

test('repeated render deduplicates one private evidence request', async () => {
  const { resolveServerObjectImage, revokeAllObservationImageUrls } = await storagePromise;
  const previousFetch = global.fetch;
  let requests = 0;
  global.fetch = async () => {
    requests += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    return new Response(new Blob(['image'], { type: 'image/jpeg' }), { status: 200 });
  };
  try {
    const args = {
      reference: 'organizations/org-a/observations/obs-dedupe/before/image.jpg',
      authUser: { uid: 'viewer-a', getIdToken: async () => 'valid-token' },
    };
    const [first, second] = await Promise.all([
      resolveServerObjectImage(args),
      resolveServerObjectImage(args),
    ]);
    assert.equal(first.available, true);
    assert.equal(second.url, first.url);
    assert.equal(requests, 1);
  } finally {
    revokeAllObservationImageUrls();
    global.fetch = previousFetch;
  }
});

test('Inspector, Manager, and Contractor viewers use the same authUser path', () => {
  for (const file of ['dashboard.html', 'manager.html', 'mobile-map.html']) {
    const source = read(file);
    assert.match(source, /resolveObservationImage\(\{/);
    assert.match(source, /authUser:auth(?:\?)?\.currentUser/);
    assert.doesNotMatch(source, /getIdToken:\(\)=>auth(?:\?)?\.currentUser(?:\?)?\.getIdToken\(\)/);
  }
});

test('storage reader exposes only approved safe evidence error codes', () => {
  const source = read('api/storage/read.js');
  for (const code of ['AUTH_TOKEN_INVALID', 'AUTH_ORGANIZATION_DENIED', 'EVIDENCE_NOT_FOUND', 'B2_READ_FAILED']) {
    assert.match(source, new RegExp(code));
  }
  for (const unsafe of ["error: 'unauthenticated'", "error: 'forbidden'", "error: 'storage_read_failed'", "error: 'object_not_found'"]) {
    assert.doesNotMatch(source, new RegExp(unsafe));
  }
});
