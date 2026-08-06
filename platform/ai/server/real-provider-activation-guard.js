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

module.exports = Object.freeze({ evaluateRealProviderActivation });
