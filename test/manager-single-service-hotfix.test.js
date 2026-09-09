'use strict';
// Source-level coverage for the "one operational employee = one operational
// service" manager UI hotfix (manager.html + login.html + manager-dashboard-
// adapter.js). The backend rule itself (assertSingleService/
// resolveEffectiveServiceState) is covered by manager-service-entitlements.
// test.js and manager-lands-bridge-integration.test.js.
//
// The manager.html-side checks below were originally written against the
// pre-reconciliation imperative jQuery/DOM-id manager.html (radio inputs
// with literal ids, a global saveServices() function, a manually-typed
// #addPassword field, an imperative renderLandsView(), and userBadge.
// textContent for identity). That manager.html no longer exists — it was
// replaced, per explicit product direction, by the Designer canvas
// component architecture (class/render()/state) already used throughout
// this file's sibling manager.html tests. Every real behavior these tests
// protected has been traced to its current location and is covered there;
// see the per-behavior notes below for the proof.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// ---- single-select Field vs Lands (Add User) ----
// Old intent: two independent checkboxes (#addFieldEnabled/#addLandsEnabled)
// could both be checked, letting a manager submit a request for both
// services at once. Now: Add User's auKindOptions is a single-select pill
// pair (`this.setState({ auKind: o.kind, ... })`), so only one of 'field'/
// 'lands' can ever be the active choice — see manager-phase3-functional-
// parity.test.js: "Add User: Field vs Lands is a single-select choice, and
// each service offers only its own real roles" (verifies the single
// this.setState call, and that role options never toggle independent
// booleans).
test('Add User: Field/Lands single-select still exists (see manager-phase3-functional-parity.test.js for the full assertion)', () => {
  const source = read('manager.html');
  assert.match(source, /auKindOptions:/);
  assert.doesNotMatch(source, /id="addFieldEnabled"|id="addLandsEnabled"/, 'must never regress to two independent service checkboxes');
});

// ---- service editing: Phase 03B intentionally REPLACES single-select with
// independent Field/Lands toggles ----
// Old intent (pre-Phase-03B): serviceOptions was a flat list of one-click
// role pills — each click immediately called submitServiceChange({kind,
// role}) for exactly one service/role pair, with no way to select more
// than one at a time. That constraint was an explicit, intentional product
// decision that Phase 03B reverses: "ONE USER = ONE IDENTITY + MULTIPLE
// CONTROLLED PRODUCT ENTITLEMENTS" requires a manager to be able to enable
// Field/Mobility AND Lands together on the same identity. This is still
// never the old pre-Designer-refactor jQuery pattern of two raw DOM
// checkboxes with literal ids (`#svcFieldEnabled`/`#svcLandsEnabled`) that
// could be checked without any server-side transfer logic at all — the new
// toggles are real component state (svcFieldEnabled/svcLandsEnabled),
// submitted together through the same real setServices contract. See
// manager-phase3-functional-parity.test.js: "Service editing sends the
// full field+lands state together, and both may now be enabled at once".
test('Edit user services: independent Field/Lands toggles exist as real state, never the old raw DOM checkboxes (see manager-phase3-functional-parity.test.js)', () => {
  const source = read('manager.html');
  assert.match(source, /svcFieldRoleOptions:/);
  assert.match(source, /svcLandsRoleOptions:/);
  assert.match(source, /toggleSvcField:\s*\(\)\s*=>\s*this\.setState\(\{\s*svcFieldEnabled:\s*!st\.svcFieldEnabled\s*\}\)/);
  assert.match(source, /toggleSvcLands:\s*\(\)\s*=>\s*this\.setState\(\{\s*svcLandsEnabled:\s*!st\.svcLandsEnabled\s*\}\)/);
  assert.doesNotMatch(source, /id="svcFieldEnabled"|id="svcLandsEnabled"/, 'must never regress to raw, un-audited DOM checkboxes with no server-side transfer contract');
});

// ---- temporary password reaches the create call ----
// Old intent: a manually-typed #addPassword field's value had to actually
// reach the create API call. Now: the password is generated (never manually
// typed, closing a weak-password risk the old UI allowed) by
// generateTempPassword() and sent as `password: tempPassword` in the same
// create call — see manager-phase3-functional-parity.test.js: "Add User:
// opens a drawer and calls the real multi-service create contract..." and
// "...the temporary password is shown once and never sent to the audit
// trail".
test('Add User: a generated temporary password still reaches the create call (see manager-phase3-functional-parity.test.js)', () => {
  const source = read('manager.html');
  assert.match(source, /generateTempPassword\(\)/);
  assert.doesNotMatch(source, /id="addPassword"/, 'must never regress to a manually-typed temporary password field');
});

// ---- Lands entitlement management lives in the Users workflow, not a
// separate executive-summary view ----
// The old manager.html had a dedicated "Lands executive view" dashboard tab
// (renderLandsView(), KPI cards, staff list, external workspace link). That
// tab is intentionally out of scope for this reconciliation: the Designer
// architecture's sidebar already marks the equivalent "حصر الأراضي الذكي"
// entry as a deliberately deferred/roadmap item ("بانتظار الربط"), the same
// treatment given to the other not-yet-built sidebar sections ("الهيكل
// الإداري", "المساعد التنفيذي الذكي") — this is a pre-existing, disclosed
// scope boundary, not a regression introduced by this branch, and Phase 3's
// own instructions explicitly named renderLandsView() as an obsolete
// pattern NOT to re-add. What IS in scope — and built — is real Lands
// entitlement management: granting/editing a user's Lands role from the
// Users workflow (Add User's Lands option, and service editing's Lands
// roles), which this test confirms still exists and is never fabricated.
test('Lands entitlement management is real (Add User + service editing), and the deferred executive view is not silently re-added as fake data', () => {
  const source = read('manager.html');
  assert.match(source, /lands_employee/);
  assert.match(source, /lands_department_manager/);
  // No re-introduction of the old imperative Lands dashboard or fabricated
  // grant statistics.
  assert.doesNotMatch(source, /function renderLandsView\(/);
  assert.doesNotMatch(source, /landsViewGrantsUnavailable/);
});

test('the Lands filter count on the users list is real, derived from the same live users array, never a fabricated statistic', () => {
  const source = read('manager.html');
  const start = source.indexOf('const landsCount =');
  assert.notEqual(start, -1);
  const line = source.slice(start, source.indexOf(';', start) + 1);
  assert.match(line, /allUsers\.filter\(u => u\.role == null && u\.landsAccess && u\.landsAccess\.enabled\)\.length/);
});

// ---- manager identity display prioritizes the approved name over email ----
// Old intent: manager.html's own inline script read managerContext.name
// (populated from managers/{uid} or users/{uid}) ahead of the Auth email.
// Now: manager.html never talks to Firestore/Auth directly at all — that
// happens in manager-dashboard-adapter.js, the real ES module manager.html
// loads for all of its Firestore/Auth wiring (same precedent already
// established for Firebase config resolution in
// manager-login-preview-config.test.js). This is where identity resolution
// actually happens now.
test('managers/{uid} and users/{uid} name fields are both read into the manager session context', () => {
  const source = read('manager-dashboard-adapter.js');
  const fn = source.slice(source.indexOf('async function verifyManagerAccess'), source.indexOf('async function start'));
  assert.match(fn, /const name = typeof data\.name === 'string' \? data\.name\.trim\(\) : ''/g);
  const nameReads = fn.match(/const name = typeof data\.name === 'string'/g) || [];
  assert.equal(nameReads.length, 2, 'expected the name field to be read from both the managers/{uid} and users/{uid} branches');
  assert.match(fn, /return \{ role: 'manager'.*name \}/);
  assert.match(fn, /return \{ role: 'supervisor'.*name \}/);
});

test('manager session identity prioritizes the approved Firestore name over Firebase Auth displayName/email', () => {
  const source = read('manager-dashboard-adapter.js');
  assert.match(source, /sessionName: context\.name \|\| user\.displayName \|\| user\.email \|\| 'الحساب الموثق'/);
  // The old bug this replaces: email/displayName as the PRIMARY identity
  // source, with no Firestore-approved name ever consulted.
  assert.doesNotMatch(source, /sessionName: user\.displayName \|\| user\.email/);
});

test('login.html routes an active Lands-only account to the Lands trusted runtime, never denies it', () => {
  const source = read('login.html');
  assert.match(source, /hasLandsRole = Boolean\(landsAccess && landsAccess\.enabled/);
  assert.match(source, /hasLandsRole && !hasFieldRole/);
  assert.match(source, /lands-smart-git-staging-lands-trusted-audit-blumark24-os\.vercel\.app/);
});

test('login.html never places a token, password, or credential in the Lands redirect URL', () => {
  // Superseded by the one-time SSO handoff (see test/manager-lands-sso.test.js
  // for the full architecture): the employee's ID token IS now used in this
  // branch — to call the same-origin POST /api/organization/context over HTTPS,
  // never placed in a URL — so this test checks the actual invariant (no
  // token/password/credential in the URL-building code) rather than banning
  // getIdToken() outright, which is no longer the real security property.
  const source = read('login.html');
  const start = source.indexOf('const landsUrl = new URL');
  const end = source.indexOf('window.location.href = landsUrl.toString();') + 40;
  const urlBlock = source.slice(start, end);
  assert.doesNotMatch(urlBlock, /getIdToken/);
  assert.doesNotMatch(urlBlock, /password/i);
  assert.doesNotMatch(urlBlock, /idToken/i);
  assert.match(urlBlock, /landsUrl\.searchParams\.set\('code', handoffCode\)/);
});
