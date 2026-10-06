import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const landsPath = path.join(root, 'lands', 'index.html');
const r3Dir = path.join(root, 'public-r3-assets', 'runtime');
const markerDir = path.join(root, 'vendor', 'leaflet.markercluster', '1.5.3');

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const ensure = (condition, message) => { if (!condition) throw new Error(message); };

function extensionFor(mime) {
  if (/javascript/i.test(mime)) return 'js';
  if (mime === 'image/png') return 'png';
  if (mime === 'font/woff2') return 'woff2';
  throw new Error('Unsupported R3 asset MIME: ' + mime);
}

async function extractR3() {
  const source = await fs.readFile(indexPath, 'utf8');
  if (!source.includes('<script type="__bundler/template">')) {
    ensure(!/__bundler\/|__bundler_|blob:/.test(source), 'index.html is partially cleaned but still contains bundler markers');
    console.log('R3 already static; extraction skipped.');
    return;
  }

  const templateMatch = source.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
  const manifestMatch = source.match(/<script type="__bundler\/manifest">([\s\S]*?)<\/script>/);
  ensure(templateMatch && manifestMatch, 'Approved R3 bundle islands are missing');

  let html = JSON.parse(templateMatch[1]);
  const manifest = JSON.parse(manifestMatch[1]);

  await fs.rm(r3Dir, { recursive: true, force: true });
  await fs.mkdir(r3Dir, { recursive: true });

  let written = 0;
  for (const [id, entry] of Object.entries(manifest)) {
    if (!html.includes(id)) continue;
    let bytes = Buffer.from(entry.data, 'base64');
    if (entry.compressed) bytes = gunzipSync(bytes);
    const ext = extensionFor(entry.mime);
    const fileName = id + '.' + ext;
    const filePath = path.join(r3Dir, fileName);
    await fs.writeFile(filePath, bytes);
    html = html.split(id).join('/public-r3-assets/runtime/' + fileName);
    written += 1;
  }

  html = html.replace(
    'componentDidUpdate(pp, ps) { if (ps.bp !== this.state.bp) { clearTimeout(this._rt); this._rt = setTimeout(() => this._remount(), 30); } }',
    'componentDidUpdate() { if (this._bp !== this.state.bp) { this._bp = this.state.bp; clearTimeout(this._rt); this._rt = setTimeout(() => this._remount(), 30); } }'
  );

  html = html.replace('<html>', '<html lang="ar" dir="rtl">');
  if (!html.includes('<title>SMART HSR — من الميدان إلى القرار</title>')) {
    html = html.replace('<head>', '<head>\n<title>SMART HSR — من الميدان إلى القرار</title>');
  }
  if (!html.includes('/public-enhancements.js')) {
    html = html.replace('</body>', '<script src="/public-enhancements.js"></script>\n</body>');
  }

  ensure(!/__bundler\/|__bundler_|blob:/.test(html), 'Bundler runtime markers remain after extraction');
  ensure(html.includes('data-screen-label="01 Hero"'), 'R3 hero marker missing after extraction');
  ensure(html.includes('data-screen-label="10 Partnership CTA"'), 'R3 CTA marker missing after extraction');
  ensure(html.includes('data-screen-label="11 Footer"'), 'R3 footer marker missing after extraction');
  ensure(written >= 40, 'Unexpectedly low R3 asset count: ' + written);

  await fs.writeFile(indexPath, html, 'utf8');
  console.log('R3 static extraction complete:', written, 'assets;', 'index sha256', sha256(Buffer.from(html)));
}

async function fetchPinned(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error('Failed to fetch pinned asset ' + url + ': ' + response.status);
  return Buffer.from(await response.arrayBuffer());
}

async function localizeGIS() {
  const packageUrl = 'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/package.json';
  const packageBuffer = await fetchPinned(packageUrl);
  const pkg = JSON.parse(packageBuffer.toString('utf8'));
  ensure(pkg.version === '1.5.3', 'MarkerCluster package version mismatch');

  await fs.mkdir(markerDir, { recursive: true });
  const assets = [
    ['dist/leaflet.markercluster.js', 'leaflet.markercluster.js'],
    ['dist/MarkerCluster.css', 'MarkerCluster.css'],
    ['MIT-LICENCE.txt', 'MIT-LICENCE.txt']
  ];

  for (const [remote, local] of assets) {
    const url = 'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/' + remote;
    const bytes = await fetchPinned(url);
    await fs.writeFile(path.join(markerDir, local), bytes);
    console.log('Vendored', local, sha256(bytes));
  }

  let lands = await fs.readFile(landsPath, 'utf8');
  lands = lands
    .replaceAll('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', '/vendor/leaflet/1.9.4/leaflet.css')
    .replaceAll('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', '/vendor/leaflet/1.9.4/leaflet.js')
    .replaceAll('https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css', '/vendor/leaflet.markercluster/1.5.3/MarkerCluster.css')
    .replaceAll('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js', '/vendor/leaflet.markercluster/1.5.3/leaflet.markercluster.js');

  ensure(!/unpkg\.com\/leaflet@1\.9\.4|unpkg\.com\/leaflet\.markercluster@1\.5\.3/.test(lands), 'External Leaflet/MarkerCluster runtime reference remains');
  await fs.writeFile(landsPath, lands, 'utf8');
}

async function updateR3Contract() {
  const testPath = path.join(root, 'test', 'final-public-r3-contract.test.js');
  let test = await fs.readFile(testPath, 'utf8');

  if (test.includes('function bundledTemplate(source)')) {
    test = test.replace(
      /function bundledTemplate\(source\) \{[\s\S]*?\n\}/,
      [
        'function publicR3(source) {',
        "  assert.doesNotMatch(source, /__bundler\\//, 'public R3 must ship as static HTML/assets, not a bundler manifest');",
        "  assert.doesNotMatch(source, /__bundler_/, 'public R3 must not expose bundler runtime markers');",
        "  assert.doesNotMatch(source, /blob:/, 'public R3 must not depend on Blob mounting');",
        "  assert.match(source, /\\/public-r3-assets\\/runtime\\//, 'R3 resources must ship as static local assets');",
        "  assert.match(source, /\\/public-enhancements\\.js/, 'approved public behavior layer must be loaded');",
        '  return source;',
        '}'
      ].join('\n')
    );
    test = test.replaceAll('bundledTemplate(index)', 'publicR3(index)');
  }

  test = test.replace(
    "  assert.match(index, /document\\\\.documentElement\\\\.setAttribute\\\\('lang', 'ar'\\\\)/);\n  assert.match(index, /document\\\\.documentElement\\\\.setAttribute\\\\('dir', 'rtl'\\\\)/);\n  assert.match(index, /SMART HSR — من الميدان إلى القرار/);",
    "  assert.match(index, /<html[^>]*lang=\"ar\"[^>]*dir=\"rtl\"/);\n  assert.match(index, /<title>SMART HSR — من الميدان إلى القرار<\\\\/title>/);"
  );

  ensure(!test.includes('bundledTemplate(index)'), 'Stale bundled R3 test call remains');
  await fs.writeFile(testPath, test, 'utf8');
}

async function writeHygieneContract() {
  const contract = String.raw\`'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Final V5 public landing is static and free of bundler runtime', () => {
  const index = read('index.html');
  assert.doesNotMatch(index, /__bundler\\//);
  assert.doesNotMatch(index, /__bundler_/);
  assert.doesNotMatch(index, /blob:/);
  assert.match(index, /public-r3-assets\\/runtime\\//);
  assert.match(index, /public-enhancements\\.js/);
});

test('Final V5 Lands GIS runtime uses local pinned Leaflet and MarkerCluster assets', () => {
  const lands = read('lands/index.html');
  assert.match(lands, /\\/vendor\\/leaflet\\/1\\.9\\.4\\/leaflet\\.css/);
  assert.match(lands, /\\/vendor\\/leaflet\\/1\\.9\\.4\\/leaflet\\.js/);
  assert.match(lands, /\\/vendor\\/leaflet\\.markercluster\\/1\\.5\\.3\\/MarkerCluster\\.css/);
  assert.match(lands, /\\/vendor\\/leaflet\\.markercluster\\/1\\.5\\.3\\/leaflet\\.markercluster\\.js/);
  assert.doesNotMatch(lands, /unpkg\\.com\\/leaflet@1\\.9\\.4/);
  assert.doesNotMatch(lands, /unpkg\\.com\\/leaflet\\.markercluster@1\\.5\\.3/);
  for (const file of [
    'vendor/leaflet/1.9.4/leaflet.css',
    'vendor/leaflet/1.9.4/leaflet.js',
    'vendor/leaflet.markercluster/1.5.3/MarkerCluster.css',
    'vendor/leaflet.markercluster/1.5.3/leaflet.markercluster.js',
    'vendor/leaflet.markercluster/1.5.3/MIT-LICENCE.txt'
  ]) assert.ok(fs.existsSync(path.join(root, file)), file + ' must exist');
});

test('Final V5 runtime remains pinned to Node 22.x', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.engines && pkg.engines.node, '22.x');
});
\`;
  await fs.writeFile(path.join(root, 'test', 'final-v5-release-hygiene.test.js'), contract, 'utf8');
}

await extractR3();
await localizeGIS();
await updateR3Contract();
await writeHygieneContract();
console.log('FINAL_V5_RELEASE_HYGIENE_COMPLETE');
