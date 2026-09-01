'use strict';
// Brings up (or reuses) the Firebase emulators + static file server this
// E2E suite needs, then seeds the Mayor-demo accounts into them. Every
// process this starts is local-only (127.0.0.1) and torn down at the end
// of the run; nothing here ever touches real Firebase or production data.

const net = require('net');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const AUTH_PORT = 9099;
const FIRESTORE_PORT = 8080;
const SERVER_PORT = 5000;
const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.setTimeout(500, () => { socket.destroy(); resolve(false); });
  });
}

async function waitForPort(port, { timeoutMs = 60000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for port ${port} to open`);
}

async function startHarness() {
  const started = { emulators: false, server: false };
  const children = [];

  if (!(await isPortOpen(AUTH_PORT)) || !(await isPortOpen(FIRESTORE_PORT))) {
    const emu = spawn('node', [
      path.join(ROOT, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js'),
      'emulators:start', '--project', 'smart-hsr-manager', '--only', 'auth,firestore',
    ], { cwd: ROOT, stdio: 'ignore' });
    children.push(emu);
    started.emulators = true;
    await waitForPort(AUTH_PORT);
    await waitForPort(FIRESTORE_PORT);
  }

  if (!(await isPortOpen(SERVER_PORT))) {
    const srv = spawn('python3', ['server.py'], { cwd: ROOT, stdio: 'ignore' });
    children.push(srv);
    started.server = true;
    await waitForPort(SERVER_PORT);
  }

  const seedEnv = {
    ...process.env,
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${FIRESTORE_PORT}`,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${AUTH_PORT}`,
  };
  const seedOutput = execFileSync(process.execPath, [path.join(__dirname, '..', 'seed-mayor-scenario.js')], {
    cwd: ROOT, env: seedEnv, encoding: 'utf8',
  });
  const seed = JSON.parse(seedOutput);

  return {
    baseUrl: BASE_URL,
    seed,
    async stop() {
      for (const child of children) {
        try { child.kill('SIGTERM'); } catch (_e) { /* already gone */ }
      }
    },
  };
}

module.exports = { startHarness, BASE_URL, AUTH_PORT, FIRESTORE_PORT, SERVER_PORT };
