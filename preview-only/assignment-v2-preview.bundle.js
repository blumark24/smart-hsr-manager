/* Smart HSR Assignment V2 PREVIEW ONLY. Deterministic build; no source map. */
(function(globalThis){'use strict';
const modules={
"platform/assignments/assignment-contract.js":function(module,exports,require){
'use strict';

const { createDecision, deepFreeze } = require("platform/contracts/decision.js");

const ASSIGNMENT_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  REPLACED: 'REPLACED',
});

const ASSIGNMENT_STATUS_VALUES = Object.freeze(Object.values(ASSIGNMENT_STATUSES));

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateAssignmentContract(value) {
  if (!value || typeof value !== 'object') {
    return createDecision(false, 'ASSIGNMENT_REQUIRED', 'An assignment contract is required.');
  }

  for (const field of ['assignmentId', 'observationId', 'organizationId', 'contractorId', 'assignedBy', 'createdAt', 'updatedAt']) {
    if (!normalizeId(value[field])) {
      return createDecision(false, 'ASSIGNMENT_FIELD_REQUIRED', `Assignment field ${field} is required.`, { field });
    }
  }

  if (!ASSIGNMENT_STATUS_VALUES.includes(value.status)) {
    return createDecision(false, 'ASSIGNMENT_STATUS_UNSUPPORTED', 'The assignment status is not supported.', { status: value.status });
  }

  if (!Number.isInteger(value.version) || value.version < 1) {
    return createDecision(false, 'ASSIGNMENT_VERSION_INVALID', 'Assignment version must be a positive integer.');
  }

  if (!value.assignedAt) {
    return createDecision(false, 'ASSIGNED_AT_REQUIRED', 'Assignment assignedAt is required.');
  }

  if (value.status === ASSIGNMENT_STATUSES.ACTIVE && (value.replacedByAssignmentId || value.endedAt)) {
    return createDecision(false, 'ACTIVE_ASSIGNMENT_TERMINATION_CONFLICT', 'An active assignment cannot be replaced or ended.');
  }

  if (value.status === ASSIGNMENT_STATUSES.REPLACED && !normalizeId(value.replacedByAssignmentId)) {
    return createDecision(false, 'REPLACEMENT_ID_REQUIRED', 'A replaced assignment must identify its replacement.');
  }

  if (value.status !== ASSIGNMENT_STATUSES.ACTIVE && !value.endedAt) {
    return createDecision(false, 'ENDED_AT_REQUIRED', 'An inactive or replaced assignment must include endedAt.');
  }

  return createDecision(true, 'ASSIGNMENT_CONTRACT_VALID', 'The assignment contract is structurally valid.');
}

function createAssignmentContract(value) {
  const validation = validateAssignmentContract(value);
  if (!validation.allowed) return { decision: validation, assignment: null };

  const assignment = {
    assignmentId: normalizeId(value.assignmentId),
    observationId: normalizeId(value.observationId),
    organizationId: normalizeId(value.organizationId),
    contractorId: normalizeId(value.contractorId),
    status: value.status,
    version: value.version,
    assignedAt: value.assignedAt,
    assignedBy: normalizeId(value.assignedBy),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
  if (normalizeId(value.replacedByAssignmentId)) assignment.replacedByAssignmentId = normalizeId(value.replacedByAssignmentId);
  if (value.endedAt) assignment.endedAt = value.endedAt;

  return deepFreeze({ decision: validation, assignment: deepFreeze(assignment) });
}

module.exports = Object.freeze({
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_STATUS_VALUES,
  createAssignmentContract,
  validateAssignmentContract,
});

},
"platform/assignments/assignment-resolver.js":function(module,exports,require){
'use strict';

const { ASSIGNMENT_STATUSES } = require("platform/assignments/assignment-contract.js");
const { createDecision } = require("platform/contracts/decision.js");

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function assignmentIdOf(assignment) {
  return normalizeId(assignment && (assignment.assignmentId || assignment.id));
}

function observationIdOf(observation) {
  return normalizeId(observation && (observation.id || observation.docId));
}

function isActiveCurrent(assignment) {
  if (assignment.status !== undefined) {
    return assignment.status === ASSIGNMENT_STATUSES.ACTIVE
      && !assignment.replacedByAssignmentId
      && !assignment.endedAt;
  }
  return assignment.active === true && assignment.current === true;
}

function resolveAssignment({ actor, observation, assignment } = {}) {
  if (!assignment || typeof assignment !== 'object') {
    return createDecision(false, 'ASSIGNMENT_REQUIRED', 'A current assignment record is required for every contractor action.');
  }
  if (!actor || typeof actor !== 'object') {
    return createDecision(false, 'AUTHENTICATED_CONTEXT_REQUIRED', 'An authenticated actor context is required.');
  }
  if (!observation || typeof observation !== 'object') {
    return createDecision(false, 'OBSERVATION_REQUIRED', 'An observation is required.');
  }

  if (normalizeId(assignment.organizationId) !== normalizeId(observation.organizationId)
      || normalizeId(actor.organizationId) !== normalizeId(observation.organizationId)) {
    return createDecision(false, 'ASSIGNMENT_ORGANIZATION_MISMATCH', 'Actor, assignment, and observation organizations must match.');
  }
  if (normalizeId(assignment.contractorId) !== normalizeId(actor.uid)) {
    return createDecision(false, 'ASSIGNMENT_CONTRACTOR_MISMATCH', 'The assignment belongs to another contractor.');
  }

  const observationId = observationIdOf(observation);
  if (!observationId || normalizeId(assignment.observationId) !== observationId) {
    return createDecision(false, 'ASSIGNMENT_OBSERVATION_MISMATCH', 'The assignment does not reference the current observation.');
  }
  if (!isActiveCurrent(assignment)) {
    return createDecision(false, 'ASSIGNMENT_NOT_CURRENT', 'The assignment is inactive, ended, or replaced.');
  }

  const expectedAssignmentId = normalizeId(observation.currentAssignmentId || observation.assignmentId);
  if (expectedAssignmentId && assignmentIdOf(assignment) !== expectedAssignmentId) {
    return createDecision(false, 'ASSIGNMENT_REPLACED', 'The observation references a different current assignment.');
  }

  const observationVersion = observation.currentAssignmentVersion !== undefined
    ? observation.currentAssignmentVersion : observation.assignmentVersion;
  const observationHasVersion = observationVersion !== undefined && observationVersion !== null;
  const assignmentHasVersion = assignment.version !== undefined && assignment.version !== null;
  if ((observationHasVersion || assignmentHasVersion)
      && (!observationHasVersion || !assignmentHasVersion || observationVersion !== assignment.version)) {
    return createDecision(false, 'ASSIGNMENT_VERSION_MISMATCH', 'The assignment version is stale or does not match the observation.');
  }

  return createDecision(true, 'CURRENT_ASSIGNMENT_CONFIRMED', 'The current assignment belongs to this actor and observation.', {
    assignmentId: assignmentIdOf(assignment) || null,
    version: assignmentHasVersion ? assignment.version : null,
  });
}

module.exports = Object.freeze({ assignmentIdOf, isActiveCurrent, resolveAssignment });

},
"platform/assignments/canonical-assignment-write-service.js":function(module,exports,require){
'use strict';

const authorization = require("platform/core/authorization-decision-service.js");
const { createAssignmentContract, ASSIGNMENT_STATUSES } = require("platform/assignments/assignment-contract.js");
const { resolveAssignment } = require("platform/assignments/assignment-resolver.js");
const { createDecision, deepFreeze } = require("platform/contracts/decision.js");
const { ACTIONS, buildAssignmentAuditEvent } = require("platform/audit/assignment-audit-events.js");

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

},
"platform/assignments/firestore-assignment-store.js":function(module,exports,require){
'use strict';

function createFirestoreAssignmentStore({ db, sdk } = {}) {
  if (!db || !sdk) throw new TypeError('Firestore db and SDK are required.');
  const assignmentRef = id => sdk.doc(db, 'assignments', id);
  const observationRef = id => sdk.doc(db, 'observations', id);
  const value = snapshot => snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  return Object.freeze({
    deleteValue: () => sdk.deleteField(),
    getAssignment: async id => value(await sdk.getDoc(assignmentRef(id))),
    runTransaction: work => sdk.runTransaction(db, async transaction => work({
      getAssignment: async id => value(await transaction.get(assignmentRef(id))),
      getObservation: async id => value(await transaction.get(observationRef(id))),
      createAssignment: async assignment => transaction.set(assignmentRef(assignment.assignmentId), assignment),
      updateAssignment: async (id, patch) => transaction.update(assignmentRef(id), patch),
      updateObservation: async (id, patch) => transaction.update(observationRef(id), patch),
    })),
  });
}

module.exports = Object.freeze({ createFirestoreAssignmentStore });

},
"platform/assignments/legacy-assignment-bridge.js":function(module,exports,require){
'use strict';

const { validateAssignmentContract } = require("platform/assignments/assignment-contract.js");
const { deepFreeze } = require("platform/contracts/decision.js");

const BRIDGE_CLASSIFICATIONS = Object.freeze({
  CANONICAL: 'canonical',
  LEGACY_COMPATIBLE: 'legacy-compatible',
  AMBIGUOUS: 'ambiguous',
  INVALID: 'invalid',
});

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function resolveAssignmentBridge({ observation, assignment } = {}) {
  if (!observation || typeof observation !== 'object') {
    return deepFreeze({ classification: BRIDGE_CLASSIFICATIONS.INVALID, assignment: null, contractorActionAllowed: false, reason: 'Observation is required.' });
  }
  const observationId = text(observation.id || observation.docId);
  const organizationId = text(observation.organizationId);
  if (!observationId || !organizationId) {
    return deepFreeze({ classification: BRIDGE_CLASSIFICATIONS.INVALID, assignment: null, contractorActionAllowed: false, reason: 'Observation identity and organization are required.' });
  }
  if (assignment) {
    const validation = validateAssignmentContract(assignment);
    const pointerMatches = observation.currentAssignmentId === assignment.assignmentId
      && observation.currentAssignmentVersion === assignment.version;
    const resourceMatches = assignment.observationId === observationId
      && assignment.organizationId === organizationId;
    const valid = validation.allowed && pointerMatches && resourceMatches;
    return deepFreeze({
      classification: valid ? BRIDGE_CLASSIFICATIONS.CANONICAL : BRIDGE_CLASSIFICATIONS.INVALID,
      assignment: valid ? assignment : null,
      contractorActionAllowed: valid,
      reason: valid ? 'Canonical assignment and observation pointer match.' : 'Canonical assignment or pointer is invalid.',
    });
  }
  const contractorId = text(observation.assignedContractorUid);
  if (!contractorId) {
    return deepFreeze({ classification: BRIDGE_CLASSIFICATIONS.LEGACY_COMPATIBLE, assignment: null, contractorActionAllowed: false, reason: 'Legacy observation is unassigned.' });
  }
  if (observation.assignedAt && text(observation.assignedByUid)) {
    return deepFreeze({
      classification: BRIDGE_CLASSIFICATIONS.LEGACY_COMPATIBLE,
      assignment: null,
      contractorActionAllowed: false,
      reason: 'Legacy assignment can be displayed but lacks canonical identity, status, and version.',
    });
  }
  return deepFreeze({ classification: BRIDGE_CLASSIFICATIONS.AMBIGUOUS, assignment: null, contractorActionAllowed: false, reason: 'Legacy assignment provenance is incomplete.' });
}

module.exports = Object.freeze({ BRIDGE_CLASSIFICATIONS, resolveAssignmentBridge });

},
"platform/assignments/preview-compatibility-gate.js":function(module,exports,require){
'use strict';

const { BRIDGE_CLASSIFICATIONS, resolveAssignmentBridge } = require("platform/assignments/legacy-assignment-bridge.js");
const { createDecision, deepFreeze } = require("platform/contracts/decision.js");

function evaluatePreviewCompatibility(input = {}) {
  const bridge = resolveAssignmentBridge(input);
  const allowed = [BRIDGE_CLASSIFICATIONS.CANONICAL, BRIDGE_CLASSIFICATIONS.LEGACY_COMPATIBLE].includes(bridge.classification);
  const decision = allowed
    ? createDecision(true, 'PREVIEW_COMPATIBILITY_ALLOWED', 'Assignment shape is eligible for Preview processing.')
    : createDecision(false, 'PREVIEW_COMPATIBILITY_DENIED', 'Ambiguous or invalid assignment shape must fail closed.');
  return deepFreeze({ ...decision, classification: bridge.classification, bridge });
}

module.exports = Object.freeze({ evaluatePreviewCompatibility });

},
"platform/audit/assignment-audit-events.js":function(module,exports,require){
'use strict';

const { createAuditEvent } = require("platform/audit/audit-event-contract.js");

const ACTIONS = Object.freeze({
  CREATED: 'assignment_created', REPLACED: 'assignment_replaced', ENDED: 'assignment_ended',
  DENIED: 'authorization_denied', TRANSITION: 'workflow_transition_requested',
});

function buildAssignmentAuditEvent({ action, actor, observation, assignmentId, decision, timestamp, eventId, requestedState } = {}) {
  return createAuditEvent({
    eventId,
    context: { actor },
    resourceType: action === ACTIONS.TRANSITION ? 'observation' : 'assignment',
    resourceId: action === ACTIONS.TRANSITION ? observation.id : assignmentId,
    action,
    decision,
    previousState: observation && observation.status,
    requestedState,
    assignmentId,
    timestamp,
  });
}

module.exports = Object.freeze({ ACTIONS, buildAssignmentAuditEvent });

},
"platform/audit/audit-event-contract.js":function(module,exports,require){
'use strict';

const { ROLE_VALUES } = require("platform/contracts/role-contract.js");
const { createDecision, deepFreeze } = require("platform/contracts/decision.js");

const RESOURCE_TYPES = Object.freeze(['observation', 'assignment', 'organization']);
const DECISION_VALUES = Object.freeze(['ALLOW', 'DENY']);

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stateValue(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.status === 'string') return value.status;
  return undefined;
}

function validateAuditEvent(value) {
  if (!value || typeof value !== 'object') return createDecision(false, 'AUDIT_EVENT_REQUIRED', 'An audit event input is required.');
  for (const field of ['eventId', 'organizationId', 'actorId', 'resourceId', 'action', 'reasonCode', 'timestamp']) {
    if (!normalizeId(value[field])) {
      return createDecision(false, 'AUDIT_FIELD_REQUIRED', `Audit field ${field} is required.`, { field });
    }
  }
  if (!ROLE_VALUES.includes(value.actorRole)) return createDecision(false, 'AUDIT_ROLE_INVALID', 'Audit actorRole is not verified.');
  if (!RESOURCE_TYPES.includes(value.resourceType)) return createDecision(false, 'AUDIT_RESOURCE_TYPE_INVALID', 'Audit resourceType is not supported.');
  if (!DECISION_VALUES.includes(value.decision)) return createDecision(false, 'AUDIT_DECISION_INVALID', 'Audit decision must be ALLOW or DENY.');
  return createDecision(true, 'AUDIT_EVENT_VALID', 'The audit event is valid.');
}

function createAuditEvent({ eventId, context, resourceType = 'observation', resourceId, action, decision, previousState, requestedState, assignmentId, timestamp, correlationId } = {}) {
  const value = {
    eventId: normalizeId(eventId),
    organizationId: normalizeId(context && context.actor && context.actor.organizationId),
    actorId: normalizeId(context && context.actor && context.actor.uid),
    actorRole: context && context.actor && context.actor.role,
    resourceType,
    resourceId: normalizeId(resourceId),
    action: normalizeId(action),
    decision: decision && decision.allowed === true ? 'ALLOW' : 'DENY',
    reasonCode: normalizeId(decision && decision.code),
    timestamp: normalizeId(timestamp),
  };

  const previous = stateValue(previousState);
  const requested = stateValue(requestedState);
  if (previous !== undefined) value.previousState = previous;
  if (requested !== undefined) value.requestedState = requested;
  if (normalizeId(assignmentId)) value.assignmentId = normalizeId(assignmentId);
  if (normalizeId(correlationId)) value.correlationId = normalizeId(correlationId);

  const validation = validateAuditEvent(value);
  return deepFreeze({ decision: validation, event: validation.allowed ? deepFreeze(value) : null });
}

module.exports = Object.freeze({
  DECISION_VALUES,
  RESOURCE_TYPES,
  createAuditEvent,
  validateAuditEvent,
});

},
"platform/bootstrap/assignment-v2-preview-bootstrap.js":function(module,exports,require){
'use strict';

const { createFeatureFlags, PLATFORM_ASSIGNMENT_V2 } = require("platform/config/feature-flags.js");
const { evaluatePreviewEnvironment } = require("platform/config/preview-environment-guard.js");
const { createCanonicalAssignmentWriteService } = require("platform/assignments/canonical-assignment-write-service.js");
const { createFirestoreAssignmentStore } = require("platform/assignments/firestore-assignment-store.js");
const { createAssignmentV2Gateway } = require("platform/integration/assignment-v2-gateway.js");
const { deepFreeze } = require("platform/contracts/decision.js");

let state = { available: false, decision: deepFreeze({ allowed:false, code:'PREVIEW_NOT_INITIALIZED', reason:'Assignment V2 Preview is not initialized.', environment:'unknown' }), api: null, app: null };

function status() { return deepFreeze({ available: state.available, ...state.decision }); }

function initializeAssignmentV2Preview(options = {}) {
  const projectId = options.projectId || options.app?.options?.projectId;
  const decision = evaluatePreviewEnvironment({
    environment: options.environment,
    explicitOverride: options.explicitOverride,
    featureEnabled: options.featureEnabled,
    hostname: options.hostname,
    projectId,
    emulatorConnected: options.emulatorConnected,
  });
  if (!decision.allowed) { state = { available:false, decision, api:null, app:null }; return status(); }
  if (!options.app || !options.db || !options.sdk || typeof options.idFactory !== 'function' || typeof options.clock !== 'function' || options.app.options?.projectId !== projectId) {
    const denied=deepFreeze({allowed:false,code:'FIREBASE_DEPENDENCIES_INVALID',reason:'Existing Firebase app, Firestore instance, and SDK must match the approved project.',environment:decision.environment});
    state={available:false,decision:denied,api:null,app:null};return status();
  }
  if (state.available) {
    if (state.app !== options.app) return deepFreeze({available:false,allowed:false,code:'SECOND_FIREBASE_APP_DENIED',reason:'Preview bootstrap refuses a second Firebase app.',environment:decision.environment});
    return status();
  }

  const storeFactory = options.storeFactory || createFirestoreAssignmentStore;
  const serviceFactory = options.serviceFactory || createCanonicalAssignmentWriteService;
  const gatewayFactory = options.gatewayFactory || createAssignmentV2Gateway;
  const store = storeFactory({ db: options.db, sdk: options.sdk });
  const service = serviceFactory({ store, clock: options.clock, idFactory: options.idFactory });
  const gateway = gatewayFactory({ flags:createFeatureFlags({[PLATFORM_ASSIGNMENT_V2]:true}), assignmentService:service, legacyHandlers:{} });
  const api = Object.freeze({
    createAssignment: input => gateway.createAssignment(input),
    replaceAssignment: input => gateway.replaceAssignment(input),
  });
  state={available:true,decision,api,app:options.app};
  return status();
}

function isAssignmentV2PreviewAvailable() { return state.available; }
function getAssignmentV2PreviewStatus() { return status(); }
function getAssignmentV2PreviewApi() { return state.available ? state.api : null; }
function resetAssignmentV2PreviewForTests() { state={available:false,decision:deepFreeze({allowed:false,code:'PREVIEW_NOT_INITIALIZED',reason:'Assignment V2 Preview is not initialized.',environment:'unknown'}),api:null,app:null}; }

module.exports = Object.freeze({ getAssignmentV2PreviewApi, getAssignmentV2PreviewStatus, initializeAssignmentV2Preview, isAssignmentV2PreviewAvailable, resetAssignmentV2PreviewForTests });

},
"platform/browser/assignment-v2-preview-entry.js":function(module,exports,require){
'use strict';

const bootstrap = require("platform/bootstrap/assignment-v2-preview-bootstrap.js");
const { evaluatePreviewCompatibility } = require("platform/assignments/preview-compatibility-gate.js");

globalThis.SmartHSRAssignmentV2PreviewBundle = Object.freeze({
  getAssignmentV2PreviewApi: bootstrap.getAssignmentV2PreviewApi,
  getAssignmentV2PreviewStatus: bootstrap.getAssignmentV2PreviewStatus,
  initializeAssignmentV2Preview: bootstrap.initializeAssignmentV2Preview,
  isAssignmentV2PreviewAvailable: bootstrap.isAssignmentV2PreviewAvailable,
  evaluatePreviewCompatibility,
});

},
"platform/config/feature-flags.js":function(module,exports,require){
'use strict';

const PLATFORM_ASSIGNMENT_V2 = 'PLATFORM_ASSIGNMENT_V2';
const DEFAULT_FLAGS = Object.freeze({ [PLATFORM_ASSIGNMENT_V2]: false });

function createFeatureFlags(testOverrides = {}) {
  const overrides = { ...testOverrides };
  return Object.freeze({
    isEnabled(name) {
      return Object.prototype.hasOwnProperty.call(overrides, name)
        ? overrides[name] === true
        : DEFAULT_FLAGS[name] === true;
    },
  });
}

module.exports = Object.freeze({ DEFAULT_FLAGS, PLATFORM_ASSIGNMENT_V2, createFeatureFlags });

},
"platform/config/preview-environment-guard.js":function(module,exports,require){
'use strict';

const { createDecision, deepFreeze } = require("platform/contracts/decision.js");
const { APPROVED_PREVIEW_HOSTNAMES, APPROVED_STAGING_PROJECT_IDS } = require("platform/config/preview-environments.js");

function outcome(allowed, code, reason, environment = 'unknown') {
  return deepFreeze({ ...createDecision(allowed, code, reason), environment });
}

function evaluatePreviewEnvironment(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return outcome(false, 'PREVIEW_CONFIG_MALFORMED', 'Preview configuration must be an object.');
  const environment = typeof input.environment === 'string' ? input.environment.trim().toLowerCase() : 'unknown';
  if (environment !== 'preview') return outcome(false, 'PREVIEW_ENVIRONMENT_DENIED', 'Only the explicit preview environment is allowed.', environment);
  if (input.explicitOverride !== true) return outcome(false, 'PREVIEW_OVERRIDE_REQUIRED', 'An explicit Preview override is required.', environment);
  if (input.featureEnabled !== true) return outcome(false, 'PREVIEW_FEATURE_DISABLED', 'Assignment V2 remains disabled.', environment);

  const hostname = typeof input.hostname === 'string' ? input.hostname.trim().toLowerCase() : '';
  if (!hostname) return outcome(false, 'PREVIEW_HOST_REQUIRED', 'Preview hostname is required.', environment);
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  if (!local && !APPROVED_PREVIEW_HOSTNAMES.includes(hostname)) return outcome(false, 'PREVIEW_HOST_DENIED', 'Hostname is not approved for Preview.', environment);

  const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
  if (!projectId) return outcome(false, 'PREVIEW_PROJECT_REQUIRED', 'Firebase projectId is required.', environment);
  const demo = projectId.startsWith('demo-');
  const staging = APPROVED_STAGING_PROJECT_IDS.includes(projectId);
  if (!demo && !staging) return outcome(false, 'PRODUCTION_OR_UNKNOWN_PROJECT_DENIED', 'Firebase project is not a demo project or approved staging project.', environment);
  if (local && input.emulatorConnected !== true) return outcome(false, 'FIRESTORE_EMULATOR_REQUIRED', 'Local Preview requires an explicitly connected Firestore Emulator.', environment);

  return outcome(true, demo ? 'PREVIEW_DEMO_ALLOWED' : 'PREVIEW_STAGING_ALLOWED', 'Assignment V2 Preview environment is approved.', environment);
}

module.exports = Object.freeze({ evaluatePreviewEnvironment });

},
"platform/config/preview-environments.js":function(module,exports,require){
'use strict';

const APPROVED_PREVIEW_HOSTNAMES = Object.freeze([
  'preview-smart-hsr.local',
  'preview-smart-hsr.test',
]);

const APPROVED_STAGING_PROJECT_IDS = Object.freeze([
  'smart-hsr-staging',
]);

module.exports = Object.freeze({ APPROVED_PREVIEW_HOSTNAMES, APPROVED_STAGING_PROJECT_IDS });

},
"platform/contracts/decision.js":function(module,exports,require){
'use strict';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function createDecision(allowed, code, reason, metadata) {
  const value = { allowed: allowed === true, code: String(code), reason: String(reason) };
  if (metadata && typeof metadata === 'object' && Object.keys(metadata).length) {
    value.metadata = { ...metadata };
  }
  return deepFreeze(value);
}

function withDecisionMetadata(decision, metadata) {
  return createDecision(decision.allowed, decision.code, decision.reason, {
    ...(decision.metadata || {}),
    ...(metadata || {}),
  });
}

module.exports = Object.freeze({ createDecision, deepFreeze, withDecisionMetadata });

},
"platform/contracts/role-contract.js":function(module,exports,require){
'use strict';

const { createDecision } = require("platform/contracts/decision.js");

const ROLES = Object.freeze({
  OWNER: 'owner',
  MANAGER: 'manager',
  SUPERVISOR: 'supervisor',
  INSPECTOR: 'inspector',
  CONTRACTOR: 'contractor',
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

const ROLE_AUTHORITY = Object.freeze({
  owner: Object.freeze({
    organizationScope: 'platform',
    canCreateObservation: false,
    canEditObservation: false,
    canAssign: false,
    canReview: false,
    canReturn: false,
    canComplete: false,
  }),
  manager: Object.freeze({
    organizationScope: 'organization',
    canCreateObservation: false,
    canEditObservation: false,
    canAssign: true,
    canReview: true,
    canReturn: true,
    canComplete: true,
  }),
  supervisor: Object.freeze({
    organizationScope: 'organization',
    canCreateObservation: false,
    canEditObservation: false,
    canAssign: true,
    canReview: true,
    canReturn: true,
    canComplete: false,
  }),
  inspector: Object.freeze({
    organizationScope: 'organization',
    canCreateObservation: true,
    canEditObservation: true,
    canAssign: false,
    canReview: false,
    canReturn: false,
    canComplete: false,
  }),
  contractor: Object.freeze({
    organizationScope: 'organization',
    canCreateObservation: false,
    canEditObservation: false,
    canAssign: false,
    canReview: false,
    canReturn: false,
    canComplete: false,
  }),
});

function getRoleAuthority(role) {
  return ROLE_AUTHORITY[role] || null;
}

function evaluateRoleAuthority(role, capability) {
  const authority = getRoleAuthority(role);
  if (!authority) {
    return createDecision(false, 'ROLE_NOT_RECOGNIZED', 'The actor role is not a verified Smart HSR role.', { role });
  }
  if (authority[capability] !== true) {
    return createDecision(false, 'ROLE_AUTHORITY_DENIED', 'The actor role does not hold the requested authority.', { role, capability });
  }
  return createDecision(true, 'ROLE_AUTHORITY_CONFIRMED', 'The actor role holds the requested authority.', { role, capability });
}

module.exports = Object.freeze({ ROLES, ROLE_VALUES, ROLE_AUTHORITY, getRoleAuthority, evaluateRoleAuthority });

},
"platform/core/authorization-decision-service.js":function(module,exports,require){
'use strict';

const { createDecision, withDecisionMetadata } = require("platform/contracts/decision.js");
const { ROLES, evaluateRoleAuthority } = require("platform/contracts/role-contract.js");
const { evaluateOrganizationScope } = require("platform/policies/organization-scope-policy.js");
const { evaluateAssignmentOwnership } = require("platform/policies/assignment-ownership-policy.js");
const { evaluateTransition } = require("platform/policies/observation-workflow-policy.js");

function observationIdOf(observation) {
  const value = observation && (observation.id || observation.docId);
  return typeof value === 'string' ? value.trim() : '';
}

function actorOf(context) {
  return context && context.actor;
}

function resourceOf(context) {
  return context && (context.observation || context.resource);
}

function decorate(decision, action, context) {
  return withDecisionMetadata(decision, {
    action,
    actorRole: actorOf(context) && actorOf(context).role,
    resourceId: observationIdOf(resourceOf(context)) || null,
  });
}

function requireScope(context, action) {
  return decorate(evaluateOrganizationScope({ actor: actorOf(context), resource: resourceOf(context) }), action, context);
}

function canCreateObservation(context = {}) {
  const actor = actorOf(context);
  const observation = resourceOf(context);
  const scope = requireScope(context, 'create_observation');
  if (!scope.allowed) return scope;
  const authority = evaluateRoleAuthority(actor.role, 'canCreateObservation');
  if (!authority.allowed) return decorate(authority, 'create_observation', context);
  if (!actor.uid || observation.createdByUid !== actor.uid) {
    return decorate(createDecision(false, 'CREATOR_IDENTITY_MISMATCH', 'The inspector must create the observation as their own resource.'), 'create_observation', context);
  }
  if (observation.status !== 'PENDING') {
    return decorate(createDecision(false, 'INITIAL_STATUS_INVALID', 'A new observation must start as PENDING.'), 'create_observation', context);
  }
  return decorate(createDecision(true, 'OBSERVATION_CREATE_ALLOWED', 'The inspector may create this organization-scoped observation.'), 'create_observation', context);
}

function canUpdateObservation(context = {}) {
  const actor = actorOf(context);
  const role = actor && actor.role;
  if (role !== ROLES.INSPECTOR) {
    return decorate(createDecision(false, 'INSPECTOR_UPDATE_ROLE_REQUIRED', 'Generic observation editing is restricted to the creating inspector; managerial actions use named methods.'), 'update_observation', context);
  }
  return decorate(evaluateAssignmentOwnership({
    actor,
    observation: resourceOf(context),
    assignment: context.assignment,
    action: 'update',
  }), 'update_observation', context);
}

function canAssignObservation(context = {}) {
  const actor = actorOf(context);
  const scope = requireScope(context, 'assign_observation');
  if (!scope.allowed) return scope;
  const authority = evaluateRoleAuthority(actor && actor.role, 'canAssign');
  if (!authority.allowed) return decorate(authority, 'assign_observation', context);
  if (resourceOf(context).status !== 'PENDING') {
    return decorate(createDecision(false, 'ASSIGNMENT_STATUS_INVALID', 'Assignment is supported only while the observation is PENDING.'), 'assign_observation', context);
  }
  return decorate(createDecision(true, 'OBSERVATION_ASSIGN_ALLOWED', 'The managerial role may assign this observation.'), 'assign_observation', context);
}

function canStartObservation(context = {}) {
  if (!actorOf(context) || actorOf(context).role !== ROLES.CONTRACTOR) {
    return decorate(createDecision(false, 'CONTRACTOR_START_ROLE_REQUIRED', 'Only the current assigned contractor may start an observation.'), 'start_observation', context);
  }
  return decorate(evaluateTransition({
    actor: actorOf(context), observation: resourceOf(context), assignment: context.assignment, toStatus: 'IN_PROGRESS',
  }), 'start_observation', context);
}

function canSubmitEvidence(context = {}) {
  return decorate(evaluateTransition({
    actor: actorOf(context), observation: resourceOf(context), assignment: context.assignment, toStatus: 'PENDING_REVIEW',
  }), 'submit_evidence', context);
}

function canReviewObservation(context = {}) {
  const actor = actorOf(context);
  const scope = requireScope(context, 'review_observation');
  if (!scope.allowed) return scope;
  const authority = evaluateRoleAuthority(actor && actor.role, 'canReview');
  if (!authority.allowed) return decorate(authority, 'review_observation', context);
  if (resourceOf(context).status !== 'PENDING_REVIEW') {
    return decorate(createDecision(false, 'REVIEW_STATUS_INVALID', 'Review requires PENDING_REVIEW status.'), 'review_observation', context);
  }
  return decorate(createDecision(true, 'OBSERVATION_REVIEW_ALLOWED', 'The managerial role may review this observation.'), 'review_observation', context);
}

function canReturnObservation(context = {}) {
  return decorate(evaluateTransition({
    actor: actorOf(context), observation: resourceOf(context), assignment: context.assignment, toStatus: 'IN_PROGRESS',
  }), 'return_observation', context);
}

function canCompleteObservation(context = {}) {
  return decorate(evaluateTransition({
    actor: actorOf(context), observation: resourceOf(context), assignment: context.assignment, toStatus: 'COMPLETED',
  }), 'complete_observation', context);
}

module.exports = Object.freeze({
  canAssignObservation,
  canCompleteObservation,
  canCreateObservation,
  canReviewObservation,
  canReturnObservation,
  canStartObservation,
  canSubmitEvidence,
  canUpdateObservation,
});

},
"platform/integration/assignment-v2-gateway.js":function(module,exports,require){
'use strict';

const authorization = require("platform/core/authorization-decision-service.js");
const { PLATFORM_ASSIGNMENT_V2 } = require("platform/config/feature-flags.js");
const { resolveAssignmentBridge, BRIDGE_CLASSIFICATIONS } = require("platform/assignments/legacy-assignment-bridge.js");
const { ACTIONS, buildAssignmentAuditEvent } = require("platform/audit/assignment-audit-events.js");

function createAssignmentV2Gateway({ flags, assignmentService, legacyHandlers = {}, clock = () => new Date().toISOString(), idFactory = () => 'event' } = {}) {
  const enabled = () => flags.isEnabled(PLATFORM_ASSIGNMENT_V2);
  const route = (legacyName, v2) => (...args) => enabled() ? v2(...args) : legacyHandlers[legacyName](...args);

  async function transition(method, input) {
    const bridge = resolveAssignmentBridge({ observation: input.observation, assignment: input.assignment });
    if (input.actor.role === 'contractor' && bridge.classification !== BRIDGE_CLASSIFICATIONS.CANONICAL) {
      return { allowed: false, code: 'V2_CANONICAL_ASSIGNMENT_REQUIRED', reason: bridge.reason, auditEvent: null };
    }
    const decision = authorization[method]({ actor: input.actor, observation: input.observation, assignment: bridge.assignment || input.assignment });
    const auditEvent = buildAssignmentAuditEvent({ action: decision.allowed ? ACTIONS.TRANSITION : ACTIONS.DENIED, actor: input.actor, observation: input.observation, assignmentId: input.assignment && input.assignment.assignmentId, decision, requestedState: input.toStatus, timestamp: clock(), eventId: `audit-${idFactory()}` }).event;
    if (!decision.allowed) return { ...decision, auditEvent };
    return { ...decision, auditEvent, writeRequest: { observationId: input.observation.id, patch: input.patch } };
  }

  return Object.freeze({
    createAssignment: route('createAssignment', input => assignmentService.createAssignment(input)),
    replaceAssignment: route('replaceAssignment', input => assignmentService.replaceAssignment(input)),
    endAssignment: route('endAssignment', input => assignmentService.endAssignment(input)),
    startExecution: route('startExecution', input => transition('canStartObservation', input)),
    submitEvidence: route('submitEvidence', input => transition('canSubmitEvidence', input)),
    returnObservation: route('returnObservation', input => transition('canReturnObservation', input)),
    completeObservation: route('completeObservation', input => transition('canCompleteObservation', input)),
    updateInspectorObservation: route('updateInspectorObservation', input => transition('canUpdateObservation', input)),
  });
}

module.exports = Object.freeze({ createAssignmentV2Gateway });

},
"platform/policies/assignment-ownership-policy.js":function(module,exports,require){
'use strict';

const { evaluateOrganizationScope } = require("platform/policies/organization-scope-policy.js");
const { resolveAssignment } = require("platform/assignments/assignment-resolver.js");

const OPERATIONAL_ROLES = Object.freeze(['manager', 'supervisor', 'inspector', 'contractor']);

function decision(allowed, code, reason) {
  return Object.freeze({ allowed, reason, code });
}

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function observationIdOf(observation) {
  return normalizeId(observation && (observation.id || observation.docId));
}

function evaluateContractorAssignment({ actor, observation, assignment } = {}) {
  return resolveAssignment({ actor, observation, assignment });
}

function evaluateAssignmentOwnership({ actor, observation, assignment, action = 'update' } = {}) {
  const scope = evaluateOrganizationScope({ actor, resource: observation });
  if (!scope.allowed) return scope;

  if (!actor || !OPERATIONAL_ROLES.includes(actor.role)) {
    return decision(false, 'OPERATIONAL_ROLE_REQUIRED', 'The actor does not hold an operational observation role.');
  }

  const actorUid = normalizeId(actor.uid);
  if (!actorUid) {
    return decision(false, 'ACTOR_UID_REQUIRED', 'The authenticated actor has no uid.');
  }

  if (!observation || typeof observation !== 'object') {
    return decision(false, 'OBSERVATION_REQUIRED', 'An observation is required.');
  }

  if (actor.role === 'contractor') {
    if (!['start', 'submit_evidence', 'view'].includes(action)) {
      return decision(false, 'CONTRACTOR_ACTION_DENIED', 'The requested action is outside the contractor assignment contract.');
    }
    const assignmentDecision = evaluateContractorAssignment({ actor, observation, assignment });
    if (!assignmentDecision.allowed) return assignmentDecision;
    return decision(true, 'CONTRACTOR_ASSIGNEE', 'The contractor owns the current assignment.');
  }

  if (actor.role === 'inspector') {
    if (normalizeId(observation.createdByUid) !== actorUid) {
      return decision(false, 'INSPECTOR_OWNERSHIP_REQUIRED', 'The observation was created by another inspector.');
    }
    if (!['update', 'view'].includes(action)) {
      return decision(false, 'INSPECTOR_ACTION_DENIED', 'An inspector may update an owned observation before assignment, but may not approve or complete it.');
    }
    if (action === 'update' && (normalizeId(observation.assignedContractorUid) || assignment)) {
      return decision(false, 'INSPECTOR_UPDATE_AFTER_ASSIGNMENT_DENIED', 'An inspector may not update an observation after assignment.');
    }
    return decision(true, 'INSPECTOR_CREATOR', 'The inspector created the observation.');
  }

  if (actor.role === 'supervisor') {
    if (!['assign', 'review', 'return', 'view'].includes(action)) {
      return decision(false, 'SUPERVISOR_ACTION_DENIED', 'A supervisor may assign, review, return, or view, but may not close.');
    }
    return decision(true, 'SUPERVISOR_ORGANIZATION_AUTHORITY', 'The supervisor may perform the requested same-organization action.');
  }

  if (actor.role === 'manager') {
    if (!['assign', 'review', 'return', 'close', 'view'].includes(action)) {
      return decision(false, 'MANAGER_ACTION_DENIED', 'The requested action is outside the manager observation contract.');
    }
    return decision(true, 'MANAGER_ORGANIZATION_AUTHORITY', 'The manager may perform the requested same-organization action.');
  }

  return decision(false, 'OPERATIONAL_ROLE_REQUIRED', 'The actor does not hold an operational observation role.');
}

module.exports = Object.freeze({
  OPERATIONAL_ROLES,
  evaluateContractorAssignment,
  evaluateAssignmentOwnership,
});

},
"platform/policies/observation-workflow-policy.js":function(module,exports,require){
'use strict';

const { evaluateAssignmentOwnership } = require("platform/policies/assignment-ownership-policy.js");

const OBSERVATION_STATUSES = Object.freeze([
  'PENDING',
  'IN_PROGRESS',
  'PENDING_REVIEW',
  'COMPLETED',
]);

const TRANSITION_MATRIX = Object.freeze({
  PENDING: Object.freeze({
    IN_PROGRESS: Object.freeze({
      roles: Object.freeze(['contractor', 'manager', 'supervisor']),
      actionByRole: Object.freeze({ contractor: 'start', manager: 'assign', supervisor: 'assign' }),
      assignmentOwnershipRequired: true,
      organizationOwnershipRequired: true,
    }),
  }),
  IN_PROGRESS: Object.freeze({
    PENDING_REVIEW: Object.freeze({
      roles: Object.freeze(['contractor']),
      actionByRole: Object.freeze({ contractor: 'submit_evidence' }),
      assignmentOwnershipRequired: true,
      organizationOwnershipRequired: true,
    }),
  }),
  PENDING_REVIEW: Object.freeze({
    IN_PROGRESS: Object.freeze({
      roles: Object.freeze(['manager', 'supervisor']),
      actionByRole: Object.freeze({ manager: 'return', supervisor: 'return' }),
      assignmentOwnershipRequired: false,
      organizationOwnershipRequired: true,
    }),
    COMPLETED: Object.freeze({
      roles: Object.freeze(['manager']),
      actionByRole: Object.freeze({ manager: 'close' }),
      assignmentOwnershipRequired: false,
      organizationOwnershipRequired: true,
    }),
  }),
  COMPLETED: Object.freeze({}),
});

function decision(allowed, code, reason) {
  return Object.freeze({ allowed, reason, code });
}

function evaluateTransition({ actor, observation, assignment, toStatus } = {}) {
  const fromStatus = observation && observation.status;
  if (!OBSERVATION_STATUSES.includes(fromStatus) || !OBSERVATION_STATUSES.includes(toStatus)) {
    return decision(false, 'UNSUPPORTED_STATUS', 'The current or requested observation status is not supported.');
  }

  if (fromStatus === toStatus) {
    return decision(false, 'STATUS_UNCHANGED', 'A workflow transition must change the observation status.');
  }

  const contract = TRANSITION_MATRIX[fromStatus][toStatus];
  if (!contract) {
    return decision(false, 'INVALID_TRANSITION', `The transition ${fromStatus} -> ${toStatus} is not legal.`);
  }

  if (!actor || !contract.roles.includes(actor.role)) {
    return decision(false, 'ROLE_TRANSITION_DENIED', 'The authenticated role may not request this transition.');
  }

  const action = contract.actionByRole[actor.role];
  const ownership = evaluateAssignmentOwnership({ actor, observation, assignment, action });
  if (!ownership.allowed) return ownership;

  return decision(true, 'TRANSITION_ALLOWED', `The ${actor.role} role may request ${fromStatus} -> ${toStatus}.`);
}

function describeTransition(fromStatus, toStatus) {
  return TRANSITION_MATRIX[fromStatus] && TRANSITION_MATRIX[fromStatus][toStatus]
    ? TRANSITION_MATRIX[fromStatus][toStatus]
    : null;
}

module.exports = Object.freeze({
  OBSERVATION_STATUSES,
  TRANSITION_MATRIX,
  describeTransition,
  evaluateTransition,
});

},
"platform/policies/organization-scope-policy.js":function(module,exports,require){
'use strict';

const PLATFORM_OWNER_ROLE = 'owner';

function decision(allowed, code, reason) {
  return Object.freeze({ allowed, reason, code });
}

function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Pure tenant-boundary contract. The existing owner role is the only role
 * allowed to select organizations across the platform. Operational policies
 * may still deny an owner a specific action after this scope check succeeds.
 */
function evaluateOrganizationScope({ actor, resource } = {}) {
  if (!actor || typeof actor !== 'object') {
    return decision(false, 'AUTHENTICATED_CONTEXT_REQUIRED', 'An authenticated actor context is required.');
  }

  if (actor.role === PLATFORM_OWNER_ROLE) {
    return decision(true, 'PLATFORM_OWNER_SCOPE', 'The existing platform owner role may select an organization explicitly.');
  }

  const authenticatedOrganizationId = normalizeId(actor.organizationId);
  if (!authenticatedOrganizationId) {
    return decision(false, 'AUTHENTICATED_ORGANIZATION_REQUIRED', 'The authenticated context has no organizationId.');
  }

  const resourceOrganizationId = normalizeId(resource && resource.organizationId);
  if (!resourceOrganizationId) {
    return decision(false, 'RESOURCE_ORGANIZATION_REQUIRED', 'The resource has no organizationId.');
  }

  if (authenticatedOrganizationId !== resourceOrganizationId) {
    return decision(false, 'CROSS_ORGANIZATION_DENIED', 'The authenticated and resource organizations do not match.');
  }

  return decision(true, 'ORGANIZATION_MATCH', 'The authenticated and resource organizations match.');
}

module.exports = Object.freeze({
  PLATFORM_OWNER_ROLE,
  evaluateOrganizationScope,
});

}
};
const cache=Object.create(null);function require(id){if(cache[id])return cache[id].exports;if(!modules[id])throw new Error('Preview bundle module not found: '+id);const module={exports:{}};cache[id]=module;modules[id](module,module.exports,require);return module.exports;}
require("platform/browser/assignment-v2-preview-entry.js");
})(globalThis);
