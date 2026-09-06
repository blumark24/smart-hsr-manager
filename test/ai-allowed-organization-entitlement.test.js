'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const analyze = require('../api/ai/analyze');

const { resolvePilotOrganizationIds, ALQUNFUDHAH_ORGANIZATION_ID } = analyze._test;

// --- resolvePilotOrganizationIds: environment-aware entitlement allowlist ---

test('single configured id resolves to a one-element allowlist', () => {
  const ids = resolvePilotOrganizationIds({ SMART_HSR_AI_ALLOWED_ORGANIZATION_IDS: 'org-a' });
  assert.deepEqual(ids, ['org-a']);
});

test('multiple whitespace-padded comma-separated ids are trimmed and split', () => {
  const ids = resolvePilotOrganizationIds({ SMART_HSR_AI_ALLOWED_ORGANIZATION_IDS: ' org-a ,org-b,  org-c ' });
  assert.deepEqual(ids, ['org-a', 'org-b', 'org-c']);
});

test('unset variable in production falls back to the historical default', () => {
  const ids = resolvePilotOrganizationIds({ VERCEL_ENV: 'production' });
  assert.deepEqual(ids, [ALQUNFUDHAH_ORGANIZATION_ID]);
});

test('unset variable in preview fails closed to an empty allowlist', () => {
  const ids = resolvePilotOrganizationIds({ VERCEL_ENV: 'preview' });
  assert.deepEqual(ids, []);
});

test('empty string value fails closed in preview, not a crash', () => {
  const ids = resolvePilotOrganizationIds({ VERCEL_ENV: 'preview', SMART_HSR_AI_ALLOWED_ORGANIZATION_IDS: '' });
  assert.deepEqual(ids, []);
});

test('separators-only value fails closed in preview', () => {
  const ids = resolvePilotOrganizationIds({ VERCEL_ENV: 'preview', SMART_HSR_AI_ALLOWED_ORGANIZATION_IDS: ' , , ' });
  assert.deepEqual(ids, []);
});

test('unset variable outside any named environment fails closed', () => {
  const ids = resolvePilotOrganizationIds({});
  assert.deepEqual(ids, []);
});

test('explicit configuration takes precedence over the production default', () => {
  const ids = resolvePilotOrganizationIds({
    VERCEL_ENV: 'production',
    SMART_HSR_AI_ALLOWED_ORGANIZATION_IDS: 'staging-org-id',
  });
  assert.deepEqual(ids, ['staging-org-id']);
});

test('explicit configuration on preview enables exactly that organization', () => {
  const ids = resolvePilotOrganizationIds({
    VERCEL_ENV: 'preview',
    SMART_HSR_AI_ALLOWED_ORGANIZATION_IDS: 'staging-org-id',
  });
  assert.deepEqual(ids, ['staging-org-id']);
  assert.equal(ids.includes('some-other-org'), false);
});

// --- handler-level regression pin: the exact bug this fix closes ---

test('an organization outside the allowlist is denied with the proven error code', () => {
  const ids = resolvePilotOrganizationIds({ VERCEL_ENV: 'preview', SMART_HSR_AI_ALLOWED_ORGANIZATION_IDS: 'org-a' });
  const organizationAllowed = ids.includes('org-b');
  assert.equal(organizationAllowed, false);
});

test('an organization inside the allowlist passes the gate', () => {
  const ids = resolvePilotOrganizationIds({ VERCEL_ENV: 'preview', SMART_HSR_AI_ALLOWED_ORGANIZATION_IDS: 'org-a' });
  const organizationAllowed = ids.includes('org-a');
  assert.equal(organizationAllowed, true);
});
