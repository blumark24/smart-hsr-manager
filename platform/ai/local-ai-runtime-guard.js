'use strict';

const ALLOWED_MODES = Object.freeze(['test', 'local']);

function evaluateLocalAIRuntime(config = {}) {
  if (config.enabled !== true) return Object.freeze({ allowed: false, code: 'AI_RUNTIME_DISABLED', reason: 'Local AI runtime is disabled by default.' });
  if (!ALLOWED_MODES.includes(config.mode)) return Object.freeze({ allowed: false, code: 'AI_RUNTIME_ENVIRONMENT_DENIED', reason: 'AI runtime is restricted to test/local mode.' });
  if (config.publicAccess === true || config.firebaseEnabled === true || config.cloudEnabled === true || config.externalNetworkEnabled === true) {
    return Object.freeze({ allowed: false, code: 'AI_RUNTIME_ISOLATION_REQUIRED', reason: 'Public, Firebase, cloud, and external-network access must remain disabled.' });
  }
  return Object.freeze({ allowed: true, code: 'AI_RUNTIME_LOCAL_READY', reason: 'AI runtime is isolated for local/test execution.' });
}

module.exports = Object.freeze({ ALLOWED_MODES, evaluateLocalAIRuntime });
