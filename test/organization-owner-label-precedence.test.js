'use strict';
// Owner edits organizations/{id}.name; stale organizations/{id}.organizationName
// must not override the canonical tenant label returned by the map-context API.
const test = require('node:test');
const assert = require('node:assert/strict');
const { _test: { sanitizedMapContext } } = require('../api/organization/context.js');

test('Owner-managed municipality name wins over stale legacy alias', () => {
  const context = sanitizedMapContext('org-b', 'Old Session Municipality', {
    name: 'بلدية محافظة القنفذة',
    organizationName: 'الاسم القديم',
    mapCenter: { lat: 19.12639, lng: 41.07889 },
    mapDefaultZoom: 13,
  });
  assert.equal(context.organizationName, 'بلدية محافظة القنفذة');
  assert.equal(context.organizationId, 'org-b');
  assert.deepEqual(context.mapCenter, { lat: 19.12639, lng: 41.07889 });
  assert.equal(context.mapDefaultZoom, 13);
  assert.equal(context.configured, true);
});

test('legacy organizationName remains a fallback for unedited tenants', () => {
  const context = sanitizedMapContext('org-c', 'Session Label', { organizationName: 'اسم بلدية قديم' });
  assert.equal(context.organizationName, 'اسم بلدية قديم');
  assert.equal(context.organizationId, 'org-c');
});

test('missing owner labels fall back to caller tenant label, never a different tenant', () => {
  const context = sanitizedMapContext('org-d', 'بلدية أخرى', {});
  assert.equal(context.organizationName, 'بلدية أخرى');
  assert.equal(context.organizationId, 'org-d');
});

test('map settings remain untouched when a tenant label is renamed', () => {
  const input = {
    name: 'الاسم الجديد',
    organizationName: 'الاسم السابق',
    mapCenter: { lat: 20.1, lng: 41.1 },
    mapDefaultZoom: 9,
    serviceArea: 'نطاق 1',
    mapStyle: 'standard',
    mapBounds: [[19.9, 40.9], [20.3, 41.3]]
  };
  const ctx = sanitizedMapContext('org-e', 'غير مستخدم', input);
  assert.equal(ctx.organizationName, 'الاسم الجديد');
  assert.deepEqual(ctx.mapCenter, input.mapCenter);
  assert.deepEqual(ctx.mapBounds, input.mapBounds);
  assert.equal(ctx.mapDefaultZoom, 9);
  assert.equal(ctx.serviceArea, 'نطاق 1');
});
