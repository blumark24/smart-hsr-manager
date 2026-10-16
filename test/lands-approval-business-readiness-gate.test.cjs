'use strict';

// Isolated, in-memory negative-case tests for the trusted Lands approval
// executor. These use synthetic records and no Firebase or Production data.
const test = require('node:test');
const assert = require('node:assert/strict');

const context = { municipality_id: 'test-municipality', actor_uid: 'synthetic-reviewer' };
const mutation = {
  operation: 'land_grant.approve',
  record_id: 'synthetic-grant',
  audit_command: { domain: 'landGrants' }
};
const event = { event_id: 'synthetic-audit-event', occurred_at: '2026-10-16T00:00:00Z' };

const baseRecord = () => ({
  municipality_id: 'test-municipality',
  status: 'under_review',
  grant_number: ' 0012/1448 ',
  beneficiary: { name: 'Synthetic beneficiary', national_id: 'SYNTHETIC-ID' },
  royal_order: { number: 'TEST-ROYAL', date: '1448-01-01' },
  allocation_decision: { number: 'TEST-DECISION', date: '1448-01-02' },
  plan_reference_number: 'TEST-PLAN',
  parcel_reference_number: 'TEST-PARCEL',
  conveyance: { letter_number: 'TEST-LETTER', letter_date: '1448-01-03' }
});

async function attempt(record, opts = {}) {
  const { createLandsMutationExecutor } = await import('../embedded-lands/server/lands-mutation-executor.js');
  const writes = [];
  const db = {
    doc: path => path,
    runTransaction: callback => callback({
      get: async path => path.includes('/auditLogs/')
        ? { exists: Boolean(opts.auditExists), data: () => ({}) }
        : { exists: Boolean(record), data: () => record },
      update: (path, data) => writes.push({ type: 'update', path, data }),
      set: (path, data) => writes.push({ type: 'audit', path, data }),
      delete: (path) => writes.push({ type: 'delete', path })
    })
  };
  const execute = createLandsMutationExecutor({ db });
  return { writes, run: () => execute(context, mutation, event, {}) };
}

test('every missing canonical business axis fails closed without grant or audit writes', async () => {
  const omit = [
    ['beneficiary.name', r => { r.beneficiary.name = ''; }],
    ['beneficiary.national_id', r => { r.beneficiary.national_id = ''; }],
    ['royal_order.number', r => { r.royal_order.number = ''; }],
    ['royal_order.date', r => { r.royal_order.date = null; }],
    ['allocation_decision.number', r => { r.allocation_decision.number = ''; }],
    ['allocation_decision.date', r => { r.allocation_decision.date = null; }],
    ['plan_reference_number', r => { r.plan_reference_number = null; }],
    ['parcel_reference_number', r => { r.parcel_reference_number = null; }],
    ['conveyance.letter_number', r => { r.conveyance.letter_number = ''; }],
    ['conveyance.letter_date', r => { r.conveyance.letter_date = null; }],
  ];
  for (const [field, mutate] of omit) {
    const grant = baseRecord();
    mutate(grant);
    const { writes, run } = await attempt(grant);
    await assert.rejects(run(), e => e.code === 'LAND_GRANT_NOT_READY_FOR_APPROVAL', field);
    assert.equal(writes.length, 0, 'unready grant must not write: ' + field);
  }
});

test('missing official grant number blocks approval independently of 100 percent completeness', async () => {
  for (const number of [undefined, null, '', '   ']) {
    const grant = { ...baseRecord(), grant_number: number };
    const { writes, run } = await attempt(grant);
    await assert.rejects(run(), e => e.code === 'LAND_GRANT_NOT_READY_FOR_APPROVAL');
    assert.equal(writes.length, 0);
  }
});

test('wrong workflow state, archived record and foreign municipality cannot approve', async () => {
  for (const status of ['draft', 'incomplete', 'approved', 'rejected']) {
    const { writes, run } = await attempt({ ...baseRecord(), status });
    await assert.rejects(run(), e => e.code === 'MUTATION_EXECUTION_FAILED');
    assert.equal(writes.length, 0);
  }
  const archived = await attempt({ ...baseRecord(), archived: true });
  await assert.rejects(archived.run(), e => e.code === 'LAND_GRANT_ARCHIVED');
  assert.equal(archived.writes.length, 0);

  const otherTenant = await attempt({ ...baseRecord(), municipality_id: 'foreign-municipality' });
  await assert.rejects(otherTenant.run(), e => e.code === 'MUTATION_EXECUTION_FAILED');
  assert.equal(otherTenant.writes.length, 0);
});

test('duplicate audit event prevents approval with no new write', async () => {
  const { writes, run } = await attempt(baseRecord(), { auditExists: true });
  await assert.rejects(run(), e => e.code === 'AUDIT_EVENT_EXISTS');
  assert.equal(writes.length, 0);
});

test('complete authorized-stage record writes approval plus append-only audit in one transaction', async () => {
  const { writes, run } = await attempt(baseRecord());
  const result = await run();
  assert.equal(result.operation, 'land_grant.approve');
  assert.equal(result.deleted, false);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], {
    type: 'update',
    path: 'landsMunicipalities/test-municipality/landGrants/synthetic-grant',
    data: { status: 'approved', updated_at: event.occurred_at }
  });
  assert.equal(writes[1].type, 'audit');
  assert.equal(writes[1].path, 'landsMunicipalities/test-municipality/auditLogs/synthetic-audit-event');
  assert.deepEqual(writes[1].data, event);
});
