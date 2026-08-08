'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GEMINI_REST_VISION_OUTPUT_SCHEMA, createGeminiCompatibleVisionProvider } = require('../platform/ai/server/gemini-compatible-vision-provider');

const apiKey = 'offline-secret-key';
const environment = Object.freeze({ GEMINI_API_KEY: apiKey, GEMINI_VISION_MODEL: 'gemini-2.5-flash', SMART_HSR_REAL_AI_EVALUATION: 'true', SMART_HSR_SYNTHETIC_DATA_ONLY: 'true', SMART_HSR_AI_PROVIDER: 'gemini', SMART_HSR_NO_APP_INTEGRATION: 'true' });
const input = Object.freeze({ organizationId: 'synthetic-evaluation', observationId: 'rest-shape', actorId: 'offline-runner', actorRole: 'test', correlationId: 'rest-shape', imageReference: null, imageContentType: 'image/jpeg', controlledImagePayload: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), existingDescription: '', locationContext: null });

test('raw REST request uses snake_case image fields and supported response schema', async () => {
  let request;
  let calls = 0;
  const provider = createGeminiCompatibleVisionProvider({ enabled: true, environment, transport: async value => { calls += 1; request = value; return { ok: false, status: 400, body: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid request.' } } }; } });
  await provider.analyzeObservationImage(input);
  assert.equal(calls, 1);
  const imagePart = request.body.contents[0].parts[0];
  const promptPart = request.body.contents[0].parts[1];
  assert.equal(imagePart.inline_data.mime_type, 'image/jpeg');
  assert.equal(typeof imagePart.inline_data.data, 'string');
  assert.ok(imagePart.inline_data.data.length > 0);
  assert.equal('inlineData' in imagePart, false);
  assert.equal('mimeType' in imagePart.inline_data, false);
  assert.equal(typeof promptPart.text, 'string');
  assert.ok(promptPart.text.length > 0);
  assert.equal(request.body.generationConfig.responseMimeType, 'application/json');
  assert.equal(request.body.generationConfig.responseSchema, GEMINI_REST_VISION_OUTPUT_SCHEMA);
  assert.equal(GEMINI_REST_VISION_OUTPUT_SCHEMA.type, 'OBJECT');
  assert.equal('additionalProperties' in GEMINI_REST_VISION_OUTPUT_SCHEMA, false);
  assert.ok(GEMINI_REST_VISION_OUTPUT_SCHEMA.required.includes('shortSummaryAr'));
});

test('HTTP 400 diagnostics are bounded and redact request secrets', async () => {
  let request;
  let calls = 0;
  const provider = createGeminiCompatibleVisionProvider({ enabled: true, environment, transport: async value => {
    calls += 1;
    request = value;
    const imageData = value.body.contents[0].parts[0].inline_data.data;
    const prompt = value.body.contents[0].parts[1].text;
    return { ok: false, status: 400, body: { error: { code: 400, status: 'INVALID_ARGUMENT', message: `${apiKey} ${imageData} ${prompt} ${'x'.repeat(500)}` } } };
  } });
  const result = await provider.analyzeObservationImage(input);
  assert.equal(calls, 1);
  assert.equal(result.errorCode, 'AI_PROVIDER_REQUEST_INVALID');
  assert.equal(result.httpStatus, 400);
  assert.equal(result.providerErrorStatus, 'INVALID_ARGUMENT');
  assert.equal(result.providerErrorCode, '400');
  assert.ok(result.providerErrorMessageSanitized.length <= 300);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(apiKey), false);
  assert.equal(serialized.includes(request.body.contents[0].parts[0].inline_data.data), false);
  assert.equal(serialized.includes(request.body.contents[0].parts[1].text), false);
  assert.equal('body' in result, false);
  assert.equal('stack' in result, false);
});

test('adapter has one transport invocation site and no retry or provider fallback', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'platform', 'ai', 'server', 'gemini-compatible-vision-provider.js'), 'utf8');
  assert.equal((source.match(/callWithTimeout\(transport/g) || []).length, 1);
  assert.doesNotMatch(source, /openrouter|retry/i);
});
