'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLE_VALUES } = require('../platform/contracts/role-contract');
const { ACCOUNT_COLLECTION_BY_ROLE, KNOWN_DEPLOYMENT_DEVIATIONS, resolveAccountCollection, findKnownDeviation } = require('../platform/contracts/rbac-deployment-conformance');

test('every verified role resolves to its deployed account collection', () => {
  assert.equal(resolveAccountCollection('owner').metadata.collection, 'owners');
  assert.equal(resolveAccountCollection('manager').metadata.collection, 'managers');
  assert.equal(resolveAccountCollection('supervisor').metadata.collection, 'users');
  assert.equal(resolveAccountCollection('inspector').metadata.collection, 'users');
  assert.equal(resolveAccountCollection('contractor').metadata.collection, 'users');
});

test('unrecognized role is denied rather than defaulted', () => {
  const result = resolveAccountCollection('assistant');
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ROLE_NOT_RECOGNIZED');
});

test('the account-collection map covers every verified role and no others', () => {
  assert.deepEqual(Object.keys(ACCOUNT_COLLECTION_BY_ROLE).sort(), [...ROLE_VALUES].sort());
});

test('known deployment deviations are frozen and reference a verified role', () => {
  assert.equal(Object.isFrozen(KNOWN_DEPLOYMENT_DEVIATIONS), true);
  assert.ok(KNOWN_DEPLOYMENT_DEVIATIONS.length >= 1);
  for (const entry of KNOWN_DEPLOYMENT_DEVIATIONS) {
    assert.equal(Object.isFrozen(entry), true);
    assert.equal(ROLE_VALUES.includes(entry.role), true);
    assert.equal(typeof entry.description, 'string');
    assert.ok(entry.description.length > 0);
  }
});

test('the inspector direct-completion deviation is findable by id', () => {
  const entry = findKnownDeviation('INSPECTOR_DIRECT_COMPLETION');
  assert.ok(entry);
  assert.equal(entry.role, 'inspector');
  assert.equal(entry.modeledInWorkflowPolicy, false);
});

test('an unknown deviation id resolves to null', () => {
  assert.equal(findKnownDeviation('DOES_NOT_EXIST'), null);
});

test('module exports are frozen', () => {
  const conformance = require('../platform/contracts/rbac-deployment-conformance');
  assert.equal(Object.isFrozen(conformance), true);
  assert.equal(Object.isFrozen(conformance.ACCOUNT_COLLECTION_BY_ROLE), true);
});
