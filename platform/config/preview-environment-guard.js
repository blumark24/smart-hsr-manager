'use strict';

const { createDecision, deepFreeze } = require('../contracts/decision');
const { APPROVED_PREVIEW_HOSTNAMES, APPROVED_STAGING_PROJECT_IDS } = require('./preview-environments');

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
