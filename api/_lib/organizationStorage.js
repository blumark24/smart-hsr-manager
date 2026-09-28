'use strict';
// Per-organization private storage connector vault.
// Secrets are AES-256-GCM encrypted before Firestore and are never returned to browsers.
const crypto = require('crypto');
const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');

const CONNECTOR_COLLECTION = 'organizationStorageConnectors';
const SUPPORTED_TYPES = Object.freeze(['S3_COMPATIBLE', 'MINIO']);
const MASTER_KEY_ENV = 'STORAGE_CONNECTOR_MASTER_KEY';
const clientCache = new Map();

function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
function safeOrganizationId(value) {
  const id = clean(value);
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : '';
}
function normalizePrefix(value) {
  return clean(value).split('/').map(s => s.trim()).filter(s => s && s !== '.' && s !== '..' && /^[A-Za-z0-9_-]+$/.test(s)).join('/');
}
function normalizeEndpoint(value) {
  let url;
  try { url = new URL(clean(value)); } catch (_) { throw Object.assign(new Error('invalid_endpoint'), { statusCode: 400 }); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw Object.assign(new Error('https_endpoint_required'), { statusCode: 400 });
  }
  return url.href.replace(/\/$/, '');
}
function decodeMasterKey() {
  const raw = clean(process.env[MASTER_KEY_ENV]);
  if (!raw) return null;
  let key = null;
  if (/^[A-Fa-f0-9]{64}$/.test(raw)) key = Buffer.from(raw, 'hex');
  else {
    try { key = Buffer.from(raw, 'base64'); } catch (_) { key = null; }
  }
  return key && key.length === 32 ? key : null;
}
function encryptCredentials(credentials) {
  const key = decodeMasterKey();
  if (!key) throw Object.assign(new Error('connector_vault_not_configured'), { statusCode: 503 });
  const accessKeyId = clean(credentials && credentials.accessKeyId);
  const secretAccessKey = clean(credentials && credentials.secretAccessKey);
  if (!accessKeyId || !secretAccessKey) throw Object.assign(new Error('credentials_required'), { statusCode: 400 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify({ accessKeyId, secretAccessKey }), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { version: 1, algorithm: 'AES-256-GCM', iv: iv.toString('base64'), tag: tag.toString('base64'), data: encrypted.toString('base64') };
}
function decryptCredentials(record) {
  const key = decodeMasterKey();
  if (!key) throw new Error('connector_vault_not_configured');
  const secret = record && record.secret;
  if (!secret || secret.version !== 1 || secret.algorithm !== 'AES-256-GCM') throw new Error('connector_secret_invalid');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(secret.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(secret.data, 'base64')), decipher.final()]);
  const parsed = JSON.parse(decrypted.toString('utf8'));
  if (!clean(parsed.accessKeyId) || !clean(parsed.secretAccessKey)) throw new Error('connector_secret_invalid');
  return { accessKeyId: clean(parsed.accessKeyId), secretAccessKey: clean(parsed.secretAccessKey) };
}
function normalizePublicConfiguration(input) {
  const type = clean(input && input.type).toUpperCase();
  if (!SUPPORTED_TYPES.includes(type)) throw Object.assign(new Error('unsupported_connector_type'), { statusCode: 400 });
  const bucket = clean(input.bucket || input.containerName);
  const region = clean(input.region);
  if (!bucket || bucket.length > 128 || !region || region.length > 64) throw Object.assign(new Error('bucket_and_region_required'), { statusCode: 400 });
  return {
    type,
    endpoint: normalizeEndpoint(input.endpoint || input.serverUrl),
    bucket,
    region,
    prefix: normalizePrefix(input.prefix),
    forcePathStyle: type === 'MINIO' ? input.forcePathStyle !== false : input.forcePathStyle === true,
  };
}
function clientKey(config) {
  const id = config.credentials && config.credentials.accessKeyId ? config.credentials.accessKeyId : 'legacy';
  return [config.endpoint, config.region, config.forcePathStyle ? '1' : '0', id].join('|');
}
function getS3Client(config) {
  const key = clientKey(config);
  if (clientCache.has(key)) return clientCache.get(key);
  const options = {
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle === true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
  };
  if (config.credentials) options.credentials = config.credentials;
  const client = new S3Client(options);
  clientCache.set(key, client);
  if (clientCache.size > 20) clientCache.delete(clientCache.keys().next().value);
  return client;
}
function legacyConfiguration() {
  const required = ['B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_NAME', 'B2_S3_ENDPOINT', 'B2_REGION'];
  if (required.some(name => !clean(process.env[name]))) return null;
  const endpointRaw = clean(process.env.B2_S3_ENDPOINT);
  const endpoint = /^https?:\/\//i.test(endpointRaw) ? endpointRaw : `https://${endpointRaw}`;
  return {
    source: 'legacy', type: 'S3_COMPATIBLE', endpoint, bucket: clean(process.env.B2_BUCKET_NAME), region: clean(process.env.B2_REGION),
    prefix: normalizePrefix(process.env.B2_FILE_PREFIX), forcePathStyle: false,
    credentials: { accessKeyId: clean(process.env.B2_KEY_ID), secretAccessKey: clean(process.env.B2_APPLICATION_KEY) },
  };
}
async function getConnectorDocument(db, organizationId) {
  const id = safeOrganizationId(organizationId);
  if (!id) throw new Error('invalid_organization_id');
  const snap = await db.collection(CONNECTOR_COLLECTION).doc(id).get();
  return snap.exists ? (snap.data() || {}) : null;
}
async function resolveOrganizationStorage(db, organizationId, { allowLegacy = true } = {}) {
  const record = await getConnectorDocument(db, organizationId);
  if (record && record.active === true) {
    const publicConfig = normalizePublicConfiguration(record);
    return { source: 'organization', organizationId: safeOrganizationId(organizationId), ...publicConfig, credentials: decryptCredentials(record) };
  }
  return allowLegacy ? legacyConfiguration() : null;
}
async function testS3Configuration(config) {
  const client = getS3Client(config);
  await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
  return true;
}
function safeStorageFailure(error) {
  const name = (error && (error.name || error.code)) || 'unknown_error';
  const status = error && error.$metadata && error.$metadata.httpStatusCode;
  return { name: String(name).slice(0, 64), status: status || null };
}
function publicConnectorView(record) {
  if (!record) return null;
  return {
    type: clean(record.type), endpoint: clean(record.endpoint), bucket: clean(record.bucket), region: clean(record.region), prefix: clean(record.prefix),
    forcePathStyle: record.forcePathStyle === true, active: record.active === true, testedAt: record.testedAt || null,
    testStatus: clean(record.testStatus) || 'not-tested', updatedAt: record.updatedAt || null,
    hasStoredCredentials: Boolean(record.secret && record.secret.data),
  };
}

module.exports = {
  CONNECTOR_COLLECTION, SUPPORTED_TYPES, MASTER_KEY_ENV, safeOrganizationId, normalizePrefix, normalizeEndpoint,
  encryptCredentials, decryptCredentials, normalizePublicConfiguration, legacyConfiguration, getConnectorDocument,
  resolveOrganizationStorage, getS3Client, testS3Configuration, safeStorageFailure, publicConnectorView,
};
