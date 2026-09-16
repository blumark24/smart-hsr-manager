'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PORT = Number(process.env.SMART_HSR_STATIC_PORT || 5000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendHeaders(res, status, contentType) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
}

function safePath(urlPath) {
  const pathname = decodeURIComponent((urlPath || '/').split('?')[0]);
  const normalized = path.normalize(pathname).replace(/^([/\\])+/, '');
  const resolved = path.resolve(ROOT, normalized || 'index.html');
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  let filePath = safePath(req.url);
  if (!filePath) {
    sendHeaders(res, 403, 'text/plain; charset=utf-8');
    res.end('Forbidden');
    return;
  }

  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      const fallback = path.join(ROOT, '404.html');
      const body = fs.existsSync(fallback) ? fs.readFileSync(fallback) : Buffer.from('Not Found');
      sendHeaders(res, 404, fs.existsSync(fallback) ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8');
      res.end(body);
      return;
    }

    const body = fs.readFileSync(filePath);
    sendHeaders(res, 200, MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    res.end(body);
  } catch (error) {
    sendHeaders(res, 500, 'text/plain; charset=utf-8');
    res.end('Internal Server Error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`SMART HSR static test server listening on http://127.0.0.1:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
