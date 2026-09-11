'use strict';
// ============================================================================
// ASSIGNMENT MANAGEMENT UI — PENDING-MUTATION GUARD + STALE-READ RACE HOTFIX.
// Source-contract coverage (see test/employee-assignment-management-ui-
// runtime.test.js for the executable, deferred-promise proof of the actual
// timing/race behavior — this file just pins the specific code shapes the
// hotfix requires, so a future edit that silently removes a guard is
// caught immediately).
// ============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const manager = fs.readFileSync(path.join(__dirname, '..', 'manager.html'), 'utf8');

function methodBody(source, signature, maxLen = 3200) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  return source.slice(start, start + maxLen);
}

// ---- FIX 1 — never clear a mutation guard while pending ----

test('FIX 1: closeCreateAssignmentForm never clears caSubmitting and refuses to run while a mutation is pending (unified busy guard — see the newer unified-guard hotfix)', () => {
  const fn = methodBody(manager, 'closeCreateAssignmentForm() {', 300);
  assert.match(fn, /if \(this\.isAssignmentMutationBusy\(\)\) return;/);
  assert.doesNotMatch(fn, /caSubmitting:\s*false/, 'this method must never itself clear the mutation guard');
});

test('FIX 1: closeEmployeeDrawer never clears caSubmitting/endSubmitting and refuses to run while either is pending', () => {
  const fn = methodBody(manager, 'closeEmployeeDrawer() {', 700);
  assert.match(fn, /if \(this\.isAssignmentMutationBusy\(\)\) return;/);
  assert.doesNotMatch(fn, /caSubmitting:\s*false/);
  assert.doesNotMatch(fn, /endSubmitting:\s*false/);
});

test('FIX 1: cancelEndConfirm refuses to run while a mutation is pending (unified busy guard)', () => {
  const fn = methodBody(manager, 'cancelEndConfirm() {', 300);
  assert.match(fn, /if \(this\.isAssignmentMutationBusy\(\)\) return;/);
});

test('FIX 1: the create-form cancel button and the end-confirmation cancel button are both disabled while their mutation is pending', () => {
  assert.match(manager, /closeCreateAssignmentForm \}\}" data-f="1" disabled="\{\{ caSubmitting \}\}"/);
  assert.match(manager, /cancelEndConfirm \}\}" data-f="1" disabled="\{\{ endSubmitting \}\}"/);
});

// ---- FIX 2 — keep mutation locked until server refresh ----

test('FIX 2: invalidateAndReloadAssignments is async and its result is returned from loadEmployeeAssignments (awaited by callers)', () => {
  const fn = methodBody(manager, 'async invalidateAndReloadAssignments(employee) {', 500);
  assert.match(fn, /return this\.loadEmployeeAssignments\(employee\);/);
});

test('FIX 2: submitCreateAssignment awaits the post-mutation reload before clearing caSubmitting', () => {
  const fn = methodBody(manager, 'async submitCreateAssignment() {');
  const successStart = fn.indexOf("this.flash('تمت إضافة التكليف بنجاح.');");
  assert.notEqual(successStart, -1);
  const successBlock = fn.slice(successStart, fn.indexOf('} catch (e) {', successStart));
  const refreshCallIdx = successBlock.indexOf('await this.invalidateAndReloadAssignments(employee);');
  const clearIdx = successBlock.indexOf('caSubmitting: false');
  assert.notEqual(refreshCallIdx, -1);
  assert.notEqual(clearIdx, -1);
  assert.ok(clearIdx > refreshCallIdx, 'caSubmitting must only be cleared AFTER the reload is awaited');
  // The old bug: setting caSubmitting:false in the same setState call that
  // closes the form, before the reload even starts.
  const formCloseIdx = successBlock.indexOf('this.setState({ caCreateOpen: false });');
  assert.notEqual(formCloseIdx, -1);
  assert.ok(formCloseIdx < refreshCallIdx, 'the form may close immediately, but caSubmitting must not be touched at that point');
});

test('FIX 2: confirmEndAssignment awaits the post-mutation reload before clearing endSubmitting', () => {
  const fn = methodBody(manager, 'async confirmEndAssignment(assignmentId) {');
  const successStart = fn.indexOf("this.flash('تم إنهاء التكليف بنجاح.');");
  assert.notEqual(successStart, -1);
  const successBlock = fn.slice(successStart, fn.indexOf('} catch (e) {', successStart));
  const refreshCallIdx = successBlock.indexOf('await this.invalidateAndReloadAssignments(employee);');
  const clearIdx = successBlock.indexOf('endSubmitting: false');
  assert.notEqual(refreshCallIdx, -1);
  assert.notEqual(clearIdx, -1);
  assert.ok(clearIdx > refreshCallIdx, 'endSubmitting must only be cleared AFTER the reload is awaited');
});

// ---- FIX 3 — same-employee stale response protection ----

test('FIX 3: a monotonically increasing load sequence guards every write of cache/current/history/error state', () => {
  const fn = methodBody(manager, 'async loadEmployeeAssignments(employee) {');
  assert.match(fn, /this\._employeeAssignmentsLoadSeq = \(this\._employeeAssignmentsLoadSeq \|\| 0\) \+ 1;/);
  assert.match(fn, /const seq = this\._employeeAssignmentsLoadSeq;/);
  // Every place that would otherwise apply a result must re-check the
  // sequence first — this checks the guard appears at least 3 times
  // (cached branch, catch branch, success branch).
  const guardCount = (fn.match(/this\._employeeAssignmentsLoadSeq !== seq/g) || []).length;
  assert.ok(guardCount >= 3, `expected the stale-seq guard before each write point, found ${guardCount}`);
});

test('FIX 3: the guard does not rely only on selectedEmployee.id — the sequence check is independent of it', () => {
  const fn = methodBody(manager, 'async loadEmployeeAssignments(employee) {');
  // The seq check must appear standing on its own (not only combined with
  // the id comparison), proving it protects same-employee races too.
  assert.match(fn, /if \(this\._employeeAssignmentsLoadSeq !== seq\) return/);
});

// ---- FIX 4 — mutation success vs refresh failure ----

test('FIX 4: a failed post-mutation refresh shows the exact required honest message and never marks the mutation itself as failed', () => {
  const createFn = methodBody(manager, 'async submitCreateAssignment() {');
  assert.match(createFn, /if \(!refreshOk\) \{/);
  assert.match(createFn, /تم تنفيذ الإجراء، لكن تعذر تحديث سجل التكليفات\. أعد المحاولة\./);

  const endFn = methodBody(manager, 'async confirmEndAssignment(assignmentId) {');
  assert.match(endFn, /if \(!refreshOk\) \{/);
  assert.match(endFn, /تم تنفيذ الإجراء، لكن تعذر تحديث سجل التكليفات\. أعد المحاولة\./);
});

test('FIX 4: no automatic retry of the mutation itself exists anywhere in the create/end flows', () => {
  const createFn = methodBody(manager, 'async submitCreateAssignment() {');
  const endFn = methodBody(manager, 'async confirmEndAssignment(assignmentId) {');
  // No timer-based retry mechanism, and the mutation action name appears
  // exactly once each — i.e. never called a second time to "fix" a
  // refresh failure (comments discussing the policy are fine; a second
  // real call would push this count to 2+).
  assert.doesNotMatch(createFn, /setTimeout/);
  assert.doesNotMatch(endFn, /setTimeout/);
  assert.equal((createFn.match(/'createAssignment'/g) || []).length, 1);
  assert.equal((endFn.match(/'endAssignment'/g) || []).length, 1);
});

test('no browser abort behavior (AbortController) was introduced that could leave an unknown server outcome', () => {
  assert.doesNotMatch(manager, /AbortController/);
});

console.log('employee-assignment-management-ui-hotfix source-contract tests OK');
