'use strict';

const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const firebaseCli = require.resolve('firebase-tools/lib/bin/firebase');
const projectId = 'demo-smart-hsr-tests';

if (!projectId.startsWith('demo-')) {
  throw new Error('Phase 1B requires a demo- project ID.');
}

const result = spawnSync(process.execPath, [
  firebaseCli,
  'emulators:exec',
  '--project', projectId,
  '--only', 'firestore',
  'node --test test/phase1b-firestore-rules.test.js',
], {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    CI: 'true',
    FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true',
    XDG_CONFIG_HOME: path.join(os.tmpdir(), 'smart-hsr-phase1b-firebase-config'),
  },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
