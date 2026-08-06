'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLocalAIGatewayService } = require('../platform/ai/local-ai-gateway-service');
const { MOCK_CAPABILITIES, validateProviderCapabilities } = require('../platform/ai/provider-capability-contract');
const { evaluateLocalAIRuntime } = require('../platform/ai/local-ai-runtime-guard');
const { evaluateAIStorageInput } = require('../platform/ai/ai-storage-boundary');
const { createMockAIProvider } = require('../platform/ai/mock-ai-provider');
const { validateShortSummaryAr } = require('../platform/ai/arabic-summary-policy');
const { MUNICIPAL_SUMMARY_FIXTURES } = require('../platform/ai/municipal-summary-fixtures');
const { PROVIDER_CONFORMANCE_CASES, runProviderConformance } = require('../platform/ai/provider-conformance-suite');
const { createSuggestionSession, acceptSuggestion, editSuggestion, ignoreSuggestion, useManualDescription } = require('../platform/ai/suggestion-decision-contract');

const runtime = Object.freeze({ enabled: true, mode: 'test', publicAccess: false, firebaseEnabled: false, cloudEnabled: false, externalNetworkEnabled: false });
const request = (overrides = {}) => ({ requestId: 'req-1', correlationId: 'corr-1', organizationId: 'org-a', observationId: 'obs-a', actorId: 'inspector-a', actorRole: 'inspector',
  operation: 'ANALYZE_OBSERVATION_IMAGE', imageReference: 'organizations/org-a/observations/obs-a/before/object-a', imageContentType: 'image/jpeg', existingDescription: 'وصف ميداني', locationContext: { district: 'demo' }, requestedAt: '2026-08-06T00:00:00.000Z', ...overrides });
const registration = (provider = createMockAIProvider(), capabilities = MOCK_CAPABILITIES) => ({ kind: 'MOCK', enabled: true, capabilities, provider });
const gateway = ({ provider = createMockAIProvider(), capabilities = MOCK_CAPABILITIES, selectedProvider = 'mock', providers, runtimeConfig = runtime } = {}) => createLocalAIGatewayService({
  runtime: runtimeConfig, selectedProvider, providers: providers || { mock: registration(provider, capabilities) },
  resolveAuthenticatedContext: async () => ({ organizationId: 'org-a', actorId: 'inspector-a', role: 'inspector' }), clock: () => 100,
});
const mutateProvider = transform => { const base = createMockAIProvider(); return { ...base, async analyzeObservationImage(input) { return transform(await base.analyzeObservationImage(input)); } }; };

test('local health succeeds without network, Firebase, or persistence', async () => assert.deepEqual(await gateway().health(), { ok: true, status: 'AI_RUNTIME_LOCAL_READY', localOnly: true, network: false, firebase: false, persistence: false, processingTimeMs: 0 }));
test('runtime is disabled by default and fails closed', async () => { assert.equal(evaluateLocalAIRuntime().code, 'AI_RUNTIME_DISABLED'); assert.equal((await gateway({ runtimeConfig: {} }).analyzeObservationImage(request())).errorCode, 'AI_RUNTIME_DISABLED'); });
test('runtime rejects public, cloud, Firebase, or external-network mode', () => assert.equal(evaluateLocalAIRuntime({ ...runtime, externalNetworkEnabled: true }).code, 'AI_RUNTIME_ISOLATION_REQUIRED'));
test('valid local request succeeds through the mock provider', async () => { const response = await gateway().analyzeObservationImage(request()); assert.equal(response.ok, true); assert.equal(response.result.provider, 'MOCK'); assert.equal(response.auditMetadata.organizationId, 'org-a'); });
test('malformed envelope is denied deterministically', async () => assert.equal((await gateway().analyzeObservationImage(request({ requestId: '' }))).errorCode, 'AI_GATEWAY_REQUEST_INVALID'));
test('cross-organization trusted context is denied', async () => assert.equal((await gateway().analyzeObservationImage(request({ organizationId: 'org-b' }))).errorCode, 'AI_GATEWAY_AUTH_CONTEXT_DENIED'));
test('provider capability mismatch is denied', async () => assert.equal((await gateway({ capabilities: { ...MOCK_CAPABILITIES, supportsVision: false } }).analyzeObservationImage(request())).errorCode, 'AI_PROVIDER_VISION_REQUIRED'));
test('capability contract requires structured Arabic and bounded image support', () => { assert.equal(validateProviderCapabilities(MOCK_CAPABILITIES).allowed, true); assert.equal(validateProviderCapabilities({ ...MOCK_CAPABILITIES, supportsArabic: false }).allowed, false); });
test('provider timeout is normalized', async () => { const capabilities = { ...MOCK_CAPABILITIES, timeoutMs: 5 }; assert.equal((await gateway({ provider: createMockAIProvider({ mode: 'TIMEOUT' }), capabilities }).analyzeObservationImage(request())).errorCode, 'AI_TIMEOUT'); });
test('provider failure is normalized without stack or raw error', async () => { const response = await gateway({ provider: createMockAIProvider({ mode: 'FAILURE' }) }).analyzeObservationImage(request()); assert.equal(response.errorCode, 'AI_PROVIDER_ERROR'); assert.equal(JSON.stringify(response).includes('stack'), false); assert.equal(JSON.stringify(response).includes('mock provider failure'), false); });
test('malformed provider result is denied', async () => assert.equal((await gateway({ provider: createMockAIProvider({ mode: 'INVALID_OUTPUT' }) }).analyzeObservationImage(request())).errorCode, 'AI_PROVIDER_OUTPUT_INVALID'));
test('before/after and priority handlers exist but remain inactive', async () => { const beforeAfter = await gateway().verifyBeforeAfter(request({ operation: 'VERIFY_BEFORE_AFTER', beforeImageReference: 'a', afterImageReference: 'b' })); const priority = await gateway().suggestPriority(request({ operation: 'SUGGEST_PRIORITY' })); assert.equal(beforeAfter.errorCode, 'AI_OPERATION_NOT_ACTIVATED'); assert.equal(priority.errorCode, 'AI_OPERATION_NOT_ACTIVATED'); });

test('workflow mutation field from provider is rejected', async () => { const provider = mutateProvider(output => ({ ...output, workflowAction: 'UPDATE_STATUS' })); assert.equal((await gateway({ provider }).analyzeObservationImage(request())).errorCode, 'AI_WORKFLOW_OUTPUT_DENIED'); });
test('workflow command hidden in an advisory field is rejected', async () => { const provider = mutateProvider(output => ({ ...output, recommendedActionAr: 'UPDATE_STATUS' })); assert.equal((await gateway({ provider }).analyzeObservationImage(request())).errorCode, 'AI_WORKFLOW_COMMAND_DENIED'); });
test('gateway has no Firestore or Firebase imports and emits no mutation flags', async () => { const source = fs.readFileSync(path.join(__dirname, '../platform/ai/local-ai-gateway-service.js'), 'utf8'); assert.equal(/(?:require\(|\bfrom\b).*(?:firebase|firestore)|\b(?:addDoc|setDoc|updateDoc)\s*\(/i.test(source), false); const response = await gateway().analyzeObservationImage(request()); const text = JSON.stringify(response); assert.equal(/automaticSave|applyClassification|applyPriority|SAVE_OBSERVATION/.test(text), false); });
test('response and audit contain no image bytes, raw prompt, reference, or provider secret', async () => { const response = await gateway().analyzeObservationImage(request({ controlledImagePayload: new Uint8Array([1,2,3]), existingDescription: 'raw prompt marker' })); const text = JSON.stringify(response); assert.equal(text.includes('controlledImagePayload'), false); assert.equal(text.includes('imageReference'), false); assert.equal(text.includes('raw prompt marker'), false); assert.equal(/api[_-]?key|private[_-]?key|bearer/i.test(text), false); });

test('manual description remains available without a suggestion session', () => { const result = useManualDescription(null, 'وصف ميداني يدوي واضح'); assert.equal(result.allowed, true); assert.equal(result.session.state, 'MANUAL'); assert.equal(result.session.persisted, false); });
test('AI suggestion requires explicit acceptance and does not persist', async () => { const analysis = (await gateway().analyzeObservationImage(request())).result; const created = createSuggestionSession({ sessionId: 's-1', observationId: 'obs-a', analysisResult: analysis }); const accepted = acceptSuggestion(created.session); assert.equal(created.session.state, 'AI_SUGGESTED'); assert.equal(accepted.session.state, 'AI_ACCEPTED'); assert.equal(accepted.session.persisted, false); assert.equal(accepted.session.automaticSave, false); });
test('editing preserves analysis id and explicit provenance', async () => { const analysis = (await gateway().analyzeObservationImage(request())).result; const created = createSuggestionSession({ sessionId: 's-1', observationId: 'obs-a', analysisResult: analysis }); const edited = editSuggestion(created.session, 'تم رصد حفرة واضحة وتتطلب معالجة ميدانية عاجلة.'); assert.equal(edited.session.analysisId, analysis.analysisId); assert.equal(edited.session.state, 'AI_EDITED'); assert.equal(edited.session.aiSuggestionEdited, true); });
test('AI suggestion may be ignored without persistence', async () => { const analysis = (await gateway().analyzeObservationImage(request())).result; const created = createSuggestionSession({ sessionId: 's-1', observationId: 'obs-a', analysisResult: analysis }); const ignored = ignoreSuggestion(created.session); assert.equal(ignored.session.state, 'AI_IGNORED'); assert.equal(ignored.session.aiSuggestionUsed, false); assert.equal(ignored.session.persisted, false); });
test('manual choice can replace any AI session', async () => { const analysis = (await gateway().analyzeObservationImage(request())).result; const session = createSuggestionSession({ sessionId: 's-1', observationId: 'obs-a', analysisResult: analysis }).session; assert.equal(useManualDescription(session, 'وصف يدوي مستقل للملاحظة الميدانية').session.state, 'MANUAL'); });

test('canonical private reference is accepted with exact scope', () => assert.equal(evaluateAIStorageInput(request()).code, 'AI_STORAGE_CANONICAL_PRIVATE'));
test('private legacy-compatible B2 reference is accepted by explicit policy', () => assert.equal(evaluateAIStorageInput(request({ imageReference: 'observations/org-a/before/2026/08/a.jpg' })).code, 'AI_STORAGE_LEGACY_PRIVATE'));
test('local-demo reference is local-only and tenant scoped', () => assert.equal(evaluateAIStorageInput(request({ imageReference: 'local-demo://org-a/asset-a' })).code, 'AI_STORAGE_LOCAL_DEMO'));
test('ambiguous and public references are denied', () => { assert.equal(evaluateAIStorageInput(request({ imageReference: 'https://example.com/a.jpg' })).code, 'AI_STORAGE_REFERENCE_AMBIGUOUS'); assert.equal(evaluateAIStorageInput(request({ imageReference: 'gs://unknown/a.jpg' })).allowed, false); });
test('embedded data and invalid references are denied', () => { assert.equal(evaluateAIStorageInput(request({ imageReference: 'data:image/png;base64,iVBORw0KGgo=' })).code, 'AI_STORAGE_EMBEDDED_DATA_DENIED'); assert.equal(evaluateAIStorageInput(request({ imageReference: '../bad' })).code, 'AI_STORAGE_REFERENCE_INVALID'); });
test('cross-organization canonical and legacy references are denied', () => { assert.equal(evaluateAIStorageInput(request({ imageReference: 'organizations/org-b/observations/obs-a/before/object-a' })).code, 'AI_STORAGE_SCOPE_DENIED'); assert.equal(evaluateAIStorageInput(request({ imageReference: 'observations/org-b/before/2026/08/a.jpg' })).code, 'AI_STORAGE_SCOPE_DENIED'); });

test('municipal fixture catalog contains 20 cases and every supported summary passes policy', () => { assert.equal(MUNICIPAL_SUMMARY_FIXTURES.length, 20); for (const item of MUNICIPAL_SUMMARY_FIXTURES.filter(item => item.supported)) assert.equal(validateShortSummaryAr(item.shortSummaryAr).allowed, true, item.fixtureId); });
test('provider conformance catalog contains every required case', () => assert.equal(PROVIDER_CONFORMANCE_CASES.length, 18));
test('mock adapter passes the reusable 18-case conformance suite', async () => {
  const fixtureByCase = { VALID_POTHOLE:'ASPHALT_POTHOLE', VALID_LEANING_POLE:'LEANING_LIGHTING_POLE', VALID_FALLEN_PALM:'FALLEN_PALM_TREE', VALID_CONSTRUCTION_WASTE:'CONSTRUCTION_WASTE', VALID_WATER_LEAK:'WATER_LEAKAGE', VALID_UNCLEAR_IMAGE:'UNCLEAR_IMAGE' };
  const run = await runProviderConformance({ providerId: 'mock', runCase: async testCase => {
    let provider = createMockAIProvider({ fixture: fixtureByCase[testCase.caseId] || 'ASPHALT_POTHOLE' }); let providers; let capabilities = MOCK_CAPABILITIES;
    if (testCase.caseId === 'UNSUPPORTED_IMAGE') provider = createMockAIProvider({ fixture: 'UNSUPPORTED_IMAGE' });
    if (testCase.caseId === 'MALFORMED_OUTPUT') provider = createMockAIProvider({ mode: 'INVALID_OUTPUT' });
    if (testCase.caseId === 'TIMEOUT') { provider = createMockAIProvider({ mode: 'TIMEOUT' }); capabilities = { ...MOCK_CAPABILITIES, timeoutMs: 5 }; }
    if (testCase.caseId === 'PROVIDER_UNAVAILABLE') providers = {};
    if (testCase.caseId === 'NON_ARABIC_SUMMARY') provider = mutateProvider(output => ({ ...output, shortSummaryAr: 'Visible road damage requires immediate municipal repair action' }));
    if (testCase.caseId === 'SUMMARY_UNDER_FIVE_WORDS') provider = mutateProvider(output => ({ ...output, shortSummaryAr: 'حفرة تتطلب معالجة عاجلة' }));
    if (testCase.caseId === 'SUMMARY_OVER_FIFTEEN_WORDS') provider = mutateProvider(output => ({ ...output, shortSummaryAr: 'تم رصد حفرة كبيرة في الطريق الرئيسي وتتطلب معالجة عاجلة وفورية لحماية جميع مستخدمي الطريق من المخاطر المحتملة' }));
    if (testCase.caseId === 'INVALID_SEVERITY') provider = mutateProvider(output => ({ ...output, severity: 'EXTREME' }));
    if (testCase.caseId === 'INVALID_CONFIDENCE') provider = mutateProvider(output => ({ ...output, confidence: 2 }));
    if (testCase.caseId === 'MISSING_HUMAN_REVIEW') provider = mutateProvider(output => { const copy = { ...output }; delete copy.requiresHumanReview; return copy; });
    if (testCase.caseId === 'WORKFLOW_ACTION_ATTEMPT') provider = mutateProvider(output => ({ ...output, workflowAction: 'SAVE_OBSERVATION' }));
    if (testCase.caseId === 'SECRET_OR_RAW_PROMPT_ATTEMPT') provider = mutateProvider(output => ({ ...output, rawPrompt: 'api_key must-not-leak' }));
    const response = await gateway({ provider, capabilities, providers }).analyzeObservationImage(request());
    return { passed: testCase.expected === 'SUCCESS' ? response.ok === true : response.ok === false, code: response.ok ? 'SUCCESS' : response.errorCode };
  }});
  assert.equal(run.ok, true); assert.equal(run.passed, 18); assert.equal(run.failed, 0);
});
