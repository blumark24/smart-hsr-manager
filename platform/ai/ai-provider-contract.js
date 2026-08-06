'use strict';

const AI_PROVIDER_METHODS = Object.freeze(['analyzeObservationImage', 'verifyBeforeAfter', 'suggestPriority', 'healthCheck']);
const SEVERITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN']);
const PRIORITIES = Object.freeze(['LOW', 'NORMAL', 'HIGH', 'URGENT', 'UNKNOWN']);
const IMAGE_QUALITIES = Object.freeze(['GOOD', 'ACCEPTABLE', 'POOR', 'UNUSABLE']);

function validateAIProvider(provider) {
  const missing = AI_PROVIDER_METHODS.filter(method => typeof provider?.[method] !== 'function');
  return Object.freeze({ allowed: missing.length === 0, code: missing.length ? 'AI_PROVIDER_INCOMPLETE' : 'AI_PROVIDER_VALID', missing: Object.freeze(missing) });
}

function aiFailure(errorCode, reason, details = {}) {
  return Object.freeze({
    ok: false, analysisId: null, shortSummaryAr: null, categoryCode: null, categoryLabelAr: null,
    severity: 'UNKNOWN', severityScore: 0, prioritySuggestion: 'UNKNOWN', recommendedActionAr: null,
    confidence: 0, imageQuality: 'UNUSABLE', requiresHumanReview: true, warnings: Object.freeze([]),
    provider: details.provider || 'NONE', model: null, modelVersion: null,
    processingTimeMs: Number.isFinite(details.processingTimeMs) ? details.processingTimeMs : 0,
    errorCode, reason,
  });
}

module.exports = Object.freeze({ AI_PROVIDER_METHODS, SEVERITIES, PRIORITIES, IMAGE_QUALITIES, validateAIProvider, aiFailure });
