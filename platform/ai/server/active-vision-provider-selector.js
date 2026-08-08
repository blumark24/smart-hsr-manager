'use strict';

const { createGeminiCompatibleVisionProvider } = require('./gemini-compatible-vision-provider');
const { createOpenAICompatibleVisionProvider } = require('./openai-compatible-vision-provider');

// Sprint 6.11 Phase 2: single source of truth for "which AI vision provider
// is active", read once from SMART_HSR_AI_PROVIDER. Adding a future provider
// means adding one entry here -- callers (api/ai/analyze.js) never hardcode
// a provider id or kind, and provider-router.js is never touched. Gemini
// stays the default when the variable is unset, so any deployment that has
// never set SMART_HSR_AI_PROVIDER keeps its exact current behavior.
const SUPPORTED_VISION_PROVIDERS = Object.freeze({
  gemini: Object.freeze({ kind: 'GEMINI_COMPATIBLE', create: createGeminiCompatibleVisionProvider }),
  openai: Object.freeze({ kind: 'OPENAI_COMPATIBLE', create: createOpenAICompatibleVisionProvider }),
});

const DEFAULT_VISION_PROVIDER_ID = 'gemini';

function resolveConfiguredVisionProviderId(environment = process.env) {
  const raw = typeof environment.SMART_HSR_AI_PROVIDER === 'string' ? environment.SMART_HSR_AI_PROVIDER.trim() : '';
  return raw || DEFAULT_VISION_PROVIDER_ID;
}

// Builds the { providerId, providerRegistration } pair createProviderRouter
// expects, or an honest denial -- never a fabricated provider -- when
// SMART_HSR_AI_PROVIDER names something unsupported. Never returns a
// registration for an unrecognized id; the caller must fail closed on
// allowed:false exactly like every other AI gateway denial path.
function createActiveVisionProviderRegistration({ environment = process.env, mode = 'application', applicationContext = null, timeoutMs } = {}) {
  const providerId = resolveConfiguredVisionProviderId(environment);
  const entry = SUPPORTED_VISION_PROVIDERS[providerId];
  if (!entry) {
    return Object.freeze({ allowed: false, code: 'AI_PROVIDER_NOT_CONFIGURED', reason: `Configured AI provider "${providerId}" is not supported.`, providerId, kind: null, providerRegistration: null });
  }
  const provider = entry.create({ enabled: true, environment, mode, applicationContext, timeoutMs });
  return Object.freeze({
    allowed: true,
    code: 'AI_PROVIDER_SELECTED',
    reason: 'Configured AI provider resolved.',
    providerId,
    kind: entry.kind,
    providerRegistration: Object.freeze({ kind: entry.kind, enabled: true, capabilities: Object.freeze({ vision: true }), provider }),
  });
}

module.exports = Object.freeze({
  SUPPORTED_VISION_PROVIDER_IDS: Object.freeze(Object.keys(SUPPORTED_VISION_PROVIDERS)),
  DEFAULT_VISION_PROVIDER_ID,
  resolveConfiguredVisionProviderId,
  createActiveVisionProviderRegistration,
});
