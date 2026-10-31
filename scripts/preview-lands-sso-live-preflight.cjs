'use strict';

// SMART HSR — read-only, anonymous, Preview-only release preflight.
// Never accepts Production/custom hosts, sends no cookies/tokens, and never
// enables a service, writes data, logs raw response bodies or opens UAT users.
const ALLOWED_PREVIEW = /^smart-hsr-manager-[a-z0-9-]+-blumark24-os\.vercel\.app$/;
const ROUTES = Object.freeze({
  config: '/api/organization/context?previewGate=lands-sso',
  health: '/api/lands-health',
  anonymous: '/api/organization/context',
  membership: '/api/lands-membership-status'
});
function validatePreviewUrl(input) {
  let parsed;
  try { parsed = new URL(input); } catch { throw new Error('PREVIEW_URL_INVALID'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port ||
      parsed.pathname !== '/' || parsed.search || parsed.hash ||
      !ALLOWED_PREVIEW.test(parsed.hostname)) {
    throw new Error('PREVIEW_ONLY_HOST_REQUIRED');
  }
  return parsed.origin;
}
async function checkEndpoint(fetchImpl, origin, route) {
  try {
    const response = await fetchImpl(origin + route, {
      method: 'GET', redirect: 'manual', cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response || typeof response.status !== 'number') return { status: 0, data: null };
    const data = await response.json().catch(() => null);
    // Keep only explicitly public, allowlisted fields; never print full bodies.
    if (!data || typeof data !== 'object') return { status: response.status, data: null };
    return { status: response.status, data: {
      service: typeof data.service === 'string' ? data.service.slice(0, 40) : null,
      status: typeof data.status === 'string' ? data.status.slice(0, 20) : null,
      ready: data.ready === true,
      checks: data.checks && typeof data.checks === 'object' ? {
        preview: data.checks.preview === true,
        webStaging: data.checks.webStaging === true,
        adminStaging: data.checks.adminStaging === true,
        embedded: data.checks.embedded === true
      } : null,
      error: typeof data.error === 'string' ? data.error.slice(0, 80) : null
    }};
  } catch {
    return { status: 0, data: null };
  }
}
async function evaluatePreview(url, fetchImpl = fetch) {
  const origin = validatePreviewUrl(url);
  const [config, health, anonymous, membership] = await Promise.all([
    checkEndpoint(fetchImpl, origin, ROUTES.config),
    checkEndpoint(fetchImpl, origin, ROUTES.health),
    checkEndpoint(fetchImpl, origin, ROUTES.anonymous),
    checkEndpoint(fetchImpl, origin, ROUTES.membership)
  ]);
  const observed = {
    health: health.status === 200 && health.data?.service === 'smart-hsr-lands-embedded' && health.data?.status === 'ok',
    anonymousDenied: anonymous.status === 401 && anonymous.data?.error === 'unauthenticated',
    previewGateStaging: config.data?.checks?.preview === true &&
      config.data?.checks?.webStaging === true &&
      config.data?.checks?.adminStaging === true,
    embeddedEnabled: config.data?.checks?.embedded === true,
    ssoPreflightReady: config.status === 200 && config.data?.ready === true,
    protectedGateFailClosed: config.data?.ready === false && membership.status === 503 &&
      membership.data?.error === 'staging_lands_sso_gate_not_ready'
  };
  const allPreviewGates = observed.health && observed.anonymousDenied &&
    observed.previewGateStaging && observed.embeddedEnabled && observed.ssoPreflightReady;
  const protectedUnauthenticated = [401, 403, 405].includes(membership.status);
  const decision = allPreviewGates && protectedUnauthenticated
    ? 'PREVIEW-PREFLIGHT-PASS-AUTH-UAT-STILL-REQUIRED' : 'NO-GO';
  return {
    decision,
    host: new URL(origin).hostname,
    checks: observed,
    http: {
      config: config.status, health: health.status,
      anonymous: anonymous.status, membership: membership.status
    },
    // No authenticated UAT, data residency, authorization or legal sign-off is inferred.
    productionAuthorized: false, authenticatedUatVerified: false
  };
}
module.exports = { validatePreviewUrl, checkEndpoint, evaluatePreview };
if (require.main === module) {
  const url = process.argv[2];
  evaluatePreview(url)
    .then(result => {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exitCode = result.decision === 'NO-GO' ? 1 : 0;
    })
    .catch(() => {
      process.stdout.write(JSON.stringify({ decision: 'NO-GO', reason: 'INVALID_OR_UNAUTHORIZED_PREVIEW_HOST' }) + '\n');
      process.exitCode = 1;
    });
}
