import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const require = createRequire(import.meta.url);
const corsPath = path.join(repoRoot, 'api', '_lib', 'mobileCors.js');

function fakeRes() {
  const headers = new Map();
  return {
    statusCode: 200,
    ended: false,
    setHeader(k,v){ headers.set(String(k).toLowerCase(), String(v)); },
    getHeader(k){ return headers.get(String(k).toLowerCase()); },
    end(){ this.ended = true; }
  };
}

test('mobile CORS is completely disabled outside Vercel Preview', () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  delete require.cache[require.resolve(corsPath)];
  const { handleMobilePreviewCors } = require(corsPath);
  const res = fakeRes();
  const handled = handleMobilePreviewCors(
    { method:'OPTIONS', headers:{ origin:'capacitor://localhost' } },
    res,
    { methods:['GET'] }
  );
  assert.equal(handled, false);
  assert.equal(res.getHeader('access-control-allow-origin'), undefined);
  if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous;
});

test('Preview rejects arbitrary web origins and never emits wildcard CORS', () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  delete require.cache[require.resolve(corsPath)];
  const { handleMobilePreviewCors } = require(corsPath);
  const res = fakeRes();
  const handled = handleMobilePreviewCors(
    { method:'OPTIONS', headers:{ origin:'https://evil.example' } },
    res,
    { methods:['POST'] }
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 403);
  assert.notEqual(res.getHeader('access-control-allow-origin'), '*');
  if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous;
});

test('Preview permits Capacitor local origin for preflight only', () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  delete require.cache[require.resolve(corsPath)];
  const { handleMobilePreviewCors } = require(corsPath);
  const res = fakeRes();
  const handled = handleMobilePreviewCors(
    { method:'OPTIONS', headers:{ origin:'capacitor://localhost' } },
    res,
    { methods:['GET','POST'] }
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 204);
  assert.equal(res.getHeader('access-control-allow-origin'), 'capacitor://localhost');
  assert.match(res.getHeader('access-control-allow-headers'), /Authorization/);
  assert.match(res.getHeader('access-control-allow-methods'), /OPTIONS/);
  if (previous === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous;
});

test('all Mobile RC API routes are wired to the Preview CORS guard', () => {
  const routes = [
    'api/firebase-config.js',
    'api/organization/context.js',
    'api/storage/upload.js',
    'api/storage/finalize.js',
    'api/storage/read.js',
    'api/ai/analyze.js',
    'api/ai/bind-analysis.js',
    'api/admin/users.js',
    'api/report/root-cause.js',
    'api/report/work-order.js'
  ];
  for (const route of routes) {
    const source = fs.readFileSync(path.join(repoRoot, route), 'utf8');
    assert.match(source, /handleMobilePreviewCors/, route);
  }
});
