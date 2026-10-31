/**
 * Real Firestore Emulator (demo-* only). No production Firebase credentials,
 * Storage bucket, HTTP handler or municipal data. Firebase Admin bypasses
 * rules in the emulator as it would on a trusted server; the adapter must
 * explicitly enforce current tenant/role membership inside transactions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {createFirestoreDocumentStore} from '../embedded-lands/server/document-firestore-store.js';
import {createTrustedDocumentCoordinator} from '../embedded-lands/server/document-lifecycle-coordinator.js';

if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'') ||
   process.env.GCLOUD_PROJECT==='smart-hsr-manager') {
  throw Error('FIRESTORE_EMULATOR_REQUIRED: never use real Firebase');
}
const PROJECT='demo-smart-hsr-tests';
const app=initializeApp({projectId:PROJECT},'lands-document-isolated-emulator-test');
const db=getFirestore(app);
const pdf=Buffer.from('%PDF-1.7\nONLY SYNTHETIC DATA');
const digest=createHash('sha256').update(pdf).digest('hex');
const file={mime_type:'application/pdf',size_bytes:pdf.length,sha256:digest};
const salt=()=>randomBytes(5).toString('hex');
function harness() {
  const suffix=salt(),tenant='tenant_demo_'+suffix,
    actor='employee_demo_'+suffix,grant='grant_demo_'+suffix;
  const context={municipality_id:tenant,actor_uid:actor,
    lands_role:'lands_employee',lands_entitled:true,membership_enabled:true};
  const other={...context,municipality_id:'tenant_other_'+suffix};
  const membership=db.doc('landsMunicipalities/'+tenant+'/userAccess/'+actor);
  const parent=db.doc('landsMunicipalities/'+tenant+'/landGrants/'+grant);
  const store=createFirestoreDocumentStore({db});
  let docCount=0,inspectionHook=async()=>{};
  const coordinator=createTrustedDocumentCoordinator({
    async verifyPrincipal(token) {
      return token==='employee'?context:token==='other'?other:null;
    },
    store,
    objectStore:{
      async inspectAndHash({storagePath}){
        await inspectionHook();
        // Simulated byte proof only; real GCS inspector is tested separately.
        return {storage_path:storagePath,mime_type:file.mime_type,
          size_bytes:file.size_bytes,sha256:file.sha256,generation:'12345'};
      }
    },
    ids:{documentId:()=> 'doc_demo_'+suffix+'_'+(++docCount)},
    clock:{nowIso:()=>new Date().toISOString()}
  });
  const args=(requestId='request_demo_'+suffix)=>({
    auth:'employee',recordDomain:'landGrants',recordId:grant,requestId,file
  });
  return {
    tenant,actor,grant,context,other,membership,parent,store,coordinator,args,
    setInspectionHook(hook){inspectionHook=hook;}
  };
}

test('real Firestore emulator transaction contracts for Lands document coordinator', {timeout:120000}, async t=>{
  t.after(async()=>{await deleteApp(app);});
  await t.test('concurrent request key returns one document, one audit and one idempotency entry',async()=>{
    const h=harness();
    await h.membership.set({
      municipality_id:h.tenant,firebase_uid:h.actor,lands_role:'lands_employee',enabled:true
    });
    await h.parent.set({municipality_id:h.tenant,created_by:h.actor});
    const out=await Promise.all([
      h.coordinator.begin(h.args()),
      h.coordinator.begin(h.args()),
      h.coordinator.begin(h.args())
    ]);
    assert.equal(new Set(out.map(x=>x.documentId)).size,1);
    assert.equal(out[0].status,'pending');
    const data=await db.doc('landsMunicipalities/'+h.tenant+'/documents/'+out[0].documentId).get();
    assert.equal(data.exists,true);
    assert.equal(data.data().municipality_id,h.tenant);
    const indexes=await db.collection('landsMunicipalities/'+h.tenant+
      '/documentUploadRequests/'+h.actor+'/requests').get();
    assert.equal(indexes.size,1);
    const audit=await db.collection('landsMunicipalities/'+h.tenant+'/auditLogs').get();
    assert.equal(audit.size,1);
    assert.equal(audit.docs[0].data().action,'document.upload_pending');
    assert.equal(audit.docs[0].data().actor_uid,h.actor);
    await assert.rejects(h.coordinator.begin({...h.args(),file:{...file,sha256:'e'.repeat(64)}}),
      /DOCUMENT_IDEMPOTENCY_CONFLICT/);
  });
  await t.test('member revoked during byte inspection cannot finalize, audit remains pending',async()=>{
    const h=harness();
    await h.membership.set({
      municipality_id:h.tenant,firebase_uid:h.actor,lands_role:'lands_employee',enabled:true
    });
    await h.parent.set({municipality_id:h.tenant,created_by:h.actor});
    const created=await h.coordinator.begin(h.args());
    h.setInspectionHook(async()=>{
      await h.membership.update({enabled:false});
    });
    await assert.rejects(h.coordinator.finish({
      auth:'employee',documentId:created.documentId,expectedRevision:1
    }),/DOCUMENT_ROLE_DENIED/);
    const record=await db.doc('landsMunicipalities/'+h.tenant+
      '/documents/'+created.documentId).get();
    assert.equal(record.data().status,'pending');
    const audit=await db.collection('landsMunicipalities/'+h.tenant+'/auditLogs').get();
    assert.equal(audit.size,1);
    await assert.rejects(h.coordinator.status({
      auth:'other',documentId:created.documentId
    }),/DOCUMENT_NOT_FOUND/);
  });
  await t.test('missing parent and other-tenant principal never write document metadata',async()=>{
    const h=harness();
    await h.membership.set({
      municipality_id:h.tenant,firebase_uid:h.actor,lands_role:'lands_employee',enabled:true
    });
    await assert.rejects(h.coordinator.begin(h.args()),/DOCUMENT_TENANT_DENIED/);
    await assert.rejects(h.coordinator.begin({...h.args(),auth:'other'}),
      /DOCUMENT_ROLE_DENIED/);
    const snap=await db.collection('landsMunicipalities/'+h.tenant+'/documents').get();
    assert.equal(snap.size,0);
  });
});
