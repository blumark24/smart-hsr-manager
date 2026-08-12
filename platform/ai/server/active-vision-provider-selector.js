'use strict';

const { createGeminiCompatibleVisionProvider } = require('./gemini-compatible-vision-provider');
const { createOpenAICompatibleVisionProvider } = require('./openai-compatible-vision-provider');

const SUPPORTED_VISION_PROVIDERS = Object.freeze({
  gemini: Object.freeze({ kind: 'GEMINI_COMPATIBLE', create: createGeminiCompatibleVisionProvider }),
  openai: Object.freeze({ kind: 'OPENAI_COMPATIBLE', create: createOpenAICompatibleVisionProvider }),
});

const DEFAULT_VISION_PROVIDER_ID = 'gemini';
const ALLOWED_PROVIDER_HOSTS = Object.freeze(new Set(['generativelanguage.googleapis.com', 'api.openai.com']));

function resolveConfiguredVisionProviderId(environment = process.env) {
  const raw = typeof environment.SMART_HSR_AI_PROVIDER === 'string' ? environment.SMART_HSR_AI_PROVIDER.trim() : '';
  return raw || DEFAULT_VISION_PROVIDER_ID;
}

function safeTransportCode(error) {
  const raw = typeof error?.cause?.code === 'string' ? error.cause.code : typeof error?.code === 'string' ? error.code : '';
  return /^[A-Z0-9_]{1,64}$/.test(raw) ? raw : null;
}

function createServerJsonTransport({ fetchImpl = globalThis.fetch } = {}) {
  return async request => {
    if (typeof fetchImpl !== 'function') throw Object.assign(new Error('Provider transport unavailable.'), { code: 'AI_PROVIDER_UNAVAILABLE', failureStage: 'OPENAI_TRANSPORT', transportCode: 'FETCH_UNAVAILABLE' });
    let target;
    try { target = new URL(request?.url); }
    catch (_) { throw Object.assign(new Error('Provider URL invalid.'), { code: 'AI_PROVIDER_UNAVAILABLE', failureStage: 'OPENAI_TRANSPORT', transportCode: 'URL_INVALID' }); }
    if (target.protocol !== 'https:' || !ALLOWED_PROVIDER_HOSTS.has(target.hostname)) throw Object.assign(new Error('Provider destination denied.'), { code: 'AI_PROVIDER_UNAVAILABLE', failureStage: 'OPENAI_TRANSPORT', transportCode: 'DESTINATION_DENIED' });

    const controller = new AbortController();
    const timeoutMs = Number.isFinite(request?.timeoutMs) && request.timeoutMs > 0 ? request.timeoutMs : 10000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(target.toString(), { method: request?.method || 'POST', headers: request?.headers || {}, body: JSON.stringify(request?.body ?? {}), signal: controller.signal });
      const bytes = await response.arrayBuffer();
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      let body = null;
      if (text) { try { body = JSON.parse(text); } catch (_) { body = null; } }
      return Object.freeze({ ok: response.ok, status: response.status, body });
    } catch (error) {
      const transportCode = safeTransportCode(error);
      const errorName = typeof error?.name === 'string' ? error.name.slice(0, 64) : 'Error';
      if (errorName === 'AbortError' || error?.code === 'AI_TIMEOUT') {
        console.warn('ai provider transport failure', { failureStage: 'OPENAI_TRANSPORT', errorCode: 'AI_TIMEOUT', transportCode, errorName });
        throw Object.assign(new Error('Provider timeout.'), { code: 'AI_TIMEOUT', failureStage: 'OPENAI_TRANSPORT', transportCode });
      }
      console.warn('ai provider transport failure', { failureStage: 'OPENAI_TRANSPORT', errorCode: 'AI_PROVIDER_UNAVAILABLE', transportCode, errorName });
      throw Object.assign(new Error('Provider transport unavailable.'), { code: 'AI_PROVIDER_UNAVAILABLE', failureStage: 'OPENAI_TRANSPORT', transportCode });
    } finally { clearTimeout(timer); }
  };
}

function createActiveVisionProviderRegistration({ environment = process.env, mode = 'application', applicationContext = null, timeoutMs, transport } = {}) {
  const providerId = resolveConfiguredVisionProviderId(environment);
  const entry = SUPPORTED_VISION_PROVIDERS[providerId];
  if (!entry) return Object.freeze({ allowed: false, code: 'AI_PROVIDER_NOT_CONFIGURED', reason: `Configured AI provider "${providerId}" is not supported.`, providerId, kind: null, providerRegistration: null });
  const providerTransport = transport === undefined && mode === 'application' ? createServerJsonTransport() : transport;
  const provider = entry.create({ enabled: true, environment, mode, applicationContext, timeoutMs, transport: providerTransport });
  return Object.freeze({ allowed: true, code: 'AI_PROVIDER_SELECTED', reason: 'Configured AI provider resolved.', providerId, kind: entry.kind, providerRegistration: Object.freeze({ kind: entry.kind, enabled: true, capabilities: Object.freeze({ vision: true }), provider }) });
}

module.exports = Object.freeze({ SUPPORTED_VISION_PROVIDER_IDS: Object.freeze(Object.keys(SUPPORTED_VISION_PROVIDERS)), DEFAULT_VISION_PROVIDER_ID, resolveConfiguredVisionProviderId, createServerJsonTransport, createActiveVisionProviderRegistration });
