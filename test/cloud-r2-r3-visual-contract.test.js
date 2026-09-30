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
const publicUi = read('public-enhancements.js');

test('Cloud R2/R3 release opens all public access surfaces in light mode first', () => {
  for (const source of [gateway, workforce, leadership]) {
    assert.match(source, /<html lang="ar" dir="rtl" data-theme="light">/);
    assert.match(source, /smartHSRCloudDesignVersion/);
    assert.match(source, /designVersion='r2-r3-v1'/);
    assert.match(source, /saved='light'/);
    assert.match(source, /dataset\.theme=saved==='dark'\?'dark':'light'/);
  }
  assert.match(publicUi, /smart-hsr-public-cloud-version/);
  assert.match(publicUi, /let t='light'/);
});

test('Gateway uses the living spatial Cloud Design layer without changing routes', () => {
  assert.match(gateway, /smart-hsr-cloud-r3-final/);
  assert.match(gateway, /LIVING MUNICIPAL DIGITAL TWIN/);
  assert.match(gateway, /href="manager-login\.html"/);
  assert.match(gateway, /href="login\.html"/);
  assert.doesNotMatch(gateway, /owner-login\.html/);
});

test('Workforce and leadership retain distinct Cloud Design spatial semantics', () => {
  assert.match(workforce, /Workforce = light operational Digital Twin/);
  assert.match(workforce, /#EEF3F0 60%,#E1E9E4 100%/);
  assert.match(workforce, /INSTITUTIONAL WORKSPACE ACCESS/);

  assert.match(leadership, /Leadership = deep green command layer/);
  assert.match(leadership, /linear-gradient\(145deg,#0B4D35 0%,#073324 58%,#04221A 100%\)/);
  assert.match(leadership, /MUNICIPAL COMMAND ACCESS/);
});

test('Cloud Design typography and responsive release contract are present', () => {
  for (const source of [gateway, workforce, leadership]) {
    assert.match(source, /Readex\+Pro/);
    assert.match(source, /@media\(max-width:600px\)/);
    assert.match(source, /prefers-reduced-motion:reduce/);
  }
});

test('Visual patch does not alter secure portal session contracts', () => {
  assert.match(workforce, /PORTAL_CONTEXT_KEY\s*=\s*['"]smartHSRPortalContext['"]/);
  assert.match(workforce, /portal:\s*['"]workforce['"]/);
  assert.match(leadership, /initializeApp\(firebaseConfig, ['"]smart-hsr-manager-session['"]\)/);
  assert.match(leadership, /portal:\s*['"]leadership['"]/);
});
