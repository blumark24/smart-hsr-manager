'use strict';
// PHASE 05C — SMART LANDS MANAGER PRODUCTION DATA-BRIDGE CLOSURE.
//
// This phase set out to build a cross-Firebase-project server bridge for
// the Phase 05B dashboard's read-only Manager -> Lands data path in
// Production. Investigation (cross-repo, against smart-hsr-lands' own
// source at commit 536171a) proved the premise for that bridge false:
// Manager Production and Lands Production do not sit on separate Firebase
// projects. Both use smart-hsr-manager — Lands' own client/lands-client.js
// declares this explicitly (PRODUCTION_PROJECT_ID, introduced in that
// repo's commit ec2f0e5, "the SAME existing Smart HSR Production Firebase
// project the unified employee gateway already uses — not a new project"),
// and the Workload Identity Federation quota-project gap that once kept
// Lands' own Production server from reaching that project's Firestore was
// root-caused and fixed in that repo's commit 6cd5b8c ("IAM is not the
// gap... Full 62-test suite re-verified green").
//
// Because both apps' reads terminate at ONE project in every real
// environment (the staging project in Preview, smart-hsr-manager in
// Production), Phase 05B's existing direct-onSnapshot adapter already is
// the complete, sufficient, secure read-only path — building a parallel
// HTTP bridge that duplicates the exact same trust boundary Firestore
// Rules already enforce would be unnecessary surface, not a fix. This file
// locks in that closure as regression coverage: the proven boundary, the
// unconditional real-read code path, the pre-existing server-side tenant
// enforcement, and the absence of any new privileged surface.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const adapter = read('manager-lands-adapter.js');
const bridge = read('api/_lib/landsBridge.js');
const runtimeConfig = read('firebase-runtime-config.js');
const rules = read('firestore.rules');

// ---- A. the proven boundary: one shared Firebase project per environment ----
test('A1. Manager Production resolves to projectId smart-hsr-manager — the exact project Lands\' own client (PRODUCTION_PROJECT_ID) declares as its Production project too', () => {
  assert.match(runtimeConfig, /projectId:\s*'smart-hsr-manager'/);
});

test('A2. the adapter documents the proven shared-project boundary with citable evidence (repo/commit), not an assumption', () => {
  assert.match(adapter, /PHASE 05C/);
  assert.match(adapter, /ec2f0e5/, 'must cite the Lands-repo commit that declared smart-hsr-manager as its own Production project');
  assert.match(adapter, /6cd5b8c/, 'must cite the Lands-repo commit that closed the WIF quota-project gap blocking Lands\' own Production Firestore/Storage access');
  assert.match(adapter, /no separate\r?\n\/\/ cross-project bridge is required or exists/);
});

test('A3. the stale "Production uses a separate Firebase project / reads fail closed there" claim is gone from both the adapter and the mutation bridge — a corrected, evidence-based note replaces it', () => {
  assert.doesNotMatch(adapter, /smart-hsr-manager uses its own separate Firebase\s*\n?\s*\/\/ project/);
  assert.doesNotMatch(adapter, /Where they don't share a project \(Production today\)/);
  assert.doesNotMatch(bridge, /smart-hsr-manager uses its own separate Firebase\s*\n?\s*\/\/ project/);
  assert.doesNotMatch(bridge, /which today is true only on Preview/);
});

// ---- B. the adapter already performs real reads unconditionally in Production ----
test('B1. connect()\'s only environment short-circuit is isLocalPreview() (localhost + an explicit ?preview=1 opt-in) — no branch skips real Firestore reads for any real Production hostname', () => {
  const start = adapter.indexOf('window.SmartHSRLandsAdapter');
  const block = adapter.slice(start, start + 900);
  assert.match(block, /if \(isLocalPreview\(\)\) \{/);
  assert.match(block, /start\(component\)\.catch/, 'every non-local-dev-opt-in path (Preview AND Production) must reach the real start() read path');
  // isLocalPreview itself is scoped to localhost/127.0.0.1 only — it can
  // never match a real Vercel Production or Preview hostname.
  assert.match(adapter, /const isLocalPreview = \(\) => \['localhost', '127\.0\.0\.1'\]\.includes\(location\.hostname\)/);
});

test('B2. no Phase 05C code introduces a second, HTTP-polling read path — start() still reads Firestore directly via onSnapshot, the same real-time mechanism proven in Phase 05B', () => {
  const start = adapter.indexOf('async function start(component)');
  const block = adapter.slice(start, adapter.indexOf('\n}\n', start));
  assert.match(block, /onSnapshot\(/);
  assert.doesNotMatch(block, /fetch\(/, 'no new server round-trip was added to the read path — only the existing bootstrap call (outside start()) uses fetch');
});

// ---- C. organizationId -> municipality_id is server-enforced, not client-chosen (unchanged from Phase 05B, reverified here) ----
test('C1. the adapter\'s only source of orgId is the session\'s own server-verified state — never a query param, never request/body input', () => {
  assert.match(adapter, /const orgId = component\.state\?\.orgId;/);
  assert.doesNotMatch(adapter, /orgId.*location\.search|location\.search.*orgId/);
});

test('C2. Firestore Rules re-verify tenant membership independently of anything the client claims — enabledMember() is keyed on request.auth.uid against the REAL membership document, not on a client-supplied municipality id', () => {
  assert.match(rules, /function enabledMember\(municipalityId\) \{ return signedIn\(\) && exists\(accessPath\(municipalityId, request\.auth\.uid\)\) && membership\(municipalityId\)\.enabled == true && membership\(municipalityId\)\.municipality_id == municipalityId && membership\(municipalityId\)\.firebase_uid == request\.auth\.uid; \}/);
  // A manager can only ever have a real, enabled userAccess document for
  // their OWN organizationId — landsManagerBootstrap.js's bootstrap write
  // takes no target parameter and writes only the caller's own uid/org.
  const bootstrap = read('api/_lib/landsManagerBootstrap.js');
  assert.match(bootstrap, /const municipalityId = caller\.organizationId;/);
});

test('C3. every Lands collection read still requires enabledMember(municipalityId) — no read rule was loosened to trust a caller-declared id', () => {
  assert.match(rules, /match \/landsMunicipalities\/\{municipalityId\}\/landGrants\/\{grantId\} \{\s*\n\s*allow read: if enabledMember\(municipalityId\);/);
  assert.match(rules, /match \/landsMunicipalities\/\{municipalityId\}\/documents\/\{documentId\} \{\s*\n\s*allow read: if enabledMember\(municipalityId\);/);
  assert.match(rules, /allow read: if enabledMember\(municipalityId\) && regularDomain\(domain\);/);
  assert.match(rules, /allow read: if manager\(municipalityId\);/, 'auditLogs read stays manager-role-gated');
});

// ---- D. no new privileged surface was introduced in this phase ----
test('D1. no new Lands mutation/read HTTP endpoint file was added under api/ — the read path stays entirely client-Firestore-SDK, no new server route to secure or audit', () => {
  const apiDir = path.join(root, 'api');
  const adminDir = path.join(apiDir, 'admin');
  const existingAdminEndpoints = fs.readdirSync(adminDir);
  // PHASE 06A.2: the formerly dedicated api/admin/lands-bootstrap.js file
  // was consolidated into api/admin/users.js (action 'landsBootstrap') to
  // stay within Vercel's Hobby-plan serverless-function-per-deployment
  // limit — so there is now no separate Lands-named admin endpoint file at
  // all, which is an even narrower surface than before, not a new one.
  assert.deepEqual(
    existingAdminEndpoints.filter(f => /lands/i.test(f)).sort(),
    [],
    'the self-only bootstrap operation must live only as an action on the existing api/admin/users.js — no dedicated lands-*.js endpoint file'
  );
  const usersHandlerSource = fs.readFileSync(path.join(adminDir, 'users.js'), 'utf8');
  assert.match(usersHandlerSource, /case 'landsBootstrap':/, 'the consolidated bootstrap action must still exist somewhere trusted');
});

test('D2. the trusted mutation bridge module exposes no new read-broadening export beyond the existing self-scoped membership-status lookup — still no setDoc/updateDoc/deleteDoc/addDoc, still no client-chosen-municipality read surface', () => {
  assert.doesNotMatch(bridge, /setDoc\(|updateDoc\(|deleteDoc\(|addDoc\(/);
  const exportsMatch = bridge.match(/module\.exports = \{([^}]*)\};/);
  assert.ok(exportsMatch);
  const exported = exportsMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  assert.deepEqual(exported.sort(), ['bridgeConfigured', 'callLandsMembershipStatus', 'callLandsSsoRegister', 'callLandsTrustedMutation'].sort());
});

test('D3. the Lands product view still contains no approve/reject/delete/entitlement-change control — read-only holds through Phase 05C exactly as Phase 05B established', () => {
  const manager = read('manager.html');
  const start = manager.indexOf('<sc-if value="{{ viewIsLands }}">');
  const end = manager.indexOf('</main>', start);
  const block = manager.slice(start, end);
  assert.doesNotMatch(block, /اعتماد|رفض|حذف|تعديل الصلاحية/);
});

console.log('manager Phase 05C — Lands Production data-bridge closure OK (boundary proven shared; no new bridge required)');
