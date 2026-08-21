'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAIOutput } = require('../platform/ai/ai-security-policy');
const { validateAdvisoryOutput } = require('../platform/ai/advisory-output-policy');
const { normalizeVisionResult } = require('../platform/ai/server/provider-adapter-utils');
const { MUNICIPAL_VISION_OUTPUT_SCHEMA, ASSET_VALUES, DEFECT_VALUES, MAX_EVIDENCE_STATEMENTS, MAX_UNCERTAINTIES } = require('../platform/ai/server/municipal-vision-prompt');
const { ASSET_VALUES: TAXONOMY_ASSET_VALUES, DEFECT_VALUES: TAXONOMY_DEFECT_VALUES } = require('../platform/intelligence/municipal-taxonomy');
const { createOpenAICompatibleVisionProvider } = require('../platform/ai/server/openai-compatible-vision-provider');

// Pre-existing (pre-hardening) style fixture -- exactly what every sprint 5/6
// test file already constructs, deliberately WITHOUT visualEvidence/
// uncertainties. Used to prove nothing existing breaks.
const legacyValid = (overrides = {}) => ({
  shortSummaryAr: 'تم رصد حفرة أسفلتية تتطلب معالجة عاجلة لحماية مستخدمي الطريق.',
  categoryCode: 'ASPHALT_POTHOLE', categoryLabelAr: 'حفرة أسفلتية',
  severity: 'HIGH', severityScore: 78, prioritySuggestion: 'URGENT',
  responsibleDepartmentSuggestion: 'إدارة صيانة الطرق', recommendedActionAr: 'تأمين الموقع وإصلاح طبقات الأسفلت المتضررة.',
  confidence: 0.94, imageQuality: 'GOOD', requiresHumanReview: true, warnings: [], ...overrides,
});

// New-contract fixture -- what a live OpenAI call under the updated strict
// schema will always send (visualEvidence + uncertainties required).
const structuredValid = (overrides = {}) => ({
  ...legacyValid(),
  visualEvidence: {
    affectedAsset: 'ROAD_SURFACE',
    visibleDefect: 'POTHOLE',
    evidenceStatements: ['حفرة واضحة في سطح الأسفلت بمنتصف الممر.'],
  },
  uncertainties: [],
  ...overrides,
});

const openAIEnv = (overrides = {}) => ({
  SMART_HSR_REAL_AI_EVALUATION: 'true', SMART_HSR_SYNTHETIC_DATA_ONLY: 'true', SMART_HSR_NO_APP_INTEGRATION: 'true',
  SMART_HSR_AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test-openai-key', OPENAI_VISION_MODEL: 'gpt-4o-test-vision', ...overrides,
});
const inputFixture = (overrides = {}) => ({
  organizationId: 'synthetic-evaluation', observationId: 'case-openai', actorId: 'runner', actorRole: 'test', correlationId: 'corr-openai',
  imageReference: null, imageContentType: 'image/jpeg', controlledImagePayload: new Uint8Array([255, 216, 255, 1]),
  existingDescription: 'بيانات اختبار غير موثوقة', locationContext: null, ...overrides,
});
const openAIResponse = object => ({ ok: true, status: 200, body: { model: 'gpt-4o-test-vision', choices: [{ message: { content: JSON.stringify(object) } }] } });

// Runs a raw provider-shaped object through the exact same public path a
// live call takes (provider.analyzeObservationImage), so an invalid result
// is observed the same way the router/API would see it (a normalized
// {ok:false, errorCode, validationCode} object) instead of an uncaught
// throw from normalizeVisionResult -- matching the existing convention
// already used throughout test/sprint6.11-openai-provider.test.js.
async function analyzeRaw(rawObject) {
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: async () => openAIResponse(rawObject) });
  return provider.analyzeObservationImage(inputFixture());
}

// --- 1. Existing Vision contract remains intact -----------------------------

test('1. legacy provider output (no visualEvidence/uncertainties) still validates exactly as before', () => {
  const result = normalizeVisionResult({ rawObject: legacyValid(), provider: 'OPENAI_COMPATIBLE', model: 'm', modelVersion: 'v1', correlationId: 'c1', processingTimeMs: 10 });
  assert.equal('visualEvidence' in result, false);
  assert.equal('uncertainties' in result, false);
  assert.equal(validateAIOutput(result).allowed, true);
});

test('1. legacy advisory-output policy still accepts a rawObject with no visualEvidence/uncertainties keys', () => {
  assert.equal(validateAdvisoryOutput(legacyValid()).allowed, true);
});

test('1. legacy fixture still analyzes successfully end to end through the real provider path', async () => {
  const result = await analyzeRaw(legacyValid());
  assert.equal(result.ok, true);
  assert.equal('visualEvidence' in result, false);
});

// --- 2. visualEvidence is required (i.e. must be complete) for new structured responses ---

test('2. a present visualEvidence with an empty evidenceStatements array is rejected, not silently accepted', async () => {
  const result = await analyzeRaw(structuredValid({ visualEvidence: { affectedAsset: 'ROAD_SURFACE', visibleDefect: 'POTHOLE', evidenceStatements: [] } }));
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'AI_PROVIDER_OUTPUT_INVALID');
  assert.equal(result.validationCode, 'AI_VISUAL_EVIDENCE_STATEMENTS_COUNT_INVALID');
});

test('2. a fully well-formed structured response (visualEvidence + uncertainties present) validates successfully', () => {
  const result = normalizeVisionResult({ rawObject: structuredValid(), provider: 'OPENAI_COMPATIBLE', model: 'm', modelVersion: 'v1', correlationId: 'c2b', processingTimeMs: 10 });
  assert.equal(validateAIOutput(result).allowed, true);
  assert.deepEqual(result.visualEvidence, { affectedAsset: 'ROAD_SURFACE', visibleDefect: 'POTHOLE', evidenceStatements: ['حفرة واضحة في سطح الأسفلت بمنتصف الممر.'] });
  assert.deepEqual(result.uncertainties, []);
});

// --- 3. affectedAsset rejects unknown enum values ---------------------------

test('3. affectedAsset outside the taxonomy-derived enum is rejected', async () => {
  const result = await analyzeRaw(structuredValid({ visualEvidence: { affectedAsset: 'SPACESHIP', visibleDefect: 'POTHOLE', evidenceStatements: ['x'] } }));
  assert.equal(result.ok, false);
  assert.equal(result.validationCode, 'AI_VISUAL_EVIDENCE_ASSET_INVALID');
});

test('3. every ASSET_VALUES member is independently accepted', () => {
  for (const asset of ASSET_VALUES) {
    const result = normalizeVisionResult({ rawObject: structuredValid({ visualEvidence: { affectedAsset: asset, visibleDefect: 'BROKEN', evidenceStatements: ['x'] } }), provider: 'OPENAI_COMPATIBLE', model: 'm', modelVersion: 'v1', correlationId: `c3-${asset}`, processingTimeMs: 10 });
    assert.equal(validateAIOutput(result).allowed, true, `asset ${asset} should be accepted`);
  }
});

// --- 4. visibleDefect rejects unknown enum values ---------------------------

test('4. visibleDefect outside the taxonomy-derived enum is rejected', async () => {
  const result = await analyzeRaw(structuredValid({ visualEvidence: { affectedAsset: 'ROAD_SURFACE', visibleDefect: 'HAUNTED', evidenceStatements: ['x'] } }));
  assert.equal(result.ok, false);
  assert.equal(result.validationCode, 'AI_VISUAL_EVIDENCE_DEFECT_INVALID');
});

test('4. every DEFECT_VALUES member is independently accepted', () => {
  for (const defect of DEFECT_VALUES) {
    const result = normalizeVisionResult({ rawObject: structuredValid({ visualEvidence: { affectedAsset: 'ROAD_SURFACE', visibleDefect: defect, evidenceStatements: ['x'] } }), provider: 'OPENAI_COMPATIBLE', model: 'm', modelVersion: 'v1', correlationId: `c4-${defect}`, processingTimeMs: 10 });
    assert.equal(validateAIOutput(result).allowed, true, `defect ${defect} should be accepted`);
  }
});

// --- 5. evidenceStatements accepts 1-4 items only ---------------------------

test('5. evidenceStatements with 1 to 4 items is accepted', () => {
  for (let count = 1; count <= MAX_EVIDENCE_STATEMENTS; count++) {
    const statements = Array.from({ length: count }, (_, i) => `عبارة دليل رقم ${i + 1}.`);
    const result = normalizeVisionResult({ rawObject: structuredValid({ visualEvidence: { affectedAsset: 'ROAD_SURFACE', visibleDefect: 'POTHOLE', evidenceStatements: statements } }), provider: 'OPENAI_COMPATIBLE', model: 'm', modelVersion: 'v1', correlationId: `c5-${count}`, processingTimeMs: 10 });
    assert.equal(validateAIOutput(result).allowed, true, `${count} statements should be accepted`);
  }
});

test('5. evidenceStatements with more than 4 items is rejected', async () => {
  const statements = Array.from({ length: MAX_EVIDENCE_STATEMENTS + 1 }, (_, i) => `عبارة دليل رقم ${i + 1}.`);
  const result = await analyzeRaw(structuredValid({ visualEvidence: { affectedAsset: 'ROAD_SURFACE', visibleDefect: 'POTHOLE', evidenceStatements: statements } }));
  assert.equal(result.ok, false);
  assert.equal(result.validationCode, 'AI_VISUAL_EVIDENCE_STATEMENTS_COUNT_INVALID');
});

test('5. evidenceStatements items must be non-empty strings', async () => {
  const result = await analyzeRaw(structuredValid({ visualEvidence: { affectedAsset: 'ROAD_SURFACE', visibleDefect: 'POTHOLE', evidenceStatements: ['  '] } }));
  assert.equal(result.ok, false);
  assert.equal(result.validationCode, 'AI_VISUAL_EVIDENCE_STATEMENTS_SHAPE_INVALID');
});

// --- 6. uncertainties is validated safely -----------------------------------

test('6. uncertainties may legitimately be an empty array (no fabricated uncertainty required)', () => {
  const result = normalizeVisionResult({ rawObject: structuredValid({ uncertainties: [] }), provider: 'OPENAI_COMPATIBLE', model: 'm', modelVersion: 'v1', correlationId: 'c6-empty', processingTimeMs: 10 });
  assert.equal(validateAIOutput(result).allowed, true);
});

test('6. uncertainties with up to MAX_UNCERTAINTIES short Arabic statements is accepted', () => {
  const items = Array.from({ length: MAX_UNCERTAINTIES }, (_, i) => `عدم تأكد رقم ${i + 1} يتطلب تحققاً ميدانياً.`);
  const result = normalizeVisionResult({ rawObject: structuredValid({ uncertainties: items }), provider: 'OPENAI_COMPATIBLE', model: 'm', modelVersion: 'v1', correlationId: 'c6-max', processingTimeMs: 10 });
  assert.equal(validateAIOutput(result).allowed, true);
});

test('6. uncertainties beyond MAX_UNCERTAINTIES is rejected', async () => {
  const items = Array.from({ length: MAX_UNCERTAINTIES + 1 }, (_, i) => `عدم تأكد رقم ${i + 1}.`);
  const result = await analyzeRaw(structuredValid({ uncertainties: items }));
  assert.equal(result.ok, false);
  assert.equal(result.validationCode, 'AI_UNCERTAINTIES_COUNT_INVALID');
});

test('6. a non-array uncertainties value is omitted by the normalizer rather than crashing (fails safely)', () => {
  const result = normalizeVisionResult({ rawObject: structuredValid({ uncertainties: 'not-an-array' }), provider: 'OPENAI_COMPATIBLE', model: 'm', modelVersion: 'v1', correlationId: 'c6-badtype', processingTimeMs: 10 });
  assert.equal('uncertainties' in result, false);
  assert.equal(validateAIOutput(result).allowed, true);
});

test('6. non-string uncertainty items are rejected when the field is a real array', async () => {
  const result = await analyzeRaw(structuredValid({ uncertainties: [42] }));
  assert.equal(result.ok, false);
  assert.equal(result.validationCode, 'AI_UNCERTAINTIES_SHAPE_INVALID');
});

// --- 7. old persisted observations remain compatible at read/render boundaries ---

test('7. buildPersistedAiAnalysis (Firestore write allowlist) is untouched by this commit and never reads visualEvidence/uncertainties', () => {
  const { buildPersistedAiAnalysis } = require('../api/_lib/persistedAiAnalysis');
  const persisted = buildPersistedAiAnalysis(structuredValid({ analysisId: 'x', provider: 'OPENAI_COMPATIBLE', model: 'm', modelVersion: 'v1' }), null);
  assert.equal('visualEvidence' in persisted, false);
  assert.equal('uncertainties' in persisted, false);
  // Old observations persisted before this commit have no visualEvidence in
  // their stored aiAnalysis either -- since persistence never reads these
  // fields, a pre-existing record is read back through the exact same code
  // path, unaffected.
});

// --- 8. no new AI call is introduced -----------------------------------------

test('8. OpenAI provider issues exactly one transport call per analyzeObservationImage invocation', async () => {
  let calls = 0;
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: async () => { calls++; return openAIResponse(structuredValid()); } });
  const result = await provider.analyzeObservationImage(inputFixture());
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
});

test('8. the OpenAI JSON schema sent to the provider is the single existing MUNICIPAL_VISION_OUTPUT_SCHEMA, now additively including visualEvidence/uncertainties', async () => {
  let captured;
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: async req => { captured = req; return openAIResponse(structuredValid()); } });
  await provider.analyzeObservationImage(inputFixture());
  assert.equal(captured.body.response_format.json_schema.schema, MUNICIPAL_VISION_OUTPUT_SCHEMA);
  assert.ok(MUNICIPAL_VISION_OUTPUT_SCHEMA.properties.visualEvidence);
  assert.ok(MUNICIPAL_VISION_OUTPUT_SCHEMA.properties.uncertainties);
});

// --- 9. no operational mutation path is added --------------------------------

test('9. a workflow command hidden inside visualEvidence is still denied by the existing advisory-output policy', () => {
  const tampered = structuredValid({ visualEvidence: { affectedAsset: 'ROAD_SURFACE', visibleDefect: 'POTHOLE', evidenceStatements: ['SAVE_OBSERVATION now'] } });
  const validation = validateAdvisoryOutput(tampered);
  assert.equal(validation.allowed, false);
  assert.equal(validation.code, 'AI_WORKFLOW_COMMAND_DENIED');
});

test('9. structured evidence fields carry no status/assignment/closure vocabulary anywhere in this contract', () => {
  const serialized = JSON.stringify(MUNICIPAL_VISION_OUTPUT_SCHEMA).toUpperCase();
  for (const forbidden of ['SAVE_OBSERVATION', 'ASSIGN_CONTRACTOR', 'UPDATE_STATUS', 'CLOSE', 'DELETE']) {
    assert.equal(serialized.includes(forbidden), false, `schema must not mention ${forbidden}`);
  }
});

// --- 10. DAMAGED_CURB / CURB / BROKEN available through the taxonomy-backed enum ---

test('10. CURB is present in the taxonomy-derived ASSET_VALUES exposed to the Vision schema', () => {
  assert.ok(ASSET_VALUES.includes('CURB'));
  assert.deepEqual([...ASSET_VALUES].sort(), [...TAXONOMY_ASSET_VALUES].sort());
});

test('10. BROKEN is present in the taxonomy-derived DEFECT_VALUES exposed to the Vision schema', () => {
  assert.ok(DEFECT_VALUES.includes('BROKEN'));
  assert.deepEqual([...DEFECT_VALUES].sort(), [...TAXONOMY_DEFECT_VALUES].sort());
});

test('10. a CURB + BROKEN structured response validates successfully end to end', () => {
  const result = normalizeVisionResult({ rawObject: structuredValid({ categoryCode: 'DAMAGED_CURB', categoryLabelAr: 'حافة رصيف متضررة', visualEvidence: { affectedAsset: 'CURB', visibleDefect: 'BROKEN', evidenceStatements: ['حافة رصيف مكسورة وبارزة عن مستوى الرصيف.'] } }), provider: 'OPENAI_COMPATIBLE', model: 'm', modelVersion: 'v1', correlationId: 'c10', processingTimeMs: 10 });
  assert.equal(validateAIOutput(result).allowed, true);
  assert.equal(result.visualEvidence.affectedAsset, 'CURB');
  assert.equal(result.visualEvidence.visibleDefect, 'BROKEN');
});

// --- schema wiring sanity: the enum is generated, never a second mapping ----

test('MUNICIPAL_VISION_OUTPUT_SCHEMA.visualEvidence enums are generated from the taxonomy module, not hand-duplicated', () => {
  assert.deepEqual(MUNICIPAL_VISION_OUTPUT_SCHEMA.properties.visualEvidence.properties.affectedAsset.enum, ASSET_VALUES);
  assert.deepEqual(MUNICIPAL_VISION_OUTPUT_SCHEMA.properties.visualEvidence.properties.visibleDefect.enum, DEFECT_VALUES);
});

test('advisory-output-policy allows the new top-level field names without allowing anything else new', () => {
  assert.ok(require('../platform/ai/advisory-output-policy').ALLOWED_RESULT_FIELDS.includes('visualEvidence'));
  assert.ok(require('../platform/ai/advisory-output-policy').ALLOWED_RESULT_FIELDS.includes('uncertainties'));
  assert.equal(validateAdvisoryOutput({ notARealField: 'x' }).allowed, false);
});
