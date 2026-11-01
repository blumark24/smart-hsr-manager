'use strict';
/**
 * Internal release evidence gate. Fail closed for missing proof/sign-off.
 * This is a checklist validator, NOT a substitute for security/legal review.
 */
const fs = require('node:fs');
const path = require('node:path');

const manifestPath = path.resolve(__dirname, '../docs/release/municipal-acceptance-2026-10-31.json');
const requiredIds = Object.freeze([
  'security-session-rbac', 'lands-one-time-sso', 'pdpl-data-classification',
  'pdpl-data-flow-transfer', 'privacy-impact-ai-ethics', 'nca-controls-applicability',
  'manager-header-and-responsive', 'user-center-and-identity-sync',
  'lands-parity-and-masking', 'field-single-source-workflow',
  'mobility-role-and-vehicle', 'ai-provider-and-data-boundary',
  'final-cross-device-and-release'
]);
const approvalIds = Object.freeze([
  'municipalDataOwner', 'privacyLegalReviewer',
  'cybersecurityReviewer', 'executiveReleaseOwner'
]);

/**
 * A syntactically plausible link does not establish reviewed evidence. Reject
 * obvious placeholders and localhost links before a qualified reviewer can
 * make the final evidence decision.
 */
function isCandidateEvidenceUrl(link) {
  if (typeof link !== 'string') return false;
  try {
    const url = new URL(link);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password &&
      host !== 'localhost' && host !== '[::1]' &&
      !['example.com', 'example.net', 'example.org'].includes(host) &&
      !/\\.(invalid|example|test|localhost)$/.test(host) &&
      !/^(127\\.|10\\.|192\\.168\\.|169\\.254\\.)/.test(host);
  } catch (_) {
    return false;
  }
}

/**
 * expectedSha MUST come from the separately approved target deployment/build
 * artifact, never inferred from the untrusted manifest itself.
 */
function evaluate(manifest, { expectedSha } = {}) {
  const blockers = [];
  if (!manifest || !Array.isArray(manifest.gates)) {
    return { decision: 'NO-GO', blockers: ['Missing/invalid gate manifest'] };
  }
  if (manifest.productionChangeAuthorized !== true) blockers.push('Production release authorization not granted');
  if (!/^[0-9a-f]{40}$/.test(manifest.candidateSha || '')) blockers.push('Unpinned candidate SHA');
  if (!/^[0-9a-f]{40}$/.test(expectedSha || '')) {
    blockers.push('An independently pinned expected target SHA is required');
  } else if (manifest.candidateSha !== expectedSha) {
    blockers.push('Manifest candidate SHA does not match the expected target SHA');
  }
  const counts = new Map();
  for (const gate of manifest.gates) {
    if (gate && typeof gate.id === 'string') counts.set(gate.id, (counts.get(gate.id) || 0) + 1);
  }
  for (const id of requiredIds) {
    if (counts.get(id) !== 1) {
      blockers.push(id + ': required gate missing or duplicated');
      continue;
    }
    const gate = manifest.gates.find(item => item.id === id);
    if (gate.status !== 'PASS' || !Array.isArray(gate.evidence) || gate.evidence.length === 0 ||
        gate.evidence.some(link => !isCandidateEvidenceUrl(link))) {
      blockers.push(id + ': no reviewed PASS with evidence URLs');
    }
  }
  if (manifest.gates.some(g => !requiredIds.includes(g?.id))) blockers.push('Unexpected gate IDs require schema review');
  for (const id of approvalIds) {
    if (manifest.approvals?.[id] !== true) blockers.push(id + ': sign-off missing');
  }
  return { decision: blockers.length === 0 ? 'GO-CANDIDATE-REQUIRES-INDEPENDENT-VALIDATION' : 'NO-GO', blockers };
}

if (require.main === module) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const shaArg = process.argv.indexOf('--expected-sha');
  const expectedSha = shaArg >= 0 ? process.argv[shaArg + 1] : undefined;
  const result = evaluate(manifest, { expectedSha });
  console.log(JSON.stringify({ candidateSha: manifest.candidateSha, expectedSha: expectedSha || null, ...result }, null, 2));
  if (!process.argv.includes('--report-only') && result.decision === 'NO-GO') process.exitCode = 2;
}

module.exports = { evaluate, requiredIds, approvalIds, isCandidateEvidenceUrl };
