'use strict';
// Answers this app's own /api/* fetch() calls from inside the Playwright
// process by calling the REAL Vercel-style handler functions directly,
// instead of running a real Vercel dev server. The local E2E harness serves
// the static site only, so trusted server actions used by Manager/User Center
// need this process-boundary bridge.
//
// The bridge only adapts HTTP transport shape (method/headers/body in,
// statusCode/body out) to what each handler already expects. It requires
// FIRESTORE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST, so every authz check,
// Firestore/Auth Admin SDK read/write and business rule runs against the
// local emulators. Nothing inside the handlers is mocked or bypassed.

const path = require('path');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('api-mock requires FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST to be set first.');
}

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ROUTES = {
  '/api/admin/users': path.join(ROOT, 'api', 'admin', 'users.js'),
  '/api/admin/employees': path.join(ROOT, 'api', 'admin', 'employees.js'),
  '/api/organization/context': path.join(ROOT, 'api', 'organization', 'context.js'),
};

function fakeResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) { res.headers[name] = value; },
    end(chunk) { if (chunk !== undefined) res.body = chunk; },
  };
  return res;
}

async function installApiMock(context) {
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const handlerPath = ROUTES[url.pathname];
    if (!handlerPath) {
      await route.continue();
      return;
    }
    const handler = require(handlerPath);
    const postData = request.postData();
    let body = {};
    if (postData) {
      try { body = JSON.parse(postData); } catch (_) { body = {}; }
    }
    const req = { method: request.method(), headers: request.headers(), body, url: url.pathname + url.search };
    const res = fakeResponse();
    try {
      await handler(req, res);
    } catch (e) {
      res.statusCode = 500;
      res.body = JSON.stringify({ error: 'request_failed', reason: 'harness_bridge_exception', message: e.message });
    }
    await route.fulfill({
      status: res.statusCode,
      contentType: res.headers['Content-Type'] || 'application/json; charset=utf-8',
      body: res.body,
    });
  });
}

module.exports = { installApiMock, ROUTES };
