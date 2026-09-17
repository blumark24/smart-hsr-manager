'use strict';
// ============================================================================
// PHASE 09 GATE 1 — regression coverage for a real Manager/Lands schema
// mismatch found during the release-candidate Rules audit.
//
// manager-lands-adapter.js's computeGrantCompleteness() had been ported from
// an EARLIER Lands source (design/lands-vision2030-final-ui's
// client/lands-domain.js) that checked fields no longer — and in some
// cases never actually — present in Lands' real, Rules-enforced landGrant
// schema: nested beneficiary/royal_order/allocation_decision objects,
// denormalized plan_reference_number/parcel_reference_number strings, and a
// conveyance{letter_number,letter_date} object that does not exist anywhere
// in Lands' current schema, Rules, or trusted server code (confirmed via a
// cross-repo grep: zero occurrences of "conveyance" in smart-hsr-lands).
// Every real grant was silently scored far below its true completeness.
//
// The fix re-ports the CURRENT authoritative implementation,
// smart-hsr-lands/client/lands-core.js's computeCompleteness(), which only
// ever checks the *_id foreign keys and document_ids Lands' own Rules
// (validLandGrant()'s hasOnly() allowlist) actually allow.
//
// Runs the ACTUAL extracted source (not a reimplementation) in a sandboxed
// vm context — the same real-execution technique already used by
// test/manager-lands-sso.test.js and
// test/operational-map-open-twin-button.test.js for other inline-script
// logic in this codebase.
// ============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'manager-lands-adapter.js'), 'utf8');

function loadComputeGrantCompleteness() {
  const start = source.indexOf('function computeGrantCompleteness(grant) {');
  const end = source.indexOf('\n}\n', start) + 3;
  const snippet = source.slice(start, end) + '\nmodule.exports = { computeGrantCompleteness };';
  const sandbox = { module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(snippet, sandbox, { filename: 'manager-lands-adapter.js (extracted)' });
  return sandbox.module.exports.computeGrantCompleteness;
}

const vmComputeGrantCompleteness = loadComputeGrantCompleteness();
// vm.createContext gives arrays/objects the VM realm's own Array/Object
// intrinsics, which node:assert/strict's deepEqual correctly refuses to
// treat as reference-equal to this realm's Array/Object even when every
// value inside is identical. Re-serializing through JSON sidesteps realm
// identity entirely (and is exactly what every real caller of this
// function does with its result: Firestore documents, not shared prototypes).
function computeGrantCompleteness(grant) {
  return JSON.parse(JSON.stringify(vmComputeGrantCompleteness(grant)));
}

test('a grant with none of the real Lands *_id fields is 0% complete', () => {
  const result = computeGrantCompleteness({});
  assert.equal(result.percentage, 0);
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.missing.sort(), ['allocation_decision', 'beneficiary', 'documents', 'parcel', 'plan', 'royal_order'].sort());
});

test('a grant with all 6 real Lands fields set is 100% complete', () => {
  const result = computeGrantCompleteness({
    beneficiary_id: 'b1', royal_order_id: 'r1', allocation_decision_id: 'a1',
    plan_id: 'p1', parcel_id: 'pc1', document_ids: ['d1'],
  });
  assert.equal(result.percentage, 100);
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.missing, []);
});

test('a partially-populated real grant (4 of 6 fields) reports the correct percentage and exactly the missing axes', () => {
  const result = computeGrantCompleteness({
    beneficiary_id: 'b1', royal_order_id: 'r1', allocation_decision_id: 'a1', plan_id: 'p1',
  });
  assert.equal(result.percentage, 67);
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.missing.sort(), ['documents', 'parcel'].sort());
});

test('an empty document_ids array does not count as having documents', () => {
  const result = computeGrantCompleteness({
    beneficiary_id: 'b1', royal_order_id: 'r1', allocation_decision_id: 'a1',
    plan_id: 'p1', parcel_id: 'pc1', document_ids: [],
  });
  assert.equal(result.missing.includes('documents'), true);
});

test('REGRESSION: the retired stale-schema fields (nested beneficiary/royal_order objects, plan_reference_number, parcel_reference_number, conveyance) have zero effect — a grant using ONLY those never-real fields still scores 0%, proving the fix no longer reads them', () => {
  const staleShapedGrant = {
    beneficiary: { name: 'Ali', national_id: '123' },
    royal_order: { number: 'RO-1', date: '2024-01-01' },
    allocation_decision: { number: 'AD-1', date: '2024-01-02' },
    plan_reference_number: 'PLAN-1', parcel_reference_number: 'PARCEL-1',
    conveyance: { letter_number: 'C-1', letter_date: '2024-02-01' },
  };
  const result = computeGrantCompleteness(staleShapedGrant);
  assert.equal(result.percentage, 0);
  assert.equal(result.status, 'incomplete');
});
