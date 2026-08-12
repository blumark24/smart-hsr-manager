'use strict';

const { evaluateRealProviderActivation, evaluateApplicationProviderActivation } = require('./real-provider-activation-guard');
const { MUNICIPAL_VISION_OUTPUT_SCHEMA, buildControlledVisionPrompt } = require('./municipal-vision-prompt');
const { validateEvaluationInput, parseProviderJSON, normalizeVisionResult, callWithTimeout, normalizeAdapterError } = require('./provider-adapter-utils');
const { MAX_IMAGE_PAYLOAD_BYTES, ALLOWED_IMAGE_MIME_TYPES } = require('../ai-security-policy');

// Sprint 6.11 Phase 1: additive OpenAI vision provider. Same
// evaluation-only activation gate, same ai-provider-contract.js shape, and
// same normalizeVisionResult/parseProviderJSON pipeline as the existing
// Gemini and OpenRouter adapters (platform/ai/server/*-compatible-vision-provider.js)
// -- this file changes nothing about the router, the Gemini provider, or the
// live Inspector/Manager/Owner workflow. It is registered into
// createProviderRouter's existing 'OPENAI_COMPATIBLE' kind by whoever
// constructs the router; provider-router.js itself is unmodified.
//
// Sprint 6.11 Phase 2: mode:'application' added, mirroring
// gemini-compatible-vision-provider.js exactly -- see that file's header
// comment for why evaluation and application are two distinct, separately
// gated modes rather than one relaxed check. This keeps the two live
// providers symmetric for platform/ai/server/active-vision-provider-selector.js.
function createOpenAICompatibleVisionProvider({ enabled = false, environment = process.env, transport = null, timeoutMs = 10000, clock = () => Date.now(), mode = 'evaluation', applicationContext = null } = {}) {
  const apiKey = typeof environment.OPENAI_API_KEY === 'string' ? environment.OPENAI_API_KEY.trim() : '';
  const model = typeof environment.OPENAI_VISION_MODEL === 'string' ? environment.OPENAI_VISION_MODEL.trim() : '';
  const activation = () => mode === 'application'
    ? evaluateApplicationProviderActivation({
        applicationIntegrationEnabled: enabled && environment.SMART_HSR_AI_APPLICATION_INTEGRATION === 'true',
        providerExplicitlySelected: environment.SMART_HSR_AI_PROVIDER === 'openai',
        apiKeyPresent: !!apiKey,
        organizationAllowed: applicationContext?.organizationAllowed === true,
        authenticatedRequest: applicationContext?.authenticatedRequest === true,
        runtimeTarget: 'server',
      })
    : evaluateRealProviderActivation({ localEvaluationEnabled: enabled && environment.SMART_HSR_REAL_AI_EVALUATION === 'true', syntheticDataOnly: environment.SMART_HSR_SYNTHETIC_DATA_ONLY === 'true', providerExplicitlySelected: environment.SMART_HSR_AI_PROVIDER === 'openai', apiKeyPresent: !!apiKey, noApplicationIntegration: environment.SMART_HSR_NO_APP_INTEGRATION === 'true', runtimeTarget: 'server' });
  const capabilities = Object.freeze({ providerId: 'openai', supportsVision: true, supportsBeforeAfter: false, supportsStructuredOutput: true, supportsArabic: true, maxImageBytes: MAX_IMAGE_PAYLOAD_BYTES, supportedMimeTypes: ALLOWED_IMAGE_MIME_TYPES, timeoutMs });

  return Object.freeze({
    capabilities,
    async analyzeObservationImage(input = {}) {
      const started = clock();
      try {
        const guard = activation(); if (!guard.allowed) throw Object.assign(new Error(guard.reason), { code: guard.code });
        if (!model || !/^[A-Za-z0-9._-]{1,128}$/.test(model)) throw Object.assign(new Error('OpenAI vision model is not explicitly configured.'), { code: 'AI_PROVIDER_UNAVAILABLE' });
        const image = validateEvaluationInput(input); if (!image.allowed) throw Object.assign(new Error(image.reason), { code: image.code });
        const imageData = Buffer.from(input.controlledImagePayload).toString('base64');
        const body = { model, messages: [{ role: 'user', content: [{ type: 'text', text: buildControlledVisionPrompt(input) }, { type: 'image_url', image_url: { url: `data:${input.imageContentType};base64,${imageData}` } }] }],
          response_format: { type: 'json_schema', json_schema: { name: 'smart_hsr_municipal_vision', strict: true, schema: MUNICIPAL_VISION_OUTPUT_SCHEMA } }, temperature: 0 };
        const response = await callWithTimeout(transport, { method: 'POST', url: 'https://api.openai.com/v1/chat/completions', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body, timeoutMs }, timeoutMs);
        if (!response?.ok) {
          const upstreamError = response?.body?.error;
          const status = Number.isFinite(response?.status) ? response.status : null;
          const upstreamCode = typeof upstreamError?.code === 'string' ? upstreamError.code.slice(0, 80) : null;
          const upstreamType = typeof upstreamError?.type === 'string' ? upstreamError.type.slice(0, 80) : null;
          console.warn('openai vision provider rejected request', { failureStage: 'OPENAI_UPSTREAM', status, code: upstreamCode, type: upstreamType });
          throw Object.assign(new Error('OpenAI provider unavailable.'), { code: 'AI_PROVIDER_UNAVAILABLE', failureStage: 'OPENAI_UPSTREAM' });
        }
        const message = response.body?.choices?.[0]?.message;
        const text = message?.content;
        if (typeof text !== 'string' || !text.trim()) {
          console.warn('openai vision provider returned no content', {
            failureStage: 'OPENAI_NO_CONTENT',
            finishReason: typeof response.body?.choices?.[0]?.finish_reason === 'string' ? response.body.choices[0].finish_reason.slice(0, 40) : null,
            refusal: Boolean(message?.refusal),
          });
          throw Object.assign(new Error('OpenAI provider returned no content.'), { code: 'AI_PROVIDER_OUTPUT_INVALID', failureStage: 'OPENAI_NO_CONTENT' });
        }
        let rawObject;
        try {
          rawObject = parseProviderJSON(text);
        } catch (error) {
          throw Object.assign(error, { failureStage: 'OPENAI_PARSE' });
        }
        return normalizeVisionResult({ rawObject, provider: 'OPENAI_COMPATIBLE', model, modelVersion: response.body?.model || 'unreported', correlationId: input.correlationId, processingTimeMs: Math.max(0, clock() - started) });
      } catch (error) {
        const normalized = normalizeAdapterError(error);
        console.warn('openai vision provider failed safely', {
          failureStage: normalized.diagnosticStage,
          errorCode: normalized.errorCode,
          validationCode: normalized.validationCode,
        });
        return normalized;
      }
    },
    async verifyBeforeAfter() { return Object.freeze({ ok: false, errorCode: 'AI_OPERATION_NOT_ACTIVATED', reason: 'Before/after evaluation is not activated.' }); },
    async suggestPriority() { return Object.freeze({ ok: false, errorCode: 'AI_OPERATION_NOT_ACTIVATED', reason: 'Standalone priority evaluation is not activated.' }); },
    async healthCheck() { const guard = activation(); return Object.freeze({ ok: guard.allowed && !!model && typeof transport === 'function', provider: 'OPENAI_COMPATIBLE', enabled: guard.allowed, serverOnly: true, networkAttempted: false }); },
  });
}

module.exports = Object.freeze({ createOpenAICompatibleVisionProvider });
