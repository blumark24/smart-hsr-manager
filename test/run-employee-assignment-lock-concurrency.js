'use strict';
// FINAL HARDENING ADDENDUM — self-hosting wrapper for the real Firestore
// Emulator concurrency gate, matching the existing test/run-firestore-rules.js
// convention. Spins up its own Firestore emulator instance and runs the
// concurrency test inside it.
//
// If a Firestore Emulator is already running and reachable (e.g. FIRESTORE_
// EMULATOR_HOST already set in the environment), run the test file directly
// instead: node --test test/employee-assignment-lock-concurrency.test.js

const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const firebaseCli = require.resolve('firebase-tools/lib/bin/firebase');
const projectId = 'demo-smart-hsr-lock-tests';

if (!projectId.startsWith('demo-')) {
  throw new Error('Firestore emulator tests require a demo- project ID.');
}

const result = spawnSync(process.execPath, [
  firebaseCli,
  'emulators:exec',
  '--project', projectId,
  '--only', 'firestore',
  'node --test test/employee-assignment-lock-concurrency.test.js',
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
