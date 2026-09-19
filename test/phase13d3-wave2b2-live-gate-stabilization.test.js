'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');
const format = fs.readFileSync(path.join(root, 'manager-dashboard-format.js'), 'utf8');
const operationalMap = fs.readFileSync(path.join(root, 'operational-map.html'), 'utf8');

function block(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `${startMarker} not found`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `${endMarker} not found after ${startMarker}`);
  return source.slice(start, end);
}

test('Home quick actions use the existing delegated SPA contract, including the exact User Center label', () => {
  const template = block(manager, '<sc-for list="{{ quickActions }}"', '</sc-for>');
  const model = block(manager, 'quickActions: [', '],\n      // WAVE 2B');
  assert.match(template, /data-manager-view="\{\{ q\.view \}\}"/);
  assert.doesNotMatch(template, /q\.on/);
  assert.match(model, /label: 'مركز إدارة المستخدمين', view: 'users'/);
  assert.doesNotMatch(model, /on:\s*\(\)/);
});

test('desktop, mobile, and quick-action routes have one delegated event owner and one React bridge', () => {
  const guard = block(format, 'const installManagerNavigationGuard', 'installManagerNavigationGuard();');
  const bridge = block(manager, 'this.onNavigateRequest = e => {', "window.addEventListener('smart-hsr:navigate-request'");
  const mobile = block(manager, 'mobNav: [', '].map(item =>');
  assert.equal((guard.match(/document\.addEventListener\('click'/g) || []).length, 1);
  assert.equal((guard.match(/window\.dispatchEvent\(new CustomEvent\('smart-hsr:navigate-request'/g) || []).length, 1);
  assert.match(guard, /const view = target\?\.dataset\.managerView;\s*if \(!view\) return;/);
  assert.doesNotMatch(mobile, /on:\s*\(\) => this\.(?:goHome|goRoute|goLandsGateway|openView|openMap)/);
  for (const route of ['home', 'survey', 'lands', 'mobility', 'map', 'reports', 'observations', 'users', 'incidents']) {
    assert.match(bridge, new RegExp(`${route}: \\(\\) =>`), `missing bridge for ${route}`);
  }
});

test('Reports/Observations overlay stays below persistent navigation so the next route click is reachable', () => {
  assert.match(manager, /<header style="[^"]*z-index:60;/);
  assert.match(manager, /<aside style="[^"]*z-index:55;/);
  assert.match(manager, /class="manager-view-overlay"[^>]*z-index:54;/);
  assert.match(manager, /<sc-if value="\{\{ mobNavOpen \}\}">\s*<div onClick="\{\{ tMobNav \}\}" style="[^"]*z-index:70;/);
});

test('responsive aria-current ownership transfers atomically to the visible drawer', () => {
  assert.match(manager, /const mobileNavigationAuthoritative = \(st\.bp === 'tab' \|\| st\.bp === 'mob'\) && st\.mobNavOpen;/);
  assert.equal((manager.match(/navPrefixed\('nav\w+', !mobileNavigationAuthoritative && st\.view ===/g) || []).length, 8);
  const mobile = block(manager, 'mobNav: [', '].map(item =>');
  assert.equal((mobile.match(/navLook\(mobileNavigationAuthoritative && st\.view ===/g) || []).length, 9);
  assert.match(manager, /data-manager-view="\{\{ i\.view \}\}"[^>]*aria-current="\{\{ i\.current \}\}"/);
});

test('Manager SPA route methods do not perform full-page navigation', () => {
  const methods = block(manager, 'goHome(e) {', '// Field Survey never uses');
  assert.doesNotMatch(methods, /window\.location|location\.assign|location\.href/);
});

test('Operational Map reuses the named Manager Auth app and keeps authorization redirects/checks intact', () => {
  assert.match(operationalMap, /initializeApp\(firebaseConfig, 'smart-hsr-manager-session'\)/);
  assert.match(operationalMap, /const auth = getAuth\(app\);/);
  assert.match(operationalMap, /onAuthStateChanged\(auth, async \(user\) => \{/);
  assert.match(operationalMap, /if \(!user\) \{ location\.href = 'manager-login\.html'; return; \}/);
  assert.match(operationalMap, /caller = await resolveCallerRole\(user\.uid\);/);
  assert.match(operationalMap, /if \(!caller\) \{ await signOut\(auth\); location\.href = 'manager-login\.html'; return; \}/);
});
