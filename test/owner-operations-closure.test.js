'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const ownerFirebase=read('owner-firebase-client.js');
const ownerHtml=read('owner.html');
const ownerUsers=read('owner-users.js');
const ownerInvoices=read('owner-invoices.js');
const ownerOps=read('api/_lib/ownerOpsSupport.js');
const usersApi=read('api/admin/users.js');
const rules=read('firestore.rules');

test('Owner Preview session resolves Firebase config from the active deployment environment',()=>{
  assert.match(ownerFirebase,/resolveFirebaseConfig/);
  assert.match(ownerFirebase,/await resolveFirebaseConfig\(\)/);
  assert.doesNotMatch(ownerFirebase,/const firebaseConfig = \{[\s\S]*projectId:\s*["']smart-hsr-manager["']/);
});

test('Owner account creation requires an owner-selected password and sends it in the trusted create action',()=>{
  assert.match(ownerHtml,/name="password"[^>]*type="password"/);
  assert.match(ownerHtml,/minlength="10"/);
  assert.match(ownerUsers,/action:'create',[\s\S]{0,180}password/);
  assert.doesNotMatch(ownerUsers,/data-act="temp"/);
  assert.doesNotMatch(ownerUsers,/generateTempPassword/);
  assert.match(usersApi,/case 'create':[\s\S]{0,2200}password_required/);
  assert.match(usersApi,/passwordPolicyReason\(password, \{ email, name \}\)/);
});

test('Owner admin calls refresh one stale token once before surfacing authentication failure',()=>{
  assert.match(ownerUsers,/resp\.status===401/);
  assert.match(ownerUsers,/getIdToken\(true\)/);
  assert.match(ownerInvoices,/resp\.status===401/);
  assert.match(ownerInvoices,/getIdToken\(true\)/);
});

test('Owner invoices support update archive and delete only through the trusted owner API',()=>{
  for(const action of ['ownerInvoiceUpdate','ownerInvoiceArchive','ownerInvoiceDelete']){
    assert.match(ownerOps,new RegExp(action));
    assert.match(ownerInvoices,new RegExp(action));
  }
  assert.match(ownerOps,/requireOwner/);
  assert.match(ownerOps,/invoice_update/);
  assert.match(ownerOps,/invoice_archive/);
  assert.match(ownerOps,/invoice_delete/);
  assert.match(ownerInvoices,/data\.edit|dataset\.edit/);
  assert.match(ownerInvoices,/dataset\.archive/);
  assert.match(ownerInvoices,/dataset\.delete/);
});

test('Firestore still refuses direct browser update/delete of invoice records',()=>{
  const start=rules.indexOf('match /invoices/{invoiceId}');
  assert.notEqual(start,-1);
  const block=rules.slice(start,start+420);
  assert.match(block,/allow update, delete: if false/);
});
