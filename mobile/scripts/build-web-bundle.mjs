import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(here, '..');
const repoRoot = path.resolve(mobileRoot, '..');
const out = path.join(mobileRoot, 'www');

const productionHosts = new Set([
  'smart-hsr-manager.vercel.app',
  'smart-hsr-manager-blumark24-os.vercel.app'
]);

function validateOrigin(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SMART_HSR_MOBILE_API_ORIGIN must be an HTTPS origin only.');
  }
  if (productionHosts.has(url.hostname)) throw new Error('Production origin is forbidden for Mobile RC.');
  return url.origin;
}

const apiOrigin = validateOrigin(process.env.SMART_HSR_MOBILE_API_ORIGIN);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const files = [
  'inspector-v2.html',
  'inspector-v2.css',
  'inspector-v2.js',
  'inspector-v2-runtime.js',
  'inspector-v2-native-bridge.js',
  'inspector-v2.webmanifest',
  'dashboard.html',
  'firebase-runtime-config.js',
  'firebase-auth-fetch.js',
  'mobile-runtime-origin.js',
  'storage-adapter.js',
  'spatial-map.js',
  'output.css',
  'modal-style.css',
  'style-custom.css',
  'modal-script.js',
  'favicon.svg',
  'favicon.ico',
  'preview-only/inspector-human-review-preview.js'
];

for (const relative of files) {
  const source = path.join(repoRoot, relative);
  if (!fs.existsSync(source)) throw new Error(`Missing mobile bundle dependency: ${relative}`);
  const target = path.join(out, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

fs.copyFileSync(path.join(mobileRoot, 'src', 'login.html'), path.join(out, 'login.html'));

const runtime = Object.freeze({
  mode: 'native',
  apiOrigin
});
fs.writeFileSync(
  path.join(out, 'mobile-runtime-env.js'),
  `globalThis.SmartHsrMobileRuntime = Object.freeze(${JSON.stringify(runtime)});\n`
);

const index = apiOrigin
  ? `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><script src="mobile-runtime-env.js"><\/script><script>location.replace('login.html')<\/script>`
  : `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#04162f"><title>SMART HSR Mobile</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:#04162f;color:#fff;font-family:system-ui}main{max-width:420px;text-align:center;border:1px solid #24558b;border-radius:24px;padding:28px;background:#071f42}p{color:#a9bdd4;line-height:1.7}</style><main><h2>SMART HSR Mobile RC</h2><p>لم يتم تحديد Staging API Origin لهذا البناء. التطبيق متوقف عمدًا ولا يتصل بـProduction.</p></main></html>`;

fs.writeFileSync(path.join(out, 'index.html'), index);
console.log(apiOrigin ? `Operational bundle ready for ${apiOrigin}` : 'Fail-closed bundle ready (no staging origin).');
