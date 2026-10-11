'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');
const start = page.indexOf('let inspectorDisplaySyncPending = false;');
const end = page.indexOf("\nwindow.addEventListener('focus',", start);
assert.ok(start > 0 && end > start, 'inspector identity refresh implementation exists');
const implementation = page.slice(start, end);

function harness(identity, uid = 'staff-1') {
  const userName = { textContent: 'Previous Name' };
  const inspectorContext = { uid, organizationId: 'mun-1', organizationName: 'Previous Municipality' };
  const logs = { badge: 0, calls: 0 };
  const currentUser = { uid, getIdToken: async () => 'verified-token' };
  const context = {
    auth: { currentUser },
    inspectorContext, userName,
    document: { hidden: false },
    cleanDisplayText: value => typeof value === 'string' ? value.trim() : '',
    renderOrgBadge: () => { logs.badge++; },
    fetch: async (_url, request) => {
      logs.calls++;
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.Authorization, 'Bearer verified-token');
      assert.deepEqual(JSON.parse(request.body), { action: 'resolveWorkspaces', workspace: 'field' });
      return { ok: true, json: async () => identity };
    }
  };
  const refresh = vm.runInNewContext(implementation + '\nrefreshInspectorDisplayIdentity', context);
  return { refresh, userName, inspectorContext, logs, context };
}
const allow = {
  kind: 'workforce', valid: true, allowed: true, organizationId: 'mun-1',
  profile: { name: 'Updated Name', organizationName: 'Municipality A' }
};

test('authenticated inspector labels update without changing role or tenant', async () => {
  const h = harness(allow);
  await h.refresh();
  assert.equal(h.userName.textContent, 'Updated Name');
  assert.equal(h.inspectorContext.organizationName, 'Municipality A');
  assert.equal(h.inspectorContext.organizationId, 'mun-1');
  assert.equal(h.inspectorContext.uid, 'staff-1');
  assert.equal(h.logs.badge, 1);
});

test('cross-municipality responses never update inspector display', async () => {
  const h = harness({ ...allow, organizationId: 'mun-other' });
  await h.refresh();
  assert.equal(h.userName.textContent, 'Previous Name');
  assert.equal(h.inspectorContext.organizationName, 'Previous Municipality');
});

test('denied and invalid workforce responses never update labels', async () => {
  for (const identity of [{ ...allow, allowed: false }, { ...allow, valid: false }, { ...allow, kind: 'manager' }]) {
    const h = harness(identity);
    await h.refresh();
    assert.equal(h.userName.textContent, 'Previous Name');
  }
});

test('no currently signed-in user or mismatched UID makes no network call', async () => {
  const h = harness(allow);
  h.context.auth.currentUser = null;
  await h.refresh();
  assert.equal(h.logs.calls, 0);
  h.context.auth.currentUser = { uid: 'other-user', getIdToken: async () => 'token' };
  await h.refresh();
  assert.equal(h.logs.calls, 0);
});

test('new labels are refreshed on focus/visibility and bounded interval', () => {
  assert.match(page, /window\.addEventListener\('focus', \(\) => \{ void refreshInspectorDisplayIdentity\(\); \}\)/);
  assert.match(page, /document\.addEventListener\('visibilitychange'/);
  assert.match(page, /window\.setInterval\(\(\) => \{ if \(!document\.hidden\) void refreshInspectorDisplayIdentity\(\); \}, 60000\)/);
});
