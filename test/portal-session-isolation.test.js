'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('public portal exposes no hidden owner gesture', () => {
  const home = read('Home.html');
  const workforce = read('login.html');
  const leadership = read('manager-login.html');

  for (const source of [home, workforce, leadership]) {
    assert.doesNotMatch(source, /data-owner-gesture/);
    assert.doesNotMatch(source, /taps\s*>=\s*5/);
  }
  assert.doesNotMatch(home, /owner-login\.html/);
});

test('workforce login cannot overwrite or sign out leadership auth', () => {
  const source = read('login.html');

  assert.match(source, /PORTAL_CONTEXT_KEY\s*=\s*['"]smartHSRPortalContext['"]/);
  assert.match(source, /portal:\s*['"]workforce['"]/);
  assert.match(source, /persistWorkforceSession/);
  assert.doesNotMatch(source, /smart-hsr-manager-session/);
  assert.doesNotMatch(source, /managerAuth/);
  assert.match(source, /هذا حساب مدير بلدية معتمد\. استخدم بوابة القيادات البلدية/);
});

test('leadership login uses only the dedicated manager namespace', () => {
  const source = read('manager-login.html');

  assert.match(source, /initializeApp\(firebaseConfig, ['"]smart-hsr-manager-session['"]\)/);
  assert.match(source, /portal:\s*['"]leadership['"]/);
  assert.doesNotMatch(source, /fieldAuth/);
  assert.doesNotMatch(source, /clearOldPortalSessions/);
});

test('manager shell binds auth namespace, role and organization to selected portal', () => {
  const source = read('manager-dashboard-adapter.js');

  assert.match(source, /requestedPortal === ['"]workforce['"]/);
  assert.match(source, /item\.name === ['"]\[DEFAULT\]['"]/);
  assert.match(source, /item\.name === ['"]smart-hsr-manager-session['"]/);
  assert.match(source, /expectedRole = requestedPortal === ['"]workforce['"] \? ['"]supervisor['"] : ['"]manager['"]/);
  assert.match(source, /markerOrg === context\.organizationId/);
  assert.match(source, /where\(['"]organizationId['"], ['"]==['"], context\.organizationId\)/);
});

test('leadership login and manager dashboard use the same Firebase SDK runtime', () => {
  const login = read('manager-login.html');
  const adapter = read('manager-dashboard-adapter.js');

  for (const moduleName of ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js']) {
    assert.match(login, new RegExp('firebasejs/11\\.6\\.1/' + moduleName.replace('.', '\\.')));
    assert.match(adapter, new RegExp('firebasejs/11\\.6\\.1/' + moduleName.replace('.', '\\.')));
  }
  assert.doesNotMatch(adapter, /firebasejs\/10\.12\.0\//);
});

test('workforce workspace guard never classifies manager.html as a Field workspace', () => {
  const source = read('workspace-guard.js');

  assert.doesNotMatch(source, /\['dashboard\.html', 'mobile-map\.html', 'manager\.html'\]\.includes\(file\)/);
  assert.match(source, /\['dashboard\.html', 'mobile-map\.html'\]\.includes\(file\)\) return 'field'/);
});


test('gateway documents have normalized markup and hardened response policy', () => {
  const pages = [read('Home.html'), read('login.html'), read('manager-login.html')];
  for (const source of pages) {
    assert.doesNotMatch(source, /<meta charset="utf-8">\\n/);
    assert.doesNotMatch(source, /<\/style>\\n<\/head>/);
  }

  const vercel = JSON.parse(read('vercel.json'));
  const globalRule = vercel.headers.find(rule => rule.source === '/(.*)');
  assert.ok(globalRule);
  assert.ok(globalRule.headers.some(header =>
    header.key === 'X-Permitted-Cross-Domain-Policies' && header.value === 'none'
  ));

  for (const route of ['/Home.html', '/login.html', '/manager-login.html']) {
    const rule = vercel.headers.find(item => item.source === route);
    assert.ok(rule, `missing hardened headers for ${route}`);
    const headerMap = Object.fromEntries(rule.headers.map(header => [header.key, header.value]));
    assert.match(headerMap['Cache-Control'] || '', /no-store/);
    assert.equal(headerMap['Cross-Origin-Opener-Policy'], 'same-origin');
    assert.match(headerMap['Content-Security-Policy'] || '', /frame-ancestors 'none'/);
    assert.match(headerMap['Content-Security-Policy'] || '', /form-action 'self'/);
    assert.match(headerMap['Permissions-Policy'] || '', /geolocation=\(\)/);
  }
});
