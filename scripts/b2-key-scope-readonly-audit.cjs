'use strict';

/**
 * SMART HSR — one-request Backblaze B2 application-key scope inspector.
 *
 * READ ONLY: GET official B2 v4 b2_authorize_account metadata endpoint.
 * Does NOT list buckets, files, upload/download, change IAM or restore data.
 * Never log the key ID, key, returned bearer token, account/bucket IDs,
 * bucket names, filename prefixes, response body, or raw provider errors.
 *
 * For a pre-authorized STAGING operator only, locally set:
 *   SMART_HSR_B2_SCOPE_AUDIT_APPROVED=READ_ONLY_APPROVED
 *   SMART_HSR_B2_SCOPE_AUDIT_TARGET=staging
 *   SMART_HSR_B2_STAGING_BUCKET_ID=<reviewed staging ID>
 *   SMART_HSR_B2_PRODUCTION_BUCKET_ID=<reviewed production ID>
 *   B2_KEY_ID, B2_APPLICATION_KEY=<staging-restricted key>
 * Then run: node scripts/b2-key-scope-readonly-audit.cjs --read-only-scope-check
 *
 * Shell history / CI logs / issues / AI chats must never contain secrets.
 * This is provider-reported key policy evidence, NOT an access attempt against
 * Production, independent verification, restore proof or release permission.
 */
const API_URL = 'https://api.backblazeb2.com/b2api/v4/b2_authorize_account';
// Treat unknown/future capabilities as elevated, not as silently safe.
const ROUTINE_CAPABILITIES = Object.freeze([
  'listBuckets', 'readBuckets', 'listFiles', 'readFiles', 'writeFiles'
]);
const REQUIRED = Object.freeze(['readFiles', 'writeFiles']);
// Only fixed provider-documented capability names are safe to surface. A
// malformed/unrecognized capability is counted, NEVER copied into a report.
const KNOWN_CAPABILITIES = Object.freeze([
  ...ROUTINE_CAPABILITIES,
  'listAllBucketNames', 'deleteFiles', 'deleteKeys', 'writeKeys',
  'writeBuckets', 'deleteBuckets', 'bypassGovernance', 'shareFiles',
  'readBucketEncryption', 'writeBucketEncryption',
  'readBucketRetentions', 'writeBucketRetentions',
  'readFileRetentions', 'writeFileRetentions',
  'readFileLegalHolds', 'writeFileLegalHolds',
  'readBucketReplications', 'writeBucketReplications',
  'readBucketNotifications', 'writeBucketNotifications',
  'readBucketLogging', 'writeBucketLogging',
  'listKeys'
]);

function hold(scopeStatus, extra = {}) {
  return Object.freeze({
    check: 'B2_STAGING_APP_KEY_SCOPE_METADATA_READ_ONLY',
    providerApi: 'b2_authorize_account_v4',
    scopeStatus,
    releaseDecision: 'HOLD',
    productionChangeAuthorized: false,
    independentReviewerApproved: false,
    actualProductionAccessTested: false,
    backupRestoreVerified: false,
    ...extra
  });
}

function configured(env) {
  if (!env || env.SMART_HSR_B2_SCOPE_AUDIT_APPROVED !== 'READ_ONLY_APPROVED' ||
      env.SMART_HSR_B2_SCOPE_AUDIT_TARGET !== 'staging') return null;
  const stage = env.SMART_HSR_B2_STAGING_BUCKET_ID;
  const prod = env.SMART_HSR_B2_PRODUCTION_BUCKET_ID;
  if (typeof stage !== 'string' || !/^[a-f0-9]{24}$/i.test(stage) ||
      typeof prod !== 'string' || !/^[a-f0-9]{24}$/i.test(prod) ||
      stage === prod || !env.B2_KEY_ID || !env.B2_APPLICATION_KEY ||
      typeof env.B2_KEY_ID !== 'string' || typeof env.B2_APPLICATION_KEY !== 'string') return null;
  return { stage, prod, keyId: env.B2_KEY_ID, key: env.B2_APPLICATION_KEY };
}

function evaluateAuthorization(body, expectedStage, expectedProduction) {
  const allowed = body?.apiInfo?.storageApi?.allowed;
  if (!allowed || !Array.isArray(allowed.capabilities)) return hold('INVALID_OR_INCOMPLETE_PROVIDER_METADATA');
  const caps = allowed.capabilities;
  if (!caps.every(x => typeof x === 'string')) return hold('INVALID_OR_INCOMPLETE_PROVIDER_METADATA');
  const buckets = allowed.buckets;
  if (buckets === null) return hold('UNRESTRICTED_BUCKET_SCOPE_REPORTED', { allowedBucketCount: null });
  if (!Array.isArray(buckets) || !buckets.every(x => x && typeof x.id === 'string')) {
    return hold('INVALID_OR_INCOMPLETE_PROVIDER_METADATA');
  }
  const exact = buckets.length === 1 &&
    buckets[0].id === expectedStage && buckets[0].id !== expectedProduction;
  const hasExpectedOperations = REQUIRED.every(x => caps.includes(x));
  const privileged = [...new Set(caps.filter(x =>
    KNOWN_CAPABILITIES.includes(x) && !ROUTINE_CAPABILITIES.includes(x)))];
  const unrecognizedCapabilityCount = caps.filter(x => !KNOWN_CAPABILITIES.includes(x)).length;
  const keyHasExpiry = Number.isFinite(body.applicationKeyExpirationTimestamp) &&
    body.applicationKeyExpirationTimestamp > 0;
  const filePrefixRestrictionDeclared = typeof allowed.namePrefix === 'string' &&
    allowed.namePrefix.length > 0;
  // Missing expiry may be allowed under a reviewed rotation policy, while a
  // dedicated bucket may justify a missing prefix. Neither is silently green.
  // Publish ONLY fixed policy codes, never the actual prefix or key metadata.
  const policyGapsForReview = Object.freeze([
    ...(!filePrefixRestrictionDeclared ? ['FILE_PREFIX_SCOPE_REVIEW_REQUIRED'] : []),
    ...(!keyHasExpiry ? ['KEY_EXPIRY_OR_ROTATION_POLICY_REVIEW_REQUIRED'] : [])
  ]);
  const status = !exact ? 'UNAPPROVED_OR_MULTIBUCKET_SCOPE' :
    !hasExpectedOperations ? 'REQUIRED_OPERATIONS_NOT_REPORTED' :
    privileged.length || unrecognizedCapabilityCount
      ? 'PRIVILEGED_CAPABILITIES_REQUIRE_REVIEW' :
    policyGapsForReview.length ? 'STAGING_SCOPE_WITH_POLICY_GAPS' :
    'STAGING_ONLY_PROVIDER_SCOPE_REPORTED';
  // Do not return any identifiers, raw prefixes, tokens, service URLs or
  // account metadata. A reported single-bucket scope still needs signoff.
  return hold(status, {
    allowedBucketCount: buckets.length,
    expectedReadWriteCapabilitiesReported: hasExpectedOperations,
    privilegedCapabilitiesForReview: privileged,
    unrecognizedCapabilityCount,
    filePrefixRestrictionDeclared,
    applicationKeyExpirationConfigured: keyHasExpiry,
    policyGapsForReview,
    providerReportedStageOnly: exact
  });
}

async function audit({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const config = configured(env);
  if (!config) return hold('AUTHORIZATION_OR_STAGING_INPUTS_MISSING');
  if (typeof fetchImpl !== 'function') return hold('INSPECTION_UNAVAILABLE');
  try {
    const token = Buffer.from(config.keyId + ':' + config.key).toString('base64');
    const response = await fetchImpl(API_URL, {
      method: 'GET',
      headers: { Authorization: 'Basic ' + token, Accept: 'application/json' },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(12000)
    });
    if (!response || response.status !== 200) return hold('PROVIDER_AUTHORIZATION_UNAVAILABLE');
    const body = await response.json();
    return evaluateAuthorization(body, config.stage, config.prod);
  } catch (_) {
    // Provider errors may contain sensitive identifiers; never print them.
    return hold('INSPECTION_UNAVAILABLE');
  }
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || argv[0] !== '--read-only-scope-check') {
    process.stdout.write(JSON.stringify(hold('EXPLICIT_OPERATOR_FLAG_REQUIRED')) + '\n');
    return 2;
  }
  const result = await audit();
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  // No automated GO from this advisory tool, regardless of provider response.
  return 2;
}

if (require.main === module) main().then(code => { process.exitCode = code; });
module.exports = { API_URL, ROUTINE_CAPABILITIES, KNOWN_CAPABILITIES, REQUIRED, configured, evaluateAuthorization, audit, main };
