'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SUPPORTED_VISION_PROVIDER_IDS,
  DEFAULT_VISION_PROVIDER_ID,
  resolveConfiguredVisionProviderId,
  createActiveVisionProviderRegistration,
} = require('../platform/ai/server/active-vision-provider-selector');
const { createProviderRouter, PROVIDER_KINDS } = require('../platform/ai/provider-router');

const input = (overrides = {}) => ({
  organizationId: 'org-a', observationId: 'obs-a', actorId: 'actor-a', actorRole: 'inspector', correlationId: 'corr-a',
  imageContentType: 'image/jpeg', controlledImagePayload: new Uint8Array([255, 216, 255, 1]), existingDescription: '', ...overrides,
});
const authContext = () => ({ organizationId: 'org-a', actorId: 'actor-a' });

// --- provider selection (configuration driven, single source of truth) ---------

test('DEFAULT_VISION_PROVIDER_ID is gemini so unset deployments keep current behavior', () => {
  assert.equal(DEFAULT_VISION_PROVIDER_ID, 'gemini');
});

test('SUPPORTED_VISION_PROVIDER_IDS lists exactly gemini and openai', () => {
  assert.deepEqual([...SUPPORTED_VISION_PROVIDER_IDS].sort(), ['gemini', 'openai']);
});

test('resolveConfiguredVisionProviderId defaults to gemini when SMART_HSR_AI_PROVIDER is unset', () => {
  assert.equal(resolveConfiguredVisionProviderId({}), 'gemini');
});

test('resolveConfiguredVisionProviderId defaults to gemini for a blank/whitespace value', () => {
  assert.equal(resolveConfiguredVisionProviderId({ SMART_HSR_AI_PROVIDER: '   ' }), 'gemini');
});

test('resolveConfiguredVisionProviderId reads openai verbatim', () => {
  assert.equal(resolveConfiguredVisionProviderId({ SMART_HSR_AI_PROVIDER: 'openai' }), 'openai');
});

test('resolveConfiguredVisionProviderId passes an unsupported value through unchanged (selection, not silent fallback)', () => {
  assert.equal(resolveConfiguredVisionProviderId({ SMART_HSR_AI_PROVIDER: 'anthropic' }), 'anthropic');
});

// --- OpenAI activation through the selector -------------------------------------

test('createActiveVisionProviderRegistration selects OpenAI when SMART_HSR_AI_PROVIDER=openai', () => {
  const selection = createActiveVisionProviderRegistration({
    environment: { SMART_HSR_AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k', OPENAI_VISION_MODEL: 'gpt-4o-test', SMART_HSR_AI_APPLICATION_INTEGRATION: 'true' },
    applicationContext: { organizationAllowed: true, authenticatedRequest: true },
  });
  assert.equal(selection.allowed, true);
  assert.equal(selection.providerId, 'openai');
  assert.equal(selection.kind, 'OPENAI_COMPATIBLE');
  assert.ok(PROVIDER_KINDS.includes(selection.kind));
  assert.equal(typeof selection.providerRegistration.provider.analyzeObservationImage, 'function');
});

test('OpenAI selection still fails closed without the application integration flag', async () => {
  const selection = createActiveVisionProviderRegistration({
    environment: { SMART_HSR_AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k', OPENAI_VISION_MODEL: 'gpt-4o-test' },
    applicationContext: { organizationAllowed: true, authenticatedRequest: true },
  });
  assert.equal(selection.allowed, true); // selection itself succeeds; the provider's own gate denies at call time
  const result = await selection.providerRegistration.provider.analyzeObservationImage(input());
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'AI_APPLICATION_INTEGRATION_DISABLED');
});

test('OpenAI selection fails closed for an organization not on the pilot allowlist', async () => {
  const selection = createActiveVisionProviderRegistration({
    environment: { SMART_HSR_AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k', OPENAI_VISION_MODEL: 'gpt-4o-test', SMART_HSR_AI_APPLICATION_INTEGRATION: 'true' },
    applicationContext: { organizationAllowed: false, authenticatedRequest: true },
  });
  const result = await selection.providerRegistration.provider.analyzeObservationImage(input());
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'AI_APPLICATION_ORGANIZATION_NOT_ENABLED');
});

test('OpenAI selection routed end-to-end through createProviderRouter stays advisory-only', async () => {
  const selection = createActiveVisionProviderRegistration({
    environment: { SMART_HSR_AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k', OPENAI_VISION_MODEL: 'gpt-4o-test', SMART_HSR_AI_APPLICATION_INTEGRATION: 'true' },
    applicationContext: { organizationAllowed: true, authenticatedRequest: true },
  });
  const router = createProviderRouter({ selectedProvider: selection.providerId, providers: { [selection.providerId]: selection.providerRegistration } });
  const routed = await router.analyzeObservationImage(input(), authContext());
  // No real transport configured (offline test): the provider itself denies
  // with AI_PROVIDER_UNAVAILABLE, but provider-router.js's validateAIOutput
  // flattens every non-ok provider result (not only malformed output) into
  // AI_PROVIDER_OUTPUT_INVALID/AI_OUTPUT_NOT_SUCCESS -- pre-existing router
  // behavior, identical for Gemini (see the next test). Never a fabricated
  // success either way.
  assert.equal(routed.result.ok, false);
  assert.equal(routed.result.errorCode, 'AI_PROVIDER_OUTPUT_INVALID');
  assert.equal(routed.result.reason, 'AI_OUTPUT_NOT_SUCCESS');
  assert.equal(routed.advisoryOnly, true);
  assert.equal(routed.requiresExplicitHumanAction, true);
});

// --- Gemini activation remains working through the same selector ---------------

test('createActiveVisionProviderRegistration defaults to Gemini when SMART_HSR_AI_PROVIDER is unset', () => {
  const selection = createActiveVisionProviderRegistration({
    environment: { GEMINI_API_KEY: 'k', GEMINI_VISION_MODEL: 'gemini-test', SMART_HSR_AI_APPLICATION_INTEGRATION: 'true' },
    applicationContext: { organizationAllowed: true, authenticatedRequest: true },
  });
  assert.equal(selection.allowed, true);
  assert.equal(selection.providerId, 'gemini');
  assert.equal(selection.kind, 'GEMINI_COMPATIBLE');
});

test('createActiveVisionProviderRegistration selects Gemini explicitly with SMART_HSR_AI_PROVIDER=gemini', async () => {
  const selection = createActiveVisionProviderRegistration({
    environment: { SMART_HSR_AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', GEMINI_VISION_MODEL: 'gemini-test', SMART_HSR_AI_APPLICATION_INTEGRATION: 'true' },
    applicationContext: { organizationAllowed: true, authenticatedRequest: true },
  });
  assert.equal(selection.allowed, true);
  assert.equal(selection.providerId, 'gemini');
  const router = createProviderRouter({ selectedProvider: selection.providerId, providers: { [selection.providerId]: selection.providerRegistration } });
  const routed = await router.analyzeObservationImage(input(), authContext());
  // Same router flattening as the OpenAI case above -- confirms Gemini and
  // OpenAI behave identically through the router, not just individually.
  assert.equal(routed.result.ok, false);
  assert.equal(routed.result.errorCode, 'AI_PROVIDER_OUTPUT_INVALID');
  assert.equal(routed.advisoryOnly, true);
});

test('Gemini selection is unaffected by an OpenAI-only env var being absent', () => {
  const selection = createActiveVisionProviderRegistration({
    environment: { SMART_HSR_AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', GEMINI_VISION_MODEL: 'gemini-test' },
  });
  assert.equal(selection.allowed, true);
  assert.equal(selection.providerId, 'gemini');
});

// --- invalid provider handling: honest denial, never a fabricated provider -----

test('an unsupported SMART_HSR_AI_PROVIDER value is denied with AI_PROVIDER_NOT_CONFIGURED, not a silent fallback', () => {
  const selection = createActiveVisionProviderRegistration({ environment: { SMART_HSR_AI_PROVIDER: 'anthropic' } });
  assert.equal(selection.allowed, false);
  assert.equal(selection.code, 'AI_PROVIDER_NOT_CONFIGURED');
  assert.equal(selection.providerRegistration, null);
  assert.match(selection.reason, /anthropic/);
});

test('an empty-string provider registration never satisfies PROVIDER_KINDS', () => {
  const selection = createActiveVisionProviderRegistration({ environment: { SMART_HSR_AI_PROVIDER: 'not-a-real-provider' } });
  assert.equal(selection.kind, null);
  assert.equal(PROVIDER_KINDS.includes(selection.kind), false);
});

// --- no regression to mandatory human review ------------------------------------

test('both Gemini and OpenAI selections still route through the same mandatory-human-action envelope', async () => {
  for (const providerId of ['gemini', 'openai']) {
    const environment = providerId === 'openai'
      ? { SMART_HSR_AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k', OPENAI_VISION_MODEL: 'gpt-4o-test', SMART_HSR_AI_APPLICATION_INTEGRATION: 'true' }
      : { SMART_HSR_AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', GEMINI_VISION_MODEL: 'gemini-test', SMART_HSR_AI_APPLICATION_INTEGRATION: 'true' };
    const selection = createActiveVisionProviderRegistration({ environment, applicationContext: { organizationAllowed: true, authenticatedRequest: true } });
    const router = createProviderRouter({ selectedProvider: selection.providerId, providers: { [selection.providerId]: selection.providerRegistration } });
    const routed = await router.analyzeObservationImage(input(), authContext());
    assert.equal(routed.advisoryOnly, true, `${providerId}: advisoryOnly must stay true`);
    assert.equal(routed.requiresExplicitHumanAction, true, `${providerId}: requiresExplicitHumanAction must stay true`);
    assert.deepEqual(routed.automation, {
      automaticSave: false, automaticObservationCreation: false, automaticClassificationApplication: false,
      automaticPriorityApplication: false, automaticAssignment: false, automaticStatusTransition: false,
      automaticCompletion: false, automaticClosure: false,
    }, `${providerId}: automation must stay fully disabled`);
    assert.equal(routed.result.requiresHumanReview, true, `${providerId}: denied results must still say review is required`);
  }
});

// --- api/ai/analyze.js integration: verify the smaller change was sufficient ---

test('api/ai/analyze.js no longer imports the Gemini provider directly; it goes through the selector', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'ai', 'analyze.js'), 'utf8');
  assert.equal(/require\(.*gemini-compatible-vision-provider/i.test(source), false);
  assert.match(source, /require\(.*active-vision-provider-selector/i);
  assert.match(source, /createActiveVisionProviderRegistration/);
});

test('api/ai/analyze.js still fails closed (returns fail(...)) when provider selection is denied', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'ai', 'analyze.js'), 'utf8');
  assert.match(source, /providerSelection\.allowed/);
  assert.match(source, /fail\(res, 503, providerSelection\.code, providerSelection\.reason\)/);
});

test('provider-router.js was not modified to add OpenAI wiring -- OPENAI_COMPATIBLE already existed', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'platform', 'ai', 'provider-router.js'), 'utf8');
  assert.match(source, /OPENAI_COMPATIBLE/);
  assert.doesNotMatch(source, /openai-compatible-vision-provider|createOpenAICompatibleVisionProvider/i);
});
