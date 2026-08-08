'use strict';

const { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_PAYLOAD_BYTES, CONFIDENCE_THRESHOLD, validateAIOutput } = require('../ai-security-policy');
const { LOW_CONFIDENCE_FALLBACK_AR } = require('../arabic-summary-policy');
const { validateAdvisoryOutput } = require('../advisory-output-policy');

function validateEvaluationInput(input = {}) {
  if (input.imageReference) return Object.freeze({ allowed: false, code: /^https?:\/\//i.test(input.imageReference) ? 'AI_EVALUATION_PUBLIC_URL_DENIED' : 'AI_EVALUATION_PRIVATE_REFERENCE_DENIED', reason: 'Evaluation accepts controlled local bytes only.' });
  if (!(input.controlledImagePayload instanceof Uint8Array) || !input.controlledImagePayload.byteLength) return Object.freeze({ allowed: false, code: 'AI_EVALUATION_IMAGE_REQUIRED', reason: 'Controlled synthetic/public fixture bytes are required.' });
  if (input.controlledImagePayload.byteLength > MAX_IMAGE_PAYLOAD_BYTES) return Object.freeze({ allowed: false, code: 'AI_IMAGE_TOO_LARGE', reason: 'Evaluation image exceeds the gateway limit.' });
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(input.imageContentType)) return Object.freeze({ allowed: false, code: 'AI_IMAGE_MIME_DENIED', reason: 'Evaluation image MIME is unsupported.' });
  return Object.freeze({ allowed: true, code: 'AI_EVALUATION_INPUT_VALID', reason: 'Controlled evaluation image is valid.' });
}

function parseProviderJSON(value) {
  if (typeof value !== 'string' || !value.trim() || /^\s*```/.test(value)) throw Object.assign(new Error('Malformed provider JSON.'), { code: 'AI_PROVIDER_OUTPUT_INVALID' });
  try { return JSON.parse(value); } catch (_) { throw Object.assign(new Error('Malformed provider JSON.'), { code: 'AI_PROVIDER_OUTPUT_INVALID' }); }
}

function normalizeVisionResult({ rawObject, provider, model, modelVersion = 'unknown', correlationId, processingTimeMs }) {
  const advisory = validateAdvisoryOutput(rawObject); if (!advisory.allowed) throw Object.assign(new Error(advisory.reason), { code: advisory.code });
  const confidence = Number(rawObject.confidence);
  const lowConfidence = Number.isFinite(confidence) && confidence < CONFIDENCE_THRESHOLD;
  const warnings = Array.isArray(rawObject.warnings) ? [...rawObject.warnings] : rawObject.warnings;
  const normalizedWarnings = Array.isArray(warnings) ? [...new Set(lowConfidence ? [...warnings, 'LOW_CONFIDENCE'] : warnings)] : warnings;
  const result = Object.freeze({
    ok: true, analysisId: `${provider.toLowerCase()}-${String(correlationId || 'evaluation').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'evaluation'}`,
    shortSummaryAr: lowConfidence ? LOW_CONFIDENCE_FALLBACK_AR : rawObject.shortSummaryAr,
    categoryCode: rawObject.categoryCode, categoryLabelAr: rawObject.categoryLabelAr,
    ...(rawObject.subcategoryCode ? { subcategoryCode: rawObject.subcategoryCode } : {}), ...(rawObject.subcategoryLabelAr ? { subcategoryLabelAr: rawObject.subcategoryLabelAr } : {}),
    severity: rawObject.severity, severityScore: rawObject.severityScore, prioritySuggestion: rawObject.prioritySuggestion,
    ...(rawObject.responsibleDepartmentSuggestion ? { responsibleDepartmentSuggestion: rawObject.responsibleDepartmentSuggestion } : {}),
    recommendedActionAr: rawObject.recommendedActionAr, confidence, imageQuality: rawObject.imageQuality,
    requiresHumanReview: lowConfidence ? true : rawObject.requiresHumanReview, warnings: normalizedWarnings,
    provider, model, modelVersion, processingTimeMs,
  });
  const validation = validateAIOutput(result); if (!validation.allowed) throw Object.assign(new Error(validation.reason), { code: 'AI_PROVIDER_OUTPUT_INVALID' });
  return result;
}

async function callWithTimeout(transport, request, timeoutMs) {
  if (typeof transport !== 'function') throw Object.assign(new Error('Provider transport unavailable.'), { code: 'AI_PROVIDER_UNAVAILABLE' });
  let timer;
  try { return await Promise.race([transport(Object.freeze(request)), new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Provider timeout.'), { code: 'AI_TIMEOUT' })), timeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); }
}

function normalizeAdapterError(error) {
  const allowed = ['AI_TIMEOUT','AI_PROVIDER_UNAVAILABLE','AI_PROVIDER_OUTPUT_INVALID','AI_WORKFLOW_OUTPUT_DENIED','AI_WORKFLOW_COMMAND_DENIED','AI_EVALUATION_PUBLIC_URL_DENIED','AI_EVALUATION_PRIVATE_REFERENCE_DENIED','AI_EVALUATION_IMAGE_REQUIRED','AI_IMAGE_TOO_LARGE','AI_IMAGE_MIME_DENIED','AI_REAL_EVALUATION_DISABLED','AI_REAL_SYNTHETIC_DATA_REQUIRED','AI_REAL_PROVIDER_SELECTION_REQUIRED','AI_REAL_API_KEY_REQUIRED','AI_REAL_APPLICATION_ISOLATION_REQUIRED','AI_REAL_SERVER_ONLY','AI_APPLICATION_INTEGRATION_DISABLED','AI_APPLICATION_PROVIDER_SELECTION_REQUIRED','AI_APPLICATION_API_KEY_REQUIRED','AI_APPLICATION_ORGANIZATION_NOT_ENABLED','AI_APPLICATION_AUTHENTICATION_REQUIRED','AI_APPLICATION_SERVER_ONLY'];
  return Object.freeze({ ok: false, errorCode: allowed.includes(error?.code) ? error.code : 'AI_PROVIDER_ERROR', reason: allowed.includes(error?.code) ? 'Provider evaluation request was denied.' : 'Provider evaluation failed.', requiresHumanReview: true, warnings: Object.freeze([]) });
}

module.exports = Object.freeze({ validateEvaluationInput, parseProviderJSON, normalizeVisionResult, callWithTimeout, normalizeAdapterError });
