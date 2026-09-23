'use strict';

const MOBILE_PREVIEW_ORIGINS = new Set([
  'capacitor://localhost',
  'http://localhost',
  'https://localhost'
]);

function requestOrigin(req) {
  const raw = (req && req.headers && (req.headers.origin || req.headers.Origin)) || '';
  return typeof raw === 'string' ? raw.trim() : '';
}

function handleMobilePreviewCors(req, res, options) {
  const methods = (options && Array.isArray(options.methods) && options.methods.length)
    ? options.methods
    : ['GET', 'POST'];

  if (process.env.VERCEL_ENV !== 'preview') return false;

  const origin = requestOrigin(req);
  if (!origin) return false;

  const allowed = MOBILE_PREVIEW_ORIGINS.has(origin);
  if (!allowed) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 403;
      res.end();
      return true;
    }
    return false;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', Array.from(new Set(methods.concat('OPTIONS'))).join(', '));
  res.setHeader('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

module.exports = {
  MOBILE_PREVIEW_ORIGINS,
  requestOrigin,
  handleMobilePreviewCors
};
