'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeBootstrapDecision } = require('../api/admin/lands-bootstrap.js')._test;

const manager = { uid: 'manager-uid-1', isOwner: false, isManager: true, role: 'manager', organizationId: 'org-alpha' };
const employee = { uid: 'employee-uid-1', isOwner: false, isManager: false, role: null, organizationId: null };
const owner = { uid: 'owner-uid-1', isOwner: true, isManager: false, role: 'owner', organizationId: null };

test('institution manager bootstrap: allowed and targets only the caller', () => {
  const result = computeBootstrapDecision(manager, false);
  assert.equal(result.allowed, true);
  assert.equal(result.alreadyBootstrapped, false);
  assert.equal(result.write.uid, manager.uid);
  assert.equal(result.write.municipalityId, manager.organizationId);
  assert.equal(result.write.accessDoc.firebase_uid, manager.uid);
  assert.equal(result.write.accessDoc.municipality_id, manager.organizationId);
  assert.equal(result.write.accessDoc.lands_role, 'municipal_manager');
  assert.equal(result.write.accessDoc.enabled, true);
});

test('second bootstrap call: safe no-op (already_bootstrapped, no write)', () => {
  const result = computeBootstrapDecision(manager, true);
  assert.equal(result.allowed, true);
  assert.equal(result.alreadyBootstrapped, true);
  assert.equal(result.write, null);
});

test('employee cannot bootstrap', () => {
  const result = computeBootstrapDecision(employee, false);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'manager_required');
  assert.equal(result.write, undefined);
});

test('owner (non-manager) cannot bootstrap through this endpoint', () => {
  // Bootstrap is deliberately manager-only — an owner has no organizationId
  // to bind a municipality to, and this endpoint accepts no target.
  const result = computeBootstrapDecision(owner, false);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'manager_required');
});

test('missing/null caller context is denied, never treated as authorized', () => {
  assert.equal(computeBootstrapDecision(null, false).allowed, false);
  assert.equal(computeBootstrapDecision(undefined, false).allowed, false);
});

test('the write can never target any municipality other than the caller\'s own', () => {
  const managerB = { ...manager, uid: 'manager-uid-2', organizationId: 'org-beta' };
  const resultA = computeBootstrapDecision(manager, false);
  const resultB = computeBootstrapDecision(managerB, false);
  assert.equal(resultA.write.municipalityId, 'org-alpha');
  assert.equal(resultB.write.municipalityId, 'org-beta');
  assert.notEqual(resultA.write.municipalityId, resultB.write.municipalityId);
  assert.notEqual(resultA.write.uid, resultB.write.uid);
});

test('the function accepts no request-supplied target at all (signature proof)', () => {
  // computeBootstrapDecision(caller, accessAlreadyExists) — there is no third
  // parameter for a uid/role/municipality/path. Calling it with extra
  // arguments (simulating a tampered/malicious call site) changes nothing:
  // JavaScript simply ignores parameters beyond the function's declared
  // arity, so no such input can ever reach the write it produces.
  assert.equal(computeBootstrapDecision.length, 2);
  const result = computeBootstrapDecision(manager, false, { uid: 'attacker-uid', municipalityId: 'org-victim', lands_role: 'lands_department_manager' });
  assert.equal(result.write.uid, manager.uid);
  assert.equal(result.write.municipalityId, manager.organizationId);
});

test('the audit event is recorded as an explicit bootstrap action, never disguised as an ordinary grant', () => {
  const result = computeBootstrapDecision(manager, false);
  assert.equal(result.write.auditDoc.action, 'lands.manager_bootstrapped');
  assert.equal(result.write.auditDoc.safe_metadata.reason_code, 'initial_municipality_lands_authority');
  // Neither value is one of Lands' own TRUSTED_AUDIT_ACTIONS /
  // TRUSTED_AUDIT_REASON_CODES entries (server/trusted-audit.js), so it can
  // never be mistaken for a normal employee entitlement.enable/change_role
  // event when read back.
  const ordinaryLandsActions = ['lands.entitlement_enabled', 'lands.entitlement_disabled', 'lands.role_changed', 'lands.access_granted'];
  const ordinaryReasonCodes = ['workflow_review', 'document_replacement', 'document_removal', 'entitlement_change', 'role_change'];
  assert.equal(ordinaryLandsActions.includes(result.write.auditDoc.action), false);
  assert.equal(ordinaryReasonCodes.includes(result.write.auditDoc.safe_metadata.reason_code), false);
});

test('exactly one bootstrap targets exactly one deterministic audit document id', () => {
  const first = computeBootstrapDecision(manager, false);
  const second = computeBootstrapDecision(manager, false);
  assert.equal(first.write.auditDocId, second.write.auditDocId);
  assert.equal(first.write.auditDocId, `lands_bootstrap_${manager.organizationId}_${manager.uid}`);
});
