'use strict';
/**
 * SMART HSR — Preview environment inventory preflight (metadata only).
 *
 * Input MUST be a manually sanitized Vercel environment-key inventory:
 *   [{ "key": "...", "target": ["preview"], "gitBranch": null }]
 *
 * This does not query provider APIs, Firebase, B2, or Production. It cannot
 * establish whether an account or bucket really belongs to Staging. Never
 * include environment values or credentials in the input or CI artifacts.
 */
const fs = require('node:fs');

const REQUIRED_KEYS = Object.freeze([
  'FIREBASE_WEB_CONFIG',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_SERVICE_ACCOUNT',
  'B2_BUCKET_NAME',
  'B2_KEY_ID',
  'B2_APPLICATION_KEY',
  'B2_S3_ENDPOINT',
  'B2_REGION',
  'SMART_HSR_PREVIEW_B2_BUCKET_NAME',
  'SMART_HSR_PRODUCTION_B2_BUCKET_NAME',
  'LANDS_EMBEDDED_RUNTIME'
]);
const ALLOWED_FIELDS = new Set(['key', 'target', 'gitBranch']);

function normalizeInventory(inventory) {
  const rows = Array.isArray(inventory) ? inventory :
    (inventory && Object.keys(inventory).length === 1 && Array.isArray(inventory.envs) ? inventory.envs : null);
  if (!rows) throw new Error('METADATA_ONLY_INVENTORY_REQUIRED');
  return rows.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        Object.keys(row).some(field => !ALLOWED_FIELDS.has(field)) ||
        typeof row.key !== 'string' || !Array.isArray(row.target) ||
        !row.target.every(t => t === 'production' || t === 'preview' || t === 'development') ||
        (row.gitBranch != null && typeof row.gitBranch !== 'string')) {
      // No row echo: it might contain an accidentally included secret value.
      throw new Error('UNSANITIZED_OR_INVALID_METADATA');
    }
    return { key: row.key, target: row.target, gitBranch: row.gitBranch || null };
  });
}

function evaluate(inventory, branch) {
  if (typeof branch !== 'string' || !/^[-\w]+(?:\/[-\w]+)*$/.test(branch) ||
      branch === 'main' || branch === 'master') {
    throw new Error('EXPLICIT_NON_PRODUCTION_BRANCH_REQUIRED');
  }
  const entries = normalizeInventory(inventory);
  const available = new Set(entries.filter(row => row.target.includes('preview') &&
    (row.gitBranch === null || row.gitBranch === branch)).map(row => row.key));
  const missingKeys = REQUIRED_KEYS.filter(key => !available.has(key));
  const wrongBranchOnly = REQUIRED_KEYS.filter(key => !available.has(key) && entries.some(row =>
    row.key === key && row.target.includes('preview') && row.gitBranch !== null && row.gitBranch !== branch));
  return Object.freeze({
    check: 'PREVIEW_ENV_KEY_METADATA_ONLY',
    branch,
    required: REQUIRED_KEYS.length,
    scopedKeysPresent: REQUIRED_KEYS.length - missingKeys.length,
    missingKeys,
    wrongBranchOnly,
    configurationMetadata: missingKeys.length ? 'MISSING_REQUIRED_PREVIEW_KEY_NAMES' : 'KEY_NAMES_PRESENT_VALUES_UNVERIFIED',
    decision: 'HOLD',
    previewDeploymentAuthorized: false,
    productionChangeAuthorized: false,
    cloudCredentialsRead: false,
    effectiveResourceIsolationVerified: false,
    liveAuthenticatedUatVerified: false,
    isolatedRestoreVerified: false
  });
}

function main(argv = process.argv.slice(2)) {
  const index = argv.indexOf('--inventory-file');
  const branchIndex = argv.indexOf('--branch');
  if (index < 0 || branchIndex < 0 || !argv[index + 1] || !argv[branchIndex + 1]) {
    process.stderr.write('METADATA_ONLY_INVENTORY_AND_BRANCH_REQUIRED\n');
    return 2;
  }
  try {
    const data = JSON.parse(fs.readFileSync(argv[index + 1], 'utf8'));
    const report = evaluate(data, argv[branchIndex + 1]);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    // This is a hold-only gate. Exit 2 indicates not release ready.
    return 2;
  } catch (error) {
    const known = ['METADATA_ONLY_INVENTORY_REQUIRED', 'UNSANITIZED_OR_INVALID_METADATA', 'EXPLICIT_NON_PRODUCTION_BRANCH_REQUIRED'];
    const reason = known.includes(error?.message) ? error.message : 'INVALID_OR_UNREADABLE_INVENTORY';
    process.stderr.write(reason + '\n');
    return 2;
  }
}

if (require.main === module) process.exitCode = main();
module.exports = { REQUIRED_KEYS, normalizeInventory, evaluate, main };
