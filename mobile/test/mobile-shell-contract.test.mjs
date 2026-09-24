import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(here, '..');
const repoRoot = path.resolve(mobileRoot, '..');

const config = fs.readFileSync(path.join(mobileRoot, 'capacitor.config.ts'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'package.json'), 'utf8'));
const bundleScript = fs.readFileSync(path.join(mobileRoot, 'scripts', 'build-web-bundle.mjs'), 'utf8');
const runtimeOrigin = fs.readFileSync(path.join(repoRoot, 'mobile-runtime-origin.js'), 'utf8');
const firebaseRuntime = fs.readFileSync(path.join(repoRoot, 'firebase-runtime-config.js'), 'utf8');

test('mobile shell keeps a stable SMART HSR app identity', () => {
  assert.match(config, /appId: 'com\.blumark24\.smarthsr'/);
  assert.match(config, /appName: 'SMART HSR'/);
  assert.match(config, /webDir: 'www'/);
  assert.equal(pkg.engines.node, '>=22');
});

test('native app uses a local packaged web bundle, never a remote server WebView', () => {
  assert.doesNotMatch(config, /server:\s*\{/);
  assert.doesNotMatch(config, /SMART_HSR_MOBILE_SERVER_URL/);
  assert.match(pkg.scripts['bundle:web'], /build-web-bundle\.mjs/);
  assert.match(bundleScript, /inspector-v2\.html/);
  assert.match(bundleScript, /dashboard\.html/);
});

test('operational Mobile RC requires an explicit HTTPS staging API origin and denies Production', () => {
  assert.match(bundleScript, /SMART_HSR_MOBILE_API_ORIGIN/);
  assert.match(bundleScript, /url\.protocol !== 'https:'/);
  assert.match(bundleScript, /Production origin is forbidden for Mobile RC/);
  assert.match(runtimeOrigin, /MOBILE_STAGING_ORIGIN_REQUIRED/);
  assert.match(runtimeOrigin, /MOBILE_PRODUCTION_ORIGIN_DENIED/);
  assert.match(runtimeOrigin, /smart-hsr-manager\.vercel\.app/);
});

test('missing staging origin fails closed instead of opening operational data', () => {
  assert.match(bundleScript, /const index = apiOrigin/);
  assert.match(bundleScript, /متوقف عمدًا/);
  assert.match(bundleScript, /Production/);
  assert.match(bundleScript, /location\.replace\('login\.html'\)/);
  assert.match(bundleScript, /Fail-closed bundle ready \(no staging origin\)/);
});

test('native Firebase resolution is staging-only and cannot fall back to Production', () => {
  assert.match(firebaseRuntime, /isNativeMobileRuntime\(\)/);
  assert.match(firebaseRuntime, /resolveApiInput\('\/api\/firebase-config'\)/);
  assert.match(firebaseRuntime, /smart-hsr-staging-blumark24/);
  assert.match(firebaseRuntime, /FIREBASE_MOBILE_PROJECT_DENIED/);
});

test('native capabilities are declared for controlled wiring', () => {
  for (const dep of [
    '@capacitor/app',
    '@capacitor/camera',
    '@capacitor/geolocation',
    '@capacitor/network',
    '@capacitor/splash-screen',
    '@capacitor/status-bar'
  ]) assert.ok(pkg.dependencies[dep], dep);
});
