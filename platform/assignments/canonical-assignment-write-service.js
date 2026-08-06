'use strict';

const authorization = require('../core/authorization-decision-service');
const { createAssignmentContract, ASSIGNMENT_STATUSES } = require('./assignment-contract');
const { resolveAssignment } = require('./assignment-resolver');
const { createDecision, deepFreeze } = require('../contracts/decision');
const { ACTIONS, buildAssignmentAuditEvent } = require('../audit/assignment-audit-events');

function result(decision, data = null, auditEvent = null) {
  return deepFreeze({ allowed: decision.allowed, code: decision.code, reason: decision.reason, data, auditEvent });
}

function createCanonicalAssignmentWriteService({ store, clock = () => new Date().toISOString(), idFactory } = {}) {
  if (!store || typeof store.runTransaction !== 'function') throw new TypeError('A transactional assignment store is required.');
  if (typeof idFactory !== 'function') throw new TypeError('An assignment idFactory is required.');

  function audit(action, input, decision, assignmentId, requestedState) {
    const timestamp = clock();
    return buildAssignmentAuditEvent({ action, actor: input.actor, observation: input.observation, assignmentId, decision, requestedState, timestamp, eventId: `audit-${idFactory()}-${timestamp}` }).event;
  }

  async function createAssignment(input = {}) {
    const gate = authorization.canAssignObservation({ actor: input.actor, observation: input.observation });
    if (!gate.allowed) return result(gate, null, audit(ACTIONS.DENIED, input, gate, input.assignmentId));
    return store.runTransaction(async tx => {
      const observation = await tx.getObservation(input.observation.id);
      if (!observation || observation.organizationId !== input.actor.organizationId || observation.currentAssignmentId) {
        const denied = createDecision(false, 'ASSIGNMENT_CREATE_CONFLICT', 'Observation is missing, cross-organization, or already assigned.');
        return result(denied, null, audit(ACTIONS.DENIED, { ...input, observation: observation || input.observation }, denied, input.assignmentId));
      }
      const now = clock(); const assignmentId = input.assignmentId || idFactory();
      const built = createAssignmentContract({ assignmentId, observationId: observation.id, organizationId: observation.organizationId, contractorId: input.contractorId, status: ASSIGNMENT_STATUSES.ACTIVE, version: 1, assignedAt: now, assignedBy: input.actor.uid, createdAt: now, updatedAt: now });
      if (!built.decision.allowed) return result(built.decision);
      await tx.createAssignment(built.assignment);
      const observationPatch = { currentAssignmentId: assignmentId, currentAssignmentVersion: 1, assignedContractorUid: input.contractorId, assignedByUid: input.actor.uid, assignedAt: now, updatedByUid: input.actor.uid, updatedAt: now };
      if (typeof input.supervisorNote === 'string') observationPatch.supervisorNote = input.supervisorNote;
      await tx.updateObservation(observation.id, observationPatch);
      return result(gate, { assignment: built.assignment }, audit(ACTIONS.CREATED, { ...input, observation }, gate, assignmentId));
    });
  }

  async function replaceAssignment(input = {}) {
    const gate = authorization.canAssignObservation({ actor: input.actor, observation: input.observation });
    if (!gate.allowed) return result(gate, null, audit(ACTIONS.DENIED, input, gate));
    return store.runTransaction(async tx => {
      const observation = await tx.getObservation(input.observation.id);
      const current = observation && observation.currentAssignmentId ? await tx.getAssignment(observation.currentAssignmentId) : null;
      const ownership = current && resolveAssignment({ actor: { ...input.actor, uid: current.contractorId }, observation, assignment: current });
      if (!observation || !current || !ownership.allowed || observation.organizationId !== input.actor.organizationId) {
        const denied = createDecision(false, 'CURRENT_ASSIGNMENT_INVALID', 'A valid current assignment is required for replacement.');
        return result(denied, null, audit(ACTIONS.DENIED, { ...input, observation: observation || input.observation }, denied));
      }
      const now = clock(); const assignmentId = input.assignmentId || idFactory(); const version = current.version + 1;
      const built = createAssignmentContract({ assignmentId, observationId: observation.id, organizationId: observation.organizationId, contractorId: input.contractorId, status: ASSIGNMENT_STATUSES.ACTIVE, version, assignedAt: now, assignedBy: input.actor.uid, createdAt: now, updatedAt: now });
      if (!built.decision.allowed) return result(built.decision);
      await tx.updateAssignment(current.assignmentId, { status: ASSIGNMENT_STATUSES.REPLACED, replacedByAssignmentId: assignmentId, endedAt: now, updatedAt: now });
      await tx.createAssignment(built.assignment);
      const observationPatch = { currentAssignmentId: assignmentId, currentAssignmentVersion: version, assignedContractorUid: input.contractorId, assignedByUid: input.actor.uid, assignedAt: now, updatedByUid: input.actor.uid, updatedAt: now };
      if (typeof input.supervisorNote === 'string') observationPatch.supervisorNote = input.supervisorNote;
      await tx.updateObservation(observation.id, observationPatch);
      return result(gate, { previousAssignmentId: current.assignmentId, assignment: built.assignment }, audit(ACTIONS.REPLACED, { ...input, observation }, gate, assignmentId));
    });
  }

  async function endAssignment(input = {}) {
    const gate = authorization.canAssignObservation({ actor: input.actor, observation: input.observation });
    if (!gate.allowed) return result(gate, null, audit(ACTIONS.DENIED, input, gate));
    return store.runTransaction(async tx => {
      const observation = await tx.getObservation(input.observation.id);
      const current = observation && observation.currentAssignmentId ? await tx.getAssignment(observation.currentAssignmentId) : null;
      if (!current || current.status !== ASSIGNMENT_STATUSES.ACTIVE || current.organizationId !== input.actor.organizationId) {
        const denied = createDecision(false, 'CURRENT_ASSIGNMENT_INVALID', 'A same-organization ACTIVE assignment is required.');
        return result(denied, null, audit(ACTIONS.DENIED, { ...input, observation: observation || input.observation }, denied));
      }
      const now = clock();
      await tx.updateAssignment(current.assignmentId, { status: ASSIGNMENT_STATUSES.INACTIVE, endedAt: now, updatedAt: now });
      const remove = typeof store.deleteValue === 'function' ? store.deleteValue() : null;
      await tx.updateObservation(observation.id, { currentAssignmentId: remove, currentAssignmentVersion: remove, assignedContractorUid: remove, updatedByUid: input.actor.uid, updatedAt: now });
      return result(gate, { assignmentId: current.assignmentId }, audit(ACTIONS.ENDED, { ...input, observation }, gate, current.assignmentId));
    });
  }

  async function resolveCurrentAssignment({ actor, observation } = {}) {
    if (!observation || !observation.currentAssignmentId) return result(createDecision(false, 'ASSIGNMENT_REQUIRED', 'No canonical assignment pointer exists.'));
    const assignment = await store.getAssignment(observation.currentAssignmentId);
    const decision = resolveAssignment({ actor, observation, assignment });
    return result(decision, decision.allowed ? { assignment } : null);
  }

  return Object.freeze({ createAssignment, endAssignment, replaceAssignment, resolveCurrentAssignment });
}

module.exports = Object.freeze({ createCanonicalAssignmentWriteService });
