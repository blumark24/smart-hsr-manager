'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('official number preserves leading zeros and never falls back to a document ID', async () => {
  const { grantNumberLabel } = await import('../lands/client/lands-domain.js');
  assert.equal(grantNumberLabel({ id: 'internal', grant_number: ' 0012/1448 ' }), '0012/1448');
  for (const value of [undefined, null, '', ' ']) assert.equal(grantNumberLabel({ id: 'internal', grant_number: value }), 'غير مسجّل');
});

test('decision registry displays the business number and routes with the unchanged internal ID', async () => {
  const mod = await import('../lands/client/lands-domain.js');
  const source = fs.readFileSync('lands/index.html', 'utf8');
  const fn = source.slice(source.indexOf('function grantAttachmentsCell('), source.indexOf('// Decision Twin —'));
  const context = { grantMobileMode: 'table', grantViewControls: () => '', grantRowActions: () => '', mod, domains: { documents: [] }, decisionMeta: () => ({}), AXIS_LABELS: {}, completenessPill: () => '80%', completenessPercent: () => 80, session: { role: 'lands_employee', firebaseUid: 'employee' }, esc: x => String(x).replaceAll('<', '&lt;').replaceAll('>', '&gt;'), statusBadge: () => '', maskNationalId: () => '', planLabel: () => '', parcelLabel: () => '', documentsForGrant: () => [], completenessPill: () => '', fmtDate: () => '', icon: () => '' };
  vm.createContext(context); vm.runInContext(fn, context);
  const record = { id: 'internal-key', grant_number: '0012/1448', completeness: { missing: [] } };
  const html = context.decisionGrantsTab([record]);
  assert.match(html, />0012\/1448<\/b>/);
  assert.match(html, /openFile\('internal-key'\)/);
  assert.doesNotMatch(html, />internal-key</);
  assert.match(context.decisionGrantsTab([{ ...record, grant_number: null }]), /غير مسجّل/);
  assert.doesNotMatch(context.decisionGrantsTab([{ ...record, grant_number: '<script>' }]), /<script>/);
});

test('trusted edit persists grant number with audit and rejects invalid values and protected states', async () => {
  const { createLandsMutationExecutor } = await import('../embedded-lands/server/lands-mutation-executor.js');
  for (const [status, number, allowed] of [['draft', '0012/1448', true], ['incomplete', null, true], ['approved', '123', false], ['draft', {}, false], ['draft', 'x'.repeat(81), false]]) {
    const writes = [];
    const db = { doc: path => path, runTransaction: async callback => callback({ get: async path => ({ exists: !path.includes('/auditLogs/'), data: () => ({ municipality_id: 'org-a', status }) }), update: (path, value) => writes.push({ path, value }), set: (path, value) => writes.push({ path, value }) }) };
    const execute = createLandsMutationExecutor({ db });
    const request = () => execute({ municipality_id: 'org-a' }, { operation: 'land_grant.update', record_id: 'internal-key', audit_command: { domain: 'landGrants' } }, { event_id: 'event', occurred_at: 123 }, { grant_number: number });
    if (!allowed) { await assert.rejects(request()); assert.equal(writes.length, 0); }
    else { await request(); assert.equal(writes[0].value.grant_number, number); assert.match(writes[0].path, /org-a\/landGrants\/internal-key$/); assert.equal(writes.length, 2); }
  }
});

test('registry references prefer entered numbers and document counts keep scopes separate', async () => {
  const mod = await import('../lands/client/lands-domain.js');
  assert.equal(mod.grantReferenceLabel({ plan_reference_number: '0012' }, 'plan', 'GIS label'), '0012');
  assert.equal(mod.grantReferenceLabel({}, 'parcel', 'Linked parcel'), 'Linked parcel');
  const docs = [{ record_domain: 'landGrants', record_id: 'g1' }, { record_domain: 'allocationDecisions', record_id: 'd1' }, { record_domain: 'landGrants', record_id: 'g2' }];
  assert.deepEqual(mod.grantDocumentCounts({ id: 'g1' }, docs, 'd1'), { grant: 1, decision: 1 });
  assert.deepEqual(mod.grantDocumentCounts({ id: 'g1' }, docs), { grant: 1, decision: 0 });
});
