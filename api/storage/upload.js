'use strict';
// ============================================================================
// POST /api/storage/upload — secure server-side upload of inspector evidence
// images to a PRIVATE Backblaze B2 bucket (S3-compatible API).
//
// Auth:   Authorization: Bearer <Firebase ID token>  (verified, revoke-checked)
// Authz:  caller must be users/{uid} with role 'inspector' and active != false
//         and a non-empty organizationId. The organizationId is read from the
//         server-side Firestore record ONLY — the request body can never
//         choose or influence the tenant.
// Body:   application/json
//         { contentType, dataBase64, scope?, observationId? }
// Limits: image/jpeg | image/png | image/webp only, declared type must match
//         the file's magic bytes, decoded size 1..700KB.
// Key:    [<B2_FILE_PREFIX>/]observations/<organizationId>/<scope>/<yyyy>/<mm>/<uuid>.<ext>
// Out:    { ok: true, objectKey }
//
// SECURITY: B2 credentials live only in process.env on the server. They are
// never returned, never logged, and never included in any error payload. The
// bucket is private, so no public/permanent URL is ever produced here.
// ============================================================================
const crypto = require('crypto');
const { getDb } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, activeIsNotFalse } = require('../_lib/authz');
const { validateImage } = require('../_lib/imageValidation');

const MAX_UPLOAD_BYTES = 700 * 1024;
// Base64 of the byte cap, plus a small allowance for padding/whitespace, so an
// oversized payload is rejected before it is ever decoded into memory.
const MAX_BASE64_LENGTH = Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 + 1024;

const ALLOWED_IMAGE_TYPES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});
const ALLOWED_SCOPES = Object.freeze(['before', 'after']);

// Required B2 settings. Names are fixed by the Vercel project configuration.
const REQUIRED_ENV = ['B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_NAME', 'B2_S3_ENDPOINT', 'B2_REGION'];

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(payload));
}

// --- pure helpers (unit-tested) ---------------------------------------------

// Declared MIME must match the actual container. Blocks a caller from parking
// arbitrary bytes in the bucket behind an allowed content type.
function magicBytesMatch(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (contentType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (contentType === 'image/png') {
    return buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === 'image/webp') {
    return buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

function isStrictBase64(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length % 4 === 0
    && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

// Firestore-issued ids only; anything else is refused rather than sanitized so
// a surprising value can never widen or escape the tenant folder.
function safeOrganizationId(value) {
  const clean = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9_-]{1,128}$/.test(clean) ? clean : '';
}

function safeScope(value) {
  const clean = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ALLOWED_SCOPES.includes(clean) ? clean : 'before';
}

// Root folder every evidence object lives under. It is also the one segment a
// deployment's B2_FILE_PREFIX is likely to already end with.
const OBJECT_ROOT = 'observations';

// B2_FILE_PREFIX is operator-controlled; normalize it and drop anything that
// could climb out of the prefix ('..', backslashes, empty segments). Leading
// and trailing slashes disappear with the empty-segment filter, and an
// adjacent repeat of the same segment is collapsed.
function normalizedPrefixSegments(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return [];
  const segments = raw.split('/').map(s => s.trim()).filter(s => s && s !== '.' && s !== '..' && /^[A-Za-z0-9_-]+$/.test(s));
  return segments.filter((segment, index) => index === 0 || segment !== segments[index - 1]);
}

function normalizedPrefix(value) {
  return normalizedPrefixSegments(value).join('/');
}

function buildObjectKey({ prefix, organizationId, scope, extension, now = new Date(), uuid = crypto.randomUUID() }) {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  // The tail is authoritative and is never rewritten: organizationId, scope,
  // date and filename pass through exactly as given.
  const tail = [OBJECT_ROOT, organizationId, scope, year, month, `${uuid}.${extension}`];
  const head = normalizedPrefixSegments(prefix);

  // Junction de-duplication only. B2_FILE_PREFIX is commonly set to
  // 'observations' (or '<something>/observations'), which used to produce
  // 'observations/observations/<org>/...'. If the prefix already ends at the
  // object root, don't repeat it.
  //
  // Deliberately limited to this one join: collapsing repeats *inside* the
  // tail would corrupt a key whenever organizationId or scope happened to
  // equal the segment before it.
  if (head.length && head[head.length - 1] === OBJECT_ROOT) tail.shift();

  return [...head, ...tail].join('/');
}

// Reads the caller's OWN users/{uid} document. No other collection, no other
// uid: managers/owners/contractors are not upload callers for this endpoint.
async function resolveInspectorContext(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const organizationId = safeOrganizationId(data.organizationId);
  if (data.role !== 'inspector' || !activeIsNotFalse(data) || !organizationId) return null;
  return { uid, role: 'inspector', organizationId };
}

// --- request body ------------------------------------------------------------

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = '';
  if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else if (typeof req.body === 'string') raw = req.body;
  else {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      // Hard stop well above the base64 cap so a flood never buffers unbounded.
      if (size > MAX_BASE64_LENGTH + 4096) throw Object.assign(new Error('payload_too_large'), { statusCode: 413 });
      chunks.push(chunk);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

// --- B2 client ---------------------------------------------------------------

let cachedClient = null;

function b2Configuration() {
  const missing = REQUIRED_ENV.filter(name => !String(process.env[name] || '').trim());
  if (missing.length) return null; // names only are known here; values never leave env
  return {
    bucket: String(process.env.B2_BUCKET_NAME).trim(),
    endpoint: String(process.env.B2_S3_ENDPOINT).trim(),
    region: String(process.env.B2_REGION).trim(),
    prefix: process.env.B2_FILE_PREFIX || '',
  };
}

function getS3Client(config) {
  if (cachedClient) return cachedClient;
  const { S3Client } = require('@aws-sdk/client-s3');
  const endpoint = /^https?:\/\//i.test(config.endpoint) ? config.endpoint : `https://${config.endpoint}`;
  cachedClient = new S3Client({
    region: config.region,
    endpoint,
    credentials: {
      accessKeyId: String(process.env.B2_KEY_ID).trim(),
      secretAccessKey: String(process.env.B2_APPLICATION_KEY).trim(),
    },
    // B2's S3 API rejects the SDK's default CRC32 trailer; only send a checksum
    // when the operation actually requires one.
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  return cachedClient;
}

async function putObject({ config, objectKey, body, contentType, uid, organizationId }) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const client = getS3Client(config);
  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    Body: body,
    ContentType: contentType,
    ContentLength: body.length,
    Metadata: { 'uploaded-by': uid, 'organization-id': organizationId },
  }));
}

// Never surface provider text to the browser or the log: an S3 error message
// can echo the endpoint, bucket and signed header material.
function logStorageFailure(error) {
  const name = (error && (error.name || error.code)) || 'unknown_error';
  const status = error && error.$metadata && error.$metadata.httpStatusCode;
  console.error('storage upload failed', { name: String(name).slice(0, 64), status: status || null });
}

// --- handler -----------------------------------------------------------------

async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  let decoded;
  try {
    decoded = await verifyRequestToken(req);
  } catch (error) {
    return sendJson(res, error.statusCode || 401, { error: 'unauthenticated' });
  }

  const caller = await resolveInspectorContext(getDb(), decoded.uid);
  if (!caller) return sendJson(res, 403, { error: 'forbidden', reason: 'inspector_role_required' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { error: 'invalid_request' });
  }

  const contentType = typeof body.contentType === 'string' ? body.contentType.trim().toLowerCase() : '';
  const extension = ALLOWED_IMAGE_TYPES[contentType];
  if (!extension) return sendJson(res, 415, { error: 'unsupported_image_type' });

  const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64.trim() : '';
  if (!isStrictBase64(dataBase64)) return sendJson(res, 400, { error: 'invalid_request' });
  if (dataBase64.length > MAX_BASE64_LENGTH) return sendJson(res, 413, { error: 'image_too_large' });

  const buffer = Buffer.from(dataBase64, 'base64');
  if (buffer.length > MAX_UPLOAD_BYTES) return sendJson(res, 413, { error: 'image_too_large' });
  // No arbitrary minimum size: structural validation below is a strictly
  // stronger gate, and a byte floor would reject small but legitimate images.
  // Cheap gate first, then a real structural parse of the container. A file
  // that is corrupt, truncated, padded or merely wearing the right magic bytes
  // is rejected before it can ever reach the bucket.
  if (!magicBytesMatch(buffer, contentType)) return sendJson(res, 415, { error: 'unsupported_image_type' });
  const image = validateImage(buffer, contentType);
  if (!image.ok) {
    // The precise parser reason is for the server log only — the browser gets
    // a stable code so it can pick the right Arabic message.
    console.warn('image rejected', { reason: image.reason });
    return sendJson(res, 415, { error: 'invalid_image_file' });
  }

  const config = b2Configuration();
  if (!config) return sendJson(res, 503, { error: 'storage_not_configured' });

  const objectKey = buildObjectKey({
    prefix: config.prefix,
    organizationId: caller.organizationId,
    scope: safeScope(body.scope),
    extension,
  });

  try {
    await putObject({
      config,
      objectKey,
      body: buffer,
      contentType,
      uid: caller.uid,
      organizationId: caller.organizationId,
    });
  } catch (error) {
    logStorageFailure(error);
    return sendJson(res, 502, { error: 'storage_upload_failed' });
  }

  return sendJson(res, 200, { ok: true, objectKey });
}

module.exports = handler;
module.exports._test = {
  MAX_UPLOAD_BYTES,
  MAX_BASE64_LENGTH,
  ALLOWED_IMAGE_TYPES,
  magicBytesMatch,
  validateImage,
  isStrictBase64,
  safeOrganizationId,
  safeScope,
  normalizedPrefix,
  normalizedPrefixSegments,
  OBJECT_ROOT,
  buildObjectKey,
  resolveInspectorContext,
  b2Configuration,
  handler,
};
