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


const { inspectBackupMetadata, parseList } = require('../scripts/firestore-backup-readonly-audit.cjs');

test('Firestore backups inspector never reads municipal collections or changes Production', () => {
  const calls = [];
  const db = 'projects/smart-hsr-manager/databases/(default)';
  function mockRun(program, args, options) {
    calls.push({ program, args, options });
    if (args.includes('schedules')) return JSON.stringify([
      { name: db + '/backupSchedules/synthetic-only', retention: '604800s' }
    ]);
    return JSON.stringify([
      { database: db, state: 'READY', snapshotTime: '2026-11-01T11:00:00Z',
        expireTime: '2026-11-08T11:00:00Z',
        name: 'projects/smart-hsr-manager/locations/me-central2/backups/synthetic',
        nationalId: 'secret-must-never-appear' },
      { database: db, state: 'CREATING', snapshotTime: '2026-11-02T11:00:00Z' },
      { database: 'projects/other-tenant/databases/(default)', state: 'READY',
        snapshotTime: '2026-11-02T20:00:00Z' }
    ]);
  }
  const result = inspectBackupMetadata(mockRun, { now: '2026-11-02T11:00:00Z' });
  assert.equal(result.project, 'smart-hsr-manager');
  assert.equal(result.location, 'me-central2');
  assert.equal(result.schedulesDiscovered, 1);
  assert.equal(result.backupMetadataDiscovered, 2);
  assert.equal(result.readyBackupsWithValidTimestamp, 1);
  assert.equal(result.unexpiredReadyBackups, 1);
  assert.equal(result.readyBackupsWithoutVerifiedExpiry, 0);
  assert.equal(result.latestReadySnapshotUtc, '2026-11-01T11:00:00.000Z');
  assert.equal(result.latestReadySnapshotAgeHours, 24);
  assert.equal(result.rpoThresholdApproved, false);
  assert.equal(result.status, 'BACKUP_METADATA_PRESENT_RESTORE_UNVERIFIED');
  assert.equal(result.restorationVerified, false);
  assert.equal(result.complianceReviewed, false);
  assert.equal(result.productionChangeAuthorized, false);
  assert.equal(result.releaseDecision, 'HOLD');
  assert.doesNotMatch(JSON.stringify(result), /\/backups\/synthetic|secret-must-never-appear/);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.program, 'gcloud');
    assert.deepEqual(call.args.slice(0, 3), ['firestore', 'backups',
      call.args.includes('schedules') ? 'schedules' : 'list']);
    assert.ok(call.args.includes('--project=smart-hsr-manager'));
    assert.ok(call.args.includes('--format=json'));
    assert.ok(call.args.includes('--quiet'));
    assert.doesNotMatch(call.args.join(' '), /\b(?:restore|delete|create|update|export|import)\b/);
    assert.equal(call.options.encoding, 'utf8');
  }
  assert.ok(calls[0].args.includes('--database=(default)'));
  assert.ok(calls[1].args.includes('--location=me-central2'));
});

test('Firestore backup metadata inspector fails closed on missing evidence', () => {
  const db = 'projects/smart-hsr-manager/databases/(default)';
  const dataSets = [
    { schedule: [], backups: [] },
    { schedule: [{ name: db + '/backupSchedules/synthetic' }], backups: [] },
    { schedule: [], backups: [{ database: db, state: 'READY',
      snapshotTime: '2026-11-01T11:00:00Z' }] },
    { schedule: [{ name: 'projects/other-tenant/databases/(default)/backupSchedules/foreign' }],
      backups: [{ database: 'projects/other-tenant/databases/(default)', state: 'READY',
        snapshotTime: '2026-11-01T11:00:00Z' }] },
    { schedule: [{ name: db + '/backupSchedules/synthetic' }],
      backups: [{ database: db, state: 'CREATING', snapshotTime: '2026-11-01T11:00:00Z' }] },
    { schedule: [{ name: db + '/backupSchedules/synthetic' }],
      backups: [{ database: db, state: 'READY', snapshotTime: 'invalid' }] }
  ];
  for (const { schedule, backups } of dataSets) {
    const report = inspectBackupMetadata((_, args) =>
      JSON.stringify(args.includes('schedules') ? schedule : backups));
    assert.equal(report.status, 'RECOVERY_METADATA_INCOMPLETE');
    assert.equal(report.releaseDecision, 'HOLD');
    assert.equal(report.restorationVerified, false);
  }
  assert.throws(() => parseList('{}'), /UNEXPECTED_METADATA_FORMAT/);
  assert.throws(() => inspectBackupMetadata(() => 'invalid-json'), SyntaxError);
  assert.throws(() => inspectBackupMetadata(() => { throw new Error('privileged CLI error'); }),
    /privileged CLI error/);
});


test('Firestore backup inspector never accepts expired or cross-project or missing-expiry backups', () => {
  const db = 'projects/smart-hsr-manager/databases/(default)';
  const base = {
    database: db,
    name: 'projects/smart-hsr-manager/locations/me-central2/backups/test-only',
    state: 'READY', snapshotTime: '2026-11-01T11:00:00Z',
    expireTime: '2026-11-08T11:00:00Z'
  };
  function check(backup, now) {
    const mock = (_, args) => JSON.stringify(args.includes('schedules')
      ? [{ name: db + '/backupSchedules/synthetic' }] : [backup]);
    return inspectBackupMetadata(mock, { now });
  }
  assert.equal(check(base, '2026-11-02T11:00:00Z').unexpiredReadyBackups, 1);
  for (const broken of [
    { ...base, expireTime: '2026-11-01T10:00:00Z' },
    { ...base, expireTime: undefined },
    { ...base, expireTime: 'invalid' },
    { ...base, database: 'projects/another-project/databases/(default)' },
    { ...base, name: 'projects/another-project/locations/me-central2/backups/foreign' },
    { ...base, name: 'projects/smart-hsr-manager/locations/us-east1/backups/wrong-location' },
    { ...base, state: 'CREATING' },
    { ...base, snapshotTime: '2026-11-04T00:00:00Z' }
  ]) {
    const r = check(broken, '2026-11-02T11:00:00Z');
    assert.equal(r.unexpiredReadyBackups, 0);
    assert.equal(r.releaseDecision, 'HOLD');
    assert.equal(r.status, 'RECOVERY_METADATA_INCOMPLETE');
    assert.equal(r.restorationVerified, false);
  }
  const staleButUnexpired = check(base, '2026-11-07T11:00:00Z');
  assert.equal(staleButUnexpired.latestReadySnapshotAgeHours, 144);
  assert.equal(staleButUnexpired.rpoThresholdApproved, false);
  assert.equal(staleButUnexpired.releaseDecision, 'HOLD');
  assert.throws(() => check(base, 'not-a-date'), /INVALID_AUDIT_TIME/);
});
