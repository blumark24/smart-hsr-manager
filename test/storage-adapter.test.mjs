import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../storage-adapter.js', import.meta.url), 'utf8');
const adapter = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('private evidence read refreshes a rejected Firebase token once', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(options.headers.Authorization);
    if (calls.length === 1) return new Response('{"error":"unauthenticated"}', {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
    return new Response(new Blob(['image-bytes'], { type: 'image/jpeg' }), {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' }
    });
  };

  try {
    const result = await adapter.resolveObservationImage({
      reference: 'observations/org/before/2026/08/photo.jpg',
      context: { getIdToken: force => force ? 'fresh-token' : 'cached-token' }
    });
    assert.equal(result.available, true);
    assert.deepEqual(calls, ['Bearer cached-token', 'Bearer fresh-token']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('private evidence read does not retry non-authentication failures', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('{"error":"object_not_found"}', {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const result = await adapter.resolveObservationImage({
      reference: 'observations/org/before/2026/08/missing.jpg',
      context: { getIdToken: force => force ? 'fresh-token' : 'cached-token' }
    });
    assert.equal(result.available, false);
    assert.equal(result.reason, 'object_not_found');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
