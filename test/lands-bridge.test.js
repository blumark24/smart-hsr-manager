'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function freshBridge() {
  delete require.cache[require.resolve('../api/_lib/landsBridge.js')];
  return require('../api/_lib/landsBridge.js');
}

test('not configured: safe no-op, no network call attempted', async () => {
  const originalEnv = process.env.LANDS_TRUSTED_API_URL;
  const originalFetch = global.fetch;
  delete process.env.LANDS_TRUSTED_API_URL;
  let called = false;
  global.fetch = async () => { called = true; throw new Error('should not be called'); };
  try {
    const { callLandsTrustedMutation, bridgeConfigured } = freshBridge();
    assert.equal(bridgeConfigured(), false);
    const result = await callLandsTrustedMutation({ idToken: 'x', municipalityId: 'org-a', operation: 'entitlement.enable', recordId: 'uid-1' });
    assert.deepEqual(result, { ok: false, bridged: false, reason: 'lands_bridge_not_configured' });
    assert.equal(called, false);
  } finally {
    if (originalEnv === undefined) delete process.env.LANDS_TRUSTED_API_URL; else process.env.LANDS_TRUSTED_API_URL = originalEnv;
    global.fetch = originalFetch;
  }
});

test('configured: forwards the manager token and municipality, never a password/secret', async () => {
  const originalEnv = process.env.LANDS_TRUSTED_API_URL;
  const originalFetch = global.fetch;
  process.env.LANDS_TRUSTED_API_URL = 'https://lands-smart-example.vercel.app/';
  let capturedUrl, capturedOptions;
  global.fetch = async (url, options) => {
    capturedUrl = url; capturedOptions = options;
    return { ok: true, json: async () => ({ event_id: 'lands_abc123', result: { operation: 'entitlement.enable' } }) };
  };
  try {
    const { callLandsTrustedMutation } = freshBridge();
    const result = await callLandsTrustedMutation({
      idToken: 'manager-id-token', municipalityId: 'org-a',
      operation: 'entitlement.enable', recordId: 'uid-1',
      recordChanges: { lands_role: 'lands_employee' },
    });
    assert.equal(capturedUrl, 'https://lands-smart-example.vercel.app/api/lands-mutations');
    assert.equal(capturedOptions.headers.authorization, 'Bearer manager-id-token');
    assert.equal(capturedOptions.headers['x-municipality-id'], 'org-a');
    const body = JSON.parse(capturedOptions.body);
    assert.deepEqual(body, { operation: 'entitlement.enable', record_id: 'uid-1', record_changes: { lands_role: 'lands_employee' } });
    // No password, refresh token, or service-account material anywhere in
    // the outgoing request.
    const serialized = JSON.stringify(capturedOptions);
    assert.equal(/password/i.test(serialized), false);
    assert.equal(/refresh_token/i.test(serialized), false);
    assert.equal(/private_key/i.test(serialized), false);

    assert.deepEqual(result, { ok: true, bridged: true, eventId: 'lands_abc123', result: { operation: 'entitlement.enable' } });
  } finally {
    if (originalEnv === undefined) delete process.env.LANDS_TRUSTED_API_URL; else process.env.LANDS_TRUSTED_API_URL = originalEnv;
    global.fetch = originalFetch;
  }
});

test('configured but Lands rejects the request: fails closed with the reason, no throw', async () => {
  const originalEnv = process.env.LANDS_TRUSTED_API_URL;
  const originalFetch = global.fetch;
  process.env.LANDS_TRUSTED_API_URL = 'https://lands-smart-example.vercel.app';
  global.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: 'LANDS_MUTATION_DENIED' }) });
  try {
    const { callLandsTrustedMutation } = freshBridge();
    const result = await callLandsTrustedMutation({ idToken: 'x', municipalityId: 'org-a', operation: 'entitlement.enable', recordId: 'uid-1' });
    assert.deepEqual(result, { ok: false, bridged: true, status: 403, reason: 'LANDS_MUTATION_DENIED' });
  } finally {
    if (originalEnv === undefined) delete process.env.LANDS_TRUSTED_API_URL; else process.env.LANDS_TRUSTED_API_URL = originalEnv;
    global.fetch = originalFetch;
  }
});

test('configured but unreachable (network error): fails closed, never throws', async () => {
  const originalEnv = process.env.LANDS_TRUSTED_API_URL;
  const originalFetch = global.fetch;
  process.env.LANDS_TRUSTED_API_URL = 'https://lands-smart-example.vercel.app';
  global.fetch = async () => { throw new Error('ECONNREFUSED'); };
  try {
    const { callLandsTrustedMutation } = freshBridge();
    const result = await callLandsTrustedMutation({ idToken: 'x', municipalityId: 'org-a', operation: 'entitlement.enable', recordId: 'uid-1' });
    assert.deepEqual(result, { ok: false, bridged: true, reason: 'lands_bridge_unreachable' });
  } finally {
    if (originalEnv === undefined) delete process.env.LANDS_TRUSTED_API_URL; else process.env.LANDS_TRUSTED_API_URL = originalEnv;
    global.fetch = originalFetch;
  }
});
