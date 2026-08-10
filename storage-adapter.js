const DB_NAME = 'smart-hsr-institutional-storage';
const DB_VERSION = 1;
const CONNECTOR_STORE = 'connectors';
const ASSET_STORE = 'assets';
export const LOCAL_DEMO_TYPE = 'LOCAL_DEMO';
export const LOCAL_DEMO_SCHEME = 'local-demo://';
export const MAX_COMPRESSED_IMAGE_BYTES = 700 * 1024;
export const SUPPORTED_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
export const DEMO_NOTICE = 'بيئة عرض تجريبية — الصور محفوظة على هذا الجهاز فقط ولم تُرفع إلى خادم البلدية.';
export const MAYOR_NOTICE = 'تدعم المنصة ربط بيانات ومرفقات كل مؤسسة بخادمها الخاص. يعمل العرض الحالي في وضع تخزين محلي تجريبي، ويُفعّل الربط الفعلي بعد اعتماد مواصفات الخادم من تقنية معلومات المؤسسة.';

const objectUrls = new Set();

function requiredText(value, label) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result) throw new Error(`missing-${label}`);
  return result;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('indexeddb-unavailable'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(new Error('indexeddb-open-failed'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CONNECTOR_STORE)) db.createObjectStore(CONNECTOR_STORE, { keyPath: 'organizationId' });
      if (!db.objectStoreNames.contains(ASSET_STORE)) {
        const store = db.createObjectStore(ASSET_STORE, { keyPath: 'recordKey' });
        store.createIndex('organizationId', 'organizationId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function transact(storeName, mode, operation) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;
      try { result = operation(store, resolve, reject); }
      catch (error) { reject(error); }
      transaction.onerror = () => reject(new Error('indexeddb-transaction-failed'));
      if (result && typeof result.onsuccess === 'object') result.onsuccess = () => resolve(result.result);
      if (result && typeof result.onerror === 'object') result.onerror = () => reject(new Error('indexeddb-request-failed'));
    });
  } finally { db.close(); }
}

function verifiedAssetContext(context) {
  const organizationId = requiredText(context?.organizationId, 'organization');
  const uid = requiredText(context?.uid, 'user');
  const role = requiredText(context?.role, 'role');
  if (!['inspector', 'contractor', 'manager', 'supervisor', 'owner'].includes(role)) throw new Error('invalid-role');
  return { organizationId, uid, role };
}

function parseLocalReference(reference) {
  const raw = typeof reference === 'string' ? reference.trim() : '';
  if (!raw.startsWith(LOCAL_DEMO_SCHEME)) return null;
  const remainder = raw.slice(LOCAL_DEMO_SCHEME.length);
  const slash = remainder.indexOf('/');
  if (slash < 1) return null;
  try {
    const organizationId = decodeURIComponent(remainder.slice(0, slash));
    const assetKey = decodeURIComponent(remainder.slice(slash + 1));
    return organizationId && assetKey ? { organizationId, assetKey } : null;
  } catch (_) { return null; }
}

export function isLocalDemoReference(reference) {
  return !!parseLocalReference(reference);
}

// A reference that is neither a local-demo asset nor an absolute URL is a
// server-side object key in the private bucket. It is NOT usable as img.src —
// it must be fetched through the authenticated read endpoint.
export function isServerObjectKey(reference) {
  const raw = typeof reference === 'string' ? reference.trim() : '';
  if (!raw || raw.length > 512) return false;
  if (parseLocalReference(raw)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return false;   // https:, data:, local-demo:
  if (raw.startsWith('/') || raw.includes('//') || raw.includes('\\') || raw.includes('..')) return false;
  return /^[A-Za-z0-9_\-/.]+\.(?:jpe?g|png|webp)$/i.test(raw);
}

// Fetches a private object through the server and hands back a blob URL.
// The B2 bucket is never made public and no bucket URL reaches the browser.
export async function resolveServerObjectImage({ reference, getIdToken }) {
  const key = typeof reference === 'string' ? reference.trim() : '';
  if (!isServerObjectKey(key)) return { kind: 'server', available: false, url: null, reason: 'invalid-object-key' };
  if (typeof getIdToken !== 'function') return { kind: 'server', available: false, url: null, reason: 'missing-id-token' };

  let response;
  try {
    response = await fetchWithFirebaseAuth({
      getIdToken,
      input: `/api/storage/read?key=${encodeURIComponent(key)}`,
    });
  } catch (error) {
    if (error?.code === REAUTHENTICATION_REQUIRED) {
      return { kind: 'server', available: false, url: null, reason: REAUTHENTICATION_REQUIRED };
    }
    return { kind: 'server', available: false, url: null, reason: 'network-error' };
  }
  if (!response.ok) {
    // Server error codes only — never provider or bucket detail.
    const failure = await response.json().catch(() => ({}));
    const reason = typeof failure?.error === 'string' ? failure.error : `http-${response.status}`;
    return { kind: 'server', available: false, url: null, reason, status: response.status };
  }

  const blob = await response.blob();
  if (!blob || !blob.size || !String(blob.type || '').startsWith('image/')) {
    return { kind: 'server', available: false, url: null, reason: 'not-an-image' };
  }
  const url = URL.createObjectURL(blob);
  objectUrls.add(url);
  return { kind: 'server', available: true, url, mimeType: blob.type, byteSize: blob.size };
}

export async function getConnectorConfiguration(organizationId) {
  const id = requiredText(organizationId, 'organization');
  return (await transact(CONNECTOR_STORE, 'readonly', store => store.get(id))) || null;
}

export async function saveConnectorConfiguration(configuration, ownerContext) {
  if (ownerContext?.role !== 'owner' || !ownerContext?.uid) throw new Error('owner-required');
  const organizationId = requiredText(configuration?.organizationId, 'organization');
  const type = requiredText(configuration?.type, 'connector-type');
  if (!['S3_COMPATIBLE', 'MINIO', 'GOVERNMENT_HTTPS_API', LOCAL_DEMO_TYPE].includes(type)) throw new Error('invalid-connector-type');
  let serverUrl = String(configuration.serverUrl || '').trim();
  if (type !== LOCAL_DEMO_TYPE && serverUrl) {
    let parsed;
    try { parsed = new URL(serverUrl); } catch (_) { throw new Error('invalid-server-url'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('unsafe-server-url');
    serverUrl = parsed.href;
  }
  const record = {
    organizationId,
    type,
    connectionName: String(configuration.connectionName || '').trim(),
    serverUrl: type === LOCAL_DEMO_TYPE ? '' : serverUrl,
    containerName: String(configuration.containerName || '').trim(),
    region: String(configuration.region || '').trim(),
    tls: configuration.tls === true,
    mode: type === LOCAL_DEMO_TYPE ? 'local-demo' : 'server-required',
    active: type === LOCAL_DEMO_TYPE && configuration.active === true,
    lastTestAt: configuration.lastTestAt || null,
    lastTestStatus: configuration.lastTestStatus || 'not-tested',
    updatedAt: new Date().toISOString()
  };
  await transact(CONNECTOR_STORE, 'readwrite', store => store.put(record));
  return record;
}

export async function testStorageConnection({ organizationId, ownerContext }) {
  if (ownerContext?.role !== 'owner' || !ownerContext?.uid) throw new Error('owner-required');
  const connector = await getConnectorConfiguration(organizationId);
  if (!connector) return { ok: false, status: 'not-configured' };
  if (connector.type !== LOCAL_DEMO_TYPE) return { ok: false, status: 'requires-secure-server-api' };
  await openDatabase().then(db => db.close());
  return { ok: true, status: 'local-demo-ready', testedAt: new Date().toISOString() };
}

export async function uploadObservationImage({ blob, observationId = null, context, fallbackUpload = null }) {
  const verified = verifiedAssetContext(context);
  if (!['inspector', 'contractor'].includes(verified.role)) throw new Error('upload-role-denied');
  if (!(blob instanceof Blob) || !SUPPORTED_IMAGE_TYPES.includes(blob.type)) throw new Error('unsupported-image-type');
  if (!blob.size || blob.size > MAX_COMPRESSED_IMAGE_BYTES) throw new Error('image-too-large');
  const connector = await getConnectorConfiguration(verified.organizationId);
  if (!connector?.active) {
    if (typeof fallbackUpload === 'function') return fallbackUpload(blob);
    throw new Error('storage-not-configured');
  }
  if (connector.type !== LOCAL_DEMO_TYPE) throw new Error('server-connector-unavailable');
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const checksum = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const assetKey = `${Date.now().toString(36)}-${crypto.randomUUID()}`;
  const record = {
    recordKey: `${verified.organizationId}/${assetKey}`,
    assetKey,
    organizationId: verified.organizationId,
    observationId: observationId == null ? null : String(observationId),
    mimeType: blob.type,
    byteSize: blob.size,
    checksum,
    createdByUid: verified.uid,
    createdAt: new Date().toISOString(),
    blob
  };
  await transact(ASSET_STORE, 'readwrite', store => store.put(record));
  return `${LOCAL_DEMO_SCHEME}${encodeURIComponent(verified.organizationId)}/${encodeURIComponent(assetKey)}`;
}

// Handles every reference shape a report can carry:
//   local-demo://…        -> on-device blob (demo storage)
//   https://… / data:…    -> legacy direct URL, usable as-is
//   observations/…        -> private object key, fetched via the read endpoint
export async function resolveObservationImage({ reference, context }) {
  const parsed = parseLocalReference(reference);
  if (!parsed) {
    const raw = typeof reference === 'string' ? reference.trim() : '';
    if (/^https:\/\//i.test(raw) || /^data:image\//i.test(raw)) {
      return { kind: 'external', available: true, url: raw };
    }
    if (isServerObjectKey(raw)) {
      const getIdToken = typeof context?.getIdToken === 'function'
        ? context.getIdToken
        : async () => context?.idToken;
      return resolveServerObjectImage({ reference: raw, getIdToken });
    }
    return { kind: 'external', available: false, url: null, reason: 'unsupported-reference' };
  }
  const verified = verifiedAssetContext(context);
  if (parsed.organizationId !== verified.organizationId) return { kind: 'local-demo', available: false, url: null, reason: 'organization-mismatch' };
  const record = await transact(ASSET_STORE, 'readonly', store => store.get(`${parsed.organizationId}/${parsed.assetKey}`));
  if (!record || record.organizationId !== verified.organizationId || !(record.blob instanceof Blob)) {
    return { kind: 'local-demo', available: false, url: null, reason: 'not-on-this-device' };
  }
  const url = URL.createObjectURL(record.blob);
  objectUrls.add(url);
  return { kind: 'local-demo', available: true, url, mimeType: record.mimeType, byteSize: record.byteSize, checksum: record.checksum };
}

export function revokeObservationImageUrl(url) {
  if (typeof url === 'string' && objectUrls.has(url)) {
    URL.revokeObjectURL(url);
    objectUrls.delete(url);
  }
}

export function revokeAllObservationImageUrls() {
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls.clear();
}

export async function deleteObservationImage({ reference, context }) {
  const parsed = parseLocalReference(reference);
  const verified = verifiedAssetContext(context);
  if (!parsed || parsed.organizationId !== verified.organizationId) throw new Error('delete-scope-denied');
  if (verified.role !== 'owner') throw new Error('delete-role-denied');
  await transact(ASSET_STORE, 'readwrite', store => store.delete(`${parsed.organizationId}/${parsed.assetKey}`));
}

export async function clearLocalDemoStorage({ organizationId, ownerContext, confirmed }) {
  if (ownerContext?.role !== 'owner' || !ownerContext?.uid || confirmed !== true) throw new Error('owner-confirmation-required');
  const id = requiredText(organizationId, 'organization');
  await transact(ASSET_STORE, 'readwrite', (store, resolve, reject) => {
    const request = store.index('organizationId').openCursor(IDBKeyRange.only(id));
    request.onerror = () => reject(new Error('indexeddb-request-failed'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve();
      cursor.delete();
      cursor.continue();
    };
  });
  revokeAllObservationImageUrls();
}

// Future server connector contract (intentionally inactive in Stage F1):
// POST /api/storage/test, POST /api/storage/upload,
// GET /api/storage/signed-url, DELETE /api/storage/object.
// Each endpoint must verify the Firebase ID token, active role and tenant on
// the server, resolve encrypted connector secrets by that verified tenant,
// issue short-lived URLs, audit every operation and fail closed. Request-body
// identity/organization scope is never authoritative and providers never
// fall back across connectors or organizations.
import { fetchWithFirebaseAuth, REAUTHENTICATION_REQUIRED } from './firebase-auth-fetch.js';
