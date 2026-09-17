'use strict';
// Builds the already-installed `firebase` npm package into browser-ready ES
// modules, then serves them to a Playwright page in place of the
// https://www.gstatic.com/firebasejs/* CDN URLs the app imports directly.
//
// This exists only because this sandbox's network egress policy denies
// www.gstatic.com outright (403, verified independently of DNS/proxy
// config) — a policy this harness must not and does not try to route
// around. The browser never contacts that host: every request to it is
// intercepted and answered from a local bundle instead, built from the
// same npm firebase package the rest of the repo already depends on.
//
// --splitting is required: bundling each of the 3 CDN files as a fully
// separate esbuild entry (without it) would give each one its own copy of
// Firebase's internal module-level app registry, so getAuth(app) in one
// file would not recognize an app created via initializeApp() in another.

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT_DIR = path.join(__dirname, '..', '.generated', 'firebase-bundles');

const ENTRIES = [
  { name: 'firebase-app', modulePath: 'firebase/app/dist/esm/index.esm.js' },
  { name: 'firebase-auth', modulePath: 'firebase/auth/dist/esm/index.esm.js' },
  { name: 'firebase-firestore', modulePath: 'firebase/firestore/dist/esm/index.esm.js' },
];

async function buildFirebaseBundles() {
  if (fs.existsSync(path.join(OUT_DIR, 'firebase-app.js'))
    && fs.existsSync(path.join(OUT_DIR, 'firebase-auth.js'))
    && fs.existsSync(path.join(OUT_DIR, 'firebase-firestore.js'))) {
    return OUT_DIR;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const entryDir = path.join(OUT_DIR, '_entries');
  fs.mkdirSync(entryDir, { recursive: true });
  const entryPoints = ENTRIES.map(({ name, modulePath }) => {
    const absTarget = path.join(ROOT, 'node_modules', modulePath);
    if (!fs.existsSync(absTarget)) {
      throw new Error(`Cannot build Firebase mock bundle: ${absTarget} not found. Run npm install first.`);
    }
    const entryFile = path.join(entryDir, `${name}.js`);
    fs.writeFileSync(entryFile, `export * from ${JSON.stringify(absTarget)};\n`);
    return entryFile;
  });

  await esbuild.build({
    entryPoints,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    outdir: OUT_DIR,
    entryNames: '[name]',
    logLevel: 'warning',
  });

  return OUT_DIR;
}

// Installs a page.route() interceptor that answers any request under
// https://www.gstatic.com/firebasejs/**/<file> with the locally bundled
// equivalent, matched purely by filename (e.g. "firebase-auth.js"). The
// version segment in the URL is ignored; the app's own import URLs are
// never modified.
async function installFbMock(page, bundleDir) {
  const dir = bundleDir || (await buildFirebaseBundles());
  await page.route('https://www.gstatic.com/firebasejs/**', async (route) => {
    const url = new URL(route.request().url());
    const filename = path.basename(url.pathname).replace(/\.js$/, '');
    const localFile = path.join(dir, `${filename}.js`);
    if (!fs.existsSync(localFile)) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: fs.readFileSync(localFile),
    });
  });
  return dir;
}

module.exports = { buildFirebaseBundles, installFbMock, OUT_DIR };
