'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createGeminiCompatibleVisionProvider } = require('../platform/ai/server/gemini-compatible-vision-provider');

const environment = Object.freeze({
  GEMINI_API_KEY: 'offline-test-key',
  GEMINI_VISION_MODEL: 'gemini-2.5-flash',
  SMART_HSR_REAL_AI_EVALUATION: 'true',
  SMART_HSR_SYNTHETIC_DATA_ONLY: 'true',
  SMART_HSR_AI_PROVIDER: 'gemini',
  SMART_HSR_NO_APP_INTEGRATION: 'true',
});

test('Gemini transport uses canonical generateContent image fields', async () => {
  let request;
  const provider = createGeminiCompatibleVisionProvider({
    enabled: true,
    environment,
    transport: async value => {
      request = value;
      return Object.freeze({ ok: false, status: 400, body: null });
    },
  });

  await provider.analyzeObservationImage({
    organizationId: 'synthetic-evaluation',
    observationId: 'offline-transport-test',
    actorId: 'offline-runner',
    actorRole: 'test',
    correlationId: 'offline-transport-test',
    imageReference: null,
    imageContentType: 'image/jpeg',
    controlledImagePayload: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    existingDescription: '',
    locationContext: null,
  });

  assert.equal(new URL(request.url).host, 'generativelanguage.googleapis.com');
  assert.match(request.url, /\/v1beta\/models\/gemini-2\.5-flash:generateContent$/);
  assert.equal(request.headers['x-goog-api-key'], 'offline-test-key');
  assert.equal(typeof request.body.contents[0].parts[1].text, 'string');
  assert.ok(request.body.contents[0].parts[1].text.length > 0);

  const image = request.body.contents[0].parts[0].inline_data;
  assert.equal(image.mime_type, 'image/jpeg');
  assert.equal(typeof image.data, 'string');
  assert.ok(image.data.length > 0);
  assert.equal('inlineData' in request.body.contents[0].parts[0], false);
  assert.equal(request.body.generationConfig.responseMimeType, 'application/json');
  assert.ok(request.body.generationConfig.responseSchema);
});
