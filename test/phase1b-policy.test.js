'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateContractorAssignment, evaluateAssignmentOwnership } = require('../platform/policies/assignment-ownership-policy');
const { evaluateTransition } = require('../platform/policies/observation-workflow-policy');

const actor = (role = 'contractor', overrides = {}) => ({
  role,
  uid: role === 'contractor' ? 'contractor-a' : `${role}-a`,
  organizationId: 'org-a',
  ...overrides,
});

const observation = (overrides = {}) => ({
  id: 'observation-a',
  organizationId: 'org-a',
  createdByUid: 'inspector-a',
  status: 'PENDING',
  assignmentId: 'assignment-a',
  assignmentVersion: 3,
  ...overrides,
});

const assignment = (overrides = {}) => ({
  id: 'assignment-a',
  organizationId: 'org-a',
  contractorId: 'contractor-a',
  observationId: 'observation-a',
  active: true,
  current: true,
  version: 3,
  ...overrides,
});

test('missing assignment is denied', () => {
  const result = evaluateContractorAssignment({ actor: actor(), observation: observation() });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ASSIGNMENT_REQUIRED');
});

test('inactive assignment is denied', () => {
  const result = evaluateContractorAssignment({ actor: actor(), observation: observation(), assignment: assignment({ active: false }) });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ASSIGNMENT_NOT_CURRENT');
});

test('assignment not marked current is denied', () => {
  const result = evaluateContractorAssignment({ actor: actor(), observation: observation(), assignment: assignment({ current: false }) });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ASSIGNMENT_NOT_CURRENT');
});

test('contractor mismatch is denied', () => {
  const result = evaluateContractorAssignment({ actor: actor(), observation: observation(), assignment: assignment({ contractorId: 'contractor-b' }) });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ASSIGNMENT_CONTRACTOR_MISMATCH');
});

test('assignment observation mismatch is denied', () => {
  const result = evaluateContractorAssignment({ actor: actor(), observation: observation(), assignment: assignment({ observationId: 'observation-b' }) });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ASSIGNMENT_OBSERVATION_MISMATCH');
});

test('assignment organization mismatch is denied', () => {
  const result = evaluateContractorAssignment({ actor: actor(), observation: observation(), assignment: assignment({ organizationId: 'org-b' }) });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ASSIGNMENT_ORGANIZATION_MISMATCH');
});

test('replaced assignment id is denied', () => {
  const result = evaluateContractorAssignment({ actor: actor(), observation: observation(), assignment: assignment({ id: 'assignment-old' }) });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ASSIGNMENT_REPLACED');
});

test('stale assignment version is denied', () => {
  const result = evaluateContractorAssignment({ actor: actor(), observation: observation(), assignment: assignment({ version: 2 }) });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ASSIGNMENT_VERSION_MISMATCH');
});

test('valid current assignment is allowed', () => {
  const result = evaluateContractorAssignment({ actor: actor(), observation: observation(), assignment: assignment() });
  assert.equal(result.allowed, true);
  assert.equal(result.code, 'CURRENT_ASSIGNMENT_CONFIRMED');
});

test('contractor transition requires the valid current assignment', () => {
  const denied = evaluateTransition({ actor: actor(), observation: observation(), assignment: assignment({ current: false }), toStatus: 'IN_PROGRESS' });
  const allowed = evaluateTransition({ actor: actor(), observation: observation(), assignment: assignment(), toStatus: 'IN_PROGRESS' });
  assert.equal(denied.allowed, false);
  assert.equal(denied.code, 'ASSIGNMENT_NOT_CURRENT');
  assert.equal(allowed.allowed, true);
});

test('inspector update is denied after assignment', () => {
  const result = evaluateAssignmentOwnership({
    actor: actor('inspector'),
    observation: observation({ assignedContractorUid: 'contractor-a' }),
    assignment: assignment(),
    action: 'update',
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'INSPECTOR_UPDATE_AFTER_ASSIGNMENT_DENIED');
});

test('inspector cannot approve or complete', () => {
  const approve = evaluateAssignmentOwnership({ actor: actor('inspector'), observation: observation(), action: 'review' });
  const complete = evaluateTransition({ actor: actor('inspector'), observation: observation({ status: 'IN_PROGRESS' }), toStatus: 'COMPLETED' });
  assert.equal(approve.allowed, false);
  assert.equal(approve.code, 'INSPECTOR_ACTION_DENIED');
  assert.equal(complete.allowed, false);
});

test('real manager role may approve and real supervisor role may return', () => {
  const approve = evaluateTransition({ actor: actor('manager'), observation: observation({ status: 'PENDING_REVIEW' }), toStatus: 'COMPLETED' });
  const returnForCorrection = evaluateTransition({ actor: actor('supervisor'), observation: observation({ status: 'PENDING_REVIEW' }), toStatus: 'IN_PROGRESS' });
  assert.equal(approve.allowed, true);
  assert.equal(returnForCorrection.allowed, true);
});

test('supervisor cannot approve and no assistant role is invented', () => {
  const supervisor = evaluateTransition({ actor: actor('supervisor'), observation: observation({ status: 'PENDING_REVIEW' }), toStatus: 'COMPLETED' });
  const assistant = evaluateTransition({ actor: actor('assistant'), observation: observation({ status: 'PENDING_REVIEW' }), toStatus: 'COMPLETED' });
  assert.equal(supervisor.allowed, false);
  assert.equal(assistant.allowed, false);
  assert.equal(assistant.code, 'ROLE_TRANSITION_DENIED');
});

test('COMPLETED is terminal for every real operational role', () => {
  for (const role of ['manager', 'supervisor', 'inspector', 'contractor']) {
    const result = evaluateTransition({
      actor: actor(role),
      observation: observation({ status: 'COMPLETED' }),
      assignment: role === 'contractor' ? assignment() : undefined,
      toStatus: 'PENDING',
    });
    assert.equal(result.allowed, false, role);
    assert.equal(result.code, 'INVALID_TRANSITION', role);
  }
});
