'use strict';
// SMART HSR preview adapter for a standard Node.js host (Render free preview).
// No Auth/RBAC/Firestore changes. Uses the EXISTING Vercel Node API handlers.
// Default is static, read-only preview; API is opt-in with staging-only secrets.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname);
const ROUTES = Object.freeze({
  '/api/admin/users': () => require('./api/admin/users.js'),
  '/api/admin/employees': () => require('./api/admin/employees.js'),
  '/api/admin/platform-accounts': () => require('./api/admin/platform-accounts.js'),
  '/api/organization/context': () => require('./api/organization/context.js'),
  '/api/firebase-config': () => require('./api/firebase-config.js'),
  '/api/ai/analyze': () => require('./api/ai/analyze.js'),
  '/api/ai/bind-analysis': () => require('./api/ai/bind-analysis.js'),
  '/api/storage/upload': () => require('./api/storage/upload.js'),
  '/api/storage/read': () => require('./api/storage/read.js'),
  '/api/storage/finalize': () => require('./api/storage/finalize.js'),
  '/api/report': () => require('./api/report.js'),
  '/api/report/ai-review': () => require('./api/report/ai-review.js'),
});
const API_REWRITES = Object.freeze({
  '/api/lands-health': ['/api/organization/context', 'embeddedLandsAction', 'health'],
  '/api/lands-mutations': ['/api/organization/context', 'embeddedLandsAction', 'mutation'],
  '/api/lands-membership-status': ['/api/organization/context', 'embeddedLandsAction', 'membership'],
  '/api/lands-sso-register': ['/api/organization/context', 'embeddedLandsAction', 'sso-register'],
  '/api/lands-sso-consume': ['/api/organization/context', 'embeddedLandsAction', 'sso-consume'],
  '/api/report/root-cause': ['/api/report', 'kind', 'root-cause'],
  '/api/report/work-order': ['/api/report', 'kind', 'work-order'],
});
const STATIC_EXTENSIONS = Object.freeze({
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif',
  '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2',
  '.ttf':'font/ttf', '.wasm':'application/wasm', '.glb':'model/gltf-binary',
  '.gltf':'model/gltf+json', '.pbf':'application/x-protobuf',
  '.czml':'application/json', '.geojson':'application/geo+json',
  '.json':'application/json', '.kml':'application/vnd.google-earth.kml+xml',
});
const DENY_FOLDERS = new Set([
  '.git','.github','.vercel','.netlify','.next','node_modules','test','tests',
  'api','scripts','docs','private','secrets','coverage',
]);
const SAFE_JSON_FOLDERS = new Set(['vendor','lands','assets','public','geo','spatial','data']);
const MAX_BODY = 12 * 1024 * 1024;
const sendJson = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
};
const apiReady = () => process.env.PREVIEW_API_ENABLED === 'true'
  && process.env.SMART_HSR_PREVIEW_MODE === 'staging'
  && !!process.env.FIREBASE_SERVICE_ACCOUNT
  && !!process.env.FIREBASE_WEB_CONFIG;

function safeStaticPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\\') || decoded.includes('\0')) return null;
  const parts = decoded.split('/').filter(Boolean);
  if (parts.some(x => x.startsWith('.') || x === '..')) return null;
  if (parts.some(x => DENY_FOLDERS.has(x.toLowerCase()))) return null;
  let rel = parts.join('/');
  if (!rel) rel = 'Home.html';
  // The portable Node bridge is server-only and must never be downloadable.
  if (rel === 'portable-preview-server.js') return null;
  if (rel === 'lands') rel = 'lands/index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const ext = path.extname(rel).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(STATIC_EXTENSIONS, ext)) return null;
  if (ext === '.json' && !SAFE_JSON_FOLDERS.has(parts[0]?.toLowerCase())) return null;
  const absolute = path.resolve(ROOT, rel);
  if (!absolute.startsWith(ROOT + path.sep)) return null;
  return { absolute, mime: STATIC_EXTENSIONS[ext], ext };
}

async function handleStatic(req, res, parsed) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return sendJson(res,405,{error:'method_not_allowed'});
  }
  const item = safeStaticPath(parsed.pathname);
  if (!item) return sendJson(res, 404, {error:'not_found'});
  try {
    const stat = await fs.promises.stat(item.absolute);
    if (!stat.isFile()) return sendJson(res, 404, {error:'not_found'});
    // Also protect against symlinks escaping the checked-out source tree.
    const real = await fs.promises.realpath(item.absolute);
    if (!real.startsWith(ROOT + path.sep)) return sendJson(res,404,{error:'not_found'});
    res.statusCode = 200;
    res.setHeader('Content-Type', item.mime);
    res.setHeader('Cache-Control', item.ext === '.html' ? 'no-store' : 'public, max-age=120');
    if (req.method === 'HEAD') return res.end();
    const file = fs.createReadStream(real);
    file.on('error', () => { if (!res.headersSent) sendJson(res,500,{error:'asset_error'}); else res.destroy(); });
    file.pipe(res);
  } catch { sendJson(res,404,{error:'not_found'}); }
}

async function parseBody(req) {
  if (!['POST','PUT','PATCH'].includes(req.method)) return {};
  if (!/application\/json/i.test(req.headers['content-type'] || '')) {
    const error = new Error('json_required'); error.statusCode = 415; throw error;
  }
  const data = []; let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY) {
      const error = new Error('body_too_large'); error.statusCode = 413; throw error;
    }
    data.push(chunk);
  }
  if (!total) return {};
  try { return JSON.parse(Buffer.concat(data).toString('utf8')); }
  catch { const error = new Error('invalid_json'); error.statusCode = 400; throw error; }
}

async function handleApi(req, res, parsed) {
  if (!apiReady()) return sendJson(res, 503, {error:'preview_api_disabled', detail:'Configure isolated staging credentials in host settings.'});
  let route = parsed.pathname;
  const q = new URLSearchParams(parsed.searchParams);
  const rewrite = API_REWRITES[route];
  if (rewrite) { route = rewrite[0]; q.set(rewrite[1], rewrite[2]); }
  const load = ROUTES[route];
  if (!load) return sendJson(res,404,{error:'api_not_found'});
  req.query = Object.fromEntries(q.entries());
  try { req.body = await parseBody(req); }
  catch (error) { return sendJson(res,error.statusCode||400,{error:error.message}); }
  if (rewrite) req.url = route + '?' + q.toString();
  // Preserve the same Node IncomingMessage/ServerResponse contract used on Vercel.
  res.status = code => { res.statusCode = code; return res; };
  res.json = data => { sendJson(res,res.statusCode||200,data); return res; };
  try {
    const handler = load();
    await handler(req,res);
    if (!res.writableEnded && !res.destroyed) {
      // Some handlers stream content; never prematurely close an active stream.
      if (!res.headersSent) return sendJson(res,502,{error:'api_no_response'});
    }
  } catch {
    if (!res.headersSent) return sendJson(res,500,{error:'request_failed'});
    res.destroy();
  }
}

function createPreviewServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    let parsed;
    try { parsed = new URL(req.url, 'http://localhost'); }
    catch { return sendJson(res,400,{error:'invalid_url'}); }
    if (parsed.pathname === '/__preview/health') {
      return sendJson(res,200,{status:'ok',mode:'preview',apiEnabled:apiReady()});
    }
    if (parsed.pathname.startsWith('/api/')) return handleApi(req,res,parsed);
    return handleStatic(req,res,parsed);
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT || 8787);
  createPreviewServer().listen(port,'0.0.0.0',() => {
    process.stdout.write('SMART HSR safe preview listening on port ' + port + '\n');
  });
}
module.exports = { createPreviewServer, safeStaticPath, apiReady, ROUTES, API_REWRITES };
