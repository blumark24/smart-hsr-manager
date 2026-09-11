'use strict';
// ============================================================================
// ASSIGNMENT MANAGEMENT UI — PENDING-MUTATION GUARD + STALE-READ RACE HOTFIX.
//
// The other assignment-management-ui test files are source-contract
// (regex/string) coverage — sufficient to prove SHAPE, but not sufficient to
// prove TIMING/RACE behavior. This file extracts the REAL method bodies
// from manager.html (loadEmployeeAssignments, invalidateAndReloadAssignments,
// openEmployeeDetail/closeEmployeeDrawer, the create/end mutation flow, and
// adminApiErrorMessage) verbatim via node:vm and executes them against a
// minimal harness object with controllable, manually-resolved deferred
// promises standing in for callAdminEmployeesApi/getAuthToken — the same
// "extract real source, execute it directly" technique already established
// by test/dashboard-modal-evidence-regression.test.js.
//
// No optimistic local assignment mutation is ever asserted as correct here:
// every scenario below proves the UI waits for and reflects only genuine
// server responses, discards anything superseded, and never double-fires a
// mutation call.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const manager = fs.readFileSync(path.join(__dirname, '..', 'manager.html'), 'utf8');

function slice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `start marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `end marker not found: ${endMarker}`);
  return source.slice(start, end);
}

function buildHarnessClass() {
  // Pure top-level helpers (decodeJwtUid, isValidSectionIdentifier,
  // isValidFreeText, isValidDateString, plus the display formatters) —
  // none of them reference `this` or the DOM, so they're safe to eval as-is.
  const helpers = slice(manager, 'const INSTITUTIONAL_PRODUCT_LABELS', 'class Component extends DCLogic {');
  // The REAL, contiguous block of methods under test, extracted verbatim.
  const methods = slice(manager, 'openEmployeeDetail(employee) {', '// Re-reads the employee doc from the live registry');
  const errorMapper = slice(manager, 'adminApiErrorMessage(e) {', '// Server never returns a temp password');

  const src = `
    ${helpers}
    class Harness {
      ${methods}
      ${errorMapper}
    }
    this.Harness = Harness;
  `;
  const sandbox = { console };
  // atob is a browser/Node-global convenience decodeJwtUid relies on —
  // provide the same semantics via Buffer inside the isolated vm context.
  sandbox.atob = (b64) => Buffer.from(b64, 'base64').toString('binary');
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.Harness;
}

function fakeIdToken(uid) {
  const payload = Buffer.from(JSON.stringify({ user_id: uid })).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${payload}.signature`;
}

function makeInstance({ callAdminEmployeesApi } = {}) {
  const Harness = buildHarnessClass();
  const instance = new Harness();
  instance.state = {
    employeeDrawerOpen: false, selectedEmployee: null, actEmail: '',
    employeeAssignmentsLoading: false, employeeAssignmentsError: '',
    employeeAssignmentsCurrent: [], employeeAssignmentsHistory: [],
    caCreateOpen: false, caSubmitting: false, caError: '',
    caProductId: 'field', caAssignmentType: 'PRIMARY', caScopeType: 'PRODUCT', caScopeId: '',
    caStartAt: '2026-01-01', caEndAt: '', caReason: '',
    endConfirmingId: null, endReasonDraft: '', endSubmitting: false, endError: '',
  };
  instance.setState = function (patch) {
    const p = typeof patch === 'function' ? patch(this.state) : patch;
    Object.assign(this.state, p);
  };
  instance.flashLog = [];
  instance.flash = (msg) => { instance.flashLog.push(msg); };
  instance.getAuthToken = async () => fakeIdToken('mgr-uid-1');
  instance.callAdminEmployeesApi = callAdminEmployeesApi;
  return instance;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function signal() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, fire: resolve };
}

const EMPLOYEE = { id: 'emp-1', organizationId: 'org-a' };

// ============================================================================
// CREATE PENDING
// ============================================================================

test('CREATE PENDING: cancel/close/second-submit are all blocked while createAssignment is unresolved; the API is called exactly once', async () => {
  const createDeferred = deferred();
  const createCalled = signal();
  let createCallCount = 0;
  const instance = makeInstance({
    callAdminEmployeesApi: async (action) => {
      if (action === 'createAssignment') { createCallCount++; createCalled.fire(); return createDeferred.promise; }
      throw new Error('unexpected action ' + action);
    },
  });
  instance.state.selectedEmployee = EMPLOYEE;
  instance.state.employeeDrawerOpen = true;
  instance.state.caCreateOpen = true;

  const submitPromise = instance.submitCreateAssignment();
  await createCalled.promise;

  assert.equal(createCallCount, 1);
  assert.equal(instance.state.caSubmitting, true);

  // Cancel form attempted while pending — must be a no-op.
  instance.closeCreateAssignmentForm();
  assert.equal(instance.state.caCreateOpen, true, 'the create form must not close while a request is pending');
  assert.equal(instance.state.caSubmitting, true, 'caSubmitting must never be cleared by cancel while pending');

  // Drawer close attempted while pending — must be a no-op.
  instance.closeEmployeeDrawer();
  assert.equal(instance.state.employeeDrawerOpen, true, 'the drawer must not close while a create mutation is pending');
  assert.equal(instance.state.selectedEmployee, EMPLOYEE, 'selectedEmployee must not be cleared while pending');

  // A second create attempted while pending — must not call the API again.
  await instance.submitCreateAssignment();
  assert.equal(createCallCount, 1, 'a duplicate submit must never call createAssignment a second time');

  createDeferred.resolve({ assignment: { assignmentId: 'a-1', status: 'ACTIVE' } });
  await submitPromise;
  assert.equal(instance.state.caSubmitting, false, 'caSubmitting clears once the whole flow (including reload) finishes');
});

// ============================================================================
// END PENDING
// ============================================================================

test('END PENDING: cancel/close/second-end are all blocked while endAssignment is unresolved; the API is called exactly once', async () => {
  const endDeferred = deferred();
  const endCalled = signal();
  let endCallCount = 0;
  const instance = makeInstance({
    callAdminEmployeesApi: async (action) => {
      if (action === 'endAssignment') { endCallCount++; endCalled.fire(); return endDeferred.promise; }
      throw new Error('unexpected action ' + action);
    },
  });
  instance.state.selectedEmployee = EMPLOYEE;
  instance.state.employeeDrawerOpen = true;
  instance.state.endConfirmingId = 'assign-1';

  const endPromise = instance.confirmEndAssignment('assign-1');
  await endCalled.promise;

  assert.equal(endCallCount, 1);
  assert.equal(instance.state.endSubmitting, true);

  // Cancel confirmation attempted while pending — must be a no-op.
  instance.cancelEndConfirm();
  assert.equal(instance.state.endConfirmingId, 'assign-1', 'cancel must not clear the confirmation while pending');
  assert.equal(instance.state.endSubmitting, true);

  // Drawer close attempted while pending — must be a no-op.
  instance.closeEmployeeDrawer();
  assert.equal(instance.state.employeeDrawerOpen, true, 'the drawer must not close while an end mutation is pending');

  // A second end attempted while pending — must not call the API again.
  await instance.confirmEndAssignment('assign-1');
  assert.equal(endCallCount, 1, 'a duplicate end attempt must never call endAssignment a second time');

  endDeferred.resolve({ assignmentId: 'assign-1', status: 'ENDED' });
  await endPromise;
  assert.equal(instance.state.endSubmitting, false);
});

// ============================================================================
// POST-MUTATION REFRESH
// ============================================================================

test('POST-MUTATION REFRESH: caSubmitting stays true through the fresh listAssignments reload, blocking a second mutation, and only clears once the reload finishes', async () => {
  const listDeferred = deferred();
  const listCalled = signal();
  let createCallCount = 0, listCallCount = 0;
  const instance = makeInstance({
    callAdminEmployeesApi: async (action) => {
      if (action === 'createAssignment') { createCallCount++; return { assignment: { assignmentId: 'a-1', status: 'ACTIVE' } }; }
      if (action === 'listAssignments') { listCallCount++; listCalled.fire(); return listDeferred.promise; }
      throw new Error('unexpected action ' + action);
    },
  });
  instance.state.selectedEmployee = EMPLOYEE;
  instance.state.employeeDrawerOpen = true;
  instance.state.caCreateOpen = true;

  const submitPromise = instance.submitCreateAssignment();
  await listCalled.promise; // createAssignment already resolved; the fresh reload is now in flight

  assert.equal(createCallCount, 1);
  assert.equal(listCallCount, 1);
  assert.equal(instance.state.caSubmitting, true, 'caSubmitting must remain true while the post-mutation reload is pending');
  assert.equal(instance.state.caCreateOpen, false, 'the form itself may close as soon as the mutation succeeds');

  // A second mutation attempted during the reload window must still be blocked.
  await instance.submitCreateAssignment();
  assert.equal(createCallCount, 1, 'no second mutation may start while the post-mutation reload is still pending');

  listDeferred.resolve({
    assignments: [{ assignmentId: 'a-1', status: 'ACTIVE', organizationId: 'org-a', productId: 'field', scope: { type: 'PRODUCT', id: 'field' }, assignmentType: 'PRIMARY', startAt: '2026-01-01' }],
  });
  await submitPromise;

  assert.equal(instance.state.caSubmitting, false, 'caSubmitting only clears once the reload has actually finished');
  assert.equal(instance.state.employeeAssignmentsCurrent.length, 1);
  assert.equal(instance.state.employeeAssignmentsCurrent[0].assignmentId, 'a-1');
});

// ============================================================================
// STALE SAME-EMPLOYEE READ
// ============================================================================

test('STALE SAME-EMPLOYEE READ: an older in-flight load for the same employee is fully discarded once a newer load for that employee has already resolved', async () => {
  const deferredA = deferred();
  const deferredB = deferred();
  let call = 0;
  const instance = makeInstance({
    callAdminEmployeesApi: async () => {
      call++;
      if (call === 1) return deferredA.promise;
      if (call === 2) return deferredB.promise;
      throw new Error('unexpected extra call');
    },
  });
  instance.state.selectedEmployee = EMPLOYEE;

  // Both loads start for the SAME employee before either resolves — an
  // async function body runs synchronously up to its first await, so these
  // two calls are issued, in order, before any awaiting happens.
  const loadA = instance.loadEmployeeAssignments(EMPLOYEE);
  const loadB = instance.loadEmployeeAssignments(EMPLOYEE);
  assert.equal(call, 2, 'both loads must have already reached the API call synchronously');

  // B (the newer request) resolves first, with NEW data.
  deferredB.resolve({
    assignments: [{ assignmentId: 'new-1', status: 'ACTIVE', organizationId: 'org-a', productId: 'field', scope: { type: 'PRODUCT', id: 'field' }, assignmentType: 'PRIMARY', startAt: '2026-02-01' }],
  });
  await loadB;

  assert.equal(instance.state.employeeAssignmentsCurrent.length, 1);
  assert.equal(instance.state.employeeAssignmentsCurrent[0].assignmentId, 'new-1');

  // A (the older request) resolves LATER, with OLD/stale data — it must be
  // discarded completely: no cache write, no current/history write, no
  // error-state write.
  deferredA.resolve({
    assignments: [{ assignmentId: 'old-1', status: 'ACTIVE', organizationId: 'org-a', productId: 'field', scope: { type: 'PRODUCT', id: 'field' }, assignmentType: 'PRIMARY', startAt: '2026-01-01' }],
  });
  await loadA;

  assert.equal(instance.state.employeeAssignmentsCurrent.length, 1, 'the stale response must never be appended or merged in');
  assert.equal(instance.state.employeeAssignmentsCurrent[0].assignmentId, 'new-1', 'final UI state must remain B');
  const cached = instance._employeeAssignmentsCache.get(EMPLOYEE.id);
  assert.equal(cached.current[0].assignmentId, 'new-1', 'final cache must remain B');
});

// ============================================================================
// PRE-MUTATION VS POST-MUTATION
// ============================================================================

test('PRE-MUTATION VS POST-MUTATION: a pre-existing in-flight list load is superseded and discarded by a mutation\'s own fresh post-mutation reload', async () => {
  const preDeferred = deferred();
  const postDeferred = deferred();
  const postCalled = signal();
  let listCallCount = 0;
  const instance = makeInstance({
    callAdminEmployeesApi: async (action) => {
      if (action === 'listAssignments') {
        listCallCount++;
        if (listCallCount === 1) return preDeferred.promise;
        if (listCallCount === 2) { postCalled.fire(); return postDeferred.promise; }
        throw new Error('unexpected extra listAssignments call');
      }
      if (action === 'createAssignment') return { assignment: { assignmentId: 'a-2', status: 'ACTIVE' } };
      throw new Error('unexpected action ' + action);
    },
  });
  instance.state.selectedEmployee = EMPLOYEE;
  instance.state.employeeDrawerOpen = true;
  instance.state.caCreateOpen = true;

  // A pre-existing in-flight load — e.g. the drawer's own initial shadow
  // read, already in flight when the mutation below starts.
  const preLoad = instance.loadEmployeeAssignments(EMPLOYEE);
  assert.equal(listCallCount, 1);

  // The mutation runs; its own post-mutation reload must start and become
  // authoritative regardless of the pre-mutation load still in flight.
  const submitPromise = instance.submitCreateAssignment();
  await postCalled.promise;
  assert.equal(listCallCount, 2, 'the mutation must trigger its own fresh listAssignments call');

  // The fresh post-mutation result resolves first.
  postDeferred.resolve({
    assignments: [{ assignmentId: 'fresh-1', status: 'ACTIVE', organizationId: 'org-a', productId: 'field', scope: { type: 'PRODUCT', id: 'field' }, assignmentType: 'PRIMARY', startAt: '2026-02-01' }],
  });
  await submitPromise;

  assert.equal(instance.state.caSubmitting, false);
  assert.equal(instance.state.employeeAssignmentsCurrent.length, 1);
  assert.equal(instance.state.employeeAssignmentsCurrent[0].assignmentId, 'fresh-1');

  // The stale pre-mutation response resolves later — it must be fully discarded.
  preDeferred.resolve({
    assignments: [{ assignmentId: 'stale-1', status: 'ACTIVE', organizationId: 'org-a', productId: 'field', scope: { type: 'PRODUCT', id: 'field' }, assignmentType: 'PRIMARY', startAt: '2026-01-01' }],
  });
  await preLoad;

  assert.equal(instance.state.employeeAssignmentsCurrent.length, 1);
  assert.equal(instance.state.employeeAssignmentsCurrent[0].assignmentId, 'fresh-1', 'the stale pre-mutation response must never overwrite the fresh post-mutation result');
  const cached = instance._employeeAssignmentsCache.get(EMPLOYEE.id);
  assert.equal(cached.current[0].assignmentId, 'fresh-1');
});

// ============================================================================
// BONUS — FIX 4: mutation success vs refresh failure
// ============================================================================

test('MUTATION SUCCESS VS REFRESH FAILURE: a failed post-mutation reload never claims the mutation itself failed, and never triggers an automatic retry of the mutation', async () => {
  let createCallCount = 0;
  const instance = makeInstance({
    callAdminEmployeesApi: async (action) => {
      if (action === 'createAssignment') { createCallCount++; return { assignment: { assignmentId: 'a-3', status: 'ACTIVE' } }; }
      if (action === 'listAssignments') { const e = new Error('request_failed'); e.reason = null; throw e; }
      throw new Error('unexpected action ' + action);
    },
  });
  instance.state.selectedEmployee = EMPLOYEE;
  instance.state.employeeDrawerOpen = true;
  instance.state.caCreateOpen = true;

  await instance.submitCreateAssignment();

  assert.equal(createCallCount, 1, 'a failed refresh must never cause the mutation to be resubmitted automatically');
  assert.equal(instance.state.caSubmitting, false);
  assert.equal(instance.state.caError, '', 'the mutation succeeded — caError must not carry a false failure message');
  assert.ok(instance.flashLog.some(m => m.includes('تم تنفيذ الإجراء') && m.includes('تعذر تحديث')), 'an honest refresh-failed message must be shown, never a mutation-failed message');
});

console.log('employee-assignment-management-ui-runtime tests OK');
