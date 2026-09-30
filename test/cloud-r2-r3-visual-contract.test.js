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

test('Gateway matches approved Cloud Design 3g composition', () => {
  assert.match(gateway, /data-screen-label="3g Mobile Gateway"/);
  assert.match(gateway, /UNIFIED ACCESS GATEWAY/);
  assert.match(gateway, /بوابة الدخول<br>الموحّدة/);
  assert.match(gateway, /01 · LEADERSHIP/);
  assert.match(gateway, /02 · WORKSPACE/);
  assert.match(gateway, /gateway-mobile-en">EN</);
  assert.match(gateway, /href="manager-login\.html"/);
  assert.match(gateway, /href="login\.html"/);
  assert.doesNotMatch(gateway, /owner-login\.html/);
  assert.doesNotMatch(gateway, /data-theme-toggle/);
});

test('Leadership login matches approved Cloud Design 3h composition', () => {
  assert.match(leadership, /data-screen-label="3h Mobile Leadership"/);
  assert.match(leadership, /01 · LEADERSHIP ACCESS/);
  assert.match(leadership, /COMMAND ACCESS · L4/);
  assert.match(leadership, /مركز القيادة البلدية/);
  assert.match(leadership, /class="sso-visual"/);
  assert.match(leadership, /id="leadershipLoginButton"/);
  assert.match(leadership, /id="loginForm"/);
});

test('Workforce login matches approved Cloud Design 3j composition', () => {
  assert.match(workforce, /data-screen-label="3j Mobile Users"/);
  assert.match(workforce, /02 · WORKSPACE ACCESS/);
  assert.match(workforce, /OPERATIONS LAYER · L3/);
  assert.match(workforce, /مساحة العمل المؤسسية/);
  assert.match(workforce, /id="loginButton"/);
  assert.match(workforce, /id="loginForm"/);
});

test('Exact Cloud access stylesheet locks source geometry and responsive sheets', () => {
  assert.match(css, /\.gateway-header\{[^}]*top:16px/);
  assert.match(css, /\.gateway-hero\{[^}]*top:404px/);
  assert.match(css, /\.gateway-cards\{[^}]*top:580px/);
  assert.match(css, /grid-template-columns:minmax\(480px,600px\) minmax\(0,1fr\)/);
  assert.match(css, /border-radius:32px 32px 0 0/);
  assert.match(css, /@media\(max-width:600px\)/);
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
