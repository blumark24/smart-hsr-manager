'use strict';
// Answers this app's own /api/* fetch() calls from inside the Playwright
// process by calling the REAL Vercel-style handler functions directly,
// instead of running a real Vercel dev server. This exists because
// test/e2e/lib/harness.js serves the static site with a plain Python HTTP
// server (server.py) — enough for every page whose data path is Firestore/
// Auth directly, but api/admin/users.js's trusted server actions
// (listMobilityEmployees, allocateVehicle, etc.) are real serverless
// functions with no server process here to run them.
//
// The bridge only adapts HTTP transport shape (method/headers/body in,
// statusCode/body out) to what each handler already expects (readJsonBody()
// accepts a plain object body; sendJson() calls res.setHeader/res.end) — it
// requires the same FIRESTORE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST env
// vars the rest of this harness already sets, so every authz check, every
// Firestore/Auth Admin SDK read and write, and every business rule inside
// the handler runs for real against the local emulators. Nothing about the
// handler's own logic is mocked or stubbed — only the process boundary
// (an HTTP server) that would otherwise carry the request to it.

const path = require('path');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('api-mock requires FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST to be set first.');
}

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ROUTES = {
  '/api/admin/users': path.join(ROOT, 'api', 'admin', 'users.js'),
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
