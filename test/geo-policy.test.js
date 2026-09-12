'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateTwinAdmission, evaluateGeoResourceAccess, evaluateReferenceLayerAccess } = require('../platform/geo/geo-policy');
const { ROLES } = require('../platform/contracts/role-contract');

test('owner is admitted to the Twin without an organizationId (platform-wide)', () => {
  const decision = evaluateTwinAdmission({ actor: { role: ROLES.OWNER } });
  assert.equal(decision.allowed, true);
});

test('manager (mayor) is admitted to the Twin only with a resolved organizationId', () => {
  assert.equal(evaluateTwinAdmission({ actor: { role: ROLES.MANAGER } }).allowed, false);
  assert.equal(evaluateTwinAdmission({ actor: { role: ROLES.MANAGER, organizationId: 'org-a' } }).allowed, true);
});

test('supervisor (general supervisor) is admitted to the Twin at the same organization scope as today\'s authority model', () => {
  const decision = evaluateTwinAdmission({ actor: { role: ROLES.SUPERVISOR, organizationId: 'org-a' } });
  assert.equal(decision.allowed, true);
});

test('inspector (employee) and contractor are never admitted to the Twin — Operational Map only', () => {
  assert.equal(evaluateTwinAdmission({ actor: { role: ROLES.INSPECTOR, organizationId: 'org-a' } }).allowed, false);
  assert.equal(evaluateTwinAdmission({ actor: { role: ROLES.CONTRACTOR, organizationId: 'org-a' } }).allowed, false);
});

test('an actor with no resolved role is denied, never defaulted to allow', () => {
  const decision = evaluateTwinAdmission({ actor: {} });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_TWIN_ACTOR_REQUIRED');
});

test('evaluateGeoResourceAccess denies cross-organization access (tenant isolation)', () => {
  const decision = evaluateGeoResourceAccess({
    actor: { role: ROLES.MANAGER, organizationId: 'org-a' },
    resource: { organizationId: 'org-b', layerId: 'field_observations' },
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'CROSS_ORGANIZATION_DENIED');
});

test('evaluateGeoResourceAccess denies a role below a layer\'s minimum even within the correct organization', () => {
  const decision = evaluateGeoResourceAccess({
    actor: { role: ROLES.INSPECTOR, organizationId: 'org-a' },
    resource: { organizationId: 'org-a', layerId: 'lands_parcels' },
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'GEO_LAYER_ROLE_DENIED');
});

test('evaluateGeoResourceAccess allows a same-organization, sufficiently-privileged actor', () => {
  const decision = evaluateGeoResourceAccess({
    actor: { role: ROLES.INSPECTOR, organizationId: 'org-a' },
    resource: { organizationId: 'org-a', layerId: 'field_observations' },
  });
  assert.equal(decision.allowed, true);
});

test('the platform owner may access any organization\'s resources (existing organization-scope-policy behavior, reused verbatim)', () => {
  const decision = evaluateGeoResourceAccess({
    actor: { role: 'owner', organizationId: null },
    resource: { organizationId: 'org-a', layerId: 'field_observations' },
  });
  assert.equal(decision.allowed, true);
});

test('reference layers (open/global data) require an authenticated recognized role but no organization match', () => {
  assert.equal(evaluateReferenceLayerAccess({ actor: {}, layerId: 'commercial_places' }).allowed, false);
  assert.equal(evaluateReferenceLayerAccess({ actor: { role: ROLES.CONTRACTOR }, layerId: 'commercial_places' }).allowed, true);
});
