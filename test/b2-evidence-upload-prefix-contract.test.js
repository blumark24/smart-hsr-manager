'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildObjectKey } = require('../api/storage/upload.js')._test;

test('observation upload remains inside the B2 observations prefix', () => {
  const key = buildObjectKey({
    prefix: 'observations/', organizationId: 'org-a', observationId: 'obs-1',
    scope: 'before', extension: 'jpg', uuid: 'image-1',
  });
  assert.equal(key, 'observations/org-a/obs-1/before/image-1.jpg');
  assert.ok(key.startsWith('observations/'));
  assert.ok(key.includes('/org-a/obs-1/before/'));
  assert.ok(!key.startsWith('organizations/'));
  assert.ok(!key.includes('observations/observations/'));
});

test('unbound upload remains inside the B2 observations prefix with date scope', () => {
  const key = buildObjectKey({
    prefix: 'observations/', organizationId: 'org-b', observationId: '',
    scope: 'after', extension: 'webp', uuid: 'image-2', now: new Date('2026-08-11T00:00:00Z'),
  });
  assert.equal(key, 'observations/org-b/after/2026/08/image-2.webp');
  assert.ok(key.startsWith('observations/'));
  assert.ok(key.includes('/org-b/after/'));
  assert.ok(!key.startsWith('organizations/'));
  assert.ok(!key.includes('observations/observations/'));
});

test('operator prefix cannot move uploads outside or duplicate the contracted root', () => {
  for (const prefix of ['', 'observations', 'observations/', 'other/observations']) {
    const key = buildObjectKey({
      prefix, organizationId: 'org-c', observationId: 'obs-3',
      scope: 'after', extension: 'png', uuid: 'image-3',
    });
    assert.equal(key, 'observations/org-c/obs-3/after/image-3.png');
    assert.ok(!key.includes('observations/observations/'));
  }
});
