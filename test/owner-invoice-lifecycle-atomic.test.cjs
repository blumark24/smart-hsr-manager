'use strict';

// Pure synthetic Firestore transaction harness. Never contacts Firebase/B2.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Isolate the exact production function without importing live Firebase Admin
// dependencies. Its only free identifier is the pure cleanText helper.
const source = fs.readFileSync(path.join(__dirname, '../api/_lib/ownerOpsSupport.js'), 'utf8');
const start = source.indexOf('async function handleOwnerInvoiceLifecycle(');
const end = source.indexOf('\nasync function handleOwnerSupport(', start);
assert.ok(start >= 0 && end > start, 'source lifecycle handler exists');
const handleOwnerInvoiceLifecycle = vm.runInNewContext(
  '(' + source.slice(start, end).trim() + ')',
  { cleanText(value, max = 4000) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; } },
  { timeout: 1500 }
);

const INVOICE_ID = 'synthetic-invoice-a1';
const PATH = 'invoices/' + INVOICE_ID;
const AUDIT_ROOT = 'platformAdminAuditEvents/';

function harness(invoice = {
  status: 'pending', recordType: 'manual_pending_billing',
  paymentConfirmed: false, organization_id: 'synthetic-municipality',
  invoiceId: 'SYN-001', plan: 'Basic', amount: 100
}) {
  let data = new Map();
  if (invoice) data.set(PATH, structuredClone(invoice));
  let failAudit = false;
  let sequence = 0;
  function ref(path) { return { path }; }
  function collection(name) {
    return { doc(id) { return ref(name + '/' + (id || 'synthetic-audit-' + (++sequence))); } };
  }
  const db = {
    collection,
    async runTransaction(fn) {
      let wrote = false;
      const ops = [];
      const tx = {
        async get(r) {
          assert.equal(wrote, false, 'Firestore transaction must read before writes');
          const value = data.get(r.path);
          return { exists: value !== undefined, data: () => value && structuredClone(value) };
        },
        set(r, value, options) { wrote = true; ops.push(['set', r.path, value, options]); },
        delete(r) { wrote = true; ops.push(['delete', r.path]); },
        create(r, value) { wrote = true; ops.push(['create', r.path, value]); }
      };
      const result = await fn(tx);
      const staged = new Map(data);
      for (const [type, path, value, options] of ops) {
        if (failAudit && path.startsWith(AUDIT_ROOT)) throw Error('SIMULATED_AUDIT_FAILURE');
        if (type === 'set') staged.set(path, options?.merge ? { ...staged.get(path), ...value } : { ...value });
        else if (type === 'delete') staged.delete(path);
        else if (type === 'create') {
          if (staged.has(path)) throw Error('SIMULATED_DUPLICATE');
          staged.set(path, value);
        }
      }
      data = staged;
      return result;
    }
  };
  return {
    db, read: path => data.get(path),
    auditRecords: () => [...data.entries()].filter(([p]) => p.startsWith(AUDIT_ROOT)).map(([, value]) => value),
    failNextAudit() { failAudit = true; }
  };
}

async function execute(h, action, body = {}) {
  let status;
  let payload;
  await handleOwnerInvoiceLifecycle({
    action, body: { invoiceId: INVOICE_ID, ...body }, decoded: { uid: 'synthetic-owner' },
    db: h.db, FieldValue: { serverTimestamp: () => 'synthetic-time' },
    res: {}, sendJson(_r, s, p) { status = s; payload = p; }
  });
  return { status, payload };
}

test('Owner update and audit commit atomically', async () => {
  const h = harness();
  const out = await execute(h, 'ownerInvoiceUpdate', {
    plan: 'Basic', billingCycle: 'monthly', status: 'pending', amount: 125
  });
  assert.equal(out.status, 200);
  assert.equal(h.read(PATH).amount, 125);
  assert.equal(h.read(PATH).status, 'pending');
  assert.equal(h.auditRecords().length, 1);
  assert.equal(h.auditRecords()[0].action, 'invoice_update');
});

test('Audit write failure rolls back invoice UPDATE', async () => {
  const h = harness();
  h.failNextAudit();
  await assert.rejects(execute(h, 'ownerInvoiceUpdate', {
    plan: 'Basic', billingCycle: 'monthly', status: 'pending', amount: 999
  }), /SIMULATED_AUDIT_FAILURE/);
  assert.equal(h.read(PATH).amount, 100);
  assert.equal(h.auditRecords().length, 0);
});

test('Audit write failure rolls back invoice ARCHIVE', async () => {
  const h = harness();
  h.failNextAudit();
  await assert.rejects(execute(h, 'ownerInvoiceArchive'), /SIMULATED_AUDIT_FAILURE/);
  assert.equal(h.read(PATH).status, 'pending');
  assert.equal(h.auditRecords().length, 0);
});

test('Audit write failure rolls back invoice DELETE', async () => {
  const h = harness();
  h.failNextAudit();
  await assert.rejects(execute(h, 'ownerInvoiceDelete'), /SIMULATED_AUDIT_FAILURE/);
  assert.ok(h.read(PATH));
  assert.equal(h.auditRecords().length, 0);
});

test('Successful ARCHIVE and DELETE each emit exactly one audit event', async () => {
  const h = harness();
  assert.equal((await execute(h, 'ownerInvoiceArchive')).status, 200);
  assert.equal(h.read(PATH).status, 'archived');
  assert.equal((await execute(h, 'ownerInvoiceDelete')).status, 200);
  assert.equal(h.read(PATH), undefined);
  assert.deepEqual(h.auditRecords().map(a => a.action), ['invoice_archive', 'invoice_delete']);
});

test('Unverified pending-billing record cannot become paid even through Owner API', async () => {
  const h = harness();
  const out = await execute(h, 'ownerInvoiceUpdate', {
    plan: 'Basic', billingCycle: 'monthly', status: 'paid', amount: 100
  });
  assert.equal(out.status, 409);
  assert.equal(out.payload.error, 'payment_verification_required');
  assert.equal(h.read(PATH).status, 'pending');
  assert.equal(h.auditRecords().length, 0);
});

test('Missing invoice and invalid update never create audit entries', async () => {
  const absent = harness(null);
  assert.equal((await execute(absent, 'ownerInvoiceDelete')).status, 404);
  assert.equal(absent.auditRecords().length, 0);
  const h = harness();
  assert.equal((await execute(h, 'ownerInvoiceUpdate', {
    plan: '', billingCycle: 'monthly', status: 'pending', amount: 100
  })).status, 400);
  assert.equal(h.read(PATH).amount, 100);
  assert.equal(h.auditRecords().length, 0);
});
