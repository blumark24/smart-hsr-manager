'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { evaluate, requiredIds, approvalIds, requiredRecoveryIds, isCandidateEvidenceUrl } = require('../scripts/municipal-release-gate.cjs');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/release/municipal-acceptance-2026-10-31.json'), 'utf8'));
const copy = v => JSON.parse(JSON.stringify(v));

// A purely synthetic syntax fixture. Not a real backup, proof or approval.
function addSyntheticRecoveryProofs(candidate) {
  candidate.operationalRecovery = {};
  for (const id of requiredRecoveryIds) {
    candidate.operationalRecovery[id] = {
      status: 'PASS',
      reviewedAt: '2026-11-02T00:00:00Z',
      reviewedBy: 'SyntheticReviewerForUnitTests',
      evidence: ['https://github.com/blumark24/smart-hsr-manager/issues/119']
    };
  }
}

test('current municipal acceptance is fail-closed, not falsely green', () => {
  assert.equal(manifest.overallStatus, 'NO-GO');
  const result = evaluate(manifest);
  assert.equal(result.decision, 'NO-GO');
  assert.ok(result.blockers.length >= requiredIds.length);
});

test('each required gate and sign-off is individually mandatory', () => {
  const approved = copy(manifest);
  approved.productionChangeAuthorized = true;
  // Synthetic test URL: format only. This test does NOT certify reviewed evidence.
  approved.gates.forEach(g => { g.status = 'PASS'; g.evidence = ['https://github.com/blumark24/smart-hsr-manager/issues/73']; });
  approvalIds.forEach(id => { approved.approvals[id] = true; });
  addSyntheticRecoveryProofs(approved);
  assert.equal(evaluate(approved, { expectedSha: approved.candidateSha }).decision, 'GO-CANDIDATE-REQUIRES-INDEPENDENT-VALIDATION');

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

test('approved-looking manifest requires independent SHA pin and rejects mismatches', () => {
  const approved = copy(manifest);
  approved.productionChangeAuthorized = true;
  approved.gates.forEach(g => {
    g.status = 'PASS';
    g.evidence = ['https://github.com/blumark24/smart-hsr-manager/issues/73'];
  });
  approvalIds.forEach(id => { approved.approvals[id] = true; });
  addSyntheticRecoveryProofs(approved);

  assert.equal(evaluate(approved).decision, 'NO-GO', 'missing independently pinned target SHA');
  assert.ok(evaluate(approved).blockers.some(s => s.includes('expected target SHA')));
  const wrongSha = 'f'.repeat(40) === approved.candidateSha ? 'e'.repeat(40) : 'f'.repeat(40);
  const mismatched = evaluate(approved, { expectedSha: wrongSha });
  assert.equal(mismatched.decision, 'NO-GO');
  assert.ok(mismatched.blockers.some(s => s.includes('does not match')));
  assert.equal(evaluate(approved, { expectedSha: 'not-a-sha' }).decision, 'NO-GO');
  assert.equal(evaluate(approved, { expectedSha: approved.candidateSha }).decision, 'GO-CANDIDATE-REQUIRES-INDEPENDENT-VALIDATION');
});

test('placeholder, non-HTTPS and local evidence links are never accepted', () => {
  for (const url of [
    'https://example.invalid/synthetic-reviewed-evidence',
    'https://example.com/check', 'https://repo.test/approval',
    'https://localhost/report', 'https://127.0.0.1/report',
    'http://github.com/blumark24/smart-hsr-manager/issues/73',
    'https://user:pass@github.com/blumark24/smart-hsr-manager/issues/73',
    'not-a-url'
  ]) assert.equal(isCandidateEvidenceUrl(url), false, url);
  assert.equal(isCandidateEvidenceUrl('https://github.com/blumark24/smart-hsr-manager/issues/73'), true);
  const approved = copy(manifest);
  approved.productionChangeAuthorized = true;
  approved.gates.forEach(g => { g.status = 'PASS'; g.evidence = ['https://github.com/blumark24/smart-hsr-manager/issues/73']; });
  approvalIds.forEach(id => { approved.approvals[id] = true; });
  addSyntheticRecoveryProofs(approved);
  approved.gates[0].evidence = ['https://example.invalid/fake-proof'];
  assert.equal(evaluate(approved, { expectedSha: approved.candidateSha }).decision, 'NO-GO');
});

test('operational recovery evidence is required independently of all functional signoffs', () => {
  assert.deepEqual(requiredRecoveryIds,
    ['firestoreBackup', 'b2FileRecovery', 'isolatedRestore', 'rollbackRunbook']);
  const approved = copy(manifest);
  approved.productionChangeAuthorized = true;
  approved.gates.forEach(g => {
    g.status = 'PASS';
    g.evidence = ['https://github.com/blumark24/smart-hsr-manager/issues/119'];
  });
  approvalIds.forEach(id => { approved.approvals[id] = true; });
  assert.equal(evaluate(approved, { expectedSha: approved.candidateSha }).decision,
    'NO-GO', 'regular signoffs must not bypass backup/restore/rollback evidence');
  addSyntheticRecoveryProofs(approved);
  assert.equal(evaluate(approved, { expectedSha: approved.candidateSha }).decision,
    'GO-CANDIDATE-REQUIRES-INDEPENDENT-VALIDATION',
    'synthetic schema only tests syntax, not external evidence validity');
  for (const id of requiredRecoveryIds) {
    const missing = copy(approved);
    delete missing.operationalRecovery[id];
    assert.equal(evaluate(missing, { expectedSha: missing.candidateSha }).decision, 'NO-GO');
    const noEvidence = copy(approved);
    noEvidence.operationalRecovery[id].evidence = [];
    assert.equal(evaluate(noEvidence, { expectedSha: noEvidence.candidateSha }).decision, 'NO-GO');
    const noTimestamp = copy(approved);
    noTimestamp.operationalRecovery[id].reviewedAt = 'pending';
    assert.equal(evaluate(noTimestamp, { expectedSha: noTimestamp.candidateSha }).decision, 'NO-GO');
    const noReviewer = copy(approved);
    noReviewer.operationalRecovery[id].reviewedBy = 'TBD';
    assert.equal(evaluate(noReviewer, { expectedSha: noReviewer.candidateSha }).decision, 'NO-GO');
    const hold = copy(approved);
    hold.operationalRecovery[id].status = 'HOLD';
    assert.equal(evaluate(hold, { expectedSha: hold.candidateSha }).decision, 'NO-GO');
  }
  assert.equal(manifest.productionChangeAuthorized, false);
  assert.equal(manifest.overallStatus, 'NO-GO');
  assert.equal(manifest.operationalRecovery, undefined);
});
