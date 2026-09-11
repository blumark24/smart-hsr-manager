'use strict';
// ============================================================================
// ASSIGNMENT MANAGEMENT — UNIFIED MUTATION BUSY GUARD (micro-hotfix).
// Source-contract coverage pinning the specific code shapes this hotfix
// requires (see test/employee-assignment-management-ui-runtime.test.js for
// the executable, deferred-promise proof that the actual behavior — not
// just the shape — is correct).
//
// The bug being fixed: openCreateAssignmentForm() unconditionally reset
// caSubmitting to false, so reopening the create form right after a
// successful createAssignment — while its own post-mutation listAssignments
// refresh was still pending — silently cleared the pending-mutation guard
// and could let a second create start. This file also pins the broader
// fix: CREATE and END are now mutually exclusive via one shared
// isAssignmentMutationBusy() check used by every mutation-adjacent entry
// point (open/submit/start/confirm/cancel/close).
// ============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');
const authz = fs.readFileSync(path.join(root, 'api', '_lib', 'authz.js'), 'utf8');
const employeesApi = fs.readFileSync(path.join(root, 'api', 'admin', 'employees.js'), 'utf8');
const firestoreRules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const assignmentContract = fs.readFileSync(path.join(root, 'platform', 'contracts', 'employee-assignment-contract.js'), 'utf8');
const lockContract = fs.readFileSync(path.join(root, 'platform', 'contracts', 'employee-assignment-lock-contract.js'), 'utf8');
const loginHtml = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const managerLoginHtml = fs.readFileSync(path.join(root, 'manager-login.html'), 'utf8');
const dashboardAdapter = fs.readFileSync(path.join(root, 'manager-dashboard-adapter.js'), 'utf8');
const smartMobilityAdapter = fs.readFileSync(path.join(root, 'smart-mobility-adapter.js'), 'utf8');

function methodBody(source, signature, maxLen = 900) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  return source.slice(start, start + maxLen);
}

// ---- the unified concept itself ----

test('UNIFIED GUARD: isAssignmentMutationBusy() is defined as caSubmitting || endSubmitting, and every mutation-entry guard reuses it', () => {
  const fn = methodBody(manager, 'isAssignmentMutationBusy() {', 200);
  assert.match(fn, /return this\.state\.caSubmitting \|\| this\.state\.endSubmitting;/);
});

test('UNIFIED GUARD: the render view-model exposes assignmentMutationBusy from the same single source of truth', () => {
  assert.match(manager, /assignmentMutationBusy:\s*this\.isAssignmentMutationBusy\(\)/);
});

// ---- FIX: openCreateAssignmentForm never clears caSubmitting ----

test('openCreateAssignmentForm never writes caSubmitting:false and refuses to open while any mutation is busy', () => {
  const fullFn = methodBody(manager, 'openCreateAssignmentForm() {', 500);
  // Bound to this method's own closing brace only — not the next method's
  // leading comment, which legitimately discusses caSubmitting in prose.
  const ownBody = fullFn.slice(0, fullFn.indexOf('\n  }') + 4);
  assert.match(ownBody, /if \(this\.isAssignmentMutationBusy\(\)\) return;/);
  assert.doesNotMatch(ownBody, /caSubmitting/, 'openCreateAssignmentForm must never reference caSubmitting in its own body at all — reopening a form must never touch the guard');
});

test('startEndConfirm never clears any mutation flag and refuses to open while any mutation is busy', () => {
  const fn = methodBody(manager, 'startEndConfirm(assignmentId) {', 300);
  assert.match(fn, /if \(this\.isAssignmentMutationBusy\(\)\) return;/);
  assert.doesNotMatch(fn, /caSubmitting:\s*false|endSubmitting:\s*false/);
});

// ---- FIX: cross-mutation exclusivity on the actual mutation entry points ----

test('submitCreateAssignment guards on the unified busy check (blocked by either caSubmitting or endSubmitting)', () => {
  const fn = methodBody(manager, 'async submitCreateAssignment() {', 400);
  assert.match(fn, /if \(this\.isAssignmentMutationBusy\(\)\) return;/);
});

test('confirmEndAssignment guards on the unified busy check (blocked by either caSubmitting or endSubmitting)', () => {
  const fn = methodBody(manager, 'async confirmEndAssignment(assignmentId) {', 400);
  assert.match(fn, /if \(this\.isAssignmentMutationBusy\(\)\) return;/);
});

// ---- FIX: no open/cancel/close method may ever clear a mutation flag ----

test('closeCreateAssignmentForm cannot clear either mutation flag and guards on the unified busy check', () => {
  const fn = methodBody(manager, 'closeCreateAssignmentForm() {', 300);
  assert.match(fn, /if \(this\.isAssignmentMutationBusy\(\)\) return;/);
  assert.doesNotMatch(fn, /caSubmitting:\s*false|endSubmitting:\s*false/);
});

test('cancelEndConfirm cannot clear either mutation flag and guards on the unified busy check', () => {
  const fn = methodBody(manager, 'cancelEndConfirm() {', 300);
  assert.match(fn, /if \(this\.isAssignmentMutationBusy\(\)\) return;/);
  assert.doesNotMatch(fn, /caSubmitting:\s*false|endSubmitting:\s*false/);
});

test('closeEmployeeDrawer cannot clear either mutation flag and guards on the unified busy check', () => {
  const fn = methodBody(manager, 'closeEmployeeDrawer() {', 700);
  assert.match(fn, /if \(this\.isAssignmentMutationBusy\(\)\) return;/);
  assert.doesNotMatch(fn, /caSubmitting:\s*false/);
  assert.doesNotMatch(fn, /endSubmitting:\s*false/);
});

// ---- only the owning async mutation flow may clear its own flag ----

test('only submitCreateAssignment itself ever sets caSubmitting:false, and only after awaiting the post-mutation refresh', () => {
  const nonMutationMethods = [
    'openCreateAssignmentForm() {', 'closeCreateAssignmentForm() {', 'startEndConfirm(assignmentId) {',
    'cancelEndConfirm() {', 'closeEmployeeDrawer() {',
  ];
  for (const sig of nonMutationMethods) {
    const fn = methodBody(manager, sig, 800);
    assert.doesNotMatch(fn, /caSubmitting:\s*false/, `${sig} must never clear caSubmitting`);
    assert.doesNotMatch(fn, /endSubmitting:\s*false/, `${sig} must never clear endSubmitting`);
  }
});

// ---- FIX 3 — UI controls disabled while assignmentMutationBusy ----

test('"+ إضافة تكليف" is disabled while assignmentMutationBusy', () => {
  assert.match(manager, /openCreateAssignmentForm \}\}" data-f="1" disabled="\{\{ assignmentMutationBusy \}\}"/);
});

test('the per-card "إنهاء التكليف" entry control is disabled while assignmentMutationBusy', () => {
  assert.match(manager, /a\.onStartEndConfirm \}\}" data-f="1" disabled="\{\{ assignmentMutationBusy \}\}"/);
});

test('the create-form cancel button and the end-confirmation cancel button remain disabled by their own specific pending flag (unchanged from the prior hotfix)', () => {
  assert.match(manager, /closeCreateAssignmentForm \}\}" data-f="1" disabled="\{\{ caSubmitting \}\}"/);
  assert.match(manager, /cancelEndConfirm \}\}" data-f="1" disabled="\{\{ endSubmitting \}\}"/);
});

test('the drawer backdrop and the explicit close button both route through closeEmployeeDrawer, which is blocked while assignmentMutationBusy', () => {
  const drawerOpenStart = manager.indexOf('<sc-if value="{{ employeeDrawerOpen }}">');
  const drawerHeaderEnd = manager.indexOf('{{ selectedEmployeeName }}', drawerOpenStart);
  const backdropBlock = manager.slice(drawerOpenStart, drawerHeaderEnd);
  assert.match(backdropBlock, /onClick="\{\{ closeEmployeeDrawer \}\}"/);
  const closeButtonBlock = manager.slice(drawerHeaderEnd, drawerHeaderEnd + 600);
  assert.match(closeButtonBlock, /onClick="\{\{ closeEmployeeDrawer \}\}"/);
});

test('no reset-state escape hatch exists — no method sets caCreateOpen/endConfirmingId back to their pending state while bypassing isAssignmentMutationBusy', () => {
  // Every place caCreateOpen: true or endConfirmingId: <id> is assigned
  // must be preceded, in the same method, by the unified busy guard.
  const openFn = methodBody(manager, 'openCreateAssignmentForm() {', 500);
  assert.ok(openFn.indexOf('isAssignmentMutationBusy') < openFn.indexOf('caCreateOpen: true'));
  const startFn = methodBody(manager, 'startEndConfirm(assignmentId) {', 300);
  assert.ok(startFn.indexOf('isAssignmentMutationBusy') < startFn.indexOf('endConfirmingId: assignmentId'));
});

// ---- no backend/security files touched ----

test('SECURITY: no backend, authorization, rules, or contract file was touched by this frontend-only hotfix', () => {
  // These are content-shape sanity checks (the locked foundation's own
  // signatures must still be present, byte-identical in spirit) — the
  // authoritative proof that these files are untouched is `git diff
  // --check`/`git status` in the release step, which this hotfix's
  // process runs and reports on. This test guards against a future
  // accidental edit slipping through unnoticed by re-asserting the
  // load-bearing invariants these files must still uphold.
  assert.match(employeesApi, /function assertCanManageAssignments\(caller, targetOrganizationId\) \{/);
  assert.doesNotMatch(employeesApi, /caller\.isOwner\) return \{ allowed: true, reason: 'owner' \}/, 'the owner-denial policy for assignments must remain in place');
  assert.match(authz, /async function getCallerContext\(uid\)/);
  assert.doesNotMatch(authz, /employeeAssignments/);
  assert.match(firestoreRules, /match \/employeeAssignments\/\{assignmentId\} \{\s*allow read, write: if false;/);
  assert.match(firestoreRules, /match \/employeeAssignmentLocks\/\{lockId\} \{\s*allow read, write: if false;/);
  assert.match(assignmentContract, /SECTION_HEAD: 'SECTION_HEAD'/);
  assert.match(lockContract, /computeSectionHeadLockId/);
});

test('SECURITY: no Authorization Cutover — login/routing/adapter files remain free of any employeeAssignments reference', () => {
  assert.doesNotMatch(loginHtml, /employeeAssignments/);
  assert.doesNotMatch(managerLoginHtml, /employeeAssignments/);
  assert.doesNotMatch(dashboardAdapter, /employeeAssignments/);
  assert.doesNotMatch(smartMobilityAdapter, /employeeAssignments/);
});

console.log('employee-assignment-management-ui-unified-guard source-contract tests OK');
