import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createTrustedDocumentCoordinator} from '../embedded-lands/server/document-lifecycle-coordinator.js';

const now='2026-10-31T12:00:00.000Z';
const content=Buffer.from('%PDF-synthetic-example-only');
const hash=x=>createHash('sha256').update(x).digest('hex');
const descriptor=()=>({mime_type:'application/pdf',size_bytes:content.length,sha256:hash(content)});
const tenant='municipality_demo_1',parentId='grant_demo_1',employee='employee_demo_1';
const identities={
  employee:{municipality_id:tenant,actor_uid:employee,lands_role:'lands_employee',lands_entitled:true,membership_enabled:true},
  other:{municipality_id:tenant,actor_uid:'employee_demo_2',lands_role:'lands_employee',lands_entitled:true,membership_enabled:true},
  outside:{municipality_id:'municipality_demo_2',actor_uid:employee,lands_role:'lands_employee',lands_entitled:true,membership_enabled:true},
  disabled:{municipality_id:tenant,actor_uid:employee,lands_role:'lands_employee',lands_entitled:true,membership_enabled:false}
};

function setup({onInspect}={}) {
  const state={
    docs:new Map(),requests:new Map(),
    parents:new Map([[tenant+'/landGrants/'+parentId,{id:parentId,municipality_id:tenant,created_by:employee}]]),
    audit:[],objects:new Map(),inspections:0,revokedActors:new Set()
  };
  const key=(m,id)=>m+'/'+id,reqKey=(m,u,r)=>m+'/'+u+'/'+r;
  const store={
    async transaction(callback){
      const docs=new Map(state.docs),requests=new Map(state.requests),audit=[...state.audit];
      const tx={
        async assertActiveMembership(principal){
          return principal.lands_entitled===true && principal.membership_enabled===true &&
            !state.revokedActors.has(principal.actor_uid);
        },
        async findByRequest({municipalityId,actorUid,requestId}){
          const id=requests.get(reqKey(municipalityId,actorUid,requestId));
          return id?docs.get(key(municipalityId,id))||null:null;
        },
        async readParent({municipalityId,recordDomain,recordId}){
          return state.parents.get(municipalityId+'/'+recordDomain+'/'+recordId)||null;
        },
        async readDocument({municipalityId,documentId}){
          return docs.get(key(municipalityId,documentId))||null;
        },
        async insertDocument(d){if(docs.has(key(d.municipality_id,d.file_id)))throw Error('DUPLICATE_DOC');docs.set(key(d.municipality_id,d.file_id),d);},
        async reserveRequest({municipalityId,actorUid,requestId,documentId}){
          const k=reqKey(municipalityId,actorUid,requestId);
          if(requests.has(k))throw Error('DUPLICATE_REQUEST');
          requests.set(k,documentId);
        },
        async updateDocument(d){
          const old=docs.get(key(d.municipality_id,d.file_id));
          if(!old||old.revision+1!==d.revision)throw Error('REVISION_CAS_FAILED');
          docs.set(key(d.municipality_id,d.file_id),d);
        },
        async appendAudit(event){audit.push(event);}
      };
      const result=await callback(tx);
      state.docs=docs;state.requests=requests;state.audit=audit;
      return result;
    },
    async readDocument(m,id){return state.docs.get(key(m,id))||null;}
  };
  let next=0;
  const coordinator=createTrustedDocumentCoordinator({
    async verifyPrincipal(auth){return identities[auth]||null;},
    store,
    objectStore:{
      async inspectAndHash({storagePath,documentId}){
        state.inspections++;
        if(onInspect)await onInspect(documentId);
        const o=state.objects.get(storagePath);
        if(!o)throw Error('SYNTHETIC_OBJECT_MISSING');
        return {storage_path:storagePath,mime_type:o.mime_type,size_bytes:o.bytes.length,
          sha256:hash(o.bytes),generation:o.generation};
      }
    },
    ids:{documentId:()=> 'doc_demo_'+(++next)},
    clock:{nowIso:()=>now}
  });
  const beginArgs=(req='request_demo_1',auth='employee')=>({
    auth,recordDomain:'landGrants',recordId:parentId,requestId:req,file:descriptor()
  });
  function document(id){return state.docs.get(key(tenant,id));}
  function upload(d,options={}){
    state.objects.set(d.storage_path,{
      bytes:Buffer.from(options.bytes||content),
      mime_type:options.mime_type||'application/pdf',
      generation:options.generation||'1234'
    });
  }
  return {coordinator,state,beginArgs,document,upload,store};
}

test('unconfigured API and Storage adapters fail closed',()=>{
  assert.throws(()=>createTrustedDocumentCoordinator({}),/DOCUMENT_TRUSTED_ADAPTER_REQUIRED/);
});

test('pending intent, audit and request index commit together and return no file path',async()=>{
  const x=setup(),a=await x.coordinator.begin(x.beginArgs());
  assert.deepEqual([a.status,a.attempt,a.revision],['pending',1,1]);
  assert.equal(x.state.docs.size,1);
  assert.equal(x.state.requests.size,1);
  assert.equal(x.state.audit[0].action,'document.upload_pending');
  assert.match(x.document(a.documentId).storage_path,/attempt-1$/);
  assert.deepEqual(Object.keys(a).sort(),['documentId','status','attempt','revision'].sort());
});

test('idempotent replay returns same document; conflicting digest or record never creates another',async()=>{
  const x=setup(),a=await x.coordinator.begin(x.beginArgs());
  assert.deepEqual(await x.coordinator.begin(x.beginArgs()),a);
  await assert.rejects(x.coordinator.begin({...x.beginArgs(),file:{...descriptor(),sha256:'f'.repeat(64)}}),/DOCUMENT_IDEMPOTENCY_CONFLICT/);
  await assert.rejects(x.coordinator.begin({...x.beginArgs(),recordId:'different_grant'}),/DOCUMENT_IDEMPOTENCY_CONFLICT/);
  assert.equal(x.state.docs.size,1);
  assert.equal(x.state.audit.length,1);
});

test('wrong tenant, disabled account, alien creator, unknown parent and unknown token cannot create',async()=>{
  const x=setup();
  for(const auth of ['outside','disabled','other','unknown']){
    await assert.rejects(x.coordinator.begin(x.beginArgs('req_'+auth,auth)));
  }
  await assert.rejects(x.coordinator.begin({...x.beginArgs(),recordId:'missing_grant',requestId:'req_other'}),/DOCUMENT_TENANT_DENIED/);
  assert.equal(x.state.docs.size,0);
  assert.equal(x.state.audit.length,0);
});

test('wrong actor/tenant/stale revision denied BEFORE accessing object storage',async()=>{
  const x=setup(),a=await x.coordinator.begin(x.beginArgs());
  for(const auth of ['outside','disabled','other']){
    await assert.rejects(x.coordinator.finish({auth,documentId:a.documentId,expectedRevision:1}));
  }
  await assert.rejects(x.coordinator.finish({auth:'employee',documentId:a.documentId,expectedRevision:8}),/DOCUMENT_REVISION_CONFLICT/);
  assert.equal(x.state.inspections,0);
  assert.equal(x.state.audit.length,1);
});

test('stored bytes must exist; mismatch in content type, digest or generation cannot finalize',async()=>{
  for(const mode of ['missing','wrong-bytes','wrong-mime','bad-generation']){
    const x=setup(),a=await x.coordinator.begin(x.beginArgs());
    if(mode==='wrong-bytes')x.upload(x.document(a.documentId),{bytes:Buffer.from('tamper')});
    if(mode==='wrong-mime')x.upload(x.document(a.documentId),{mime_type:'image/png'});
    if(mode==='bad-generation')x.upload(x.document(a.documentId),{generation:'0'});
    await assert.rejects(x.coordinator.finish({auth:'employee',documentId:a.documentId,expectedRevision:1}));
    assert.equal(x.document(a.documentId).status,'pending');
    assert.equal(x.state.audit.length,1);
  }
});

test('verified object becomes READY atomically with typed audit; replay rejected',async()=>{
  const x=setup(),a=await x.coordinator.begin(x.beginArgs());
  x.upload(x.document(a.documentId));
  const done=await x.coordinator.finish({auth:'employee',documentId:a.documentId,expectedRevision:1});
  assert.equal(done.status,'ready');
  assert.equal(done.revision,2);
  assert.equal(x.state.audit[1].action,'document.upload_verified');
  await assert.rejects(x.coordinator.finish({auth:'employee',documentId:a.documentId,expectedRevision:1}),/DOCUMENT_REVISION_CONFLICT/);
  assert.equal(x.state.audit.length,2);
});

test('failed attempt uses new path, stale object cannot verify retry, audit records each state',async()=>{
  const x=setup(),a=await x.coordinator.begin(x.beginArgs());
  const old=x.document(a.documentId);x.upload(old);
  const fail=await x.coordinator.fail({auth:'employee',documentId:a.documentId,expectedRevision:1,failureCode:'UPLOAD_FAILED'});
  assert.equal(fail.status,'failed');
  await x.coordinator.retry({auth:'employee',documentId:a.documentId,expectedRevision:fail.revision});
  const newer=x.document(a.documentId);
  assert.notEqual(newer.storage_path,old.storage_path);
  await assert.rejects(x.coordinator.finish({auth:'employee',documentId:a.documentId,expectedRevision:3}),/SYNTHETIC_OBJECT_MISSING/);
  x.upload(newer);
  assert.equal((await x.coordinator.finish({auth:'employee',documentId:a.documentId,expectedRevision:3})).status,'ready');
  assert.deepEqual(x.state.audit.map(a=>a.action),[
    'document.upload_pending','document.upload_failed','document.upload_retried','document.upload_verified'
  ]);
});

test('raw failures and invalid IDs are rejected and never logged or returned to caller',async()=>{
  const x=setup(),a=await x.coordinator.begin(x.beginArgs());
  await assert.rejects(x.coordinator.fail({auth:'employee',documentId:a.documentId,expectedRevision:1,failureCode:'secret/bucket/uid'}),/DOCUMENT_INVALID_FAILURE_CODE/);
  await assert.rejects(x.coordinator.retry({auth:'employee',documentId:a.documentId,expectedRevision:0}),/DOCUMENT_INVALID_REVISION/);
  await assert.rejects(x.coordinator.status({auth:'employee',documentId:'../forbidden'}),/DOCUMENT_INVALID_ID/);
  const result=await x.coordinator.status({auth:'employee',documentId:a.documentId});
  assert.doesNotMatch(JSON.stringify(result),/storage_path|municipality_id|created_by|generation|secret/i);
  assert.equal(x.state.audit.length,1);
});

test('audit failure aborts metadata finalization even when bytes exist',async()=>{
  const x=setup(),a=await x.coordinator.begin(x.beginArgs());
  x.upload(x.document(a.documentId));
  const base=x.store.transaction.bind(x.store);
  x.store.transaction=cb=>base(tx=>{
    tx.appendAudit=()=>{throw Error('SYNTHETIC_AUDIT_FAILURE');};
    return cb(tx);
  });
  await assert.rejects(x.coordinator.finish({auth:'employee',documentId:a.documentId,expectedRevision:1}),/SYNTHETIC_AUDIT_FAILURE/);
  assert.equal(x.document(a.documentId).status,'pending');
  assert.equal(x.state.audit.length,1);
});

test('concurrent failure invalidates a verified proof before transactional finalize',async()=>{
  let x;
  x=setup({onInspect:async documentId=>{
    await x.coordinator.fail({auth:'employee',documentId,expectedRevision:1,failureCode:'UPLOAD_FAILED'});
  }});
  const a=await x.coordinator.begin(x.beginArgs());
  x.upload(x.document(a.documentId));
  await assert.rejects(x.coordinator.finish({auth:'employee',documentId:a.documentId,expectedRevision:1}),/DOCUMENT_REVISION_CONFLICT/);
  assert.equal(x.document(a.documentId).status,'failed');
  assert.equal(x.state.audit.length,2);
});

test('document metadata is accessible only to its creator inside the verified municipality',async()=>{
  const x=setup(),a=await x.coordinator.begin(x.beginArgs());
  assert.equal((await x.coordinator.status({auth:'employee',documentId:a.documentId})).status,'pending');
  await assert.rejects(x.coordinator.status({auth:'other',documentId:a.documentId}),/DOCUMENT_ACTOR_DENIED/);
  await assert.rejects(x.coordinator.status({auth:'outside',documentId:a.documentId}),/DOCUMENT_NOT_FOUND/);
});

test('revoking membership DURING verified byte inspection prevents final READY transition',async()=>{
  let x;
  x=setup({onInspect:async()=>{x.state.revokedActors.add(employee);}});
  const a=await x.coordinator.begin(x.beginArgs());
  x.upload(x.document(a.documentId));
  await assert.rejects(
    x.coordinator.finish({auth:'employee',documentId:a.documentId,expectedRevision:1}),
    /DOCUMENT_ROLE_DENIED/
  );
  assert.equal(x.document(a.documentId).status,'pending');
  assert.equal(x.state.audit.length,1);
});

test('missing transaction-scoped membership gate is a hard error, not a silent bypass',async()=>{
  const x=setup(),base=x.store.transaction.bind(x.store);
  x.store.transaction=cb=>base(tx=>{
    delete tx.assertActiveMembership;
    return cb(tx);
  });
  await assert.rejects(x.coordinator.begin(x.beginArgs()),/DOCUMENT_MEMBERSHIP_GATE_REQUIRED/);
  assert.equal(x.state.docs.size,0);
  assert.equal(x.state.audit.length,0);
});
