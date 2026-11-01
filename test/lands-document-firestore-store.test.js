/**
 * Firestore adapter contract exercised with an in-memory transaction double.
 * No emulator/service account/network or municipal personal data.
 *
 * Firestore's read-before-write restriction and CREATE precondition are
 * asserted. Real emulator concurrency must still be tested before rollout.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFirestoreDocumentStore } from '../embedded-lands/server/document-firestore-store.js';
import { createTrustedDocumentCoordinator } from '../embedded-lands/server/document-lifecycle-coordinator.js';

const m='municipality_demo_1',uid='employee_demo_1',grant='grant_demo_1';
const when='2026-10-31T14:00:00.000Z';
const bytes=Buffer.from('%PDF-only-synthetic-data');
const hash=()=>createHash('sha256').update(bytes).digest('hex');
const data=()=>({mime_type:'application/pdf',size_bytes:bytes.length,sha256:hash()});
const mkPrincipal=(overrides={})=>({
  municipality_id:m,actor_uid:uid,
  lands_role:'lands_employee',lands_entitled:true,membership_enabled:true,
  ...overrides
});

function sandbox() {
  const docs=new Map();
  let index=0,failAudit=false;
  const ref=path=>({
    path,
    id:path.split('/').at(-1),
    async get(){
      const value=docs.get(path);
      return {exists:value!==undefined,id:path.split('/').at(-1),data(){return structuredClone(value);}};
    }
  });
  const db={
    doc:ref,
    collection:path=>({doc:()=>ref(path+'/audit_'+(++index))}),
    async runTransaction(callback) {
      const staged=new Map(docs);
      let writing=false;
      const tx={
        async get(r){
          if(writing)throw Error('FIRESTORE_READ_AFTER_WRITE');
          const item=staged.get(r.path);
          return {exists:item!==undefined,id:r.id,data:()=>structuredClone(item)};
        },
        create(r,value){
          writing=true;
          if(failAudit&&r.path.includes('/auditLogs/'))throw Error('SYNTHETIC_AUDIT_DENIED');
          if(staged.has(r.path))throw Error('DOCUMENT_ALREADY_EXISTS');
          staged.set(r.path,structuredClone(value));
        },
        update(r,value){
          writing=true;
          if(!staged.has(r.path))throw Error('DOCUMENT_DOES_NOT_EXIST');
          staged.set(r.path,structuredClone(value));
        }
      };
      const result=await callback(tx);
      docs.clear();
      for(const [k,v] of staged)docs.set(k,v);
      return result;
    }
  };
  docs.set('landsMunicipalities/'+m+'/userAccess/'+uid,{
    municipality_id:m,firebase_uid:uid,lands_role:'lands_employee',enabled:true
  });
  docs.set('landsMunicipalities/'+m+'/landGrants/'+grant,{
    municipality_id:m,created_by:uid,grant_number:'DEMO-1'
  });
  const principal=(auth)=>{
    if(auth==='employee')return mkPrincipal();
    if(auth==='disabled')return mkPrincipal({membership_enabled:false});
    if(auth==='outsider')return mkPrincipal({municipality_id:'municipality_demo_2'});
    if(auth==='other')return mkPrincipal({actor_uid:'employee_demo_2'});
    return null;
  };
  const store=createFirestoreDocumentStore({db});
  let next=0,proof;
  const service=createTrustedDocumentCoordinator({
    verifyPrincipal:async auth=>principal(auth),
    store,
    objectStore:{
      async inspectAndHash({storagePath}) {
        if(proof)return proof(storagePath);
        return {
          storage_path:storagePath,mime_type:'application/pdf',
          size_bytes:bytes.length,sha256:hash(),generation:'1234'
        };
      }
    },
    ids:{documentId:()=> 'document_demo_'+(++next)},
    clock:{nowIso:()=>when}
  });
  const init=(requestId='request_demo_1',auth='employee')=>({
    auth,recordDomain:'landGrants',recordId:grant,requestId,file:data()
  });
  const docPath=id=>'landsMunicipalities/'+m+'/documents/'+id;
  const membershipPath='landsMunicipalities/'+m+'/userAccess/'+uid;
  const auditRecords=()=>[...docs.entries()].filter(([k])=>k.includes('/auditLogs/'));
  return {
    db,docs,store,service,init,docPath,membershipPath,auditRecords,
    setProof(fn){proof=fn;},
    failAudit(value){failAudit=value;}
  };
}

test('Firestore adapter requires a real transaction-capable handle',()=>{
  assert.throws(()=>createFirestoreDocumentStore({db:{doc(){}}}),/DOCUMENT_FIRESTORE_ADAPTER_REQUIRED/);
});

test('begin stores pending intent, unique request index, and audit in one read-before-write transaction',async()=>{
  const s=sandbox();
  const out=await s.service.begin(s.init());
  assert.equal(out.status,'pending');
  const item=s.docs.get(s.docPath(out.documentId));
  assert.equal(item.municipality_id,m);
  assert.equal(item.created_by,uid);
  assert.equal(item.revision,1);
  assert.equal(s.auditRecords().length,1);
  assert.ok(s.docs.has('landsMunicipalities/'+m+'/documentUploadRequests/'+uid+'/requests/request_demo_1'));
  assert.deepEqual(Object.keys(out).sort(),['documentId','status','attempt','revision'].sort());
});

test('replay is idempotent and conflict does not write document/index/audit',async()=>{
  const s=sandbox();
  const first=await s.service.begin(s.init());
  assert.deepEqual(await s.service.begin(s.init()),first);
  await assert.rejects(s.service.begin({...s.init(),file:{...data(),sha256:'f'.repeat(64)}}),/DOCUMENT_IDEMPOTENCY_CONFLICT/);
  assert.equal([...s.docs.keys()].filter(x=>x.includes('/documents/')).length,1);
  assert.equal(s.auditRecords().length,1);
});

test('disabled membership, foreign tenant and wrong creator are denied even with forged principal',async()=>{
  const s=sandbox();
  await assert.rejects(s.service.begin(s.init('req_disabled','disabled')),/DOCUMENT_ROLE_DENIED/);
  await assert.rejects(s.service.begin(s.init('req_outsider','outsider')),/DOCUMENT_ROLE_DENIED/);
  await assert.rejects(s.service.begin(s.init('req_other','other')),/DOCUMENT_ROLE_DENIED/);
  await assert.rejects(s.service.begin(s.init('req_unknown','invalid')),/DOCUMENT_AUTH_REQUIRED/);
  assert.equal(s.auditRecords().length,0);
});

test('fresh Firestore membership read catches revocation after Storage inspection',async()=>{
  const s=sandbox();
  const start=await s.service.begin(s.init());
  s.setProof(async path=>{
    const membership=s.docs.get(s.membershipPath);
    s.docs.set(s.membershipPath,{...membership,enabled:false});
    return {storage_path:path,mime_type:'application/pdf',
      size_bytes:bytes.length,sha256:hash(),generation:'1234'};
  });
  await assert.rejects(s.service.finish({
    auth:'employee',documentId:start.documentId,expectedRevision:1
  }),/DOCUMENT_ROLE_DENIED/);
  assert.equal(s.docs.get(s.docPath(start.documentId)).status,'pending');
  assert.equal(s.auditRecords().length,1);
});

test('verified data is finalized after independent byte proof and atomically audited',async()=>{
  const s=sandbox();
  const start=await s.service.begin(s.init());
  const end=await s.service.finish({auth:'employee',documentId:start.documentId,expectedRevision:1});
  assert.equal(end.status,'ready');
  assert.equal(end.revision,2);
  assert.equal(s.auditRecords().length,2);
  const event=s.auditRecords().at(-1)[1];
  assert.equal(event.municipality_id,m);
  assert.equal(event.actor_uid,uid);
  assert.equal(event.action,'document.upload_verified');
  assert.deepEqual(Object.keys(end).sort(),['documentId','status','attempt','revision'].sort());
});

test('untrusted object proof digest fails closed and never changes Firestore state',async()=>{
  const s=sandbox();
  const start=await s.service.begin(s.init());
  s.setProof(async path=>({storage_path:path,mime_type:'application/pdf',
    size_bytes:bytes.length,sha256:'b'.repeat(64),generation:'1234'}));
  await assert.rejects(s.service.finish({
    auth:'employee',documentId:start.documentId,expectedRevision:1
  }),/DOCUMENT_STORAGE_PROOF_MISMATCH/);
  assert.equal(s.docs.get(s.docPath(start.documentId)).status,'pending');
  assert.equal(s.auditRecords().length,1);
});

test('audit failure aborts create transaction with no orphaned document or index',async()=>{
  const s=sandbox();
  s.failAudit(true);
  await assert.rejects(s.service.begin(s.init()),/SYNTHETIC_AUDIT_DENIED/);
  assert.equal(s.auditRecords().length,0);
  assert.equal([...s.docs.keys()].some(p=>p.includes('/documents/')),false);
  assert.equal([...s.docs.keys()].some(p=>p.includes('/documentUploadRequests/')),false);
});

test('failed document can retry a new attempt and stale revision cannot be finalized',async()=>{
  const s=sandbox();
  const start=await s.service.begin(s.init());
  const fail=await s.service.fail({
    auth:'employee',documentId:start.documentId,expectedRevision:1,failureCode:'UPLOAD_FAILED'
  });
  assert.equal(fail.status,'failed');
  const retried=await s.service.retry({
    auth:'employee',documentId:start.documentId,expectedRevision:2
  });
  assert.equal(retried.attempt,2);
  assert.match(s.docs.get(s.docPath(start.documentId)).storage_path,/attempt-2$/);
  await assert.rejects(s.service.finish({
    auth:'employee',documentId:start.documentId,expectedRevision:1
  }),/DOCUMENT_REVISION_CONFLICT/);
  assert.equal(s.auditRecords().length,3);
});

test('direct tenant-crossing repository read does not resolve a document under a foreign path',async()=>{
  const s=sandbox();
  const out=await s.service.begin(s.init());
  const foreign=await s.store.readDocument('municipality_demo_2',out.documentId);
  assert.equal(foreign,null);
  await assert.rejects(s.service.status({auth:'other',documentId:out.documentId}),/DOCUMENT_ACTOR_DENIED/);
});
