'use strict';
// SMART HSR release-documentation contract: synthetic/local, no credentials or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/release/municipal-acceptance-2026-10-31.json'), 'utf8'));

test('README matches Node version and actual Vercel serverless/Firebase stack', () => {
  assert.equal(pkg.engines.node, '22.x');
  assert.match(readme, /Node\.js \*\*22\.x\*\*/);
  assert.match(readme, /Vercel serverless API/);
  assert.match(readme, /Firebase Admin\/Auth\/Firestore/);
  assert.doesNotMatch(readme, /التطبيق جاهز للنشر باستخدام Replit Autoscale|Node\.js 20\+/);
});

test('README does not advertise a rejected municipal release or missing signoffs as completed', () => {
  assert.equal(manifest.productionChangeAuthorized, false);
  assert.equal(manifest.overallStatus, 'NO-GO');
  assert.ok(manifest.gates.every(g => g.status === 'HOLD'));
  assert.ok(Object.values(manifest.approvals).every(v => v !== true));
  assert.match(readme, /HOLD \/ NO-GO/);
  assert.match(readme, /32\/100/);
  assert.match(readme, /17 نتيجة/);
  assert.match(readme, /304\/304/);
  assert.match(readme, /مراجِع أمني مستقل/);
});

test('README documents Draft no-deploy guard and never portrays offline fixture as live GIS/UAT', () => {
  const guarded = 'fix/owner-upgrade-ledger-no-deploy-20261101';
  assert.equal(vercel.git?.deploymentEnabled?.[guarded], false);
  assert.match(readme, /غير مدمج/);
  assert.match(readme, /لا تتصل/);
  assert.match(readme, /لا تعرض GPS حقيقيًا/);
  assert.match(readme, /بيانات \*\*اصطناعية فقط\*\*/);
  assert.match(readme, /npm test.*يفشل عمدًا/);
});

test('Draft CI scope guard remains quoted, anchored and no-deploy', () => {
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/owner-billing-atomic-isolated.yml'),'utf8');
  const guard=workflow.split('\n').find(line=>line.trim().startsWith("if grep -Ev '^(api/_lib/ownerBillingUpgrade"));
  assert.ok(guard, 'review scope gate required');
  assert.ok(guard.trim().endsWith(")$' /tmp/owner-review-changes; then"),
    'must end the quoted anchored allowlist and read the change list');
  assert.ok(guard.includes("docs/release/SMART_HSR_INDEPENDENT_SECURITY_REVIEW_HANDOFF_2026-11-01\\.md"),
    'review handoff must remain in docs-only scope');
  assert.match(workflow,/git diff --name-only a1fbda58932d9d6568faa0c2e876e6630aed4108 HEAD > \/tmp\/owner-review-changes/);
  assert.match(workflow,/echo 'FAIL: out-of-scope path modification'; exit 1/);
  assert.equal(vercel.git?.deploymentEnabled?.['fix/owner-upgrade-ledger-no-deploy-20261101'],false);
});
