import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const require = createRequire(import.meta.url);
const readiness = require(path.join(repoRoot, 'api/mobile/readiness.js'))._test;

const baseEnv = () => ({
  SMART_HSR_RUNTIME_ENV: 'staging',
  FIREBASE_PROJECT_ID: 'smart-hsr-staging-blumark24',
  FIREBASE_WEB_CONFIG: JSON.stringify({ projectId: 'smart-hsr-staging-blumark24' }),
});

test('readiness never needs secret values in its output', () => {
  const env = {
    ...baseEnv(),
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'smart-hsr-staging-blumark24', private_key: 'secret' }),
    B2_KEY_ID: 'secret',
    B2_APPLICATION_KEY: 'secret',
    B2_BUCKET_NAME: 'bucket',
    B2_S3_ENDPOINT: 'endpoint',
    B2_REGION: 'region',
    SMART_HSR_STORAGE_STAGING_ISOLATED: 'true',
    SMART_HSR_AI_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'secret',
    GEMINI_VISION_MODEL: 'model',
    SMART_HSR_AI_APPLICATION_INTEGRATION: 'true',
    SMART_HSR_AI_ALLOWED_ORGANIZATION_IDS: 'org',
  };
  const result = readiness.buildReadiness(env);
  const serialized = JSON.stringify(result);
  assert.equal(result.operationalBackendReady, true);
  assert.doesNotMatch(serialized, /private_key|secret|bucket|endpoint|model|org/);
});

test('firebase admin fails closed without a staging server identity', () => {
  const result = readiness.firebaseAdminReadiness(baseEnv());
  assert.equal(result.ready, false);
  assert.equal(result.identityPresent, false);
});

test('storage requires all B2 settings and an explicit staging-isolation declaration for overall readiness', () => {
  const env = { ...baseEnv() };
  const storage = readiness.storageReadiness(env);
  assert.equal(storage.ready, false);
  assert.equal(storage.configuredCount, 0);
  assert.equal(storage.isolatedNamespaceDeclared, false);
});

test('AI activation requires application flag, org allowlist, and configured provider credentials', () => {
  const env = {
    ...baseEnv(),
    SMART_HSR_AI_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'k',
    GEMINI_VISION_MODEL: 'm',
    SMART_HSR_AI_APPLICATION_INTEGRATION: 'true',
    SMART_HSR_AI_ALLOWED_ORGANIZATION_IDS: 'org',
  };
  assert.equal(readiness.aiReadiness(env).ready, true);
  delete env.GEMINI_API_KEY;
  assert.equal(readiness.aiReadiness(env).ready, false);
});

test('firebase client readiness refuses any non-staging project id', () => {
  const env = baseEnv();
  env.FIREBASE_PROJECT_ID = 'wrong-project';
  assert.equal(readiness.buildReadiness(env).firebaseClient.ready, false);
});
