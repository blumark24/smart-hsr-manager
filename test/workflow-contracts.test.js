'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateOrganizationScope } = require('../platform/policies/organization-scope-policy');
const { evaluateAssignmentOwnership } = require('../platform/policies/assignment-ownership-policy');
const {
  OBSERVATION_STATUSES,
  TRANSITION_MATRIX,
  evaluateTransition,
} = require('../platform/policies/observation-workflow-policy');

const ORG_A = 'org-a';
const ORG_B = 'org-b';

const actor = (role, uid, organizationId = ORG_A) => ({ role, uid, organizationId });
const observation = (overrides = {}) => ({
  id: 'observation-1',
  organizationId: ORG_A,
  createdByUid: 'inspector-a',
  assignedContractorUid: 'contractor-a',
  status: 'PENDING',
  ...overrides,
});
const assignment = (overrides = {}) => ({
  id: 'assignment-1',
  organizationId: ORG_A,
  contractorId: 'contractor-a',
  observationId: 'observation-1',
  active: true,
  current: true,
  ...overrides,
});

test('status contract contains only statuses found in the current repository', () => {
  assert.deepEqual(OBSERVATION_STATUSES, ['PENDING', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED']);
  assert.deepEqual(Object.keys(TRANSITION_MATRIX), OBSERVATION_STATUSES);
});

test('organization scope allows an exact organization match', () => {
  assert.deepEqual(evaluateOrganizationScope({
    actor: actor('inspector', 'inspector-a'),
    resource: observation(),
  }), {
    allowed: true,
    reason: 'The authenticated and resource organizations match.',
    code: 'ORGANIZATION_MATCH',
  });
});

test('cross-organization access is denied', () => {
  const result = evaluateOrganizationScope({
    actor: actor('manager', 'manager-a'),
    resource: observation({ organizationId: ORG_B }),
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'CROSS_ORGANIZATION_DENIED');
});

test('missing authenticated organization context is denied', () => {
  const result = evaluateOrganizationScope({
    actor: actor('contractor', 'contractor-a', ''),
    resource: observation(),
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'AUTHENTICATED_ORGANIZATION_REQUIRED');
});

test('missing resource organization is denied', () => {
  const result = evaluateOrganizationScope({
    actor: actor('manager', 'manager-a'),
    resource: observation({ organizationId: '' }),
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'RESOURCE_ORGANIZATION_REQUIRED');
});

test('existing platform owner role has explicit cross-organization scope only', () => {
  const result = evaluateOrganizationScope({
    actor: actor('owner', 'owner-a', ''),
    resource: observation({ organizationId: ORG_B }),
  });
  assert.equal(result.allowed, true);
  assert.equal(result.code, 'PLATFORM_OWNER_SCOPE');
});

test('platform owner scope does not grant an operational transition', () => {
  const result = evaluateTransition({
    actor: actor('owner', 'owner-a', ''),
    observation: observation(),
    toStatus: 'IN_PROGRESS',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ROLE_TRANSITION_DENIED');
});

test('contractor cannot start an unassigned observation', () => {
  const result = evaluateTransition({
    actor: actor('contractor', 'contractor-a'),
    observation: observation({ assignedContractorUid: '' }),
    assignment: null,
    toStatus: 'IN_PROGRESS',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ASSIGNMENT_REQUIRED');
});

test('assigned contractor can start a pending observation', () => {
  const result = evaluateTransition({
    actor: actor('contractor', 'contractor-a'),
    observation: observation(),
    assignment: assignment(),
    toStatus: 'IN_PROGRESS',
  });
  assert.equal(result.allowed, true);
  assert.equal(result.code, 'TRANSITION_ALLOWED');
});

test('contractor cannot submit evidence for another contractor assignment', () => {
  const result = evaluateTransition({
    actor: actor('contractor', 'contractor-b'),
    observation: observation({ status: 'IN_PROGRESS' }),
    assignment: assignment(),
    toStatus: 'PENDING_REVIEW',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ASSIGNMENT_CONTRACTOR_MISMATCH');
});

test('assigned contractor can submit evidence for review', () => {
  const result = evaluateTransition({
    actor: actor('contractor', 'contractor-a'),
    observation: observation({ status: 'IN_PROGRESS' }),
    assignment: assignment(),
    toStatus: 'PENDING_REVIEW',
  });
  assert.equal(result.allowed, true);
});

test('contractor cannot close an observation', () => {
  const result = evaluateTransition({
    actor: actor('contractor', 'contractor-a'),
    observation: observation({ status: 'PENDING_REVIEW' }),
    assignment: assignment(),
    toStatus: 'COMPLETED',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ROLE_TRANSITION_DENIED');
});

test('inspector cannot update another inspector observation under the intended contract', () => {
  const result = evaluateAssignmentOwnership({
    actor: actor('inspector', 'inspector-b'),
    observation: observation(),
    action: 'update',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'INSPECTOR_OWNERSHIP_REQUIRED');
});

test('creating inspector may update the observation under the intended contract', () => {
  const result = evaluateAssignmentOwnership({
    actor: actor('inspector', 'inspector-a'),
    observation: observation({ assignedContractorUid: '' }),
    action: 'update',
  });
  assert.equal(result.allowed, true);
  assert.equal(result.code, 'INSPECTOR_CREATOR');
});

test('inspector may not complete an observation', () => {
  const result = evaluateTransition({
    actor: actor('inspector', 'inspector-a'),
    observation: observation({ status: 'IN_PROGRESS' }),
    toStatus: 'COMPLETED',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'INVALID_TRANSITION');
});

test('supervisor may return a pending-review observation for correction', () => {
  const result = evaluateTransition({
    actor: actor('supervisor', 'supervisor-a'),
    observation: observation({ status: 'PENDING_REVIEW' }),
    toStatus: 'IN_PROGRESS',
  });
  assert.equal(result.allowed, true);
});

test('supervisor may review but may not close', () => {
  const review = evaluateAssignmentOwnership({
    actor: actor('supervisor', 'supervisor-a'),
    observation: observation({ status: 'PENDING_REVIEW' }),
    action: 'review',
  });
  const close = evaluateAssignmentOwnership({
    actor: actor('supervisor', 'supervisor-a'),
    observation: observation({ status: 'PENDING_REVIEW' }),
    action: 'close',
  });
  assert.equal(review.allowed, true);
  assert.equal(close.allowed, false);
  assert.equal(close.code, 'SUPERVISOR_ACTION_DENIED');
});

test('manager may close a pending-review observation', () => {
  const result = evaluateTransition({
    actor: actor('manager', 'manager-a'),
    observation: observation({ status: 'PENDING_REVIEW' }),
    toStatus: 'COMPLETED',
  });
  assert.equal(result.allowed, true);
});

test('manager action remains denied across organizations', () => {
  const result = evaluateTransition({
    actor: actor('manager', 'manager-a'),
    observation: observation({ organizationId: ORG_B, status: 'PENDING_REVIEW' }),
    toStatus: 'COMPLETED',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'CROSS_ORGANIZATION_DENIED');
});

test('invalid transition is denied', () => {
  const result = evaluateTransition({
    actor: actor('manager', 'manager-a'),
    observation: observation(),
    toStatus: 'COMPLETED',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'INVALID_TRANSITION');
});

test('unknown status is denied', () => {
  const result = evaluateTransition({
    actor: actor('manager', 'manager-a'),
    observation: observation(),
    toStatus: 'ARCHIVED',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'UNSUPPORTED_STATUS');
});

test('completed observation cannot be reopened by any operational role', () => {
  for (const [role, uid] of [
    ['manager', 'manager-a'],
    ['supervisor', 'supervisor-a'],
    ['inspector', 'inspector-a'],
    ['contractor', 'contractor-a'],
  ]) {
    const result = evaluateTransition({
      actor: actor(role, uid),
      observation: observation({ status: 'COMPLETED' }),
      toStatus: 'PENDING',
    });
    assert.equal(result.allowed, false, role);
    assert.equal(result.code, 'INVALID_TRANSITION', role);
  }
});
