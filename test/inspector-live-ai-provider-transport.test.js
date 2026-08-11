'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createServerJsonTransport,
} = require('../platform/ai/server/active-vision-provider-selector');

test('server AI transport sends JSON over HTTPS and returns parsed provider JSON', async () => {
  let captured = null;
  const transport = createServerJsonTransport({
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        status: 200,
        async arrayBuffer() {
          return new TextEncoder().encode(JSON.stringify({ ok: true, value: 7 })).buffer;
        },
      };
    },
  });

  const result = await transport({
    method: 'POST',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/test:generateContent',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'redacted-in-test' },
    body: { hello: 'world' },
    timeoutMs: 1000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, value: 7 });
  assert.equal(captured.url, 'https://generativelanguage.googleapis.com/v1beta/models/test:generateContent');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.body, JSON.stringify({ hello: 'world' }));
});

test('server AI transport fails closed for non-HTTPS or unapproved provider hosts', async () => {
  const transport = createServerJsonTransport({
    fetchImpl: async () => {
      throw new Error('network must not be reached');
    },
  });

  await assert.rejects(
    () => transport({ method: 'POST', url: 'http://generativelanguage.googleapis.com/x', headers: {}, body: {}, timeoutMs: 1000 }),
    error => error?.code === 'AI_PROVIDER_UNAVAILABLE'
  );

  await assert.rejects(
    () => transport({ method: 'POST', url: 'https://example.com/provider', headers: {}, body: {}, timeoutMs: 1000 }),
    error => error?.code === 'AI_PROVIDER_UNAVAILABLE'
  );
});
