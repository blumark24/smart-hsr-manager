'use strict';

const { validateAIProvider, aiFailure } = require('./ai-provider-contract');
const { DEFAULT_TIMEOUT_MS, validateAnalyzeInput, validateAIOutput, createControlledProviderInput } = require('./ai-security-policy');
const { advisoryEnvelope } = require('./human-approval-policy');

const PROVIDER_KINDS = Object.freeze(['MOCK', 'OPENROUTER_COMPATIBLE', 'OPENAI_COMPATIBLE', 'GEMINI_COMPATIBLE', 'SAUDI_PRIVATE', 'ON_PREMISES']);

async function withTimeout(operation, timeoutMs) {
  let timer;
  try {
    return await Promise.race([operation(), new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('AI timeout'), { code: 'AI_TIMEOUT' })), timeoutMs); })]);
  } finally { if (timer) clearTimeout(timer); }
}

function createProviderRouter({ selectedProvider = null, providers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const selected = selectedProvider == null ? null : String(selectedProvider);
  return Object.freeze({
    async analyzeObservationImage(input, authenticatedContext) {
      if (!selected) return advisoryEnvelope(aiFailure('AI_PROVIDER_NOT_CONFIGURED', 'No AI provider is enabled.'));
      const registration = providers[selected];
      if (!registration || !PROVIDER_KINDS.includes(registration.kind)) return advisoryEnvelope(aiFailure('AI_PROVIDER_NOT_AVAILABLE', 'Configured AI provider is unavailable.'));
      if (registration.enabled !== true) return advisoryEnvelope(aiFailure('AI_PROVIDER_DISABLED', 'Configured AI provider is disabled.', { provider: selected }));
      if (registration.capabilities?.vision !== true) return advisoryEnvelope(aiFailure('AI_PROVIDER_VISION_REQUIRED', 'Image analysis requires vision capability.', { provider: selected }));
      if (!validateAIProvider(registration.provider).allowed) return advisoryEnvelope(aiFailure('AI_PROVIDER_CONTRACT_INVALID', 'Provider does not implement the required contract.', { provider: selected }));
      const inputDecision = validateAnalyzeInput(input, authenticatedContext); if (!inputDecision.allowed) return advisoryEnvelope(aiFailure(inputDecision.code, inputDecision.reason, { provider: selected }));
      let output;
      try { output = await withTimeout(() => registration.provider.analyzeObservationImage(createControlledProviderInput(input)), timeoutMs); }
      catch (error) {
        const code = error?.code === 'AI_TIMEOUT' ? 'AI_TIMEOUT' : 'AI_PROVIDER_ERROR';
        console.warn('ai provider router caught provider exception', { provider: selected, failureStage: code === 'AI_TIMEOUT' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_EXCEPTION', errorCode: code });
        return advisoryEnvelope(aiFailure(code, code === 'AI_TIMEOUT' ? 'AI provider timed out.' : 'AI provider failed.', { provider: selected }));
      }
      if (!output || output.ok !== true) {
        const errorCode = typeof output?.errorCode === 'string' ? output.errorCode : 'AI_PROVIDER_ERROR';
        const diagnosticStage = typeof output?.diagnosticStage === 'string' ? output.diagnosticStage : 'PROVIDER_RESULT';
        const validationCode = typeof output?.validationCode === 'string' ? output.validationCode : null;
        console.warn('ai provider router received failure result', { provider: selected, failureStage: diagnosticStage, errorCode, validationCode });
        return advisoryEnvelope(aiFailure(errorCode, typeof output?.reason === 'string' ? output.reason : 'AI provider failed.', { provider: selected }));
      }
      const outputDecision = validateAIOutput(output);
      if (!outputDecision.allowed) {
        console.warn('ai provider router rejected successful output', { provider: selected, failureStage: 'ROUTER_OUTPUT_VALIDATION', errorCode: 'AI_PROVIDER_OUTPUT_INVALID', validationCode: outputDecision.code });
        return advisoryEnvelope(aiFailure('AI_PROVIDER_OUTPUT_INVALID', outputDecision.code, { provider: selected }));
      }
      return advisoryEnvelope(Object.freeze({ ...output, warnings: Object.freeze([...output.warnings]) }));
    },
  });
}

module.exports = Object.freeze({ PROVIDER_KINDS, createProviderRouter });
