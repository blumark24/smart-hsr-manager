'use strict';
// ============================================================================
// Phase 08.1 CLOSURE 2 — contractor observation status-transition workflow.
//
// Pure logic shared between the trusted server action
// (api/admin/users.js's 'contractorObservationUpdate') and any future
// caller. Mirrors — and, once the server action ships, REPLACES as the
// live authority for — the exact transition/note semantics
// mobile-map.html previously performed via a direct client
// updateDoc(observations/{id}) call (kept here verbatim: the SMART_HSR_*
// execution-event line format, the append-only note merge, the two
// allowed transitions). See mobile-map.html's own buildExecutionEvent/
// combinedExecutionNote for the original client-side implementation this
// was extracted from.
//
// This module performs NO I/O — the caller (the server action) is
// responsible for reading the current observation document and writing
// the result, ideally inside one transaction so a stale read can never be
// acted on.
// ============================================================================

const { createDecision, deepFreeze } = require('../contracts/decision');

// 'PENDING_REVIEW' is the REAL Firestore status value — mobile-map.html's
// own CONTRACTOR_SUBMITTED constant is only a UI-facing alias for it
// ("UI semantic alias; preserves the approved backend workflow" per that
// file's own comment) and must never leak into the actual written field.
const CONTRACTOR_TRANSITIONS = Object.freeze({
  START: Object.freeze({ from: 'PENDING', to: 'IN_PROGRESS', eventKind: 'START' }),
  SUBMIT: Object.freeze({ from: 'IN_PROGRESS', to: 'PENDING_REVIEW', eventKind: 'SUBMISSION' }),
});
const EXECUTION_EVENT_PREFIX = '[SMART_HSR_';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Verbatim port of mobile-map.html's buildExecutionEvent(kind, fix).
function buildExecutionEventLine(kind, fix) {
  const coordinates = fix && Array.isArray(fix.coords) && fix.coords.length === 2
    ? `${fix.coords[0].toFixed(6)},${fix.coords[1].toFixed(6)}` : 'غير متاح';
  const accuracy = fix && Number.isFinite(fix.accuracy) ? `±${fix.accuracy}م` : 'دقة غير متاحة';
  return `[SMART_HSR_${kind}] ${new Date().toISOString()} | ${coordinates} | ${accuracy}`;
}

function executionEventLines(value) {
  return String(value || '').split('\n').filter((line) => line.startsWith(EXECUTION_EVENT_PREFIX));
}

// Verbatim port of mobile-map.html's combinedExecutionNote(existing, userNote, eventLine).
function combineExecutionNote(existingNote, userNote, eventLine) {
  return [...new Set([...executionEventLines(existingNote), eventLine]), String(userNote || '').trim()]
    .filter(Boolean).join('\n');
}

// `actor` = { uid, organizationId } already resolved server-side from a
// verified token — never from the request body. `observation` = the
// document as already read (inside the caller's transaction).
function evaluateContractorObservationTransition({ actor, observation, transitionKey }) {
  const transition = CONTRACTOR_TRANSITIONS[transitionKey];
  if (!transition) {
    return createDecision(false, 'CONTRACTOR_TRANSITION_UNRECOGNIZED', 'The requested transition is not a recognized contractor workflow step.', { transitionKey });
  }
  if (!actor || !isNonEmptyString(actor.uid) || !isNonEmptyString(actor.organizationId)) {
    return createDecision(false, 'CONTRACTOR_ACTOR_REQUIRED', 'An authenticated, organization-scoped contractor actor is required.');
  }
  if (!observation) {
    return createDecision(false, 'CONTRACTOR_OBSERVATION_NOT_FOUND', 'The observation does not exist.');
  }
  if (observation.organizationId !== actor.organizationId) {
    return createDecision(false, 'CROSS_ORGANIZATION_DENIED', 'The observation belongs to a different organization than the caller.');
  }
  if (observation.assignedContractorUid !== actor.uid) {
    return createDecision(false, 'CONTRACTOR_NOT_ASSIGNED', 'The caller is not the contractor assigned to this observation.');
  }
  if (observation.status !== transition.from) {
    return createDecision(false, 'CONTRACTOR_TRANSITION_INVALID_CURRENT_STATUS', 'The observation is not in the status this transition requires.', { expected: transition.from, actual: observation.status });
  }
  return createDecision(true, 'CONTRACTOR_TRANSITION_ALLOWED', 'The transition is allowed.', { transitionKey, from: transition.from, to: transition.to });
}

// Builds the exact field set the trusted server write applies — the ONE
// place that decides what changes, so the server (not the client) is the
// authority for the final resolutionNote/status/updatedByUid/updatedAt.
function buildContractorObservationUpdate({ actor, observation, transitionKey, note, fix, afterImagePath }) {
  const decision = evaluateContractorObservationTransition({ actor, observation, transitionKey });
  if (!decision.allowed) return { decision, update: null };
  const transition = CONTRACTOR_TRANSITIONS[transitionKey];
  const eventLine = buildExecutionEventLine(transition.eventKind, fix);
  const update = {
    status: transition.to,
    resolutionNote: combineExecutionNote(observation.resolutionNote, note, eventLine),
    updatedByUid: actor.uid,
  };
  if (transitionKey === 'SUBMIT' && isNonEmptyString(afterImagePath)) {
    update.afterImagePath = afterImagePath;
  }
  return deepFreeze({ decision, update: deepFreeze(update) });
}

module.exports = Object.freeze({
  CONTRACTOR_TRANSITIONS,
  buildExecutionEventLine,
  combineExecutionNote,
  evaluateContractorObservationTransition,
  buildContractorObservationUpdate,
});
