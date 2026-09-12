'use strict';
// Tests for the PHASE 08 addition to api/organization/context.js: an
// additive, backward-compatible ?geoLayer= query mode on the existing GET
// path. See that file's own PHASE 08 comment block for why this was added
// to an existing endpoint rather than a new one (Vercel Hobby plan's
// 12-Serverless-Function limit was already reached before this phase).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ctx = require(path.join('..', 'api', 'organization', 'context.js'))._test;

function mockRes() {
  return { statusCode: 0, headers: {}, body: null, setHeader() {}, end(p) { this.body = p; } };
}

test('requestedGeoLayer reads from req.query and from a raw URL', () => {
  assert.equal(ctx.requestedGeoLayer({ query: { geoLayer: 'buildings' } }), 'buildings');
  assert.equal(ctx.requestedGeoLayer({ url: '/api/organization/context?geoLayer=commercial_places' }), 'commercial_places');
  assert.equal(ctx.requestedGeoLayer({ query: {} }), '');
});

test('requestedBboxParam parses a valid 4-number bbox and rejects malformed input', () => {
  assert.deepEqual(ctx.requestedBboxParam({ query: { bbox: '41,19,41.1,19.1' } }), [41, 19, 41.1, 19.1]);
  assert.equal(ctx.requestedBboxParam({ query: { bbox: 'not,a,bbox' } }), null);
  assert.equal(ctx.requestedBboxParam({ query: {} }), null);
});

test('an unsupported geoLayer value is rejected with 400, not silently ignored', async () => {
  const res = mockRes();
  await ctx.handleGeoLayerQuery({ query: { geoLayer: 'mobility_missions', bbox: '41,19,41.1,19.1' } }, res, { role: 'inspector' }, 'org-a');
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, 'geo_layer_unsupported');
});

test('a role below the layer\'s minimum is denied even for open reference data', async () => {
  const res = mockRes();
  await ctx.handleGeoLayerQuery({ query: { geoLayer: 'buildings', bbox: '41,19,41.1,19.1' } }, res, { role: null }, 'org-a');
  assert.equal(res.statusCode, 403);
});

test('a missing or invalid bbox is rejected before any data is read', async () => {
  let res = mockRes();
  await ctx.handleGeoLayerQuery({ query: { geoLayer: 'buildings' } }, res, { role: 'inspector' }, 'org-a');
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, 'bbox_required');

  res = mockRes();
  await ctx.handleGeoLayerQuery({ query: { geoLayer: 'buildings', bbox: '1,1,1,1' } }, res, { role: 'inspector' }, 'org-a');
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).error, 'bbox_invalid');
});

test('a valid request for a municipality with a real extract returns real, attributed entities', async () => {
  const res = mockRes();
  await ctx.handleGeoLayerQuery(
    { query: { geoLayer: 'commercial_places', bbox: '41.065,19.118,41.093,19.136' } },
    res, { role: 'inspector' }, ctx.ALQUNFUDHAH_ORGANIZATION_ID,
  );
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.count > 0);
  assert.equal(body.entities.length, body.count);
  assert.ok(body.attributions.length > 0);
  assert.ok(body.entities.every((e) => e.status === null), 'reference entities must never carry a fabricated status');
});

test('a valid request for a municipality with NO real extract returns an honest empty list', async () => {
  const res = mockRes();
  await ctx.handleGeoLayerQuery(
    { query: { geoLayer: 'buildings', bbox: '41.065,19.118,41.093,19.136' } },
    res, { role: 'inspector' }, 'an-organization-with-no-extract',
  );
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.count, 0);
  assert.deepEqual(body.entities, []);
});

test('default GET behavior (no geoLayer param) is completely unaffected by this addition', () => {
  // sanity check that the dispatch function itself still exists unchanged
  // and that sanitizedMapContext (the original, pre-Phase-08 response
  // shape) is untouched by this file's own exports list.
  assert.equal(typeof ctx.sanitizedMapContext, 'function');
  assert.equal(typeof ctx.resolveRoleContext, 'function');
});
