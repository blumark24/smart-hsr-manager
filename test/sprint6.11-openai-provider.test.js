'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAIProvider } = require('../platform/ai/ai-provider-contract');
const { validateAIOutput } = require('../platform/ai/ai-security-policy');
const { createOpenAICompatibleVisionProvider } = require('../platform/ai/server/openai-compatible-vision-provider');
const { createGeminiCompatibleVisionProvider } = require('../platform/ai/server/gemini-compatible-vision-provider');
const { createProviderRouter, PROVIDER_KINDS } = require('../platform/ai/provider-router');
const { PROVIDER_CONFORMANCE_CASES, runProviderConformance } = require('../platform/ai/provider-conformance-suite');

const rawValid = (overrides = {}) => ({
  shortSummaryAr: 'تم رصد حفرة أسفلتية تتطلب معالجة عاجلة لحماية مستخدمي الطريق.',
  categoryCode: 'ASPHALT_POTHOLE', categoryLabelAr: 'حفرة أسفلتية',
  severity: 'HIGH', severityScore: 78, prioritySuggestion: 'URGENT',
  responsibleDepartmentSuggestion: 'إدارة صيانة الطرق', recommendedActionAr: 'تأمين الموقع وإصلاح طبقات الأسفلت المتضررة.',
  confidence: 0.94, imageQuality: 'GOOD', requiresHumanReview: true, warnings: [], ...overrides,
});
const input = (overrides = {}) => ({
  organizationId: 'synthetic-evaluation', observationId: 'case-openai', actorId: 'runner', actorRole: 'test', correlationId: 'corr-openai',
  imageReference: null, imageContentType: 'image/jpeg', controlledImagePayload: new Uint8Array([255, 216, 255, 1]),
  existingDescription: 'بيانات اختبار غير موثوقة', locationContext: null, ...overrides,
});
const openAIEnv = (overrides = {}) => ({
  SMART_HSR_REAL_AI_EVALUATION: 'true', SMART_HSR_SYNTHETIC_DATA_ONLY: 'true', SMART_HSR_NO_APP_INTEGRATION: 'true',
  SMART_HSR_AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test-openai-key', OPENAI_VISION_MODEL: 'gpt-4o-test-vision', ...overrides,
});
const openAIResponse = object => ({ ok: true, status: 200, body: { model: 'gpt-4o-test-vision', choices: [{ message: { content: JSON.stringify(object) } }] } });

// --- Provider contract validity -------------------------------------------------

test('OpenAI provider implements the full ai-provider-contract.js method set', () => {
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: async () => openAIResponse(rawValid()) });
  const validation = validateAIProvider(provider);
  assert.equal(validation.allowed, true);
  assert.deepEqual(validation.missing, []);
});

test('PROVIDER_KINDS already declares OPENAI_COMPATIBLE (router untouched)', () => {
  assert.ok(PROVIDER_KINDS.includes('OPENAI_COMPATIBLE'));
});

// --- Output schema compatibility (matches Gemini's structured result) -----------

test('successful analysis returns the same structured result shape as Gemini', async () => {
  const openai = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: async () => openAIResponse(rawValid()) });
  const gemini = createGeminiCompatibleVisionProvider({
    enabled: true,
    environment: { GEMINI_API_KEY: 'test-gemini-key', GEMINI_VISION_MODEL: 'gemini-test-vision', SMART_HSR_REAL_AI_EVALUATION: 'true', SMART_HSR_SYNTHETIC_DATA_ONLY: 'true', SMART_HSR_AI_PROVIDER: 'gemini', SMART_HSR_NO_APP_INTEGRATION: 'true' },
    transport: async () => ({ ok: true, status: 200, body: { modelVersion: 'test-v1', candidates: [{ content: { parts: [{ text: JSON.stringify(rawValid()) }] } }] } }),
  });
  const openaiResult = await openai.analyzeObservationImage(input());
  const geminiResult = await gemini.analyzeObservationImage(input());
  assert.equal(openaiResult.ok, true);
  assert.deepEqual(Object.keys(openaiResult).sort(), Object.keys(geminiResult).sort());
  for (const field of ['confidence', 'severity', 'prioritySuggestion', 'shortSummaryAr', 'recommendedActionAr', 'requiresHumanReview']) {
    assert.equal(field in openaiResult, true);
  }
  assert.equal(openaiResult.provider, 'OPENAI_COMPATIBLE');
});

test('OpenAI adapter builds an OpenAI-shaped structured vision request', async () => {
  let captured;
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: async req => { captured = req; return openAIResponse(rawValid()); } });
  const result = await provider.analyzeObservationImage(input());
  assert.equal(result.ok, true);
  assert.match(captured.url, /api\.openai\.com\/v1\/chat\/completions/);
  assert.equal(captured.headers.Authorization, 'Bearer test-openai-key');
  assert.equal(captured.body.model, 'gpt-4o-test-vision');
  assert.equal(captured.body.response_format.type, 'json_schema');
  assert.equal(captured.body.messages[0].content[1].image_url.url.startsWith('data:image/jpeg;base64,'), true);
});

test('provider output passes the shared ai-security-policy structured validator', async () => {
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: async () => openAIResponse(rawValid()) });
  const result = await provider.analyzeObservationImage(input());
  assert.equal(validateAIOutput(result).allowed, true);
});

// --- Security validation compatibility ------------------------------------------

test('no API key is ever exposed in a result or health response', async () => {
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: async () => openAIResponse(rawValid()) });
  const result = await provider.analyzeObservationImage(input());
  const health = await provider.healthCheck();
  assert.equal(JSON.stringify({ result, health }).includes('test-openai-key'), false);
});

test('public uncontrolled URL is rejected before transport', async () => {
  let calls = 0;
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: async () => { calls++; return openAIResponse(rawValid()); } });
  const result = await provider.analyzeObservationImage(input({ imageReference: 'https://example.com/a.jpg' }));
  assert.equal(result.errorCode, 'AI_EVALUATION_PUBLIC_URL_DENIED');
  assert.equal(calls, 0);
});

test('unconfigured model is denied before transport', async () => {
  let calls = 0;
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv({ OPENAI_VISION_MODEL: '' }), transport: async () => { calls++; return openAIResponse(rawValid()); } });
  assert.equal((await provider.analyzeObservationImage(input())).errorCode, 'AI_PROVIDER_UNAVAILABLE');
  assert.equal(calls, 0);
});

test('missing activation flag denies the request without a network call', async () => {
  let calls = 0;
  const provider = createOpenAICompatibleVisionProvider({ enabled: false, environment: openAIEnv(), transport: async () => { calls++; return openAIResponse(rawValid()); } });
  assert.equal((await provider.analyzeObservationImage(input())).errorCode, 'AI_REAL_EVALUATION_DISABLED');
  assert.equal(calls, 0);
});

test('missing API key is denied', async () => {
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv({ OPENAI_API_KEY: '' }), transport: async () => openAIResponse(rawValid()) });
  assert.equal((await provider.analyzeObservationImage(input())).errorCode, 'AI_REAL_API_KEY_REQUIRED');
});

// --- Human review remains mandatory ----------------------------------------------

test('low-confidence response is forced to the approved fallback and human review', async () => {
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: async () => openAIResponse(rawValid({ confidence: 0.2, shortSummaryAr: 'تم رصد صورة غير واضحة تتطلب المراجعة الميدانية.' })) });
  const result = await provider.analyzeObservationImage(input());
  assert.equal(result.ok, true);
  assert.equal(result.requiresHumanReview, true);
  assert.ok(result.warnings.includes('LOW_CONFIDENCE'));
});

test('router advisory envelope always demands explicit human action for the OpenAI provider', async () => {
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: async () => openAIResponse(rawValid()) });
  const router = createProviderRouter({
    selectedProvider: 'openai',
    providers: { openai: { kind: 'OPENAI_COMPATIBLE', enabled: true, capabilities: { vision: true }, provider } },
  });
  const routed = await router.analyzeObservationImage(
    {
      organizationId: 'org-openai', observationId: 'obs-openai', actorId: 'actor-openai', actorRole: 'inspector', correlationId: 'corr-router',
      imageContentType: 'image/jpeg', controlledImagePayload: new Uint8Array([255, 216, 255, 1]), existingDescription: '',
    },
    { organizationId: 'org-openai', actorId: 'actor-openai' }
  );
  assert.equal(routed.advisoryOnly, true);
  assert.equal(routed.requiresExplicitHumanAction, true);
  assert.equal(routed.automation.automaticSave, false);
  assert.equal(routed.automation.automaticStatusTransition, false);
  assert.equal(routed.result.ok, true);
  assert.equal(routed.result.requiresHumanReview, true);
});

test('even a confident provider result that sets requiresHumanReview false is still wrapped in a mandatory-human-action envelope', async () => {
  // validateAIOutput only forces requiresHumanReview:true for low-confidence
  // results (ai-security-policy.js AI_LOW_CONFIDENCE_POLICY_VIOLATION), so a
  // high-confidence requiresHumanReview:false result is schema-valid. The
  // "human review is mandatory" guarantee lives one level up: the router's
  // advisoryEnvelope (human-approval-policy.js) unconditionally sets
  // requiresExplicitHumanAction:true and disables every automation flag,
  // regardless of what any provider -- OpenAI included -- claims.
  const confidentProvider = createOpenAICompatibleVisionProvider({
    enabled: true, environment: openAIEnv(),
    transport: async () => openAIResponse(rawValid({ confidence: 0.9, requiresHumanReview: false })),
  });
  const router = createProviderRouter({ selectedProvider: 'openai', providers: { openai: { kind: 'OPENAI_COMPATIBLE', enabled: true, capabilities: { vision: true }, provider: confidentProvider } } });
  const routed = await router.analyzeObservationImage(
    { organizationId: 'org-openai', observationId: 'obs-openai', actorId: 'actor-openai', actorRole: 'inspector', correlationId: 'corr-router', imageContentType: 'image/jpeg', controlledImagePayload: new Uint8Array([255, 216, 255, 1]), existingDescription: '' },
    { organizationId: 'org-openai', actorId: 'actor-openai' }
  );
  assert.equal(routed.result.ok, true);
  assert.equal(routed.result.requiresHumanReview, false);
  assert.equal(routed.requiresExplicitHumanAction, true);
  assert.equal(routed.advisoryOnly, true);
  assert.deepEqual(routed.automation, {
    automaticSave: false, automaticObservationCreation: false, automaticClassificationApplication: false,
    automaticPriorityApplication: false, automaticAssignment: false, automaticStatusTransition: false,
    automaticCompletion: false, automaticClosure: false,
  });
});

test('a provider output missing required fields is rejected by the router as invalid, not silently passed through', async () => {
  const brokenProvider = Object.freeze({
    capabilities: Object.freeze({ providerId: 'openai', supportsVision: true }),
    async analyzeObservationImage() {
      return Object.freeze({
        ok: true, analysisId: 'x', shortSummaryAr: '', categoryCode: 'ASPHALT_POTHOLE', categoryLabelAr: 'حفرة أسفلتية',
        severity: 'HIGH', severityScore: 78, prioritySuggestion: 'URGENT', recommendedActionAr: 'تأمين الموقع.', confidence: 0.9, imageQuality: 'GOOD',
        requiresHumanReview: true, warnings: [], provider: 'OPENAI_COMPATIBLE', model: 'm', modelVersion: '1', processingTimeMs: 1,
      });
    },
    async verifyBeforeAfter() { return {}; },
    async suggestPriority() { return {}; },
    async healthCheck() { return { ok: true }; },
  });
  const router = createProviderRouter({ selectedProvider: 'openai', providers: { openai: { kind: 'OPENAI_COMPATIBLE', enabled: true, capabilities: { vision: true }, provider: brokenProvider } } });
  const routed = await router.analyzeObservationImage(
    { organizationId: 'org-openai', observationId: 'obs-openai', actorId: 'actor-openai', actorRole: 'inspector', correlationId: 'corr-router', imageContentType: 'image/jpeg', controlledImagePayload: new Uint8Array([255, 216, 255, 1]), existingDescription: '' },
    { organizationId: 'org-openai', actorId: 'actor-openai' }
  );
  assert.equal(routed.result.ok, false);
  assert.equal(routed.result.errorCode, 'AI_PROVIDER_OUTPUT_INVALID');
  assert.equal(routed.requiresExplicitHumanAction, true);
});

// --- Provider failure handling ----------------------------------------------------

test('timeout is normalized without leaking the raw provider error', async () => {
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: () => new Promise(() => {}), timeoutMs: 5 });
  const result = await provider.analyzeObservationImage(input());
  assert.equal(result.errorCode, 'AI_TIMEOUT');
  assert.doesNotMatch(JSON.stringify(result), /stack|OPENAI_API_KEY|test-openai-key/i);
});

test('transport failure (HTTP not-ok) is normalized to AI_PROVIDER_UNAVAILABLE', async () => {
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: async () => ({ ok: false, status: 503, body: null }) });
  const result = await provider.analyzeObservationImage(input());
  assert.equal(result.errorCode, 'AI_PROVIDER_UNAVAILABLE');
  assert.equal(result.requiresHumanReview, true);
});

test('malformed provider JSON is rejected without leaking raw content', async () => {
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: async () => ({ ok: true, status: 200, body: { choices: [{ message: { content: 'not-json' } }] } }) });
  const result = await provider.analyzeObservationImage(input());
  assert.equal(result.errorCode, 'AI_PROVIDER_OUTPUT_INVALID');
  assert.equal(JSON.stringify(result).includes('not-json'), false);
});

test('thrown transport exception is normalized and does not leak stack or upstream detail', async () => {
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: async () => { throw Object.assign(new Error('sensitive upstream details'), { stack: 'secret stack' }); } });
  const result = await provider.analyzeObservationImage(input());
  assert.equal(result.errorCode, 'AI_PROVIDER_ERROR');
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('sensitive upstream'), false);
  assert.equal(serialized.includes('secret stack'), false);
});

test('workflow command output is rejected', async () => {
  const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport: async () => openAIResponse({ ...rawValid(), workflowAction: 'SAVE_OBSERVATION' }) });
  assert.equal((await provider.analyzeObservationImage(input())).errorCode, 'AI_WORKFLOW_OUTPUT_DENIED');
});

test('OpenAI adapter passes the shared offline provider conformance suite', async () => {
  const fixtureSuccess = new Set(['VALID_POTHOLE', 'VALID_LEANING_POLE', 'VALID_FALLEN_PALM', 'VALID_CONSTRUCTION_WASTE', 'VALID_WATER_LEAK', 'VALID_UNCLEAR_IMAGE']);
  const run = await runProviderConformance({
    providerId: 'openai',
    runCase: async testCase => {
      let output = rawValid();
      let transport = async () => openAIResponse(output);
      let timeoutMs = 1000;
      if (testCase.caseId === 'VALID_UNCLEAR_IMAGE') output = rawValid({ confidence: 0.2, categoryCode: 'UNKNOWN', categoryLabelAr: 'غير محدد', severity: 'UNKNOWN', severityScore: 0, prioritySuggestion: 'UNKNOWN', imageQuality: 'POOR' });
      if (testCase.caseId === 'UNSUPPORTED_IMAGE' || testCase.caseId === 'PROVIDER_UNAVAILABLE') transport = async () => ({ ok: false, status: 503, body: null });
      if (testCase.caseId === 'MALFORMED_OUTPUT') transport = async () => ({ ok: true, body: { choices: [{ message: { content: 'bad-json' } }] } });
      if (testCase.caseId === 'TIMEOUT') { transport = () => new Promise(() => {}); timeoutMs = 5; }
      if (testCase.caseId === 'NON_ARABIC_SUMMARY') output = rawValid({ shortSummaryAr: 'Visible road damage requires immediate municipal repair action' });
      if (testCase.caseId === 'SUMMARY_UNDER_FIVE_WORDS') output = rawValid({ shortSummaryAr: 'حفرة تتطلب معالجة عاجلة' });
      if (testCase.caseId === 'SUMMARY_OVER_FIFTEEN_WORDS') output = rawValid({ shortSummaryAr: 'تم رصد حفرة كبيرة في الطريق الرئيسي وتتطلب معالجة عاجلة وفورية لحماية جميع مستخدمي الطريق من المخاطر المحتملة' });
      if (testCase.caseId === 'INVALID_SEVERITY') output = rawValid({ severity: 'EXTREME' });
      if (testCase.caseId === 'INVALID_CONFIDENCE') output = rawValid({ confidence: 2 });
      if (testCase.caseId === 'MISSING_HUMAN_REVIEW') { output = rawValid(); delete output.requiresHumanReview; }
      if (testCase.caseId === 'WORKFLOW_ACTION_ATTEMPT') output = { ...rawValid(), workflowAction: 'SAVE_OBSERVATION' };
      if (testCase.caseId === 'SECRET_OR_RAW_PROMPT_ATTEMPT') output = { ...rawValid(), rawPrompt: 'api_key must-not-leak' };
      const provider = createOpenAICompatibleVisionProvider({ enabled: true, environment: openAIEnv(), transport, timeoutMs });
      const result = await provider.analyzeObservationImage(input());
      return { passed: fixtureSuccess.has(testCase.caseId) ? result.ok === true : result.ok === false, code: result.ok ? 'SUCCESS' : result.errorCode };
    },
  });
  assert.equal(run.ok, true);
  assert.equal(run.passed, PROVIDER_CONFORMANCE_CASES.length);
});

// --- Sprint 6.11 Phase 2: mode:'application' (live-wiring gate), mirroring the
// Gemini application-mode tests in test/sprint6-8-ai-vision-integration.test.js --

test('OpenAI default mode (no mode passed) still uses the evaluation-only gate, unaffected by the new application mode', async () => {
  const provider = createOpenAICompatibleVisionProvider({
    enabled: true,
    environment: { OPENAI_API_KEY: 'k', OPENAI_VISION_MODEL: 'gpt-4o-test', SMART_HSR_REAL_AI_EVALUATION: 'true', SMART_HSR_AI_PROVIDER: 'openai' },
    // deliberately omit SMART_HSR_SYNTHETIC_DATA_ONLY / SMART_HSR_NO_APP_INTEGRATION
  });
  const result = await provider.analyzeObservationImage(input());
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'AI_REAL_SYNTHETIC_DATA_REQUIRED');
});

test('OpenAI mode:"application" refuses without the application integration flag even if evaluation flags are set', async () => {
  const provider = createOpenAICompatibleVisionProvider({
    enabled: true,
    mode: 'application',
    environment: { OPENAI_API_KEY: 'k', OPENAI_VISION_MODEL: 'gpt-4o-test', SMART_HSR_AI_PROVIDER: 'openai', SMART_HSR_REAL_AI_EVALUATION: 'true', SMART_HSR_SYNTHETIC_DATA_ONLY: 'true', SMART_HSR_NO_APP_INTEGRATION: 'true' },
    applicationContext: { organizationAllowed: true, authenticatedRequest: true },
  });
  const result = await provider.analyzeObservationImage(input());
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'AI_APPLICATION_INTEGRATION_DISABLED');
});

test('OpenAI mode:"application" refuses an organization not on the pilot allowlist even with the flag on', async () => {
  const provider = createOpenAICompatibleVisionProvider({
    enabled: true,
    mode: 'application',
    environment: { OPENAI_API_KEY: 'k', OPENAI_VISION_MODEL: 'gpt-4o-test', SMART_HSR_AI_PROVIDER: 'openai', SMART_HSR_AI_APPLICATION_INTEGRATION: 'true' },
    applicationContext: { organizationAllowed: false, authenticatedRequest: true },
  });
  const result = await provider.analyzeObservationImage(input());
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'AI_APPLICATION_ORGANIZATION_NOT_ENABLED');
});

test('OpenAI mode:"application" refuses an unauthenticated request even with the flag on and org allowed', async () => {
  const provider = createOpenAICompatibleVisionProvider({
    enabled: true,
    mode: 'application',
    environment: { OPENAI_API_KEY: 'k', OPENAI_VISION_MODEL: 'gpt-4o-test', SMART_HSR_AI_PROVIDER: 'openai', SMART_HSR_AI_APPLICATION_INTEGRATION: 'true' },
    applicationContext: { organizationAllowed: true, authenticatedRequest: false },
  });
  const result = await provider.analyzeObservationImage(input());
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'AI_APPLICATION_AUTHENTICATION_REQUIRED');
});

test('OpenAI mode:"application" succeeds through to the transport once every gate condition holds', async () => {
  let calls = 0;
  const provider = createOpenAICompatibleVisionProvider({
    enabled: true,
    mode: 'application',
    environment: { OPENAI_API_KEY: 'k', OPENAI_VISION_MODEL: 'gpt-4o-test', SMART_HSR_AI_PROVIDER: 'openai', SMART_HSR_AI_APPLICATION_INTEGRATION: 'true' },
    applicationContext: { organizationAllowed: true, authenticatedRequest: true },
    transport: async () => { calls++; return openAIResponse(rawValid()); },
  });
  const result = await provider.analyzeObservationImage(input());
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.requiresHumanReview, true);
});
