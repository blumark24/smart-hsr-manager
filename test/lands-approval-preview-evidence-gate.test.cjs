'use strict';

// P0 isolated Preview containment: no hosted grant approval without a trusted
// verified-document gateway. Pure mock: no Firebase, Storage or real identities.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const executorPath = path.join(__dirname, '../embedded-lands/server/lands-mutation-executor.js');
const runtimePath = path.join(__dirname, '../api/_lib/embeddedLandsRuntime.js');
const command = Object.freeze({
  operation: 'land_grant.approve',
  record_id: 'synthetic-grant',
  audit_command: { domain: 'landGrants' }
});
const event = Object.freeze({ event_id: 'synthetic-audit', occurred_at: '2026-11-01T00:00:00.000Z' });
const context = Object.freeze({ municipality_id: 'synthetic-municipality', actor_uid: 'synthetic-reviewer' });

function inEnvironment(environment, fn) {
  const old = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = environment;
  return Promise.resolve().then(fn).finally(() => {
    if (old === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = old;
  });
}

async function createHarness() {
  const { createLandsMutationExecutor } = await import(pathToFileURL(executorPath).href);
  let transactions = 0;
  const db = {
    async runTransaction(fn) {
      transactions += 1;
      // Real Firestore must never be contacted: the transaction is a stub.
      throw new Error('SYNTHETIC_TRANSACTION_REACHED');
    }
  };
  return {
    commit: createLandsMutationExecutor({ db, documentStorage: null }),
    transactions: () => transactions
  };
}

test('Preview denies grant approval before any Firestore transaction, regardless of caller-supplied evidence', async () => {
  await inEnvironment('preview', async () => {
    const h = await createHarness();
    await assert.rejects(
      h.commit(context, command, event, { document_ids: ['forged-ready'], status: 'approved' }),
      error => error.code === 'LANDS_APPROVAL_EVIDENCE_GATEWAY_REQUIRED'
    );
    assert.equal(h.transactions(), 0);
  });
});

test('Preview containment does not allow bypass by claiming an official number or document metadata', async () => {
  await inEnvironment('preview', async () => {
    const h = await createHarness();
    await assert.rejects(
      h.commit(context, command, event, { grant_number: 'SYNTH-123', documentsVerified: true }),
      error => error.code === 'LANDS_APPROVAL_EVIDENCE_GATEWAY_REQUIRED'
    );
    assert.equal(h.transactions(), 0);
  });
});

test('Production and local test paths are not affected by Preview-only containment', async () => {
  for (const env of ['production', 'development']) {
    await inEnvironment(env, async () => {
      const h = await createHarness();
      await assert.rejects(h.commit(context, command, event, {}), /SYNTHETIC_TRANSACTION_REACHED/);
      assert.equal(h.transactions(), 1);
    });
  }
});

test('Hosted embedded Lands API maps pending evidence verification to an explicit 503', () => {
  const source = fs.readFileSync(runtimePath, 'utf8');
  assert.match(source, /LANDS_APPROVAL_EVIDENCE_GATEWAY_REQUIRED:\s*503/);
  assert.match(fs.readFileSync(executorPath, 'utf8'), /operation === 'land_grant\.approve' && process\.env\.VERCEL_ENV === 'preview'/);
});
