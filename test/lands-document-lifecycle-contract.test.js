import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_PHASE,
  MAX_UPLOAD_ATTEMPTS,
  createPendingDocument,
  markDocumentReady,
  markDocumentFailed,
  retryFailedDocument
} from '../embedded-lands/server/document-lifecycle-policy.js';

const at = '2026-10-31T12:00:00.000Z';
const digest = 'a'.repeat(64);
const record = Object.freeze({
  id:'grant_demo_1', municipality_id:'municipality_demo_1', created_by:'employee_demo_1'
});
const actor = Object.freeze({
  municipality_id:'municipality_demo_1', actor_uid:'employee_demo_1',
  lands_role:'lands_employee', lands_entitled:true, membership_enabled:true
});
const input = () => ({
  context:actor, sourceRecord:record, recordDomain:'landGrants',
  recordId:record.id, documentId:'doc_demo_1', requestId:'request_demo_1',
  file:{mime_type:'application/pdf',size_bytes:2048,sha256:digest},now:at
});
const pending=()=>createPendingDocument(input());
const proof=doc=>({storage_path:doc.storage_path, mime_type:doc.mime_type,
  size_bytes:doc.size_bytes, sha256:doc.sha256, generation:'12345'});
const ready=doc=>markDocumentReady({document:doc,context:actor,expectedRevision:doc.revision,proof:proof(doc),now:at});
const failed=doc=>markDocumentFailed({document:doc,context:actor,expectedRevision:doc.revision,failureCode:'UPLOAD_FAILED',now:at});

test('pending intent carries server-derived tenant path and no personal filename or approved flag',()=>{
  const doc=pending();
  assert.equal(doc.status,DOCUMENT_PHASE.PENDING);
  assert.equal(doc.attempt,1);
  assert.equal(doc.revision,1);
  assert.equal(doc.filename,'document-doc_demo_1');
  assert.equal(doc.storage_path,'landsMunicipalities/municipality_demo_1/documents/landGrants/grant_demo_1/doc_demo_1/attempt-1');
  assert.ok(Object.isFrozen(doc));
  assert.ok(!('approved' in doc));
  assert.ok(!('user_national_id' in doc));
});

test('success requires verified byte-level metadata and transitions to READY exactly once',()=>{
  const doc=pending(),result=ready(doc);
  assert.equal(result.status,'ready');
  assert.equal(result.revision,2);
  assert.equal(result.storage_generation,'12345');
  assert.equal(doc.status,'pending');
  assert.throws(()=>ready(result),/DOCUMENT_INVALID_TRANSITION/);
});

test('Storage write alone does not complete document, absent proof fails closed',()=>{
  const doc=pending();
  assert.throws(()=>markDocumentReady({document:doc,context:actor,expectedRevision:1,now:at}),/DOCUMENT_STORAGE_PROOF_MISMATCH/);
  assert.equal(doc.status,'pending');
});

test('reject path, digest, bytes, MIME and generation tampering in storage verification',()=>{
  const doc=pending();
  for(const bad of [
    {storage_path:'landsMunicipalities/other/documents/landGrants/grant_demo_1/doc_demo_1/attempt-1'},
    {sha256:'b'.repeat(64)},
    {size_bytes:1024},
    {mime_type:'image/png'},
    {generation:'0'},
    {generation:'../123'}
  ]){
    assert.throws(()=>markDocumentReady({
      document:doc,context:actor,expectedRevision:1,
      proof:{...proof(doc),...bad},now:at
    }),/DOCUMENT_STORAGE_PROOF_MISMATCH/);
  }
});

test('reject cross-municipality, forged/disabled membership and unrelated actor',()=>{
  const doc=pending();
  const otherTenant={...actor,municipality_id:'municipality_demo_2'};
  const disabled={...actor,membership_enabled:false};
  const unentitled={...actor,lands_entitled:false};
  const wrongActor={...actor,actor_uid:'employee_demo_2'};
  assert.throws(()=>markDocumentReady({document:doc,context:otherTenant,expectedRevision:1,proof:proof(doc),now:at}),/DOCUMENT_TENANT_DENIED/);
  assert.throws(()=>markDocumentReady({document:doc,context:disabled,expectedRevision:1,proof:proof(doc),now:at}),/DOCUMENT_ROLE_DENIED/);
  assert.throws(()=>markDocumentReady({document:doc,context:unentitled,expectedRevision:1,proof:proof(doc),now:at}),/DOCUMENT_ROLE_DENIED/);
  assert.throws(()=>markDocumentReady({document:doc,context:wrongActor,expectedRevision:1,proof:proof(doc),now:at}),/DOCUMENT_ACTOR_DENIED/);
  assert.throws(()=>createPendingDocument({...input(),context:otherTenant}),/DOCUMENT_TENANT_DENIED/);
  assert.throws(()=>createPendingDocument({...input(),sourceRecord:{...record,created_by:'someone_else'}}),/DOCUMENT_ACTOR_DENIED/);
});

test('unknown role, missing server entitlement and invalid IDs cannot create pending intent',()=>{
  assert.throws(()=>createPendingDocument({...input(),context:{...actor,lands_role:'owner'}}),/DOCUMENT_ROLE_DENIED/);
  assert.throws(()=>createPendingDocument({...input(),context:{...actor,lands_entitled:false}}),/DOCUMENT_ROLE_DENIED/);
  assert.throws(()=>createPendingDocument({...input(),requestId:'../escape'}),/DOCUMENT_INVALID_ID/);
  assert.throws(()=>createPendingDocument({...input(),recordDomain:'auditLogs'}),/DOCUMENT_INVALID_DOMAIN/);
  assert.throws(()=>createPendingDocument({...input(),recordId:'../other'}),/DOCUMENT_INVALID_ID/);
});

test('reject oversized file, unapproved MIME, missing verified SHA and bad timestamp',()=>{
  for(const file of [
    {mime_type:'application/pdf',size_bytes:10*1024*1024+1,sha256:digest},
    {mime_type:'application/x-msdownload',size_bytes:10,sha256:digest},
    {mime_type:'application/pdf',size_bytes:0,sha256:digest},
    {mime_type:'image/png',size_bytes:8,sha256:'not-a-digest'},
  ]) assert.throws(()=>createPendingDocument({...input(),file}),/DOCUMENT_INVALID_FILE/);
  assert.throws(()=>createPendingDocument({...input(),now:'bad'}),/DOCUMENT_INVALID_TIME/);
});

test('failed pending document does not become READY without explicit verified retry',()=>{
  const doc=failed(pending());
  assert.equal(doc.status,'failed');
  assert.equal(doc.failure_code,'UPLOAD_FAILED');
  assert.throws(()=>ready(doc),/DOCUMENT_INVALID_TRANSITION/);
  assert.throws(()=>failed(doc),/DOCUMENT_INVALID_TRANSITION/);
});

test('retry changes Storage object attempt path; stale proof from previous attempt is denied',()=>{
  const first=pending(),fail=failed(first);
  const retry=retryFailedDocument({document:fail,context:actor,expectedRevision:2,now:at});
  assert.equal(retry.attempt,2);
  assert.equal(retry.status,'pending');
  assert.equal(retry.revision,3);
  assert.notEqual(first.storage_path,retry.storage_path);
  assert.match(retry.storage_path,/attempt-2$/);
  assert.throws(()=>markDocumentReady({document:retry,context:actor,expectedRevision:3,proof:proof(first),now:at}),/DOCUMENT_STORAGE_PROOF_MISMATCH/);
  assert.equal(ready(retry).status,'ready');
});

test('repeated or stale revision cannot finalize/retry: optimistic compare-and-set contract',()=>{
  const doc=pending(),once=failed(doc);
  assert.throws(()=>markDocumentFailed({document:doc,context:actor,expectedRevision:999,failureCode:'UPLOAD_FAILED',now:at}),/DOCUMENT_REVISION_CONFLICT/);
  assert.throws(()=>retryFailedDocument({document:once,context:actor,expectedRevision:1,now:at}),/DOCUMENT_REVISION_CONFLICT/);
  assert.throws(()=>markDocumentReady({document:doc,context:actor,expectedRevision:2,proof:proof(doc),now:at}),/DOCUMENT_REVISION_CONFLICT/);
});

test('retry limit is enforced; no fourth Storage attempt created',()=>{
  let doc=pending();
  for(let attempt=1;attempt<MAX_UPLOAD_ATTEMPTS;attempt++){
    doc=failed(doc);
    doc=retryFailedDocument({document:doc,context:actor,expectedRevision:doc.revision,now:at});
  }
  assert.equal(doc.attempt,3);
  doc=failed(doc);
  assert.throws(()=>retryFailedDocument({document:doc,context:actor,expectedRevision:doc.revision,now:at}),/DOCUMENT_RETRY_NOT_ALLOWED/);
});

test('failure codes are allowlisted and never include raw server secrets',()=>{
  const doc=pending();
  assert.throws(()=>markDocumentFailed({
    document:doc,context:actor,expectedRevision:1,
    failureCode:'bucket-name/secret/uid',now:at
  }),/DOCUMENT_INVALID_FAILURE_CODE/);
  const f=failed(doc);
  assert.deepEqual(Object.keys(f).filter(k=>/secret|token|password/i.test(k)),[]);
  assert.equal(f.failure_code,'UPLOAD_FAILED');
});

test('OCI immutable version ID is kept separate from GCS numeric generation',()=>{
 const doc=pending(), result=markDocumentReady({document:doc,context:actor,expectedRevision:1,
  proof:{...proof(doc),generation:undefined,provider:'oci',version_id:'2d528a44-5b15-40dc-b303-20993d1ade66'},now:at});
 assert.equal(result.storage_provider,'oci');
 assert.equal(result.storage_generation,null);
 assert.equal(result.storage_version_id,'2d528a44-5b15-40dc-b303-20993d1ade66');
});
test('OCI and GCS version proofs cannot be mixed, forged or omitted',()=>{
 const doc=pending();
 for(const bad of [{provider:'oci',generation:undefined,version_id:null},
 {provider:'oci',generation:undefined,version_id:'../bad'},
 {provider:'oci',version_id:'123'},{provider:'untrusted',generation:undefined,version_id:'valid-id'},
 {provider:'gcs',version_id:'valid-id'}]){
  assert.throws(()=>markDocumentReady({document:doc,context:actor,expectedRevision:1,
   proof:{...proof(doc),...bad},now:at}),/DOCUMENT_STORAGE_PROOF_MISMATCH/);
 }
});
