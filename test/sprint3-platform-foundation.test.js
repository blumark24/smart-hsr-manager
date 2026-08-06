'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDecision } = require('../platform/contracts/decision');
const { ROLES, ROLE_VALUES, getRoleAuthority, evaluateRoleAuthority } = require('../platform/contracts/role-contract');
const { ASSIGNMENT_STATUSES, createAssignmentContract, validateAssignmentContract } = require('../platform/assignments/assignment-contract');
const { resolveAssignment } = require('../platform/assignments/assignment-resolver');
const { LEGACY_COMPATIBILITY, classifyLegacyAssignment } = require('../platform/assignments/legacy-compatibility');
const { createAuditEvent } = require('../platform/audit/audit-event-contract');
const authorization = require('../platform/core/authorization-decision-service');

const ORG_A = 'org-a';
const ORG_B = 'org-b';

const actor = (role, overrides = {}) => ({ uid: `${role}-a`, role, organizationId: ORG_A, ...overrides });
const observation = (overrides = {}) => ({
  id: 'observation-a', organizationId: ORG_A, createdByUid: 'inspector-a', status: 'PENDING',
  assignmentId: 'assignment-a', assignmentVersion: 2, ...overrides,
});
const assignment = (overrides = {}) => ({
  assignmentId: 'assignment-a', observationId: 'observation-a', organizationId: ORG_A,
  contractorId: 'contractor-a', status: 'ACTIVE', version: 2,
  assignedAt: '2026-08-06T00:00:00.000Z', assignedBy: 'manager-a',
  createdAt: '2026-08-06T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z', ...overrides,
});
const context = (role, overrides = {}) => ({
  actor: actor(role), observation: observation(), assignment: role === 'contractor' ? assignment() : undefined, ...overrides,
});

test('canonical roles contain only verified repository values', () => {
  assert.deepEqual(ROLE_VALUES, ['owner', 'manager', 'supervisor', 'inspector', 'contractor']);
  assert.equal(ROLE_VALUES.includes('assistant'), false);
  assert.equal(ROLES.SUPERVISOR, 'supervisor');
});

test('owner retains platform scope but no observation authority', () => {
  assert.equal(getRoleAuthority('owner').organizationScope, 'platform');
  assert.equal(authorization.canCreateObservation(context('owner')).allowed, false);
  assert.equal(authorization.canCompleteObservation(context('owner', { observation: observation({ status: 'PENDING_REVIEW' }) })).allowed, false);
});

test('manager has assignment, review, return, and completion authority', () => {
  const authority = getRoleAuthority('manager');
  assert.equal(authority.canAssign, true);
  assert.equal(authority.canReview, true);
  assert.equal(authority.canReturn, true);
  assert.equal(authority.canComplete, true);
});

test('supervisor reviews and returns but cannot complete', () => {
  const reviewContext = context('supervisor', { observation: observation({ status: 'PENDING_REVIEW' }) });
  assert.equal(authorization.canReviewObservation(reviewContext).allowed, true);
  assert.equal(authorization.canReturnObservation(reviewContext).allowed, true);
  assert.equal(authorization.canCompleteObservation(reviewContext).allowed, false);
});

test('unknown assistant role is denied', () => {
  const result = evaluateRoleAuthority('assistant', 'canReview');
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ROLE_NOT_RECOGNIZED');
});

test('inspector may create own PENDING observation in matching organization', () => {
  const result = authorization.canCreateObservation(context('inspector', {
    observation: observation({ assignmentId: undefined, assignmentVersion: undefined }),
  }));
  assert.equal(result.allowed, true);
  assert.equal(result.code, 'OBSERVATION_CREATE_ALLOWED');
});

test('inspector create requires matching creator uid and PENDING status', () => {
  const wrongCreator = authorization.canCreateObservation(context('inspector', { observation: observation({ createdByUid: 'inspector-b' }) }));
  const wrongStatus = authorization.canCreateObservation(context('inspector', { observation: observation({ status: 'IN_PROGRESS' }) }));
  assert.equal(wrongCreator.allowed, false);
  assert.equal(wrongCreator.code, 'CREATOR_IDENTITY_MISMATCH');
  assert.equal(wrongStatus.allowed, false);
  assert.equal(wrongStatus.code, 'INITIAL_STATUS_INVALID');
});

test('inspector may update own unassigned observation', () => {
  const result = authorization.canUpdateObservation(context('inspector', {
    observation: observation({ assignmentId: undefined, assignmentVersion: undefined, assignedContractorUid: undefined }),
    assignment: undefined,
  }));
  assert.equal(result.allowed, true);
});

test('inspector cannot update another inspector observation', () => {
  const result = authorization.canUpdateObservation(context('inspector', {
    observation: observation({ createdByUid: 'inspector-b', assignmentId: undefined, assignmentVersion: undefined }),
    assignment: undefined,
  }));
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'INSPECTOR_OWNERSHIP_REQUIRED');
});

test('inspector cannot update after assignment or complete', () => {
  const assigned = authorization.canUpdateObservation(context('inspector', {
    observation: observation({ assignedContractorUid: 'contractor-a' }), assignment: assignment(),
  }));
  const complete = authorization.canCompleteObservation(context('inspector', { observation: observation({ status: 'PENDING_REVIEW' }) }));
  assert.equal(assigned.allowed, false);
  assert.equal(assigned.code, 'INSPECTOR_UPDATE_AFTER_ASSIGNMENT_DENIED');
  assert.equal(complete.allowed, false);
});

test('missing actor organization is denied', () => {
  const result = authorization.canUpdateObservation(context('inspector', {
    actor: actor('inspector', { organizationId: '' }),
    observation: observation({ assignmentId: undefined, assignmentVersion: undefined }),
    assignment: undefined,
  }));
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'AUTHENTICATED_ORGANIZATION_REQUIRED');
});

test('cross-organization action is denied', () => {
  const result = authorization.canReviewObservation(context('manager', {
    observation: observation({ organizationId: ORG_B, status: 'PENDING_REVIEW' }),
  }));
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'CROSS_ORGANIZATION_DENIED');
});

test('matching organization review is allowed for manager', () => {
  const result = authorization.canReviewObservation(context('manager', { observation: observation({ status: 'PENDING_REVIEW' }) }));
  assert.equal(result.allowed, true);
});

test('canonical active assignment contract is immutable and valid', () => {
  const result = createAssignmentContract(assignment());
  assert.equal(result.decision.allowed, true);
  assert.equal(result.assignment.status, ASSIGNMENT_STATUSES.ACTIVE);
  assert.equal(Object.isFrozen(result.assignment), true);
});

test('replaced assignment requires replacement id and endedAt', () => {
  const invalid = validateAssignmentContract(assignment({ status: 'REPLACED', endedAt: '2026-08-06T01:00:00.000Z' }));
  const valid = validateAssignmentContract(assignment({
    status: 'REPLACED', replacedByAssignmentId: 'assignment-b', endedAt: '2026-08-06T01:00:00.000Z',
  }));
  assert.equal(invalid.allowed, false);
  assert.equal(invalid.code, 'REPLACEMENT_ID_REQUIRED');
  assert.equal(valid.allowed, true);
});

test('unsupported assignment status is denied', () => {
  const result = validateAssignmentContract(assignment({ status: 'PAUSED' }));
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ASSIGNMENT_STATUS_UNSUPPORTED');
});

test('assignment resolver denies missing assignment', () => {
  const result = resolveAssignment({ actor: actor('contractor'), observation: observation() });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'ASSIGNMENT_REQUIRED');
});

test('assignment resolver denies wrong contractor', () => {
  const result = resolveAssignment({ actor: actor('contractor'), observation: observation(), assignment: assignment({ contractorId: 'contractor-b' }) });
  assert.equal(result.code, 'ASSIGNMENT_CONTRACTOR_MISMATCH');
});

test('assignment resolver denies wrong observation', () => {
  const result = resolveAssignment({ actor: actor('contractor'), observation: observation(), assignment: assignment({ observationId: 'observation-b' }) });
  assert.equal(result.code, 'ASSIGNMENT_OBSERVATION_MISMATCH');
});

test('assignment resolver denies wrong organization', () => {
  const result = resolveAssignment({ actor: actor('contractor'), observation: observation(), assignment: assignment({ organizationId: ORG_B }) });
  assert.equal(result.code, 'ASSIGNMENT_ORGANIZATION_MISMATCH');
});

test('assignment resolver denies inactive and replaced assignments', () => {
  const inactive = resolveAssignment({ actor: actor('contractor'), observation: observation(), assignment: assignment({ status: 'INACTIVE', endedAt: '2026-08-06T01:00:00Z' }) });
  const replaced = resolveAssignment({ actor: actor('contractor'), observation: observation(), assignment: assignment({ status: 'REPLACED', replacedByAssignmentId: 'assignment-b', endedAt: '2026-08-06T01:00:00Z' }) });
  assert.equal(inactive.code, 'ASSIGNMENT_NOT_CURRENT');
  assert.equal(replaced.code, 'ASSIGNMENT_NOT_CURRENT');
});

test('assignment resolver detects replaced identity and stale version', () => {
  const replaced = resolveAssignment({ actor: actor('contractor'), observation: observation(), assignment: assignment({ assignmentId: 'assignment-old' }) });
  const stale = resolveAssignment({ actor: actor('contractor'), observation: observation(), assignment: assignment({ version: 1 }) });
  assert.equal(replaced.code, 'ASSIGNMENT_REPLACED');
  assert.equal(stale.code, 'ASSIGNMENT_VERSION_MISMATCH');
});

test('assignment resolver accepts valid current assignment', () => {
  const result = resolveAssignment({ actor: actor('contractor'), observation: observation(), assignment: assignment() });
  assert.equal(result.allowed, true);
  assert.equal(result.code, 'CURRENT_ASSIGNMENT_CONFIRMED');
});

test('valid contractor starts PENDING and submits IN_PROGRESS evidence', () => {
  const start = authorization.canStartObservation(context('contractor'));
  const submit = authorization.canSubmitEvidence(context('contractor', { observation: observation({ status: 'IN_PROGRESS' }) }));
  assert.equal(start.allowed, true);
  assert.equal(submit.allowed, true);
});

test('contractor cannot start without current assignment or complete', () => {
  const start = authorization.canStartObservation(context('contractor', { assignment: undefined }));
  const complete = authorization.canCompleteObservation(context('contractor', { observation: observation({ status: 'PENDING_REVIEW' }) }));
  assert.equal(start.allowed, false);
  assert.equal(start.code, 'ASSIGNMENT_REQUIRED');
  assert.equal(complete.allowed, false);
});

test('manager completes review and manager or supervisor returns review', () => {
  const review = observation({ status: 'PENDING_REVIEW' });
  assert.equal(authorization.canCompleteObservation(context('manager', { observation: review })).allowed, true);
  assert.equal(authorization.canReturnObservation(context('manager', { observation: review })).allowed, true);
  assert.equal(authorization.canReturnObservation(context('supervisor', { observation: review })).allowed, true);
});

test('COMPLETED is terminal for all verified operational roles', () => {
  for (const role of ['manager', 'supervisor', 'inspector', 'contractor']) {
    const result = authorization.canStartObservation(context(role, { observation: observation({ status: 'COMPLETED' }) }));
    assert.equal(result.allowed, false, role);
  }
});

test('legacy unassigned observation is fully compatible', () => {
  const result = classifyLegacyAssignment({ id: 'obs', organizationId: ORG_A });
  assert.equal(result.classification, LEGACY_COMPATIBILITY.FULLY_COMPATIBLE);
});

test('legacy complete embedded fields are partially compatible', () => {
  const result = classifyLegacyAssignment({
    id: 'obs', organizationId: ORG_A, assignedContractorUid: 'contractor-a',
    assignedAt: '2026-08-06T00:00:00Z', assignedByUid: 'manager-a',
  });
  assert.equal(result.classification, LEGACY_COMPATIBILITY.PARTIALLY_COMPATIBLE);
});

test('legacy contractor without provenance is ambiguous', () => {
  const result = classifyLegacyAssignment({ id: 'obs', organizationId: ORG_A, assignedContractorUid: 'contractor-a' });
  assert.equal(result.classification, LEGACY_COMPATIBILITY.AMBIGUOUS);
});

test('legacy observation missing identity is incompatible', () => {
  const result = classifyLegacyAssignment({ organizationId: ORG_A, assignedContractorUid: 'contractor-a' });
  assert.equal(result.classification, LEGACY_COMPATIBILITY.INCOMPATIBLE);
});

test('authorization decisions generate deterministic immutable audit events', () => {
  const authContext = context('manager', { observation: observation({ status: 'PENDING_REVIEW' }) });
  const decision = authorization.canCompleteObservation(authContext);
  const input = {
    eventId: 'event-1', context: authContext, resourceId: 'observation-a', action: 'complete_observation', decision,
    previousState: { status: 'PENDING_REVIEW', imagePath: 'must-not-leak' }, requestedState: { status: 'COMPLETED', private_key: 'must-not-leak' },
    assignmentId: 'assignment-a', timestamp: '2026-08-06T00:00:00.000Z', correlationId: 'correlation-1',
  };
  const first = createAuditEvent(input);
  const second = createAuditEvent(input);
  assert.equal(first.decision.allowed, true);
  assert.deepEqual(first.event, second.event);
  assert.equal(Object.isFrozen(first.event), true);
  assert.equal(first.event.previousState, 'PENDING_REVIEW');
  assert.equal(first.event.requestedState, 'COMPLETED');
  assert.equal(JSON.stringify(first.event).includes('imagePath'), false);
  assert.equal(JSON.stringify(first.event).includes('private_key'), false);
  assert.equal(JSON.stringify(first.event).includes('must-not-leak'), false);
});

test('denial decision produces DENY audit event', () => {
  const authContext = context('inspector', { observation: observation({ status: 'PENDING_REVIEW' }) });
  const decision = authorization.canCompleteObservation(authContext);
  const result = createAuditEvent({
    eventId: 'event-deny', context: authContext, resourceId: 'observation-a', action: 'complete_observation',
    decision, previousState: 'PENDING_REVIEW', requestedState: 'COMPLETED', timestamp: '2026-08-06T00:00:00.000Z',
  });
  assert.equal(result.event.decision, 'DENY');
  assert.equal(result.event.reasonCode, decision.code);
});

test('all service decisions use the canonical structured shape', () => {
  const result = authorization.canAssignObservation(context('manager'));
  assert.equal(typeof result.allowed, 'boolean');
  assert.equal(typeof result.code, 'string');
  assert.equal(typeof result.reason, 'string');
  assert.equal(typeof result.metadata, 'object');
});

test('decision metadata and nested values are immutable', () => {
  const value = createDecision(true, 'OK', 'Allowed.', { nested: { value: 1 } });
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.metadata), true);
  assert.equal(Object.isFrozen(value.metadata.nested), true);
});
