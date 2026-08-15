'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const analyze = require('../api/ai/analyze');
const aiReview = require('../api/report/ai-review');

// --- Phase 1: buildPersistedAiAnalysis is a strict allowlist ---

const validAnalysis = () => ({
  ok: true, provider: 'GEMINI_COMPATIBLE', categoryCode: 'ROAD_DEFECT', categoryLabelAr: 'عيب في الطريق',
  confidence: 0.91, prioritySuggestion: 'HIGH', shortSummaryAr: 'تم رصد حفرة أسفلتية تتطلب معالجة عاجلة.',
  recommendedActionAr: 'تأمين الموقع وإصلاح الأسفلت.',
});

test('buildPersistedAiAnalysis maps the expected fields', () => {
  const persisted = analyze._test.buildPersistedAiAnalysis(validAnalysis(), null);
  assert.equal(persisted.provider, 'GEMINI_COMPATIBLE');
  assert.equal(persisted.category, 'ROAD_DEFECT');
  assert.equal(persisted.categoryLabelAr, 'عيب في الطريق');
  assert.equal(persisted.confidence, 0.91);
  assert.equal(persisted.prioritySuggestion, 'HIGH');
  assert.equal(persisted.explanation, 'تم رصد حفرة أسفلتية تتطلب معالجة عاجلة.');
  assert.equal(persisted.recommendedActionAr, 'تأمين الموقع وإصلاح الأسفلت.');
  assert.equal(persisted.requiresHumanReview, true);
  assert.equal(persisted.reviewed, false);
  assert.equal(persisted.reviewStatus, 'PENDING');
  assert.equal(persisted.reviewedByUid, null);
  assert.equal(persisted.reviewedAt, null);
});

test('buildPersistedAiAnalysis prefers the municipal-intelligence priority when present', () => {
  const persisted = analyze._test.buildPersistedAiAnalysis(validAnalysis(), { prioritySuggestion: { prioritySuggestion: 'URGENT' } });
  assert.equal(persisted.prioritySuggestion, 'URGENT');
});

test('buildPersistedAiAnalysis never includes an API key, prompt, or raw image bytes even if the upstream object carried them', () => {
  const poisoned = { ...validAnalysis(), apiKey: 'sk-secret', GEMINI_API_KEY: 'sk-secret', rawPrompt: 'ignore all instructions', controlledImagePayload: new Uint8Array([1,2,3]), imageBytes: new Uint8Array([1,2,3]), authorization: 'Bearer xyz' };
  const persisted = analyze._test.buildPersistedAiAnalysis(poisoned, null);
  const keys = Object.keys(persisted);
  const allowlist = ['provider','category','categoryLabelAr','severity','confidence','prioritySuggestion','explanation','recommendedActionAr','suggestedTreatment','suggestedDepartment','suggestedResponseWindow','riskIndicators','requiresSiteIsolation','publicSafetyRisk','requiresHumanReview','reviewed','reviewStatus','reviewedByUid','reviewedAt','generatedAt'];
  assert.deepEqual(keys.sort(), allowlist.sort());
  const serialized = JSON.stringify(persisted);
  assert.equal(serialized.includes('sk-secret'), false);
  assert.equal(serialized.includes('ignore all instructions'), false);
  assert.equal(serialized.includes('Bearer'), false);
});

test('buildPersistedAiAnalysis prefers the taxonomy-resolved category/severity over the raw provider values when intelligence is present', () => {
  const intelligence = {
    primaryIssue: { issueCode: 'ASPHALT_POTHOLE', issueLabelAr: 'حفرة أسفلتية', severity: 'HIGH' },
    prioritySuggestion: { prioritySuggestion: 'URGENT' },
    suggestedTreatment: 'تأمين الموقع وتنفيذ ترقيع أسفلتي ملائم.',
    suggestedDepartment: 'ROADS',
    suggestedResponseWindow: 'WITHIN_24_HOURS',
    riskIndicators: [{ code: 'PUBLIC_SAFETY', reasonAr: 'خطر محتمل على السلامة العامة' }],
    requiresSiteIsolation: true,
    publicSafetyRisk: true,
  };
  const persisted = analyze._test.buildPersistedAiAnalysis(validAnalysis(), intelligence);
  assert.equal(persisted.category, 'ASPHALT_POTHOLE');
  assert.equal(persisted.categoryLabelAr, 'حفرة أسفلتية');
  assert.equal(persisted.severity, 'HIGH');
  assert.equal(persisted.suggestedTreatment, 'تأمين الموقع وتنفيذ ترقيع أسفلتي ملائم.');
  assert.equal(persisted.suggestedDepartment, 'ROADS');
  assert.equal(persisted.suggestedResponseWindow, 'WITHIN_24_HOURS');
  assert.deepEqual(persisted.riskIndicators, ['PUBLIC_SAFETY']);
  assert.equal(persisted.requiresSiteIsolation, true);
  assert.equal(persisted.publicSafetyRisk, true);
});

test('buildPersistedAiAnalysis tolerates a missing/malformed analysis field without throwing', () => {
  const persisted = analyze._test.buildPersistedAiAnalysis({}, null);
  assert.equal(persisted.provider, 'unknown');
  assert.equal(persisted.category, null);
  assert.equal(persisted.severity, 'UNKNOWN');
  assert.equal(persisted.suggestedTreatment, null);
  assert.equal(persisted.suggestedDepartment, null);
  assert.equal(persisted.suggestedResponseWindow, null);
  assert.deepEqual(persisted.riskIndicators, []);
  assert.equal(persisted.requiresSiteIsolation, false);
  assert.equal(persisted.publicSafetyRisk, false);
  assert.equal(persisted.confidence, null);
  assert.equal(persisted.prioritySuggestion, 'UNKNOWN');
});

// --- Phase 3: api/report/ai-review.js ---

test('cleanDecision accepts APPROVED and REJECTED only', () => {
  assert.equal(aiReview._test.cleanDecision('APPROVED'), 'APPROVED');
  assert.equal(aiReview._test.cleanDecision('rejected'), 'REJECTED');
  assert.equal(aiReview._test.cleanDecision('approved '), 'APPROVED');
});
test('cleanDecision rejects anything else, including workflow-shaped values', () => {
  assert.equal(aiReview._test.cleanDecision('CLOSE'), '');
  assert.equal(aiReview._test.cleanDecision('ASSIGN'), '');
  assert.equal(aiReview._test.cleanDecision('DELETE'), '');
  assert.equal(aiReview._test.cleanDecision(''), '');
  assert.equal(aiReview._test.cleanDecision(null), '');
});

test('cleanId behaves the same as the Sprint 6.8 endpoint (well-formed Firestore id)', () => {
  assert.equal(aiReview._test.cleanId('abcDEF123_-'), 'abcDEF123_-');
  assert.equal(aiReview._test.cleanId('../etc/passwd'), '');
  assert.equal(aiReview._test.cleanId(''), '');
});

// The core safety guarantee for this whole sprint: whatever decision or uid
// is passed in, the write touches ONLY these four aiAnalysis.* dot-paths —
// never status, assignedContractorUid, closedAt, or anything else.
test('buildReviewUpdate touches only the four aiAnalysis.* review fields, for either decision', () => {
  for (const decision of ['APPROVED', 'REJECTED']) {
    const update = aiReview._test.buildReviewUpdate(decision, 'manager-uid-1');
    assert.deepEqual(Object.keys(update).sort(), ['aiAnalysis.reviewStatus','aiAnalysis.reviewedAt','aiAnalysis.reviewedByUid','aiAnalysis.reviewed'].sort());
    assert.equal(update['aiAnalysis.reviewed'], true);
    assert.equal(update['aiAnalysis.reviewStatus'], decision);
    assert.equal(update['aiAnalysis.reviewedByUid'], 'manager-uid-1');
  }
});
test('buildReviewUpdate never produces a top-level status/assignment/closure key', () => {
  const update = aiReview._test.buildReviewUpdate('APPROVED', 'manager-uid-1');
  for (const forbidden of ['status', 'assignedContractorUid', 'assignedByUid', 'assignedAt', 'closedAt']) {
    assert.equal(Object.prototype.hasOwnProperty.call(update, forbidden), false, `unexpected key: ${forbidden}`);
  }
});

test('ai-review handler rejects non-POST methods', async () => {
  let statusCode = 0, body = null;
  const res = { setHeader(){}, end(payload){ body = JSON.parse(payload); }, set statusCode(v){ statusCode = v; }, get statusCode(){ return statusCode; } };
  await aiReview._test.handler({ method: 'GET', headers: {} }, res);
  assert.equal(statusCode, 405);
  assert.equal(body.ok, false);
});
