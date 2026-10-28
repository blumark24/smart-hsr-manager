'use strict';
// Preview tab-session compatibility tests; no real network or account access.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const login = read('login.html');
const manager = read('manager-dashboard-adapter.js');
const lands = read('lands/client/lands-client.js');
const staging = 'smart-hsr-staging-blumark24';
const production = 'smart-hsr-manager';

async function loginPersistence(projectId) {
  const m = login.match(/await setPersistence\(auth, firebaseConfig\.projectId === 'smart-hsr-staging-blumark24'[\s\S]*?browserLocalPersistence\);/);
  assert.ok(m, 'login must inspect actual staging project');
  let selected;
  const ctx = {
    auth: {}, firebaseConfig: { projectId },
    browserSessionPersistence: 'SESSION', browserLocalPersistence: 'LOCAL',
    async setPersistence(_a, option) { selected = option; }
  };
  await vm.runInNewContext('(async()=>{' + m[0] + '})()', ctx);
  return selected;
}

async function managerPersistence(projectId, requestedPortal) {
  const m = manager.match(/const isolatedWorkforceTab = requestedPortal === 'workforce'[\s\S]*?authApi\.browserLocalPersistence\);/);
  assert.ok(m, 'manager supervisor persistence selection');
  let selected;
  const ctx = {
    auth: {}, requestedPortal, firebaseConfig: { projectId },
    authApi: {
      browserSessionPersistence: 'SESSION', browserLocalPersistence: 'LOCAL',
      async setPersistence(_a, option) { selected = option; }
    }
  };
  await vm.runInNewContext('(async()=>{' + m[0] + '})()', ctx);
  return selected;
}

async function landsPersistence(projectId, useEmulators = false, fail = false) {
  const begin = lands.indexOf('const isolatedPreviewSession = ');
  const end = lands.indexOf('if (useEmulators) {', begin);
  assert.ok(begin >= 0 && end > begin);
  const snippet = lands.slice(begin, end);
  let selected = null;
  const ctx = {
    useEmulators, firebaseConfig: { projectId }, STAGING_PROJECT_ID: staging,
    auth: {}, browserSessionPersistence: 'SESSION', browserLocalPersistence: 'LOCAL',
    setPersistence: async (_auth, option) => {
      selected = option;
      if (fail) throw new Error('storage-unavailable');
    },
    Promise, Error
  };
  const result = await vm.runInNewContext('(async()=>{' + snippet + ' await persistenceReady; return isolatedPreviewSession;})()', ctx)
    .then(isolated => ({ isolated, failed: false }))
    .catch(err => ({ failed: true, error: err.message }));
  return { selected, ...result };
}

test('Preview workforce login is per-tab, while Production retains local persistence', async () => {
  assert.equal(await loginPersistence(staging), 'SESSION');
  assert.equal(await loginPersistence(production), 'LOCAL');
  assert.match(login, /await setPersistence\(probeAuth, inMemoryPersistence\)/);
  assert.match(login, /const probeApp = initializeApp\(firebaseConfig, 'smart-hsr-role-probe'\)/);
});

test('supervisor manager dashboard is per-tab only on staging; municipal manager unchanged', async () => {
  assert.equal(await managerPersistence(staging, 'workforce'), 'SESSION');
  assert.equal(await managerPersistence(staging, 'leadership'), 'LOCAL');
  assert.equal(await managerPersistence(production, 'workforce'), 'LOCAL');
  assert.equal(await managerPersistence(production, 'leadership'), 'LOCAL');
  assert.match(manager, /initializeApp\(firebaseConfig, 'smart-hsr-manager-session'\)/);
});

test('Lands SSO persists in same tab on Preview; emulator and production retain existing behavior', async () => {
  assert.deepEqual(await landsPersistence(staging), { selected:'SESSION', isolated:true, failed:false });
  assert.deepEqual(await landsPersistence(production), { selected:'LOCAL', isolated:false, failed:false });
  assert.deepEqual(await landsPersistence(staging, true), { selected:null, isolated:false, failed:false });
  assert.match(lands, /async signIn\(email, password\) \{ await persistenceReady; await signInWithEmailAndPassword/);
  assert.match(lands, /async signInWithHandoffToken\(customToken\) \{ await persistenceReady; await signInWithCustomToken/);
});

test('Preview Lands fails closed if tab persistence is unavailable; Production keeps prior best-effort behavior', async () => {
  assert.deepEqual(await landsPersistence(staging, false, true), { selected:'SESSION', failed:true, error:'LANDS_PREVIEW_SESSION_UNAVAILABLE' });
  assert.deepEqual(await landsPersistence(production, false, true), { selected:'LOCAL', isolated:false, failed:false });
});

test('other workforce routes do not overwrite session-scoped Auth with local persistence', () => {
  for (const p of ['workspace.html','dashboard.html','mobile-map.html','field-head-runtime.js','service-switcher.js','workspace-guard.js']) {
    assert.doesNotMatch(read(p), /\bsetPersistence\s*\([^)]*,\s*browserLocalPersistence\b/, p);
  }
  assert.match(read('manager-login.html'), /browserLocalPersistence/);
  assert.match(read('owner-firebase-client.js'), /browserLocalPersistence/);
});

test('tab-only behavior never adds a new endpoint or stored password', () => {
  const snippet = lands.slice(lands.indexOf('const isolatedPreviewSession = '),lands.indexOf('if (useEmulators) {',lands.indexOf('const isolatedPreviewSession = ')));
  assert.doesNotMatch(snippet, /setDoc|updateDoc|createUser|fetch\(|revokeRefreshTokens/);
  assert.match(login, /signInWithEmailAndPassword\(probeAuth, email, password\)/);
});
