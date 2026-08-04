'use strict';
// ============================================================================
// Shared Backblaze B2 (S3-compatible) client.
//
// Credentials live only in process.env on the server. Nothing here is ever
// returned to a browser, written to a log, or embedded in an error message.
//
// NOTE: api/storage/upload.js still carries its own copy of this bootstrap.
// It is deployed and working, so it was deliberately left untouched; folding
// it onto this module is a follow-up, not a demo-night change.
// ============================================================================

const REQUIRED_ENV = ['B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_NAME', 'B2_S3_ENDPOINT', 'B2_REGION'];

let cachedClient = null;

function b2Configuration() {
  const missing = REQUIRED_ENV.filter(name => !String(process.env[name] || '').trim());
  if (missing.length) return null; // names only; values never leave process.env
  return {
    bucket: String(process.env.B2_BUCKET_NAME).trim(),
    endpoint: String(process.env.B2_S3_ENDPOINT).trim(),
    region: String(process.env.B2_REGION).trim(),
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
    // B2's S3 API rejects the SDK's default CRC32 trailer.
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  return cachedClient;
}

// Never surface provider text: an S3 error can echo the endpoint, the bucket
// and signed header material.
function safeStorageFailure(error) {
  const name = (error && (error.name || error.code)) || 'unknown_error';
  const status = (error && error.$metadata && error.$metadata.httpStatusCode) || null;
  return { name: String(name).slice(0, 64), status };
}

module.exports = { REQUIRED_ENV, b2Configuration, getS3Client, safeStorageFailure };
