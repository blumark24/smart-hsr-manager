'use strict';

const { evaluateRealProviderActivation, evaluateApplicationProviderActivation } = require('./real-provider-activation-guard');
const { buildControlledVisionPrompt } = require('./municipal-vision-prompt');
const { validateEvaluationInput, parseProviderJSON, normalizeVisionResult, callWithTimeout, normalizeAdapterError } = require('./provider-adapter-utils');
const { MAX_IMAGE_PAYLOAD_BYTES, ALLOWED_IMAGE_MIME_TYPES } = require('../ai-security-policy');

const GEMINI_REST_VISION_OUTPUT_SCHEMA = Object.freeze({
  type: 'OBJECT',
  properties: Object.freeze({
    shortSummaryAr: { type: 'STRING' }, categoryCode: { type: 'STRING' }, categoryLabelAr: { type: 'STRING' },
    subcategoryCode: { type: 'STRING', nullable: true }, subcategoryLabelAr: { type: 'STRING', nullable: true },
    severity: { type: 'STRING', enum: ['LOW','MEDIUM','HIGH','CRITICAL','UNKNOWN'] }, severityScore: { type: 'NUMBER' },
    prioritySuggestion: { type: 'STRING', enum: ['LOW','NORMAL','HIGH','URGENT','UNKNOWN'] },
    responsibleDepartmentSuggestion: { type: 'STRING', nullable: true }, recommendedActionAr: { type: 'STRING' },
    confidence: { type: 'NUMBER' }, imageQuality: { type: 'STRING', enum: ['GOOD','ACCEPTABLE','POOR','UNUSABLE'] },
    requiresHumanReview: { type: 'BOOLEAN' }, warnings: { type: 'ARRAY', items: { type: 'STRING' } },
  }),
  required: Object.freeze(['shortSummaryAr','categoryCode','categoryLabelAr','severity','severityScore','prioritySuggestion','recommendedActionAr','confidence','imageQuality','requiresHumanReview','warnings']),
});

function sanitizeHttpError(response, sensitiveValues = []) {
  const status = Number.isInteger(response?.status) ? response.status : null;
  const providerError = response?.body?.error && typeof response.body.error === 'object' ? response.body.error : {};
  const redact = value => {
    if (typeof value !== 'string') return null;
    let sanitized = value.replace(/[\r\n\t]+/g, ' ').replace(/[A-Za-z0-9+/]{256,}={0,2}/g, '[REDACTED]');
    for (const sensitive of sensitiveValues) if (sensitive) sanitized = sanitized.split(sensitive).join('[REDACTED]');
    return sanitized.trim().slice(0, 300) || null;
  };
  return Object.freeze({
    ok: false,
    errorCode: status === 400 ? 'AI_PROVIDER_REQUEST_INVALID' : 'AI_PROVIDER_UNAVAILABLE',
    reason: status === 400 ? 'Provider rejected the request shape.' : 'Provider request was unavailable.',
    requiresHumanReview: true,
    warnings: Object.freeze([]),
    httpStatus: status,
    providerErrorStatus: redact(providerError.status),
    providerErrorMessageSanitized: redact(providerError.message),
    providerErrorCode: typeof providerError.code === 'number' || typeof providerError.code === 'string' ? String(providerError.code).slice(0, 64) : null,
  });
}

// mode: 'evaluation' (default, unchanged behavior) uses the isolated
// synthetic-evaluation activation gate, exactly as before. mode:'application'
// is additive (Sprint 6.8) and uses the separate, honestly-scoped live
// activation gate instead -- see real-provider-activation-guard.js for why
// these are two distinct functions rather than one relaxed check.
// applicationContext (only read in 'application' mode) carries per-request
// facts the caller (the API endpoint) has already established server-side:
// { organizationAllowed, authenticatedRequest }.
function createGeminiCompatibleVisionProvider({ enabled = false, environment = process.env, transport = null, timeoutMs = 10000, clock = () => Date.now(), mode = 'evaluation', applicationContext = null } = {}) {
  const apiKey = typeof environment.GEMINI_API_KEY === 'string' ? environment.GEMINI_API_KEY.trim() : '';
  const model = typeof environment.GEMINI_VISION_MODEL === 'string' ? environment.GEMINI_VISION_MODEL.trim() : '';
  const activation = () => mode === 'application'
    ? evaluateApplicationProviderActivation({
        applicationIntegrationEnabled: enabled && environment.SMART_HSR_AI_APPLICATION_INTEGRATION === 'true',
        providerExplicitlySelected: environment.SMART_HSR_AI_PROVIDER === 'gemini',
        apiKeyPresent: !!apiKey,
        organizationAllowed: applicationContext?.organizationAllowed === true,
        authenticatedRequest: applicationContext?.authenticatedRequest === true,
        runtimeTarget: 'server',
      })
    : evaluateRealProviderActivation({ localEvaluationEnabled: enabled && environment.SMART_HSR_REAL_AI_EVALUATION === 'true', syntheticDataOnly: environment.SMART_HSR_SYNTHETIC_DATA_ONLY === 'true', providerExplicitlySelected: environment.SMART_HSR_AI_PROVIDER === 'gemini', apiKeyPresent: !!apiKey, noApplicationIntegration: environment.SMART_HSR_NO_APP_INTEGRATION === 'true', runtimeTarget: 'server' });
  const capabilities = Object.freeze({ providerId: 'gemini', supportsVision: true, supportsBeforeAfter: false, supportsStructuredOutput: true, supportsArabic: true, maxImageBytes: MAX_IMAGE_PAYLOAD_BYTES, supportedMimeTypes: ALLOWED_IMAGE_MIME_TYPES, timeoutMs });

  return Object.freeze({
    capabilities,
    async analyzeObservationImage(input = {}) {
      const started = clock();
      try {
        const guard = activation(); if (!guard.allowed) throw Object.assign(new Error(guard.reason), { code: guard.code });
        if (!model || !/^[A-Za-z0-9._-]{1,128}$/.test(model)) throw Object.assign(new Error('Gemini model is not explicitly configured.'), { code: 'AI_PROVIDER_UNAVAILABLE' });
        const image = validateEvaluationInput(input); if (!image.allowed) throw Object.assign(new Error(image.reason), { code: image.code });
        const prompt = buildControlledVisionPrompt(input);
        const imageData = Buffer.from(input.controlledImagePayload).toString('base64');
        const body = { contents: [{ role: 'user', parts: [{ inline_data: { mime_type: input.imageContentType, data: imageData } }, { text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_REST_VISION_OUTPUT_SCHEMA, temperature: 0 } };
        const response = await callWithTimeout(transport, { method: 'POST', url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body, timeoutMs }, timeoutMs);
        if (!response?.ok) return sanitizeHttpError(response, [apiKey, prompt, imageData]);
        const text = response.body?.candidates?.[0]?.content?.parts?.[0]?.text;
        return normalizeVisionResult({ rawObject: parseProviderJSON(text), provider: 'GEMINI_COMPATIBLE', model, modelVersion: response.body?.modelVersion || 'unreported', correlationId: input.correlationId, processingTimeMs: Math.max(0, clock() - started) });
      } catch (error) { return normalizeAdapterError(error); }
    },
    async verifyBeforeAfter() { return Object.freeze({ ok: false, errorCode: 'AI_OPERATION_NOT_ACTIVATED', reason: 'Before/after evaluation is not activated.' }); },
    async suggestPriority() { return Object.freeze({ ok: false, errorCode: 'AI_OPERATION_NOT_ACTIVATED', reason: 'Standalone priority evaluation is not activated.' }); },
    async healthCheck() { const guard = activation(); return Object.freeze({ ok: guard.allowed && !!model && typeof transport === 'function', provider: 'GEMINI_COMPATIBLE', enabled: guard.allowed, serverOnly: true, networkAttempted: false }); },
  });
}

module.exports = Object.freeze({ GEMINI_REST_VISION_OUTPUT_SCHEMA, sanitizeHttpError, createGeminiCompatibleVisionProvider });
