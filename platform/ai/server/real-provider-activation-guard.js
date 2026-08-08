'use strict';

function evaluateRealProviderActivation(config = {}) {
  const checks = [
    ['localEvaluationEnabled', config.localEvaluationEnabled === true, 'AI_REAL_EVALUATION_DISABLED'],
    ['syntheticDataOnly', config.syntheticDataOnly === true, 'AI_REAL_SYNTHETIC_DATA_REQUIRED'],
    ['providerExplicitlySelected', config.providerExplicitlySelected === true, 'AI_REAL_PROVIDER_SELECTION_REQUIRED'],
    ['apiKeyPresent', config.apiKeyPresent === true, 'AI_REAL_API_KEY_REQUIRED'],
    ['noApplicationIntegration', config.noApplicationIntegration === true, 'AI_REAL_APPLICATION_ISOLATION_REQUIRED'],
    ['serverOnly', config.runtimeTarget === 'server' && typeof window === 'undefined', 'AI_REAL_SERVER_ONLY'],
  ];
  const failed = checks.find(([, passed]) => !passed);
  if (failed) return Object.freeze({ allowed: false, code: failed[2], reason: `Real provider activation requirement ${failed[0]} was not satisfied.` });
  return Object.freeze({ allowed: true, code: 'AI_REAL_PROVIDER_EVALUATION_ALLOWED', reason: 'Explicit local synthetic evaluation is allowed.' });
}

// Distinct, additive activation gate for genuine live-application traffic
// (Sprint 6.8: Inspector Upload -> AI Gateway -> Gemini Vision Provider).
// This is deliberately a SEPARATE function from evaluateRealProviderActivation
// above rather than a relaxed mode of it: the evaluation gate's
// syntheticDataOnly/noApplicationIntegration checks exist specifically to
// keep that path isolated from real application traffic, and real inspector
// photos flowing through the live app are neither synthetic nor
// application-isolated. Claiming otherwise to satisfy the evaluation gate
// would be dishonest to what that gate verifies, so live activation instead
// requires its own explicit, human-operator-controlled flag
// (SMART_HSR_AI_APPLICATION_INTEGRATION) plus request-level authentication
// and organization-allowlist checks that the evaluation gate has no concept
// of. The evaluation gate and its existing callers/tests are unchanged.
function evaluateApplicationProviderActivation(config = {}) {
  const checks = [
    ['applicationIntegrationEnabled', config.applicationIntegrationEnabled === true, 'AI_APPLICATION_INTEGRATION_DISABLED'],
    ['providerExplicitlySelected', config.providerExplicitlySelected === true, 'AI_APPLICATION_PROVIDER_SELECTION_REQUIRED'],
    ['apiKeyPresent', config.apiKeyPresent === true, 'AI_APPLICATION_API_KEY_REQUIRED'],
    ['organizationAllowed', config.organizationAllowed === true, 'AI_APPLICATION_ORGANIZATION_NOT_ENABLED'],
    ['authenticatedRequest', config.authenticatedRequest === true, 'AI_APPLICATION_AUTHENTICATION_REQUIRED'],
    ['serverOnly', config.runtimeTarget === 'server' && typeof window === 'undefined', 'AI_APPLICATION_SERVER_ONLY'],
  ];
  const failed = checks.find(([, passed]) => !passed);
  if (failed) return Object.freeze({ allowed: false, code: failed[2], reason: `Application provider activation requirement ${failed[0]} was not satisfied.` });
  return Object.freeze({ allowed: true, code: 'AI_APPLICATION_PROVIDER_EVALUATION_ALLOWED', reason: 'Explicit live application AI integration is allowed for this request.' });
}

module.exports = Object.freeze({ evaluateRealProviderActivation, evaluateApplicationProviderActivation });
