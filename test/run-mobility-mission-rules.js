'use strict';

const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const firebaseCli = require.resolve('firebase-tools/lib/bin/firebase');
const projectId = 'demo-smart-hsr-mobility-tests';

if (!projectId.startsWith('demo-')) {
  throw new Error('Firestore rules tests require a demo- project ID.');
}

const result = spawnSync(process.execPath, [
  firebaseCli,
  'emulators:exec',
  '--project', projectId,
  '--only', 'firestore',
  'node --test test/mobility-mission-rules.test.js',
], {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    CI: 'true',
    FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true',
    XDG_CONFIG_HOME: path.join(os.tmpdir(), 'smart-hsr-firebase-test-config'),
  },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
