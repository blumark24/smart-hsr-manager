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
const ownerOrganizations=read('owner-organizations.js');
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


test('Owner organization onboarding creates and persists the municipality manager in one trusted operation',()=>{
  assert.match(ownerHtml,/name="managerPassword"[^>]*type="password"/);
  assert.match(ownerOrganizations,/ownerCreateOrganizationWithManager/);
  assert.match(ownerOrganizations,/managerCreated/);
  assert.match(ownerOps,/ownerCreateOrganizationWithManager/);
  assert.match(ownerOps,/auth\.createUser/);
  assert.match(ownerOps,/db\.collection\('managers'\)\.doc\(managerUser\.uid\)/);
  assert.match(ownerOps,/organizationId: orgRef\.id/);
  assert.match(ownerOps,/managerUid: managerUser\.uid/);
  assert.match(ownerOps,/organization_manager_create/);
  assert.doesNotMatch(ownerOps,/manager.*password.*Firestore/i);
});

test('Owner can rotate the linked municipality manager password and revoke prior sessions',()=>{
  assert.match(ownerOrganizations,/ownerSetManagerPassword/);
  assert.match(ownerOrganizations,/managerUid:org\.managerUid/);
  assert.match(ownerOps,/ownerSetManagerPassword/);
  assert.match(ownerOps,/auth\.updateUser\(managerUid, \{ password, disabled: false \}\)/);
  assert.match(ownerOps,/auth\.revokeRefreshTokens\(managerUid\)/);
  assert.match(ownerOps,/manager_password_change/);
});

test('Owner organization modal keeps internal notes without creating another owner identity',()=>{
  assert.match(ownerHtml,/name="notes"/);
  assert.match(ownerOrganizations,/notes:f\.notes\.value\.trim\(\)/);
  assert.doesNotMatch(ownerOrganizations,/role:\s*['"]owner['"]/);
});


test('Owner spatial context is saved only through the trusted owner API and audited',()=>{
  assert.match(ownerOrganizations,/ownerSetOrganizationSpatialContext/);
  assert.match(ownerOps,/ownerSetOrganizationSpatialContext/);
  assert.match(ownerOps,/spatial_context_invalid/);
  assert.match(ownerOps,/organization_spatial_context_set/);
  assert.match(ownerOps,/mapCenter:\s*\{\s*lat,\s*lng\s*\}/);
  assert.match(ownerOps,/mapDefaultZoom:\s*zoom/);
});


test('Owner tenant identity audit is authenticated, scoped and read-only',()=>{
  assert.match(ownerOrganizations,/فحص ربط الدخول/);
  assert.match(ownerOrganizations,/action:'ownerAuditTenantIdentity', organizationId:id/);
  assert.match(ownerOps,/'ownerAuditTenantIdentity'/);
  const gate = ownerOps.slice(ownerOps.indexOf('async function handleOwnerOpsSupport('));
  assert.match(gate,/const owner = await requireOwner\(decoded, getCallerContext, sendJson, res\)/);
  assert.match(gate,/if \(action === 'ownerAuditTenantIdentity'\)/);
  const start = ownerOps.indexOf('async function handleOwnerTenantIdentityAudit(');
  const end = ownerOps.indexOf('async function handleOwnerOpsSupport(', start);
  assert.ok(start>0 && end>start, 'Owner-only audit handler exists');
  const readOnly = ownerOps.slice(start,end);
  assert.match(readOnly,/db\.collection\('organizations'\)\.doc\(organizationId\)\.get\(\)/);
  assert.match(readOnly,/db\.collection\('managers'\)\.doc\(managerUid\)\.get\(\)/);
  assert.match(readOnly,/\.where\('organizationId', '==', organizationId\)\.limit\(50\)\.get\(\)/);
  assert.match(readOnly,/await auth\.getUser\(uid\)/);
  assert.doesNotMatch(readOnly,/auth\.(createUser|updateUser|deleteUser|revokeRefreshTokens)/);
  assert.doesNotMatch(readOnly,/\.(set|update|delete|create)\(/);
  assert.match(readOnly,/readOnly: true/);
});
