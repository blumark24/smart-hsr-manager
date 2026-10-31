'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { evaluate, requiredIds, approvalIds } = require('../scripts/municipal-release-gate.cjs');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/release/municipal-acceptance-2026-10-31.json'), 'utf8'));
const copy = v => JSON.parse(JSON.stringify(v));

test('current municipal acceptance is fail-closed, not falsely green', () => {
  assert.equal(manifest.overallStatus, 'NO-GO');
  const result = evaluate(manifest);
  assert.equal(result.decision, 'NO-GO');
  assert.ok(result.blockers.length >= requiredIds.length);
});

test('each required gate and sign-off is individually mandatory', () => {
  const approved = copy(manifest);
  approved.productionChangeAuthorized = true;
  approved.gates.forEach(g => { g.status = 'PASS'; g.evidence = ['https://example.invalid/synthetic-reviewed-evidence']; });
  approvalIds.forEach(id => { approved.approvals[id] = true; });
  assert.equal(evaluate(approved).decision, 'GO-CANDIDATE-REQUIRES-INDEPENDENT-VALIDATION');

  for (const id of requiredIds) {
    const broken = copy(approved);
    broken.gates.find(g => g.id === id).evidence = [];
    assert.equal(evaluate(broken).decision, 'NO-GO', 'missing evidence: ' + id);
  }
  for (const id of approvalIds) {
    const broken = copy(approved);
    broken.approvals[id] = false;
    assert.equal(evaluate(broken).decision, 'NO-GO', 'missing approval: ' + id);
  }
});

test('duplicate, missing or unknown gates block acceptance', () => {
  const broken = copy(manifest);
  broken.gates.push(copy(broken.gates[0]));
  assert.equal(evaluate(broken).decision, 'NO-GO');
  assert.ok(evaluate(null).blockers.length > 0);
});
