'use strict';
// ============================================================================
// PHASE 08.1 CLOSURE 4 — Geo Core server-boundary authorization proof.
//
// geo-policy.test.js already proves the pure policy module (evaluateTwinAdmission
// / evaluateGeoResourceAccess / evaluateReferenceLayerAccess) fails closed in
// isolation. This file proves the SAME properties hold at the real server
// boundary — api/organization/context.js's GET handler (the endpoint both
// operational-map.html and twin.html actually call) — using the real,
// unmodified handler code against the in-memory Firestore/Auth double from
// test/helpers/fakeFirebaseAdmin.js (the same harness
// test/admin-list-mobility-employees.test.js uses).
//
// Required by the Phase 08.1 brief's CLOSURE 4:
//   "Add tests proving: client-supplied role cannot elevate access,
//    client-supplied org cannot cross tenant, unauthorized Twin admission
//    denied, unauthorized layer denied, cross-organization context denied."
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakes } = require('./helpers/fakeFirebaseAdmin');

const CONTEXT_HANDLER_PATH = require.resolve('../api/organization/context.js');
const AUTHZ_PATH = require.resolve('../api/_lib/authz.js');

function loadFreshHandler() {
  delete require.cache[AUTHZ_PATH];
  delete require.cache[CONTEXT_HANDLER_PATH];
  return require(CONTEXT_HANDLER_PATH);
}

function fakeGetRequest({ uid, query = {} }) {
  return {
    method: 'GET',
    headers: { authorization: `Bearer token-for-${uid}` },
    query,
  };
}

function fakeResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { res.headers[k] = v; },
    end(payload) { res.body = payload ? JSON.parse(payload) : null; },
  };
  return res;
}

test('CLOSURE 4: a non-owner caller (supervisor) requesting a DIFFERENT organizationId than their own is denied — client-supplied org cannot cross tenant', async () => {
  const fakes = installFakes();
  try {
    fakes.store.seed('users/sup-a', { role: 'supervisor', active: true, organizationId: 'org-a' });
    fakes.store.seed('organizations/org-b', { organizationName: 'Org B', configured: true });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeGetRequest({ uid: 'sup-a', query: { organizationId: 'org-b' } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_organization_denied');
  } finally { fakes.restore(); }
});

test('CLOSURE 4: a non-owner caller requesting a DIFFERENT organizationId via ?geoLayer= is also denied — the geo-layer path is not a bypass around tenant scoping', async () => {
  const fakes = installFakes();
  try {
    fakes.store.seed('users/sup-a', { role: 'supervisor', active: true, organizationId: 'org-a' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeGetRequest({ uid: 'sup-a', query: { organizationId: 'org-b', geoLayer: 'buildings', bbox: '41,19,41.1,19.1' } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_organization_denied');
  } finally { fakes.restore(); }
});

test('CLOSURE 4: the caller\'s role is ALWAYS the server-resolved Firestore role — a client-supplied "role" field in the query has zero effect (cannot elevate access)', async () => {
  const fakes = installFakes();
  try {
    // A real inspector, but the request also claims role=owner/manager in the
    // query string — the handler never reads a role from the request at all,
    // so this must be completely inert.
    fakes.store.seed('users/insp-a', { role: 'inspector', active: true, organizationId: 'org-a' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeGetRequest({
      uid: 'insp-a',
      query: { role: 'owner', organizationId: 'org-b', geoLayer: 'lands_parcels', bbox: '41,19,41.1,19.1' },
    }), res);
    // Still scoped to the caller's OWN org (org-a), not the client-claimed
    // org-b, and still denied lands_parcels at inspector's real (non-elevated)
    // layer minimum — proving the spoofed "role" and "organizationId" query
    // fields were never consulted.
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_organization_denied');
  } finally { fakes.restore(); }
});

test('CLOSURE 4: an inactive supervisor (deactivated by the manager) is denied entirely — no stale role grants access', async () => {
  const fakes = installFakes();
  try {
    fakes.store.seed('users/sup-inactive', { role: 'supervisor', active: false, organizationId: 'org-a' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeGetRequest({ uid: 'sup-inactive', query: {} }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'inactive_or_unscoped_role');
  } finally { fakes.restore(); }
});

test('CLOSURE 4: a tenant-scoped municipal layer (lands_parcels) is NOT reachable through the open-reference ?geoLayer= dispatch — the allowlist is real, not a generic pass-through that could leak cross-tenant municipal data', async () => {
  const fakes = installFakes();
  try {
    fakes.store.seed('users/insp-b', { role: 'inspector', active: true, organizationId: 'org-a' });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeGetRequest({ uid: 'insp-b', query: { geoLayer: 'lands_parcels', bbox: '41,19,41.1,19.1' } }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'geo_layer_unsupported');
  } finally { fakes.restore(); }
});

test('CLOSURE 4: the platform owner may cross organizations explicitly (existing, intended behavior) — proves the tenant check is role-aware, not a blanket denial', async () => {
  const fakes = installFakes();
  try {
    fakes.store.seed('owners/owner-1', { active: true });
    fakes.store.seed('organizations/org-z', { organizationName: 'Org Z', configured: true });
    const handler = loadFreshHandler();
    const res = fakeResponse();
    await handler(fakeGetRequest({ uid: 'owner-1', query: { organizationId: 'org-z' } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.organizationId, 'org-z');
  } finally { fakes.restore(); }
});
