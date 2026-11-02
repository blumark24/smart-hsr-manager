'use strict';

// Review-only, hosted Preview fail-closed gate. Does not prove IAM or residency.
const STAGING_PROJECT_ID = 'smart-hsr-staging-blumark24';
function deny(resource) {
  const error = new Error('PREVIEW_' + resource + '_ISOLATION_DENIED');
  error.code = 'PREVIEW_' + resource + '_ISOLATION_DENIED';
  error.statusCode = 503;
  throw error;
}
function objectFromJson(raw, resource) {
  if (typeof raw !== 'string' || !raw.trim()) deny(resource);
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch (_) { /* invalid configuration always denied */ }
  deny(resource);
}
// Preview Web config must never pair the staging projectId with Production
// Auth/Storage resources. Custom resource domains require explicit review.
function assertPreviewFirebaseWebResources(web) {
  if (!web || typeof web !== 'object' || Array.isArray(web) ||
      web.projectId !== STAGING_PROJECT_ID) deny('FIREBASE');
  if (web.authDomain !== undefined &&
      web.authDomain !== STAGING_PROJECT_ID + '.firebaseapp.com') deny('FIREBASE');
  if (web.storageBucket !== undefined &&
      ![STAGING_PROJECT_ID + '.firebasestorage.app',
        STAGING_PROJECT_ID + '.appspot.com'].includes(web.storageBucket)) deny('FIREBASE');
  // SMART HSR currently does not use Firebase Realtime Database. A supplied
  // databaseURL is unreviewed and cannot be treated as staging by projectId.
  if (web.databaseURL !== undefined) deny('FIREBASE');
  return true;
}
function assertPreviewFirebaseIsolation(env = process.env, initializedApps = []) {
  if (env.VERCEL_ENV !== 'preview') return true;
  if (env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST) deny('FIREBASE');
  const web = objectFromJson(env.FIREBASE_WEB_CONFIG, 'FIREBASE');
  const account = objectFromJson(env.FIREBASE_SERVICE_ACCOUNT, 'FIREBASE');
  assertPreviewFirebaseWebResources(web);
  if (account.project_id !== STAGING_PROJECT_ID) deny('FIREBASE');
  if (account.client_email !== undefined &&
      (typeof account.client_email !== 'string' ||
       !account.client_email.endsWith('@' + STAGING_PROJECT_ID + '.iam.gserviceaccount.com'))) {
    deny('FIREBASE');
  }
  for (const name of ['FIREBASE_PROJECT_ID', 'GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
    if (env[name] && env[name] !== STAGING_PROJECT_ID) deny('FIREBASE');
  }
  if (!Array.isArray(initializedApps)) deny('FIREBASE');
  for (const app of initializedApps) {
    if (!app || !app.options || app.options.projectId !== STAGING_PROJECT_ID) deny('FIREBASE');
  }
  return true;
}
function assertPreviewStorageIsolation(env = process.env) {
  if (env.VERCEL_ENV !== 'preview') return true;
  const actual = String(env.B2_BUCKET_NAME || '').trim();
  const preview = String(env.SMART_HSR_PREVIEW_B2_BUCKET_NAME || '').trim();
  const production = String(env.SMART_HSR_PRODUCTION_B2_BUCKET_NAME || '').trim();
  if (!actual || !preview || !production || preview === production || actual !== preview) deny('STORAGE');
  for (const name of ['B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_S3_ENDPOINT', 'B2_REGION']) {
    if (!String(env[name] || '').trim()) deny('STORAGE');
  }
  return true;
}
function isPreviewStorageIsolationConfigured(env = process.env) {
  try {
    assertPreviewStorageIsolation(env);
    return true;
  } catch (error) {
    if (error && error.code === 'PREVIEW_STORAGE_ISOLATION_DENIED') return false;
    throw error;
  }
}
function assertPreviewStorageClientConfig(config, env = process.env) {
  if (env.VERCEL_ENV !== 'preview') return true;
  assertPreviewStorageIsolation(env);
  if (!config || typeof config !== 'object' || Array.isArray(config)) deny('STORAGE');
  for (const [field, name] of [
    ['bucket', 'B2_BUCKET_NAME'], ['endpoint', 'B2_S3_ENDPOINT'], ['region', 'B2_REGION'],
  ]) {
    if (typeof config[field] !== 'string' || config[field] !== String(env[name] || '').trim()) {
      deny('STORAGE');
    }
  }
  return true;
}
module.exports = {
  STAGING_PROJECT_ID,
  assertPreviewFirebaseWebResources,
  assertPreviewFirebaseIsolation,
  assertPreviewStorageIsolation,
  isPreviewStorageIsolationConfigured,
  assertPreviewStorageClientConfig,
};
