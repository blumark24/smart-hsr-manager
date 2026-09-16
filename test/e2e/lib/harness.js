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

function captureChild(child) {
  let output = '';
  const append = (chunk) => {
    output += String(chunk || '');
    if (output.length > 12000) output = output.slice(-12000);
  };
  if (child.stdout) child.stdout.on('data', append);
  if (child.stderr) child.stderr.on('data', append);
  return () => output.trim();
}

function stopChildTree(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      child.kill('SIGTERM');
    }
  } catch (_e) {
    try { child.kill('SIGTERM'); } catch (_ignored) { /* already gone */ }
  }
}

async function waitForPortOrExit(port, child, getOutput, label) {
  let exited = false;
  let exitCode = null;
  let exitSignal = null;
  child.once('exit', (code, signal) => {
    exited = true;
    exitCode = code;
    exitSignal = signal;
  });

  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true;
    if (exited) {
      const logs = getOutput();
      throw new Error(`${label} exited before port ${port} opened (code=${exitCode}, signal=${exitSignal || 'none'}).${logs ? `\n--- ${label} output ---\n${logs}` : ''}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const logs = getOutput();
  throw new Error(`Timed out waiting for port ${port} to open.${logs ? `\n--- ${label} output ---\n${logs}` : ''}`);
}

async function stopChildren(children) {
  for (const child of children.slice().reverse()) stopChildTree(child);
}

async function startHarness() {
  const started = { emulators: false, server: false };
  const children = [];

  try {
    if (!(await isPortOpen(AUTH_PORT)) || !(await isPortOpen(FIRESTORE_PORT))) {
      const emu = spawn(process.execPath, [
        path.join(ROOT, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js'),
        'emulators:start', '--project', 'smart-hsr-manager', '--only', 'auth,firestore',
      ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      const getEmulatorOutput = captureChild(emu);
      children.push(emu);
      started.emulators = true;
      await waitForPortOrExit(AUTH_PORT, emu, getEmulatorOutput, 'Firebase emulators');
      await waitForPortOrExit(FIRESTORE_PORT, emu, getEmulatorOutput, 'Firebase emulators');
    }

    if (!(await isPortOpen(SERVER_PORT))) {
      const srv = spawn(process.execPath, [path.join(__dirname, 'static-server.js')], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, SMART_HSR_STATIC_PORT: String(SERVER_PORT) },
      });
      const getServerOutput = captureChild(srv);
      children.push(srv);
      started.server = true;
      await waitForPortOrExit(SERVER_PORT, srv, getServerOutput, 'SMART HSR static test server');
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
      started,
      async stop() {
        await stopChildren(children);
      },
    };
  } catch (error) {
    await stopChildren(children);
    throw error;
  }
}

module.exports = { startHarness, BASE_URL, AUTH_PORT, FIRESTORE_PORT, SERVER_PORT };
