'use strict';
// ============================================================================
// componentDidUpdate(prevState undefined) REGRESSION
//
// manager.html's Manager Component previously did:
//   componentDidUpdate(_prevProps, prevState) {
//     this.syncOperationalMap();
//     if (prevState.view !== this.state.view || prevState.orgId !== this.state.orgId) this.publishManagerView();
//   }
// The host framework (support.js's StreamableComponent) can invoke a
// Logic subclass's componentDidUpdate without a prevState argument, so
// `prevState` arrives as undefined and `prevState.view` throws
// "Cannot read properties of undefined (reading 'view')" on every update
// after mount. That crash aborts BEFORE publishManagerView() runs, so
// data-smart-hsr-manager-view and the smart-hsr:manager-view-change event
// never update after the initial mount — silently breaking every consumer
// gated on the "users" view (the whole approved User Center route guard).
//
// This extracts the REAL componentDidUpdate/publishManagerView methods
// verbatim from manager.html via node:vm and executes them directly, the
// same "extract real source, execute it directly" technique established by
// test/dashboard-modal-evidence-regression.test.js and
// test/employee-assignment-management-ui-runtime.test.js — proving the
// actual runtime behavior, not just a source pattern.
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

function buildHarness(sandboxExtras) {
  const methods = slice(manager, 'componentDidUpdate(_prevProps, prevState) {', 'operationalObservations() {');
  const src = `
    class Harness {
      ${methods}
    }
    this.Harness = Harness;
  `;
  // document/window/CustomEvent must live IN the vm context: the extracted
  // methods reference them as bare identifiers, which a vm context resolves
  // against its own global object, not Node's `global`.
  const sandbox = { console, ...sandboxExtras };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.Harness;
}

function makeInstance(state) {
  const attrs = {};
  const dispatched = [];
  const document = {
    documentElement: {
      setAttribute: (name, value) => { attrs[name] = value; },
    },
  };
  const window = {
    dispatchEvent: (event) => { dispatched.push(event); },
  };
  class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init && init.detail; }
  }

  const Harness = buildHarness({ document, window, CustomEvent });
  const instance = new Harness();
  instance.state = state;
  instance.syncCalls = 0;
  instance.syncOperationalMap = () => { instance.syncCalls += 1; };

  return { instance, attrs, dispatched };
}

test('componentDidUpdate does not throw when prevState is undefined (host framework called it with one argument)', () => {
  const { instance, attrs, dispatched } = makeInstance({ view: 'users', orgId: 'org-1' });
  assert.doesNotThrow(() => instance.componentDidUpdate({}, undefined));
  assert.equal(instance.syncCalls, 1, 'syncOperationalMap must still run');
  assert.equal(attrs['data-smart-hsr-manager-view'], 'users', 'publishManagerView must run and sync the current route when prevState is missing');
  assert.equal(dispatched.length, 1);
  // The event detail object is constructed inside the vm sandbox realm, so
  // its prototype differs from a plain Node object literal's — compare
  // fields directly rather than with assert.deepEqual (which treats that
  // prototype mismatch as inequality even when the structure matches).
  assert.equal(dispatched[0].detail.view, 'users');
  assert.equal(dispatched[0].detail.organizationId, 'org-1');
});

test('componentDidUpdate does not throw when prevState is null', () => {
  const { instance, attrs } = makeInstance({ view: 'fieldSurvey', orgId: 'org-2' });
  assert.doesNotThrow(() => instance.componentDidUpdate({}, null));
  assert.equal(attrs['data-smart-hsr-manager-view'], 'fieldSurvey');
});

test('componentDidUpdate still skips publishManagerView when view and orgId are unchanged (no regression on the happy path)', () => {
  const { instance, attrs, dispatched } = makeInstance({ view: 'users', orgId: 'org-1' });
  instance.componentDidUpdate({}, { view: 'users', orgId: 'org-1' });
  assert.equal(instance.syncCalls, 1, 'syncOperationalMap must always run');
  assert.equal(attrs['data-smart-hsr-manager-view'], undefined, 'publishManagerView must not fire when nothing relevant changed');
  assert.equal(dispatched.length, 0);
});

test('componentDidUpdate still fires publishManagerView on a real view change with a real prevState', () => {
  const { instance, attrs, dispatched } = makeInstance({ view: 'users', orgId: 'org-1' });
  instance.componentDidUpdate({}, { view: 'home', orgId: 'org-1' });
  assert.equal(attrs['data-smart-hsr-manager-view'], 'users');
  assert.equal(dispatched.length, 1);
});
