import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const config = fs.readFileSync(path.join(root, 'capacitor.config.ts'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const fallback = fs.readFileSync(path.join(root, 'www', 'index.html'), 'utf8');

test('mobile shell keeps a stable SMART HSR app identity', () => {
  assert.match(config, /appId: 'com\.blumark24\.smarthsr'/);
  assert.match(config, /appName: 'SMART HSR'/);
  assert.equal(pkg.engines.node, '>=22');
});

test('preview bridge is explicit, HTTPS-only, and never hardcodes Production', () => {
  assert.match(config, /SMART_HSR_MOBILE_SERVER_URL/);
  assert.match(config, /startsWith\('https:\/\/'\)/);
  assert.doesNotMatch(config, /smart-hsr-manager\.vercel\.app/);
  assert.doesNotMatch(config, /firebaseapp\.com/);
});

test('missing preview bridge fails closed instead of opening operational data', () => {
  assert.match(fallback, /يتوقف التطبيق هنا عمدًا/);
  assert.match(fallback, /Production/);
});

test('native capabilities are declared for later controlled wiring', () => {
  for (const dep of [
    '@capacitor/app',
    '@capacitor/camera',
    '@capacitor/geolocation',
    '@capacitor/network',
    '@capacitor/splash-screen',
    '@capacitor/status-bar'
  ]) assert.ok(pkg.dependencies[dep], dep);
});
