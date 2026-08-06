'use strict';

const { evaluateRealProviderActivation } = require('./real-provider-activation-guard');
const { MUNICIPAL_VISION_OUTPUT_SCHEMA, buildControlledVisionPrompt } = require('./municipal-vision-prompt');
const { validateEvaluationInput, parseProviderJSON, normalizeVisionResult, callWithTimeout, normalizeAdapterError } = require('./provider-adapter-utils');
const { MAX_IMAGE_PAYLOAD_BYTES, ALLOWED_IMAGE_MIME_TYPES } = require('../ai-security-policy');

function createGeminiCompatibleVisionProvider({ enabled = false, environment = process.env, transport = null, timeoutMs = 10000, clock = () => Date.now() } = {}) {
  const apiKey = typeof environment.GEMINI_API_KEY === 'string' ? environment.GEMINI_API_KEY.trim() : '';
  const model = typeof environment.GEMINI_VISION_MODEL === 'string' ? environment.GEMINI_VISION_MODEL.trim() : '';
  const activation = () => evaluateRealProviderActivation({ localEvaluationEnabled: enabled && environment.SMART_HSR_REAL_AI_EVALUATION === 'true', syntheticDataOnly: environment.SMART_HSR_SYNTHETIC_DATA_ONLY === 'true', providerExplicitlySelected: environment.SMART_HSR_AI_PROVIDER === 'gemini', apiKeyPresent: !!apiKey, noApplicationIntegration: environment.SMART_HSR_NO_APP_INTEGRATION === 'true', runtimeTarget: 'server' });
  const capabilities = Object.freeze({ providerId: 'gemini', supportsVision: true, supportsBeforeAfter: false, supportsStructuredOutput: true, supportsArabic: true, maxImageBytes: MAX_IMAGE_PAYLOAD_BYTES, supportedMimeTypes: ALLOWED_IMAGE_MIME_TYPES, timeoutMs });

  return Object.freeze({
    capabilities,
    async analyzeObservationImage(input = {}) {
      const started = clock();
      try {
        const guard = activation(); if (!guard.allowed) throw Object.assign(new Error(guard.reason), { code: guard.code });
        if (!model || !/^[A-Za-z0-9._-]{1,128}$/.test(model)) throw Object.assign(new Error('Gemini model is not explicitly configured.'), { code: 'AI_PROVIDER_UNAVAILABLE' });
        const image = validateEvaluationInput(input); if (!image.allowed) throw Object.assign(new Error(image.reason), { code: image.code });
        const body = { contents: [{ role: 'user', parts: [{ text: buildControlledVisionPrompt(input) }, { inline_data: { mime_type: input.imageContentType, data: Buffer.from(input.controlledImagePayload).toString('base64') } }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: MUNICIPAL_VISION_OUTPUT_SCHEMA, temperature: 0 } };
        const response = await callWithTimeout(transport, { method: 'POST', url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body, timeoutMs }, timeoutMs);
        if (!response?.ok) throw Object.assign(new Error('Gemini provider unavailable.'), { code: 'AI_PROVIDER_UNAVAILABLE' });
        const text = response.body?.candidates?.[0]?.content?.parts?.[0]?.text;
        return normalizeVisionResult({ rawObject: parseProviderJSON(text), provider: 'GEMINI_COMPATIBLE', model, modelVersion: response.body?.modelVersion || 'unreported', correlationId: input.correlationId, processingTimeMs: Math.max(0, clock() - started) });
      } catch (error) { return normalizeAdapterError(error); }
    },
    async verifyBeforeAfter() { return Object.freeze({ ok: false, errorCode: 'AI_OPERATION_NOT_ACTIVATED', reason: 'Before/after evaluation is not activated.' }); },
    async suggestPriority() { return Object.freeze({ ok: false, errorCode: 'AI_OPERATION_NOT_ACTIVATED', reason: 'Standalone priority evaluation is not activated.' }); },
    async healthCheck() { const guard = activation(); return Object.freeze({ ok: guard.allowed && !!model && typeof transport === 'function', provider: 'GEMINI_COMPATIBLE', enabled: guard.allowed, serverOnly: true, networkAttempted: false }); },
  });
}

module.exports = Object.freeze({ createGeminiCompatibleVisionProvider });
