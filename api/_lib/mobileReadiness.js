'use strict';

const STAGING_FIREBASE_PROJECT_ID = 'smart-hsr-staging-blumark24';
const B2_REQUIRED = Object.freeze([
  'B2_KEY_ID',
  'B2_APPLICATION_KEY',
  'B2_BUCKET_NAME',
  'B2_S3_ENDPOINT',
  'B2_REGION',
]);

function nonEmpty(name, env = process.env) {
  return typeof env[name] === 'string' && env[name].trim().length > 0;
}

function parseFirebaseWebConfig(env = process.env) {
  const raw = typeof env.FIREBASE_WEB_CONFIG === 'string' ? env.FIREBASE_WEB_CONFIG.trim() : '';
  if (!raw) return { present: false, validJson: false, projectAligned: false };
  try {
    const parsed = JSON.parse(raw);
    return {
      present: true,
      validJson: true,
      projectAligned: parsed && parsed.projectId === STAGING_FIREBASE_PROJECT_ID,
    };
  } catch (_) {
    return { present: true, validJson: false, projectAligned: false };
  }
}

function firebaseAdminReadiness(env = process.env) {
  const serviceAccountPresent = nonEmpty('FIREBASE_SERVICE_ACCOUNT', env);
  const applicationCredentialsPresent = nonEmpty('GOOGLE_APPLICATION_CREDENTIALS', env);
  const projectIdAligned = String(env.FIREBASE_PROJECT_ID || '').trim() === STAGING_FIREBASE_PROJECT_ID;

  let serviceAccountProjectAligned = false;
  let serviceAccountJsonValid = false;
  if (serviceAccountPresent) {
    try {
      const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
      serviceAccountJsonValid = Boolean(parsed && typeof parsed === 'object');
      serviceAccountProjectAligned = parsed && parsed.project_id === STAGING_FIREBASE_PROJECT_ID;
    } catch (_) {
      serviceAccountJsonValid = false;
    }
  }

  const identityPresent = serviceAccountPresent || applicationCredentialsPresent;
  const identityAligned = serviceAccountPresent
    ? serviceAccountJsonValid && serviceAccountProjectAligned
    : applicationCredentialsPresent && projectIdAligned;

  return {
    ready: Boolean(identityPresent && identityAligned && projectIdAligned),
    identityPresent,
    projectIdAligned,
    serviceAccountJsonValid: serviceAccountPresent ? serviceAccountJsonValid : null,
    serviceAccountProjectAligned: serviceAccountPresent ? serviceAccountProjectAligned : null,
  };
}

function storageReadiness(env = process.env) {
  const missingCount = B2_REQUIRED.filter(name => !nonEmpty(name, env)).length;
  return {
    ready: missingCount === 0,
    requiredCount: B2_REQUIRED.length,
    configuredCount: B2_REQUIRED.length - missingCount,
    isolatedNamespaceDeclared:
      String(env.SMART_HSR_STORAGE_STAGING_ISOLATED || '').trim().toLowerCase() === 'true',
  };
}

function aiReadiness(env = process.env) {
  const provider = String(env.SMART_HSR_AI_PROVIDER || 'gemini').trim().toLowerCase();
  const integrationEnabled =
    String(env.SMART_HSR_AI_APPLICATION_INTEGRATION || '').trim().toLowerCase() === 'true';
  const organizationAllowlistPresent = nonEmpty('SMART_HSR_AI_ALLOWED_ORGANIZATION_IDS', env);

  let providerConfigured = false;
  if (provider === 'gemini') {
    providerConfigured = nonEmpty('GEMINI_API_KEY', env) && nonEmpty('GEMINI_VISION_MODEL', env);
  } else if (provider === 'openai') {
    providerConfigured = nonEmpty('OPENAI_API_KEY', env) && nonEmpty('OPENAI_VISION_MODEL', env);
  }

  return {
    ready: Boolean(integrationEnabled && organizationAllowlistPresent && providerConfigured),
    providerSupported: provider === 'gemini' || provider === 'openai',
    integrationEnabled,
    organizationAllowlistPresent,
    providerConfigured,
  };
}

function buildReadiness(env = process.env) {
  const web = parseFirebaseWebConfig(env);
  const firebaseClient = {
    ready:
      String(env.FIREBASE_PROJECT_ID || '').trim() === STAGING_FIREBASE_PROJECT_ID &&
      web.present && web.validJson && web.projectAligned,
    projectIdAligned: String(env.FIREBASE_PROJECT_ID || '').trim() === STAGING_FIREBASE_PROJECT_ID,
    webConfigPresent: web.present,
    webConfigValid: web.validJson,
    webConfigProjectAligned: web.projectAligned,
  };
  const firebaseAdmin = firebaseAdminReadiness(env);
  const storage = storageReadiness(env);
  const ai = aiReadiness(env);

  return {
    ok: true,
    environment: 'staging',
    firebaseClient,
    firebaseAdmin,
    storage,
    ai,
    operationalBackendReady:
      firebaseClient.ready &&
      firebaseAdmin.ready &&
      storage.ready &&
      storage.isolatedNamespaceDeclared &&
      ai.ready,
  };
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(JSON.stringify(payload));
}

function handler(req, res) {
  if (String(process.env.SMART_HSR_RUNTIME_ENV || '').trim().toLowerCase() !== 'staging') {
    return sendJson(res, 404, { error: 'not_found' });
  }
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  return sendJson(res, 200, buildReadiness());
}

module.exports = handler;
module.exports._test = {
  STAGING_FIREBASE_PROJECT_ID,
  B2_REQUIRED,
  parseFirebaseWebConfig,
  firebaseAdminReadiness,
  storageReadiness,
  aiReadiness,
  buildReadiness,
  handler,
};
