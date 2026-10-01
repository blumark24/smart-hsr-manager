'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const gateway = read('Home.html');
const workforce = read('login.html');
const leadership = read('manager-login.html');
const css = read('cloud-access-r2.css');
const mount = read('cloud-twin-mount.js');

test('Gateway matches approved Cloud Design 3a / 3d / 3g compositions', () => {
  assert.match(gateway, /data-screen-label="3a Desktop Gateway · 3d iPad Gateway · 3g Mobile Gateway"/);
  assert.match(gateway, /UNIFIED ACCESS GATEWAY/);
  assert.match(gateway, /بوابة الدخول<br class="br-m"> الموحّدة/);
  assert.match(gateway, /01 · LEADERSHIP/);
  assert.match(gateway, /02 · WORKSPACE/);
  assert.match(gateway, /بوابة الموظفين والمستخدمين/);
  assert.match(gateway, /gateway-mobile-en">EN</);
  assert.match(gateway, /href="manager-login\.html"/);
  assert.match(gateway, /href="login\.html"/);
  assert.match(gateway, /data-tw="gate" data-d="7,\.5,\.3,\.4,\.36" data-t="7,\.5,\.3,\.62,\.3" data-m="5,\.5,\.26,\.66,\.22"/);
  assert.doesNotMatch(gateway, /owner-login\.html/);
  assert.doesNotMatch(gateway, /data-theme-toggle/);
});

test('Leadership login matches approved Cloud Design 3b / 3e / 3h compositions', () => {
  assert.match(leadership, /data-screen-label="3b Desktop Leadership · 3e iPad Leadership · 3h Mobile Leadership"/);
  assert.match(leadership, /01 · LEADERSHIP ACCESS/);
  assert.match(leadership, /COMMAND ACCESS · L4/);
  assert.match(leadership, /SECURE SESSION/);
  assert.match(leadership, /مركز القيادة البلدية/);
  assert.match(leadership, /طبقة القرار/);
  assert.match(leadership, /class="sso-visual"/);
  assert.match(leadership, /id="leadershipLoginButton"/);
  assert.match(leadership, /id="loginForm"/);
  assert.match(leadership, /data-tw="lead" data-d="33,\.5,\.44,\.4,\.48" data-t="33,\.5,\.22,\.56,\.24" data-m="12,\.5,\.18,\.66,\.17"/);
});

test('Workforce login matches approved Cloud Design 3c / 3f / 3j compositions', () => {
  assert.match(workforce, /data-screen-label="3c Desktop Users · 3f iPad Users · 3j Mobile Users"/);
  assert.match(workforce, /02 · WORKSPACE ACCESS/);
  assert.match(workforce, /OPERATIONS LAYER · L3/);
  assert.match(workforce, /LIVE ROUTES/);
  assert.match(workforce, /مساحة العمل المؤسسية/);
  assert.match(workforce, /id="loginButton"/);
  assert.match(workforce, /id="loginForm"/);
  assert.match(workforce, /data-tw="users" data-d="21,\.5,\.44,\.44,\.56" data-t="21,\.5,\.21,\.56,\.24" data-m="9,\.5,\.18,\.66,\.17"/);
});

test('Access surfaces use the new SMART HSR logo, shared twin renderer and noise texture', () => {
  for (const source of [gateway, workforce, leadership]) {
    assert.match(source, /src="smart-hsr-logo-r2\.png"/);
    assert.match(source, /<script src="hsr-twin\.js"><\/script>/);
    assert.match(source, /<script src="cloud-twin-mount\.js"><\/script>/);
    assert.doesNotMatch(source, /Smart_HSR_Dashboard_Logo\.svg/);
  }
  for (const asset of ['smart-hsr-logo-r2.png', 'cloud-noise.png', 'hsr-twin.js', 'cloud-twin-mount.js']) {
    assert.ok(fs.existsSync(path.join(root, asset)), `${asset} must ship with the access surfaces`);
  }
  assert.match(read('hsr-twin.js'), /window\.HSRTwin\s*=\s*\{\s*mount/);
  assert.match(mount, /gate:\s*\{ pal: 'light'/);
  assert.match(mount, /lead:\s*\{ pal: 'dark'/);
  assert.match(mount, /users:\s*\{ pal: 'light'/);
});

test('Exact Cloud access stylesheet locks source geometry and the three responsive sheets', () => {
  assert.match(css, /\.gateway-header\{[^}]*top:16px[^}]*height:72px/);
  assert.match(css, /\.gateway-hero h1\{[^}]*font:600 52px\/1\.2 "Readex Pro"/);
  assert.match(css, /\.gateway-card\{width:460px;padding:26px 28px;border-radius:26px/);
  assert.match(css, /grid-template-columns:600px minmax\(0,1fr\)/);
  assert.match(css, /padding:48px 80px 40px/);
  assert.match(css, /\.login-visual\{position:relative;margin:16px 0 16px 16px;border-radius:30px/);
  assert.match(css, /@media\(max-width:899px\),\(max-width:1024px\) and \(orientation:portrait\)/);
  assert.match(css, /padding:48px 88px 40px;border-radius:36px 36px 0 0/);
  assert.match(css, /@media\(max-width:600px\)/);
  assert.match(css, /border-radius:32px 32px 0 0/);
  assert.match(css, /gateway-mobile-en/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test('Secure portal session contracts remain present behind rebuilt UI', () => {
  assert.match(workforce, /PORTAL_CONTEXT_KEY\s*=\s*['"]smartHSRPortalContext['"]/);
  assert.match(workforce, /portal:\s*['"]workforce['"]/);
  assert.doesNotMatch(workforce, /smart-hsr-manager-session/);

  assert.match(leadership, /initializeApp\(firebaseConfig, ['"]smart-hsr-manager-session['"]\)/);
  assert.match(leadership, /portal:\s*['"]leadership['"]/);
  assert.doesNotMatch(leadership, /fieldAuth/);
});

test('No public owner entry or legacy theme state survives exact rebuild', () => {
  for (const source of [gateway, workforce, leadership]) {
    assert.doesNotMatch(source, /owner-login\.html/);
    assert.doesNotMatch(source, /smartHSRLoginTheme/);
    assert.doesNotMatch(source, /data-theme-toggle/);
  }
});
