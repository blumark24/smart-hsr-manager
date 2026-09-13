'use strict';
// PHASE 09 GATE 4 — canonical security/Rules/tenant-isolation test command
// (npm run test:security). Same self-contained emulator-wrapping pattern
// as run-release-suite.js, scoped to Rules, tenant isolation, and
// negative-security test files (matched by filename convention — every
// file below already carries "rules"/"security"/"isolation" in its own
// name, the same convention this suite already used before this script
// existed).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const testDir = __dirname;
const projectId = 'smart-hsr-manager';
const NAME_PATTERN = /rules|security|isolation/i;

const testFiles = fs.readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js') && NAME_PATTERN.test(name))
  .sort()
  .map((name) => path.posix.join('test', name));
testFiles.push('test/contractor-observation-update-endpoint.test.js', 'test/geo-organization-context-authorization.test.js');

if (testFiles.length === 0) {
  throw new Error('No matching security/Rules test files found — refusing to report a false pass.');
}

const firebaseCli = require.resolve('firebase-tools/lib/bin/firebase');
const uniqueFiles = [...new Set(testFiles)];
const result = spawnSync(process.execPath, [
  firebaseCli, 'emulators:exec', '--project', projectId, '--only', 'firestore,auth',
  `node --test --test-concurrency=1 ${uniqueFiles.join(' ')}`,
], {
  cwd: root,
  env: { ...process.env, CI: 'true', FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true', XDG_CONFIG_HOME: path.join(os.tmpdir(), 'smart-hsr-firebase-test-config') },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
