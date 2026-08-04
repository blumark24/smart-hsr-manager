'use strict';
// ============================================================================
// GET /api/storage/read?key=<url-encoded object key>
//
// Streams one evidence image out of the PRIVATE B2 bucket to an authenticated,
// organization-scoped caller. The bucket stays private and no B2 URL, signed
// or otherwise, is ever handed to the browser.
//
// Auth:   Authorization: Bearer <Firebase ID token>  (verified, revoke-checked)
// Authz:  the caller must hold an active role in an organization, AND the
//         requested key must actually belong to an observation of THAT
//         organization. An arbitrary key is refused even if it exists.
// Out:    200 with image bytes, or a JSON error code.
//
// Streaming rather than a presigned URL: it needs no extra dependency, hands
// out no bucket URL that could be replayed or shared after the fact, and has
// no expiry window to get wrong. The cost is that the browser must send the
// ID token, so the client fetches this and wraps the result in a blob URL.
// ============================================================================
const { getDb } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, activeIsNotFalse } = require('../_lib/authz');
const { b2Configuration, getS3Client, safeStorageFailure } = require('../_lib/b2Client');

const MAX_KEY_LENGTH = 512;
const ALLOWED_CONTENT_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
// Only these fields on an observation may name an object. Anything else is not
// evidence and must not be readable through this endpoint.
const EVIDENCE_FIELDS = Object.freeze(['imagePath', 'afterImagePath', 'imageObjectKey']);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(payload));
}

// --- pure helpers (unit-tested) ---------------------------------------------

// Accepts the object-key shape this system writes. Rejects absolute paths,
// traversal, protocol-ish strings, and anything with control characters.
function safeObjectKey(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw.length > MAX_KEY_LENGTH) return '';
  if (raw.startsWith('/') || raw.includes('//') || raw.includes('\\')) return '';
  if (raw.includes('..')) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return '';           // data:, https:, local-demo:
  if (!/^[A-Za-z0-9_\-/.]+$/.test(raw)) return '';
  const segments = raw.split('/');
  if (segments.some(s => !s || s === '.' || s === '..')) return '';
  return raw;
}

function requestedKey(req) {
  const direct = req.query && req.query.key;
  if (typeof direct === 'string') return direct;
  try { return new URL(req.url || '/', 'http://localhost').searchParams.get('key') || ''; }
  catch (_) { return ''; }
}

function extensionContentType(key) {
  const match = /\.([A-Za-z0-9]+)$/.exec(key || '');
  const ext = match ? match[1].toLowerCase() : '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return '';
}

// Any active role may VIEW evidence inside its own organization. managers/{uid}
// is authoritative so a stale users/{uid} record cannot widen or move scope.
async function resolveViewerContext(db, uid) {
  const managerSnap = await db.collection('managers').doc(uid).get();
  if (managerSnap.exists) {
    const d = managerSnap.data() || {};
    const org = typeof d.organizationId === 'string' ? d.organizationId.trim() : '';
    if (d.role === 'manager' && activeIsNotFalse(d) && org) {
      return { uid, role: 'manager', organizationId: org };
    }
  }
  const userSnap = await db.collection('users').doc(uid).get();
  if (userSnap.exists) {
    const d = userSnap.data() || {};
    const org = typeof d.organizationId === 'string' ? d.organizationId.trim() : '';
    if (['supervisor', 'inspector', 'contractor'].includes(d.role) && activeIsNotFalse(d) && org) {
      return { uid, role: d.role, organizationId: org };
    }
  }
  return null;
}

// The heart of the authorization: prove this key is evidence attached to an
// observation of the caller's own organization. Without this the endpoint
// would happily read any object in the bucket for any signed-in user.
async function keyBelongsToOrganization(db, key, organizationId) {
  for (const field of EVIDENCE_FIELDS) {
    const snap = await db.collection('observations')
      .where('organizationId', '==', organizationId)
      .where(field, '==', key)
      .limit(1)
      .get();
    if (!snap.empty) return true;
  }
  return false;
}

async function streamToResponse(body, res) {
  if (!body) throw new Error('empty_object_body');
  if (typeof body.pipe === 'function') {
    await new Promise((resolve, reject) => {
      body.on('error', reject);
      res.on('error', reject);
      res.on('finish', resolve);
      body.pipe(res);
    });
    return;
  }
  // Web stream / byte array fallbacks depending on runtime.
  if (typeof body.transformToByteArray === 'function') {
    res.end(Buffer.from(await body.transformToByteArray()));
    return;
  }
  throw new Error('unsupported_object_body');
}

// --- handler -----------------------------------------------------------------

async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  let decoded;
  try {
    decoded = await verifyRequestToken(req);
  } catch (error) {
    return sendJson(res, error.statusCode || 401, { error: 'unauthenticated' });
  }

  const db = getDb();
  const viewer = await resolveViewerContext(db, decoded.uid);
  if (!viewer) return sendJson(res, 403, { error: 'forbidden', reason: 'no_active_organization_role' });

  const key = safeObjectKey(requestedKey(req));
  if (!key) return sendJson(res, 400, { error: 'invalid_key' });

  const contentType = extensionContentType(key);
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return sendJson(res, 415, { error: 'unsupported_image_type' });
  }

  let allowed = false;
  try {
    allowed = await keyBelongsToOrganization(db, key, viewer.organizationId);
  } catch (error) {
    console.error('storage read: ownership check failed', { name: (error && error.name) || 'unknown' });
    return sendJson(res, 500, { error: 'read_failed' });
  }
  // Same response for "not yours" and "does not exist": callers must not be
  // able to probe which keys exist in another organization.
  if (!allowed) return sendJson(res, 403, { error: 'forbidden', reason: 'object_not_in_organization' });

  const config = b2Configuration();
  if (!config) return sendJson(res, 503, { error: 'storage_not_configured' });

  try {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const client = getS3Client(config);
    const object = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));

    res.statusCode = 200;
    // Trust our own extension mapping over whatever is stored on the object.
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (object.ContentLength) res.setHeader('Content-Length', String(object.ContentLength));
    if (req.method === 'HEAD') { res.end(); return; }

    await streamToResponse(object.Body, res);
  } catch (error) {
    const safe = safeStorageFailure(error);
    console.error('storage read failed', safe);
    if (res.headersSent) { try { res.destroy(); } catch (_) {} return; }
    if (safe.name === 'NoSuchKey' || safe.status === 404) {
      return sendJson(res, 404, { error: 'object_not_found' });
    }
    return sendJson(res, 502, { error: 'storage_read_failed' });
  }
}

module.exports = handler;
module.exports._test = {
  safeObjectKey,
  requestedKey,
  extensionContentType,
  resolveViewerContext,
  keyBelongsToOrganization,
  EVIDENCE_FIELDS,
  MAX_KEY_LENGTH,
  handler,
};
