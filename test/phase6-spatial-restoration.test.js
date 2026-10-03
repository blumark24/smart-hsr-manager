'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function loadHandler(records = {}, authError = null) {
  const db = { collection: name => ({ doc: uid => ({ get: async () => {
    const data = records[name + '/' + uid];
    return { exists: data !== undefined, data: () => data };
  } }) }) };
  const context = { module: { exports: {} }, URL,
    require: name => {
      if (name === '../_lib/firebaseAdmin') return { getDb: () => db };
      if (name === '../_lib/authz') return {
        verifyRequestToken: async () => { if (authError) throw authError; return { uid: 'actor' }; },
        activeIsNotFalse: data => data.active !== false,
      };
      if (name === '../_lib/landsBridge') return { bridgeConfigured: () => false };
      return require(path.resolve(root, 'api/organization', name));
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'api/organization/context.js'), 'utf8'), context);
  return context.module.exports;
}
const org = 'CnlVlKC7UcDMp2NZzjjT';
const manager = { 'managers/actor': { role: 'manager', active: true, organizationId: org } };
async function request(handler, query = {}) {
  const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
  await handler({ method: 'GET', query }, res);
  return res;
}
for (const layer of ['commercial_places', 'buildings']) {
  test(layer + ': real attributed data is returned in the map response shape', async () => {
    const res = await request(loadHandler(manager), { geoLayer: layer, bbox: '41.065,19.118,41.093,19.136' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.organizationId, org);
    assert.equal(res.body.geoLayer, layer);
    assert.ok(res.body.entities.length > 0);
    assert.equal(res.body.count, res.body.entities.length);
    assert.ok(res.body.attributions.length > 0);
    for (const entity of res.body.entities) {
      assert.equal(entity.truthLevel, 'GEOGRAPHIC_REFERENCE');
      assert.equal(entity.status, null);
      assert.equal(entity.organizationId, null);
    }
  });
  test(layer + ': client organization and role cannot cross tenant scope', async () => {
    const res = await request(loadHandler(manager), { organizationId: 'other-org', role: 'owner', geoLayer: layer, bbox: '41,19,42,20' });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_organization_denied');
  });
}
test('unknown municipality returns honest empty layers', async () => {
  const res = await request(loadHandler({ 'managers/actor': { role: 'manager', organizationId: 'other-org' } }), { geoLayer: 'buildings', bbox: '41,19,42,20' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.organizationId, 'other-org');
  assert.deepEqual(res.body.entities, []);
});
test('normal context GET retains its original response contract', async () => {
  const res = await request(loadHandler(manager));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.organizationId, org);
  assert.deepEqual(res.body.mapCenter, { lat: 19.12639, lng: 41.07889 });
  assert.equal(res.body.entities, undefined);
});

test('current Al Qunfudhah municipality record keeps the safe approximate-center fallback even after organization re-provisioning', async () => {
  const currentOrg = 'q5dj1a3Zo0aDlcdtpHtE';
  const records = {
    'managers/actor': { role: 'manager', active: true, organizationId: currentOrg, organizationName: 'بلدية محافظة القنفذة' },
    ['organizations/' + currentOrg]: { name: 'بلدية محافظة القنفذة' },
  };
  const res = await request(loadHandler(records));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.organizationId, currentOrg);
  assert.deepEqual(res.body.mapCenter, { lat: 19.12639, lng: 41.07889 });
  assert.equal(res.body.mapDefaultZoom, 13);
  assert.equal(res.body.configured, false);
});

test('non-Al Qunfudhah organizations never inherit the pilot fallback', async () => {
  const otherOrg = 'other-org';
  const records = {
    'managers/actor': { role: 'manager', active: true, organizationId: otherOrg, organizationName: 'بلدية أخرى' },
    ['organizations/' + otherOrg]: { name: 'بلدية أخرى' },
  };
  const res = await request(loadHandler(records));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.organizationId, otherOrg);
  assert.equal(res.body.mapCenter, null);
  assert.equal(res.body.mapDefaultZoom, null);
  assert.equal(res.body.configured, false);
});
test('disabled account is denied before reference lookup', async () => {
  const res = await request(loadHandler({ 'managers/actor': { role: 'manager', active: false, organizationId: org } }), { geoLayer: 'buildings', bbox: '41,19,42,20' });
  assert.equal(res.statusCode, 403);
});
test('authentication rejection is retained on the restored query path', async () => {
  const res = await request(loadHandler(manager, Object.assign(new Error('revoked'), { statusCode: 401 })), { geoLayer: 'buildings', bbox: '41,19,42,20' });
  assert.equal(res.statusCode, 401);
});
test('tenant-owned municipal layers cannot be read through the reference allowlist', async () => {
  const res = await request(loadHandler(manager), { geoLayer: 'lands_parcels', bbox: '41,19,42,20' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'geo_layer_unsupported');
});
test('owner-selected nonexistent organization remains denied', async () => {
  const res = await request(loadHandler({ 'owners/actor': { active: true } }), { organizationId: 'missing', geoLayer: 'buildings', bbox: '41,19,42,20' });
  assert.equal(res.statusCode, 404);
});
for (const bbox of [undefined, 'bad', '41,19,41,20', '200,19,201,20']) {
  test('invalid bbox fails closed: ' + bbox, async () => {
    const res = await request(loadHandler(manager), { geoLayer: 'buildings', bbox });
    assert.equal(res.statusCode, 400);
  });
}
test('Twin admission and organization continuity retain the existing shared policy', () => {
  const sandbox = { URL, Buffer };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'geo-core.bundle.js'), 'utf8'), sandbox);
  const { policy, continuity } = sandbox.SmartHSRGeoCore;
  assert.equal(policy.evaluateTwinAdmission({ actor: { role: 'manager', organizationId: org } }).allowed, true);
  for (const role of ['supervisor', 'inspector', 'contractor', 'employee', 'unknown']) {
    assert.equal(policy.evaluateTwinAdmission({ actor: { role, organizationId: org } }).allowed, false);
  }
  const result = continuity.buildContinuityUrl('/twin.html?preview=1', { organizationId: org, camera: { center: [41.07,19.12], zoom: 13 } });
  assert.ok(result.url);
  const url = new URL(result.url, 'https://preview.example');
  assert.equal(url.pathname, '/twin.html');
  assert.equal(url.searchParams.get('preview'), '1');
  const decoded = continuity.decodeContinuityContext(url.searchParams.get(continuity.CONTINUITY_PARAM));
  assert.equal(decoded.context.organizationId, org);
});
test('restored Twin uses existing Firebase session configuration and admission gate', () => {
  const twin = fs.readFileSync(path.join(root, 'twin.html'), 'utf8');
  assert.match(twin, /resolveFirebaseConfig/);
  assert.match(twin, /getAuth\(app\)/);
  assert.match(twin, /initializeApp\(firebaseConfig, 'smart-hsr-manager-session'\)/);
  assert.match(twin, /policy\.evaluateTwinAdmission/);
  assert.match(twin, /if \(!admission.allowed\)/);
  assert.match(twin, /continuity\.buildContinuityUrl\('\/operational-map.html' \+ location.search/);
  assert.doesNotMatch(twin, /signInWithEmailAndPassword|createUserWithEmailAndPassword/);
});
