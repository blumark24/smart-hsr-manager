'use strict';
// PHASE 09 GATE 4 — canonical Geo Core test command (npm run test:geo).
// Same self-contained emulator-wrapping pattern as run-release-suite.js,
// scoped to the Geo Core / Twin / Operational Map surface.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const testDir = __dirname;
const projectId = 'smart-hsr-manager';

const testFiles = fs.readdirSync(testDir)
  .filter((name) => name.startsWith('geo-') && name.endsWith('.test.js'))
  .sort()
  .map((name) => path.posix.join('test', name));
testFiles.push('test/operational-map-open-twin-button.test.js');

if (testFiles.length === 0) {
  throw new Error('No test/geo-*.test.js files found — refusing to report a false pass.');
}

const firebaseCli = require.resolve('firebase-tools/lib/bin/firebase');
const result = spawnSync(process.execPath, [
  firebaseCli, 'emulators:exec', '--project', projectId, '--only', 'firestore,auth',
  `node --test --test-concurrency=1 ${testFiles.join(' ')}`,
], {
  cwd: root,
  env: { ...process.env, CI: 'true', FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true', XDG_CONFIG_HOME: path.join(os.tmpdir(), 'smart-hsr-firebase-test-config') },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
