'use strict';
// ============================================================================
// Explicit allowlist only -- never a spread of the raw analysis/intelligence
// object -- so an API key, prompt, or raw image byte can never reach
// Firestore even if a future upstream change accidentally added one. This is
// the ONLY function permitted to write an observation's aiAnalysis field;
// reused unchanged by api/ai/analyze.js (persisted-mode Vision) and
// api/ai/bind-analysis.js (cache-only post-create binding) so both paths
// write the exact same shape from the exact same allowlist.
// ============================================================================
const { FieldValue } = require('./firebaseAdmin');

function buildPersistedAiAnalysis(analysis, intelligence) {
  const primary = intelligence?.primaryIssue;
  return {
    provider: typeof analysis.provider === 'string' ? analysis.provider : 'unknown',
    category: typeof primary?.issueCode === 'string' ? primary.issueCode : (typeof analysis.categoryCode === 'string' ? analysis.categoryCode : null),
    categoryLabelAr: typeof primary?.issueLabelAr === 'string' ? primary.issueLabelAr : (typeof analysis.categoryLabelAr === 'string' ? analysis.categoryLabelAr : null),
    severity: typeof primary?.severity === 'string' ? primary.severity : (typeof analysis.severity === 'string' ? analysis.severity : 'UNKNOWN'),
    confidence: Number.isFinite(analysis.confidence) ? analysis.confidence : null,
    prioritySuggestion: intelligence?.prioritySuggestion?.prioritySuggestion || analysis.prioritySuggestion || 'UNKNOWN',
    explanation: typeof analysis.shortSummaryAr === 'string' ? analysis.shortSummaryAr : null,
    recommendedActionAr: typeof analysis.recommendedActionAr === 'string' ? analysis.recommendedActionAr : null,
    suggestedTreatment: typeof intelligence?.suggestedTreatment === 'string' ? intelligence.suggestedTreatment : null,
    suggestedDepartment: typeof intelligence?.suggestedDepartment === 'string' ? intelligence.suggestedDepartment : null,
    suggestedResponseWindow: typeof intelligence?.suggestedResponseWindow === 'string' ? intelligence.suggestedResponseWindow : null,
    riskIndicators: Array.isArray(intelligence?.riskIndicators) ? intelligence.riskIndicators.map(r => r?.code).filter(code => typeof code === 'string') : [],
    requiresSiteIsolation: intelligence?.requiresSiteIsolation === true,
    publicSafetyRisk: intelligence?.publicSafetyRisk === true,
    requiresHumanReview: true,
    reviewed: false,
    reviewStatus: 'PENDING',
    reviewedByUid: null,
    reviewedAt: null,
    generatedAt: FieldValue.serverTimestamp(),
  };
}

module.exports = { buildPersistedAiAnalysis };
