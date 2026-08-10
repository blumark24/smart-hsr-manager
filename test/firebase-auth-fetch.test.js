'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const modulePromise = import(pathToFileURL(path.join(__dirname, '..', 'firebase-auth-fetch.js')).href);

test('expired token refreshes once and retries successfully', async () => {
  const { fetchWithFirebaseAuth } = await modulePromise;
  const tokenCalls = [];
  const requests = [];
  const response = await fetchWithFirebaseAuth({
    getIdToken: async force => { tokenCalls.push(force); return force ? 'fresh-token' : 'expired-token'; },
    input: '/secure',
    init: { method: 'POST' },
    fetchImpl: async (input, init) => {
      requests.push({ input, authorization: init.headers.Authorization });
      return { status: requests.length === 1 ? 401 : 200 };
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(tokenCalls, [false, true]);
  assert.deepEqual(requests.map(item => item.authorization), ['Bearer expired-token', 'Bearer fresh-token']);
});

test('refresh failure returns explicit reauthentication requirement without a retry loop', async () => {
  const { fetchWithFirebaseAuth, REAUTHENTICATION_REQUIRED } = await modulePromise;
  let tokenCalls = 0;
  let requestCalls = 0;
  await assert.rejects(fetchWithFirebaseAuth({
    getIdToken: async force => { tokenCalls += 1; if (force) throw new Error('expired'); return 'expired-token'; },
    input: '/secure',
    fetchImpl: async () => { requestCalls += 1; return { status: 401 }; },
  }), error => error.code === REAUTHENTICATION_REQUIRED);
  assert.equal(tokenCalls, 2);
  assert.equal(requestCalls, 1);
});

test('a second 401 fails closed after exactly two requests and is never looped', async () => {
  const { fetchWithFirebaseAuth, REAUTHENTICATION_REQUIRED } = await modulePromise;
  let requests = 0;
  await assert.rejects(fetchWithFirebaseAuth({
    getIdToken: async force => force ? 'fresh' : 'initial',
    input: '/secure',
    fetchImpl: async () => { requests += 1; return { status: 401 }; },
  }), error => error.code === REAUTHENTICATION_REQUIRED);
  assert.equal(requests, 2);
});
