'use strict';

const { validateAIOutput } = require('../ai-security-policy');
const { validateShortSummaryAr } = require('../arabic-summary-policy');

function rate(numerator, denominator) { return denominator ? Number((numerator / denominator).toFixed(4)) : 0; }
function average(values) { return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : 0; }

function buildProviderComparison({ provider, model, cases = [], groundTruth = {}, records = [] } = {}) {
  const byId = new Map(records.map(record => [record.caseId, record]));
  const evaluated = cases.map(testCase => ({ testCase, truth: groundTruth[testCase.caseId], record: byId.get(testCase.caseId) }));
  const successful = evaluated.filter(item => item.record?.result?.ok === true);
  const schemaPass = successful.filter(item => validateAIOutput(item.record.result).allowed);
  const arabicPass = successful.filter(item => validateShortSummaryAr(item.record.result.shortSummaryAr).allowed);
  const labeled = successful.filter(item => item.truth);
  const categoryCorrect = labeled.filter(item => item.record.result.categoryCode === item.truth.categoryCode);
  const severityCorrect = labeled.filter(item => item.record.result.severity === item.truth.severity);
  const lowConfidenceCases = successful.filter(item => item.truth?.lowConfidenceExpected === true);
  const lowConfidenceCorrect = lowConfidenceCases.filter(item => item.record.result.confidence < 0.65 && item.record.result.requiresHumanReview === true);
  const hallucinationReviews = records.filter(record => typeof record.hallucinated === 'boolean');
  const costs = records.map(record => record.approximateCostUsd).filter(Number.isFinite);
  return Object.freeze({
    provider, model, totalCases: cases.length, successfulCases: successful.length,
    schemaPassRate: rate(schemaPass.length, cases.length), arabicSummaryPassRate: rate(arabicPass.length, cases.length),
    categoryAccuracy: rate(categoryCorrect.length, labeled.length), severityAgreement: rate(severityCorrect.length, labeled.length),
    lowConfidenceCorrectness: rate(lowConfidenceCorrect.length, lowConfidenceCases.length),
    hallucinationRate: hallucinationReviews.length ? rate(hallucinationReviews.filter(record => record.hallucinated).length, hallucinationReviews.length) : null,
    averageLatencyMs: average(records.map(record => record.latencyMs).filter(Number.isFinite)),
    providerFailureRate: rate(cases.length - successful.length, cases.length), averageResponseSizeBytes: average(records.map(record => Buffer.byteLength(JSON.stringify(record.result || {}), 'utf8'))),
    approximateAverageRequestCostUsd: costs.length ? average(costs) : null,
    limitations: Object.freeze(['Evaluation dataset is small and non-production.', 'Hallucination rate requires explicit human review labels.', 'Missing price data remains null.']),
  });
}

module.exports = Object.freeze({ buildProviderComparison });
