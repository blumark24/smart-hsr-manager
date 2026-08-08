'use strict';

const { evaluateRealProviderActivation } = require('./real-provider-activation-guard');
const { MUNICIPAL_VISION_OUTPUT_SCHEMA, buildControlledVisionPrompt } = require('./municipal-vision-prompt');
const { validateEvaluationInput, parseProviderJSON, normalizeVisionResult, callWithTimeout, normalizeAdapterError } = require('./provider-adapter-utils');
const { MAX_IMAGE_PAYLOAD_BYTES, ALLOWED_IMAGE_MIME_TYPES } = require('../ai-security-policy');

function createOpenRouterCompatibleVisionProvider({ enabled = false, environment = process.env, transport = null, timeoutMs = 10000, clock = () => Date.now() } = {}) {
  const apiKey = typeof environment.OPENROUTER_API_KEY === 'string' ? environment.OPENROUTER_API_KEY.trim() : '';
  const model = typeof environment.OPENROUTER_VISION_MODEL === 'string' ? environment.OPENROUTER_VISION_MODEL.trim() : '';
  const visionDeclared = environment.OPENROUTER_MODEL_SUPPORTS_VISION === 'true';
  const structuredDeclared = environment.OPENROUTER_MODEL_SUPPORTS_STRUCTURED_OUTPUT === 'true';
  const activation = () => evaluateRealProviderActivation({ localEvaluationEnabled: enabled && environment.SMART_HSR_REAL_AI_EVALUATION === 'true', syntheticDataOnly: environment.SMART_HSR_SYNTHETIC_DATA_ONLY === 'true', providerExplicitlySelected: environment.SMART_HSR_AI_PROVIDER === 'openrouter', apiKeyPresent: !!apiKey, noApplicationIntegration: environment.SMART_HSR_NO_APP_INTEGRATION === 'true', runtimeTarget: 'server' });
  const capabilities = Object.freeze({ providerId: 'openrouter', supportsVision: visionDeclared, supportsBeforeAfter: false, supportsStructuredOutput: structuredDeclared, supportsArabic: true, maxImageBytes: MAX_IMAGE_PAYLOAD_BYTES, supportedMimeTypes: ALLOWED_IMAGE_MIME_TYPES, timeoutMs });

  return Object.freeze({
    capabilities,
    async analyzeObservationImage(input = {}) {
      const started = clock();
      try {
        const guard = activation(); if (!guard.allowed) throw Object.assign(new Error(guard.reason), { code: guard.code });
        if (!model || model.includes(',') || model === 'auto') throw Object.assign(new Error('OpenRouter model must be explicitly configured.'), { code: 'AI_PROVIDER_UNAVAILABLE' });
        if (!visionDeclared || !structuredDeclared) throw Object.assign(new Error('Configured model capabilities are insufficient.'), { code: 'AI_PROVIDER_UNAVAILABLE' });
        const image = validateEvaluationInput(input); if (!image.allowed) throw Object.assign(new Error(image.reason), { code: image.code });
        const imageData = Buffer.from(input.controlledImagePayload).toString('base64');
        const body = { model, messages: [{ role: 'user', content: [{ type: 'text', text: buildControlledVisionPrompt(input) }, { type: 'image_url', image_url: { url: `data:${input.imageContentType};base64,${imageData}` } }] }],
          response_format: { type: 'json_schema', json_schema: { name: 'smart_hsr_municipal_vision', strict: true, schema: MUNICIPAL_VISION_OUTPUT_SCHEMA } }, temperature: 0 };
        const response = await callWithTimeout(transport, { method: 'POST', url: 'https://openrouter.ai/api/v1/chat/completions', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body, timeoutMs }, timeoutMs);
        if (!response?.ok) throw Object.assign(new Error('OpenRouter provider unavailable.'), { code: 'AI_PROVIDER_UNAVAILABLE' });
        const text = response.body?.choices?.[0]?.message?.content;
        return normalizeVisionResult({ rawObject: parseProviderJSON(text), provider: 'OPENROUTER_COMPATIBLE', model, modelVersion: 'unreported', correlationId: input.correlationId, processingTimeMs: Math.max(0, clock() - started) });
      } catch (error) { return normalizeAdapterError(error); }
    },
    async verifyBeforeAfter() { return Object.freeze({ ok: false, errorCode: 'AI_OPERATION_NOT_ACTIVATED', reason: 'Before/after evaluation is not activated.' }); },
    async suggestPriority() { return Object.freeze({ ok: false, errorCode: 'AI_OPERATION_NOT_ACTIVATED', reason: 'Standalone priority evaluation is not activated.' }); },
    async healthCheck() { const guard = activation(); return Object.freeze({ ok: guard.allowed && !!model && visionDeclared && structuredDeclared && typeof transport === 'function', provider: 'OPENROUTER_COMPATIBLE', enabled: guard.allowed, serverOnly: true, networkAttempted: false }); },
  });
}

module.exports = Object.freeze({ createOpenRouterCompatibleVisionProvider });
