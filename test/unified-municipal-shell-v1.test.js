'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'smart-hsr-unified-shell.css'), 'utf8');
const switcher = fs.readFileSync(path.join(root, 'service-switcher.js'), 'utf8');

test('Mobility uses SMART HSR Unified Municipal Shell v1', () => {
  assert.match(page, /class="dh-app smart-hsr-shell-v1"/);
  assert.match(page, /smart-hsr-unified-shell\.css/);
  assert.match(page, /SMART HSR VERIFIED IDENTITY/);
  assert.match(page, /data-smart-hsr-workspace-trigger/);
  assert.match(page, /Municipal Operations System · Connected/);
});

test('Unified identity menu carries institutional context and logout', () => {
  assert.match(page, /\{\{ orgName \}\}/);
  assert.match(page, /\{\{ sessionName \}\}/);
  assert.match(page, /\{\{ identityRole \}\}/);
  assert.match(page, /ملفي التعريفي/);
  assert.match(page, /مساحة العمل/);
  assert.match(page, /التفضيلات/);
  assert.match(page, /onClick="\{\{ logout \}\}"/);
});

test('Legacy active-product sidebar card is removed from mobility shell', () => {
  assert.doesNotMatch(page, />المنتج النشط<\/div>/);
  assert.match(page, /hsr-platform-footer/);
});

test('Workspace switcher integrates into shell and falls back for legacy pages', () => {
  assert.match(switcher, /querySelector\('\[data-smart-hsr-workspace-trigger\]'\)/);
  assert.match(switcher, /workspaces\.length < 2/);
  assert.match(switcher, /location\.href = 'workspace\.html'/);
  assert.match(switcher, /smart-hsr-service-switcher/);
});

test('Unified shell CSS defines header, identity, sidebar and platform footer surfaces', () => {
  assert.match(css, /\.hsr-identity-card/);
  assert.match(css, /\.hsr-identity-menu/);
  assert.match(css, /\.dh-sidebar-panel/);
  assert.match(css, /\.hsr-platform-footer/);
  assert.match(css, /prefers-reduced-motion/);
});


test('Header is locked to Lands-style three-zone system geometry', () => {
  assert.match(page, /hsr-shell-brand-zone/);
  assert.match(page, /hsr-shell-center-zone/);
  assert.match(page, /hsr-shell-identity-zone/);
  assert.match(page, /smart-hsr-mark\.svg/);
  assert.match(css, /grid-template-areas:"brand center identity"/);
  assert.match(css, /z-index:1600!important/);
  assert.match(css, /overflow:visible!important/);
});

test('Right rail is a solid manager-like system rail, not a translucent overlay', () => {
  assert.match(page, /hsr-side-identity/);
  assert.match(page, /hsr-nav-icon/);
  assert.match(css, /--hsr-shell-rail-day/);
  assert.match(css, /position:sticky!important/);
  assert.match(css, /height:calc\(100vh - 106px\)!important/);
  assert.match(css, /background:var\(--hsr-shell-rail-day\)!important/);
});

test('Open surfaces have an explicit layer hierarchy above maps and cards', () => {
  assert.match(css, /\.dh-smart-modal-scrim\{z-index:2400!important\}/);
  assert.match(css, /\.dh-evidence-lightbox\{z-index:2500!important\}/);
  assert.match(css, /\.hsr-identity-menu[\s\S]*z-index:1900!important/);
  assert.match(css, /\.dh-map-frame\{isolation:isolate!important;z-index:1!important\}/);
});


test('Crisp brand lockup uses vector mark and rendered SMART HSR wordmark', () => {
  assert.match(page, /hsr-shell-wordmark/);
  assert.match(page, /smart-hsr-mark\.svg/);
  assert.match(css, /\.hsr-shell-wordmark-name/);
  assert.match(css, /\.hsr-platform-footer-copy/);
  assert.doesNotMatch(page, /hsr-shell-brand-logo" src="\/smart-hsr-signature-transparent\.png"/);
});
