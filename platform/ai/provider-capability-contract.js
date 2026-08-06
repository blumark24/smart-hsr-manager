'use strict';

const { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_PAYLOAD_BYTES, DEFAULT_TIMEOUT_MS } = require('./ai-security-policy');

const REQUIRED_CAPABILITY_FIELDS = Object.freeze(['providerId','supportsVision','supportsBeforeAfter','supportsStructuredOutput','supportsArabic','maxImageBytes','supportedMimeTypes','timeoutMs']);

function validateProviderCapabilities(value = {}, operation = 'ANALYZE_OBSERVATION_IMAGE') {
  const missing = REQUIRED_CAPABILITY_FIELDS.filter(field => value[field] === undefined || value[field] === null || value[field] === '');
  if (missing.length) return Object.freeze({ allowed: false, code: 'AI_PROVIDER_CAPABILITIES_INCOMPLETE', reason: `Missing capabilities: ${missing.join(', ')}` });
  if (value.supportsStructuredOutput !== true || value.supportsArabic !== true) return Object.freeze({ allowed: false, code: 'AI_PROVIDER_LANGUAGE_OR_STRUCTURE_REQUIRED', reason: 'Structured Arabic output capability is required.' });
  if (operation === 'ANALYZE_OBSERVATION_IMAGE' && value.supportsVision !== true) return Object.freeze({ allowed: false, code: 'AI_PROVIDER_VISION_REQUIRED', reason: 'Vision capability is required.' });
  if (operation === 'VERIFY_BEFORE_AFTER' && value.supportsBeforeAfter !== true) return Object.freeze({ allowed: false, code: 'AI_PROVIDER_BEFORE_AFTER_REQUIRED', reason: 'Before/after capability is required.' });
  if (!Number.isInteger(value.maxImageBytes) || value.maxImageBytes < MAX_IMAGE_PAYLOAD_BYTES) return Object.freeze({ allowed: false, code: 'AI_PROVIDER_IMAGE_LIMIT_INSUFFICIENT', reason: 'Provider image limit is below the gateway contract.' });
  if (!Array.isArray(value.supportedMimeTypes) || !ALLOWED_IMAGE_MIME_TYPES.every(type => value.supportedMimeTypes.includes(type))) return Object.freeze({ allowed: false, code: 'AI_PROVIDER_MIME_CAPABILITY_INSUFFICIENT', reason: 'Provider does not support all gateway image types.' });
  if (!Number.isInteger(value.timeoutMs) || value.timeoutMs < 1 || value.timeoutMs > DEFAULT_TIMEOUT_MS) return Object.freeze({ allowed: false, code: 'AI_PROVIDER_TIMEOUT_INVALID', reason: 'Provider timeout must be positive and bounded by the gateway timeout.' });
  return Object.freeze({ allowed: true, code: 'AI_PROVIDER_CAPABILITIES_VALID', reason: 'Provider capabilities satisfy the requested operation.' });
}

const MOCK_CAPABILITIES = Object.freeze({ providerId: 'mock', supportsVision: true, supportsBeforeAfter: true, supportsStructuredOutput: true, supportsArabic: true,
  maxImageBytes: MAX_IMAGE_PAYLOAD_BYTES, supportedMimeTypes: ALLOWED_IMAGE_MIME_TYPES, timeoutMs: 1000 });

module.exports = Object.freeze({ REQUIRED_CAPABILITY_FIELDS, MOCK_CAPABILITIES, validateProviderCapabilities });
