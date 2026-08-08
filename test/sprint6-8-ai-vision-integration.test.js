'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateRealProviderActivation, evaluateApplicationProviderActivation } = require('../platform/ai/server/real-provider-activation-guard');
const { createGeminiCompatibleVisionProvider } = require('../platform/ai/server/gemini-compatible-vision-provider');
const { normalizeAdapterError } = require('../platform/ai/server/provider-adapter-utils');
const analyze = require('../api/ai/analyze');

// --- evaluateApplicationProviderActivation: fails closed on every missing condition ---

const fullApplicationConfig = () => ({
  applicationIntegrationEnabled: true,
  providerExplicitlySelected: true,
  apiKeyPresent: true,
  organizationAllowed: true,
  authenticatedRequest: true,
  runtimeTarget: 'server',
});

test('application activation succeeds when every condition holds', () => {
  const decision = evaluateApplicationProviderActivation(fullApplicationConfig());
  assert.equal(decision.allowed, true);
  assert.equal(decision.code, 'AI_APPLICATION_PROVIDER_EVALUATION_ALLOWED');
});

test('application activation denies when the flag is off', () => {
  const decision = evaluateApplicationProviderActivation({ ...fullApplicationConfig(), applicationIntegrationEnabled: false });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'AI_APPLICATION_INTEGRATION_DISABLED');
});

test('application activation denies an organization not on the pilot allowlist', () => {
  const decision = evaluateApplicationProviderActivation({ ...fullApplicationConfig(), organizationAllowed: false });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'AI_APPLICATION_ORGANIZATION_NOT_ENABLED');
});

test('application activation denies an unauthenticated request', () => {
  const decision = evaluateApplicationProviderActivation({ ...fullApplicationConfig(), authenticatedRequest: false });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'AI_APPLICATION_AUTHENTICATION_REQUIRED');
});

test('application activation denies a missing API key', () => {
  const decision = evaluateApplicationProviderActivation({ ...fullApplicationConfig(), apiKeyPresent: false });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'AI_APPLICATION_API_KEY_REQUIRED');
});

test('application activation denies a non-server runtime', () => {
  const decision = evaluateApplicationProviderActivation({ ...fullApplicationConfig(), runtimeTarget: 'browser' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'AI_APPLICATION_SERVER_ONLY');
});

// --- the pre-existing evaluation-only gate is completely unaffected ---

test('evaluateRealProviderActivation still requires synthetic-data-only and no-app-integration, unchanged', () => {
  const decision = evaluateRealProviderActivation({
    localEvaluationEnabled: true, syntheticDataOnly: true, providerExplicitlySelected: true,
    apiKeyPresent: true, noApplicationIntegration: true, runtimeTarget: 'server',
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.code, 'AI_REAL_PROVIDER_EVALUATION_ALLOWED');
});

test('evaluateRealProviderActivation still refuses when noApplicationIntegration is false', () => {
  const decision = evaluateRealProviderActivation({
    localEvaluationEnabled: true, syntheticDataOnly: true, providerExplicitlySelected: true,
    apiKeyPresent: true, noApplicationIntegration: false, runtimeTarget: 'server',
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, 'AI_REAL_APPLICATION_ISOLATION_REQUIRED');
});

// --- Gemini provider: default mode is byte-for-byte backward compatible ---

test('gemini provider default mode (no mode passed) still uses the evaluation-only gate and refuses without synthetic/no-app-integration env flags', async () => {
  const provider = createGeminiCompatibleVisionProvider({
    enabled: true,
    environment: { GEMINI_API_KEY: 'k', GEMINI_VISION_MODEL: 'gemini-test', SMART_HSR_REAL_AI_EVALUATION: 'true', SMART_HSR_AI_PROVIDER: 'gemini' },
    // deliberately omit SMART_HSR_SYNTHETIC_DATA_ONLY / SMART_HSR_NO_APP_INTEGRATION
  });
  const result = await provider.analyzeObservationImage({ controlledImagePayload: new Uint8Array([1,2,3]), imageContentType: 'image/jpeg' });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'AI_REAL_SYNTHETIC_DATA_REQUIRED');
});

test('gemini provider mode:"application" refuses without the new application flag even if evaluation flags are set', async () => {
  const provider = createGeminiCompatibleVisionProvider({
    enabled: true,
    mode: 'application',
    environment: { GEMINI_API_KEY: 'k', GEMINI_VISION_MODEL: 'gemini-test', SMART_HSR_AI_PROVIDER: 'gemini', SMART_HSR_REAL_AI_EVALUATION: 'true', SMART_HSR_SYNTHETIC_DATA_ONLY: 'true', SMART_HSR_NO_APP_INTEGRATION: 'true' },
    applicationContext: { organizationAllowed: true, authenticatedRequest: true },
  });
  const result = await provider.analyzeObservationImage({ controlledImagePayload: new Uint8Array([1,2,3]), imageContentType: 'image/jpeg' });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'AI_APPLICATION_INTEGRATION_DISABLED');
});

test('gemini provider mode:"application" refuses an organization not on the pilot allowlist even with the flag on', async () => {
  const provider = createGeminiCompatibleVisionProvider({
    enabled: true,
    mode: 'application',
    environment: { GEMINI_API_KEY: 'k', GEMINI_VISION_MODEL: 'gemini-test', SMART_HSR_AI_PROVIDER: 'gemini', SMART_HSR_AI_APPLICATION_INTEGRATION: 'true' },
    applicationContext: { organizationAllowed: false, authenticatedRequest: true },
  });
  const result = await provider.analyzeObservationImage({ controlledImagePayload: new Uint8Array([1,2,3]), imageContentType: 'image/jpeg' });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'AI_APPLICATION_ORGANIZATION_NOT_ENABLED');
});

test('normalizeAdapterError passes through the new application error codes with their specific reason instead of a generic one', () => {
  const error = Object.assign(new Error('org not enabled'), { code: 'AI_APPLICATION_ORGANIZATION_NOT_ENABLED' });
  const normalized = normalizeAdapterError(error);
  assert.equal(normalized.errorCode, 'AI_APPLICATION_ORGANIZATION_NOT_ENABLED');
});

test('normalizeAdapterError still falls back to a generic code for an unrecognized error', () => {
  const normalized = normalizeAdapterError(new Error('boom'));
  assert.equal(normalized.errorCode, 'AI_PROVIDER_ERROR');
});

// --- api/ai/analyze.js pure helpers ---

test('cleanId accepts a well-formed Firestore-style id', () => {
  assert.equal(analyze._test.cleanId('abcDEF123_-'), 'abcDEF123_-');
});
test('cleanId rejects an empty value', () => assert.equal(analyze._test.cleanId(''), ''));
test('cleanId rejects path-traversal-shaped input', () => assert.equal(analyze._test.cleanId('../etc/passwd'), ''));
test('cleanId rejects an overlong value', () => assert.equal(analyze._test.cleanId('a'.repeat(200)), ''));
test('cleanId rejects a non-string value', () => assert.equal(analyze._test.cleanId(123), ''));

test('extensionContentType resolves the three allowed image extensions', () => {
  assert.equal(analyze._test.extensionContentType('observations/org/before/2026/08/x.jpg'), 'image/jpeg');
  assert.equal(analyze._test.extensionContentType('observations/org/before/2026/08/x.jpeg'), 'image/jpeg');
  assert.equal(analyze._test.extensionContentType('observations/org/before/2026/08/x.png'), 'image/png');
  assert.equal(analyze._test.extensionContentType('observations/org/before/2026/08/x.webp'), 'image/webp');
});
test('extensionContentType refuses an unsupported extension', () => {
  assert.equal(analyze._test.extensionContentType('observations/org/before/2026/08/x.svg'), '');
});

test('resolveInspectorContext returns null when the caller record does not exist', async () => {
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) };
  assert.equal(await analyze._test.resolveInspectorContext(db, 'uid-1'), null);
});
test('resolveInspectorContext returns null for a non-inspector role', async () => {
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: 'contractor', organizationId: 'org-a' }) }) }) }) };
  assert.equal(await analyze._test.resolveInspectorContext(db, 'uid-1'), null);
});
test('resolveInspectorContext returns null for an inactive inspector', async () => {
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: 'inspector', organizationId: 'org-a', active: false }) }) }) }) };
  assert.equal(await analyze._test.resolveInspectorContext(db, 'uid-1'), null);
});
test('resolveInspectorContext returns null for an inspector with no organizationId', async () => {
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: 'inspector', organizationId: '' }) }) }) }) };
  assert.equal(await analyze._test.resolveInspectorContext(db, 'uid-1'), null);
});
test('resolveInspectorContext returns a scoped context for an active inspector', async () => {
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: 'inspector', organizationId: 'org-a' }) }) }) }) };
  const context = await analyze._test.resolveInspectorContext(db, 'uid-1');
  assert.deepEqual(context, { uid: 'uid-1', role: 'inspector', organizationId: 'org-a' });
});

// --- honesty guarantee: every failure path returns ok:false, never a fabricated result ---

test('the pilot organization id is a plain Firestore doc id, not a secret placeholder', () => {
  assert.equal(typeof analyze._test.ALQUNFUDHAH_ORGANIZATION_ID, 'string');
  assert.ok(analyze._test.ALQUNFUDHAH_ORGANIZATION_ID.length > 0);
});
test('handler rejects non-POST methods without touching auth or storage', async () => {
  let statusCode = 0;
  let body = null;
  const res = { setHeader(){}, end(payload){ body = JSON.parse(payload); }, set statusCode(v){ statusCode = v; }, get statusCode(){ return statusCode; } };
  await analyze._test.handler({ method: 'GET', headers: {} }, res);
  assert.equal(statusCode, 405);
  assert.equal(body.ok, false);
  assert.equal(body.advisoryOnly, true);
});
