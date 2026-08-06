'use strict';

const { createFeatureFlags, PLATFORM_ASSIGNMENT_V2 } = require('../config/feature-flags');
const { evaluatePreviewEnvironment } = require('../config/preview-environment-guard');
const { createCanonicalAssignmentWriteService } = require('../assignments/canonical-assignment-write-service');
const { createFirestoreAssignmentStore } = require('../assignments/firestore-assignment-store');
const { createAssignmentV2Gateway } = require('../integration/assignment-v2-gateway');
const { deepFreeze } = require('../contracts/decision');

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
