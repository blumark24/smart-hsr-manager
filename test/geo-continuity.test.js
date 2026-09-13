'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createContinuityContext, encodeContinuityContext, decodeContinuityContext, buildContinuityUrl,
} = require('../platform/geo/geo-continuity');

test('a continuity context requires an organizationId', () => {
  const decision = createContinuityContext({}).decision;
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_CONTINUITY_ORGANIZATION_REQUIRED');
});

test('encode/decode round-trips the entity id, layer id, organization, and camera target', () => {
  const { context } = createContinuityContext({
    organizationId: 'org-a', entityId: 'overture:building:xyz', layerId: 'buildings',
    camera: { center: [41.07, 19.12], zoom: 17 },
  });
  const encoded = encodeContinuityContext(context);
  const { decision, context: decoded } = decodeContinuityContext(encoded);
  assert.equal(decision.allowed, true);
  assert.deepEqual(decoded, context);
});

test('decoding garbage never throws and never invents a fallback context', () => {
  const { decision, context } = decodeContinuityContext('not-valid-json%%%');
  assert.equal(decision.allowed, false);
  assert.equal(context, null);
});

test('buildContinuityUrl preserves an existing query param (e.g. ?useEmulators=1) on the destination page', () => {
  const { context } = createContinuityContext({ organizationId: 'org-a', entityId: 'e1' });
  const { decision, url } = buildContinuityUrl('/twin.html?useEmulators=1', context);
  assert.equal(decision.allowed, true);
  assert.match(url, /^\/twin\.html\?/);
  assert.match(url, /useEmulators=1/);
  assert.match(url, /geoContext=/);
});
