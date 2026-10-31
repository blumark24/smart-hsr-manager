'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluatePreview, validatePreviewUrl } = require('../scripts/preview-lands-sso-live-preflight.cjs');
const host = 'https://smart-hsr-manager-k2e5jx9cw-blumark24-os.vercel.app';
function fakeFetch({ ready = false, broken = false } = {}) {
  const received = [];
  const fetcher = async (url, options) => {
    received.push({ url, options });
    if (broken) throw new Error('SYNTHETIC_SECRET_SHOULD_NOT_LEAK');
    let status, data;
    if (url.includes('previewGate=lands-sso')) {
      status = ready ? 200 : 503;
      data = { service: 'lands-sso', ready, checks: {
        preview: true, webStaging: true, adminStaging: true, embedded: ready
      }};
    } else if (url.endsWith('/api/lands-health')) {
      status = 200; data = { service: 'smart-hsr-lands-embedded', status: 'ok' };
    } else if (url.endsWith('/api/lands-membership-status')) {
      status = ready ? 401 : 503;
      data = { error: ready ? 'unauthenticated' : 'staging_lands_sso_gate_not_ready' };
    } else {
      status = 401; data = { error: 'unauthenticated' };
    }
    return { status, async json() { return data; } };
  };
  return { received, fetcher };
}
test('strictly rejects Production, custom hosts, insecure or credentialed URLs', () => {
  assert.equal(validatePreviewUrl(host), host);
  const bad = [
    'https://smart.blumark24.com', 'http://smart-hsr-manager-k2e5jx9cw-blumark24-os.vercel.app',
    'https://smart-hsr-manager-k2e5jx9cw-blumark24-os.vercel.app@evil.test',
    'https://smart-hsr-manager-k2e5jx9cw-blumark24-os.vercel.app/lands/',
    'https://smart-hsr-manager-k2e5jx9cw-blumark24-os.vercel.app/?token=abc',
    'https://evil-smart-hsr-manager-k2e5jx9cw-blumark24-os.vercel.app',
    'invalid'
  ];
  for (const input of bad) assert.throws(() => validatePreviewUrl(input), /PREVIEW_/);
});
test('latest Preview-like response is NO-GO with embedded=false and 503 protected route', async () => {
  const f = fakeFetch();
  const result = await evaluatePreview(host, f.fetcher);
  assert.equal(result.decision, 'NO-GO');
  assert.equal(result.checks.health, true);
  assert.equal(result.checks.anonymousDenied, true);
  assert.equal(result.checks.previewGateStaging, true);
  assert.equal(result.checks.embeddedEnabled, false);
  assert.equal(result.checks.protectedGateFailClosed, true);
  assert.equal(result.authenticatedUatVerified, false);
  assert.equal(result.productionAuthorized, false);
  assert.deepEqual(result.http, { config:503, health:200, anonymous:401, membership:503 });
});
test('older approved Preview-like preflight still never claims UAT or Production GO', async () => {
  const f = fakeFetch({ ready:true });
  const result = await evaluatePreview(host, f.fetcher);
  assert.equal(result.decision, 'PREVIEW-PREFLIGHT-PASS-AUTH-UAT-STILL-REQUIRED');
  assert.equal(result.checks.ssoPreflightReady, true);
  assert.equal(result.productionAuthorized, false);
  assert.equal(result.authenticatedUatVerified, false);
  assert.equal(f.received.length, 4);
  for(const call of f.received) {
    assert.equal(call.options.method,'GET');
    assert.equal(call.options.redirect,'manual');
    assert.equal(call.options.headers.authorization, undefined);
    assert.equal(call.options.headers.cookie, undefined);
  }
});
test('provider exception or forbidden response produces NO-GO without secret disclosure', async () => {
  const f = fakeFetch({ broken:true });
  const result = await evaluatePreview(host,f.fetcher);
  assert.equal(result.decision, 'NO-GO');
  assert.doesNotMatch(JSON.stringify(result), /SECRET|token|password|credentials/i);
  assert.equal(result.http.config, 0);
  const restricted = async () => ({ status: 401, async json(){ return {error:'VERCEL_AUTH_REQUIRED', secret:'DO-NOT-PRINT'}; }});
  const q = await evaluatePreview(host, restricted);
  assert.equal(q.decision,'NO-GO');
  assert.doesNotMatch(JSON.stringify(q), /DO-NOT-PRINT|VERCEL_AUTH_REQUIRED/i);
});
test('wrong service identity or non-denying anonymous endpoint cannot pass', async () => {
  const {fetcher}=fakeFetch({ready:true});
  const compromised=async (url,options)=>{
    const res=await fetcher(url,options);
    if(url.endsWith('/api/organization/context')) return {status:200,async json(){return {service:'unapproved'}}};
    return res;
  };
  const result=await evaluatePreview(host, compromised);
  assert.equal(result.decision,'NO-GO');
  assert.equal(result.checks.anonymousDenied,false);
});
