import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/mobile-operational-rc.yml'), 'utf8');

test('operational RC proves the supplied origin is live Staging before native builds', () => {
  assert.match(workflow, /\/api\/firebase-config/);
  assert.match(workflow, /smart-hsr-staging-blumark24/);
  assert.match(workflow, /Origin: 'capacitor:\/\/localhost'/);
  assert.match(workflow, /access-control-allow-origin/);
  assert.match(workflow, /redirect: 'manual'/);
  assert.match(workflow, /response\.status !== 200/);
});

test('operational RC still rejects known Production hosts and requires HTTPS origin-only input', () => {
  assert.match(workflow, /smart-hsr-manager\.vercel\.app/);
  assert.match(workflow, /smart-hsr-manager-blumark24-os\.vercel\.app/);
  assert.match(workflow, /url\.protocol !== 'https:'/);
  assert.match(workflow, /url\.pathname !== '\/'/);
});


test('staging-connected RC is pinned to the isolated SMART HSR staging origin and auto-runs only on phase15 branch', () => {
  assert.match(workflow, /phase15-mobile-shell/);
  assert.match(workflow, /https:\/\/smart-hsr-staging-api-blumark24-os\.vercel\.app/);
  assert.match(workflow, /SMART_HSR_STAGING_API_ORIGIN/);
  assert.doesNotMatch(workflow, /smart-hsr-manager\.vercel\.app[^'\n]*SMART_HSR_STAGING_API_ORIGIN/);
});

test('staging-connected artifact is explicitly not named as a full operational acceptance artifact', () => {
  assert.match(workflow, /smart-hsr-staging-connected-rc-android/);
});
