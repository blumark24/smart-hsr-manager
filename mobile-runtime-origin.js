const PROD_HOSTS = new Set([
  'smart-hsr-manager.vercel.app',
  'smart-hsr-manager-blumark24-os.vercel.app'
]);

function runtimeRecord() {
  return globalThis.SmartHsrMobileRuntime && typeof globalThis.SmartHsrMobileRuntime === 'object'
    ? globalThis.SmartHsrMobileRuntime
    : null;
}

export function isNativeMobileRuntime() {
  const record = runtimeRecord();
  return record?.mode === 'native';
}

export function getApprovedMobileApiOrigin() {
  if (!isNativeMobileRuntime()) return null;
  const raw = String(runtimeRecord()?.apiOrigin || '').trim();
  if (!raw) throw new Error('MOBILE_STAGING_ORIGIN_REQUIRED');

  let url;
  try { url = new URL(raw); }
  catch (_) { throw new Error('MOBILE_STAGING_ORIGIN_INVALID'); }

  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('MOBILE_STAGING_ORIGIN_INVALID');
  }
  if (PROD_HOSTS.has(url.hostname)) throw new Error('MOBILE_PRODUCTION_ORIGIN_DENIED');
  return url.origin;
}

export function resolveApiInput(input) {
  if (!isNativeMobileRuntime()) return input;
  if (typeof input !== 'string' || !input.startsWith('/api/')) return input;
  return new URL(input, getApprovedMobileApiOrigin()).href;
}

export function mobileExpectedFirebaseProjectId() {
  return isNativeMobileRuntime() ? 'smart-hsr-staging-blumark24' : null;
}
