'use strict';
// ============================================================================
// PHASE 08.3 — regression coverage for a real defect real-browser acceptance
// surfaced: operational-map.html's "Open in Twin" button was only ever
// given an onclick handler inside openEntityCard() (gated on the button
// already being visible), so clicking it before selecting any entity did
// nothing at all — the button appeared usable but silently no-op'd.
//
// Fixed by giving the button a real default destination (organizationId
// only, no entity context) right where its visibility is decided
// (onAuthStateChanged), while openEntityCard() still overrides it with
// entity-specific continuity context once an entity is selected.
//
// Runs the ACTUAL extracted source lines (not a reimplementation) in a
// sandboxed vm context — the same real-execution technique already used by
// test/manager-lands-sso.test.js for other inline-script logic in this
// codebase's HTML files.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'operational-map.html'), 'utf8');

function makeButton() {
  return { hidden: false, onclick: null };
}

function runVisibilityAndDefaultHandlerAssignment({ allowed, organizationId }) {
  const start = source.indexOf("document.getElementById('openTwinBtn').hidden = !policy.evaluateTwinAdmission");
  const end = source.indexOf('\n', source.indexOf("  }\n", start) + 3);
  const snippet = source.slice(start, end);

  const openTwinBtn = makeButton();
  const document = { getElementById: (id) => (id === 'openTwinBtn' ? openTwinBtn : null) };
  const policy = { evaluateTwinAdmission: () => ({ allowed }) };
  const caller = {};
  const mapContext = { organizationId };
  const buildContinuityUrlCalls = [];
  const continuity = {
    buildContinuityUrl: (base, context) => {
      buildContinuityUrlCalls.push({ base, context });
      return { url: `${base}#continuity=${context.organizationId}` };
    },
  };
  const location = { href: null, search: '?useEmulators=1' };

  const sandbox = { document, policy, caller, mapContext, continuity, location, console };
  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox, { filename: 'operational-map.html (extracted)' });

  return { openTwinBtn, buildContinuityUrlCalls, location };
}

test('Twin-admitted role: openTwinBtn gets a working default onclick handler immediately, before any entity is ever selected', () => {
  const { openTwinBtn, buildContinuityUrlCalls, location } = runVisibilityAndDefaultHandlerAssignment({ allowed: true, organizationId: 'org-a' });
  assert.equal(openTwinBtn.hidden, false);
  assert.equal(typeof openTwinBtn.onclick, 'function');

  // Simulate the real click a manager would make with no entity selected yet.
  openTwinBtn.onclick();
  assert.equal(buildContinuityUrlCalls.length, 1);
  assert.equal(buildContinuityUrlCalls[0].context.organizationId, 'org-a');
  assert.equal(buildContinuityUrlCalls[0].context.entityId, undefined);
  assert.ok(location.href && location.href.startsWith('/twin.html?useEmulators=1'));
});

test('non-Twin-admitted role: openTwinBtn stays hidden and gets no onclick handler at all', () => {
  const { openTwinBtn, buildContinuityUrlCalls } = runVisibilityAndDefaultHandlerAssignment({ allowed: false, organizationId: 'org-a' });
  assert.equal(openTwinBtn.hidden, true);
  assert.equal(openTwinBtn.onclick, null);
  assert.equal(buildContinuityUrlCalls.length, 0);
});
