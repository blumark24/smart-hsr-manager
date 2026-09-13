'use strict';
// ============================================================================
// PHASE 09 GATE 4 — canonical, deterministic release test command.
//
// `npm test` previously ran the auto-generated placeholder
// ("Error: no test specified" && exit 1) and always failed with zero
// signal. This is the real command: it enumerates every test/*.test.js
// file directly (no shell glob — `test/*.test.js` does not expand the same
// way on Windows cmd.exe as it does on a POSIX shell, and Node's own
// `node --test test/` treats an explicit path as a single file rather than
// triggering directory auto-discovery, while bare `node --test` recurses
// into test/e2e, test/browser, test/fixtures, test/helpers and picks up
// scripts that are not meant to run here), then runs them all inside ONE
// Firestore + Auth emulator session via `firebase emulators:exec` — the
// same self-starting/self-stopping wrapper test/run-firestore-rules.js
// already uses for a single file, generalized to the whole suite. The Auth
// emulator project id must be exactly 'smart-hsr-manager' — matching
// api/_lib/firebaseAdmin.js's default and every test's client SDK config —
// or Auth Emulator sign-in fails with user-not-found even for a real,
// just-created user (Firestore's own singleProjectMode tolerates any id;
// Auth does not).
//
// Known, intentional, pre-existing baseline failures (documented across
// every Phase 08/08.x/09 report in this repo's history — unrelated to Geo
// Core, tracked "RULE GAP" tests that document a real but explicitly
// deferred Rules gap, plus a handful of AI-summary-policy and
// provider-routing tests with their own tracked root causes) are NOT
// silently hidden by this script: it prints the full test output via
// stdio:'inherit' exactly as node:test produces it, and exits with
// node:test's own real exit code. A release engineer runs
// `npm run test:release` and reads the failing test names directly — this
// script only makes that command exist and be portable, it does not
// interpret or filter the result.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const testDir = __dirname;
const projectId = 'smart-hsr-manager';

const testFiles = fs.readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => path.posix.join('test', name));

if (testFiles.length === 0) {
  throw new Error('No test/*.test.js files found — refusing to report a false pass.');
}

const firebaseCli = require.resolve('firebase-tools/lib/bin/firebase');
// --test-concurrency=1: multiple *.rules.test.js files each run their own
// testEnv.clearFirestore() + reseed cycle against the SAME shared Firestore
// emulator instance. Node's default concurrent-file execution lets one
// file's clearFirestore() run mid-read of another file's test, producing
// non-deterministic "permission-denied"/data-not-found failures that
// differ on every run (verified directly: re-running the same file set
// concurrently failed 5 different, unrelated tests each time). Forcing
// sequential file execution is the correct fix — this is a real shared-
// resource ordering hazard, not any individual test's logic being wrong.
const nodeTestCommand = `node --test --test-concurrency=1 ${testFiles.join(' ')}`;

const result = spawnSync(process.execPath, [
  firebaseCli,
  'emulators:exec',
  '--project', projectId,
  '--only', 'firestore,auth',
  nodeTestCommand,
], {
  cwd: root,
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
