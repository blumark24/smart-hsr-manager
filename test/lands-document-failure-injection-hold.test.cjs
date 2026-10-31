'use strict';
// Deliberately non-invasive reproduction of the CURRENT two-phase file
// upload risk. These tests prove a P1 HOLD, not that storage has been fixed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const clientSrc = fs.readFileSync(path.join(root,'lands/client/lands-client.js'),'utf8');
const uiSrc = fs.readFileSync(path.join(root,'lands/index.html'),'utf8');
const embeddedSrc = fs.readFileSync(path.join(root,'api/_lib/embeddedLandsRuntime.js'),'utf8');
const executorSrc = fs.readFileSync(path.join(root,'embedded-lands/server/lands-mutation-executor.js'),'utf8');

function extract(source,start,end) {
  const a=source.indexOf(start);
  const b=source.indexOf(end,a+start.length);
  assert.ok(a>=0 && b>a, 'missing exact original function '+start);
  return source.slice(a,b);
}
function uploadHarness({failUpload=false,failMetadata=false}={}) {
  const trace=[],docs=new Map();
  const ctx={
    session:async()=>({firebaseUid:'synthetic-person'}),
    assertLandsDocumentUpload(file){assert.equal(file.type,'application/pdf');},
    doc(){return{id:'synthetic-file'};},collection(){return{};},root(){return{};},
    createLandsDocumentMetadata({municipalityId,actorUid,recordDomain,recordId,fileId}){
      return {municipality_id:municipalityId,created_by:actorUid,record_domain:recordDomain,record_id:recordId,file_id:fileId,storage_path:'synthetic-storage-path'};
    },
    serverTimestamp(){return 'SYNTHETIC_TIME';},
    async setDoc(reference,metadata){
      trace.push('metadata');
      if(failMetadata)throw Error('SYNTHETIC_METADATA_FAILURE');
      docs.set(reference.id,metadata);
    },
    ref(_storage,p){return p;},
    storage:{},
    documentStorageMetadata(){return{};},
    async uploadBytes(){
      trace.push('storage');
      if(failUpload)throw Error('SYNTHETIC_STORAGE_FAILURE');
    }
  };
  const src=extract(clientSrc,'    async uploadDocument(municipalityId, { recordDomain, recordId, file }) {','    async readDocument(municipalityId, documentId) {');
  const method=src.trim().replace(/,\s*$/,'');
  const api=vm.runInNewContext('({'+method+'})',ctx);
  return {api,trace,docs};
}

test('P1 reproduction: storage failure leaves a visible metadata document in current two-stage upload',async()=>{
  const x=uploadHarness({failUpload:true});
  await assert.rejects(x.api.uploadDocument('synthetic-municipality',{recordDomain:'landGrants',recordId:'synthetic-grant',file:{type:'application/pdf',size:104}}),/SYNTHETIC_STORAGE_FAILURE/);
  assert.deepEqual(x.trace,['metadata','storage']);
  assert.equal(x.docs.size,1,'current defect: orphaned metadata when bytes fail');
});
test('metadata rejection cannot start storage upload',async()=>{
  const x=uploadHarness({failMetadata:true});
  await assert.rejects(x.api.uploadDocument('synthetic-municipality',{recordDomain:'landGrants',recordId:'synthetic-grant',file:{type:'application/pdf',size:104}}),/SYNTHETIC_METADATA_FAILURE/);
  assert.deepEqual(x.trace,['metadata']);
  assert.equal(x.docs.size,0);
});
test('successful upload returns document id and writes two independent resources',async()=>{
  const x=uploadHarness();
  const out=await x.api.uploadDocument('synthetic-municipality',{recordDomain:'landGrants',recordId:'synthetic-grant',file:{type:'application/pdf',size:104}});
  assert.deepEqual(x.trace,['metadata','storage']);
  assert.equal(out.documentId,'synthetic-file');
  assert.equal(x.docs.size,1);
});
test('P1 reproduction: embedded document.replace cannot succeed without a document-storage adapter',()=>{
  assert.match(embeddedSrc,/createLandsMutationExecutor\(\{ db, documentStorage: null \}\)/);
  assert.match(executorSrc,/case 'document\.replace':[\s\S]*?if \(!documentStorage\) fail\('DOCUMENT_STORAGE_UNAVAILABLE'\)/);
  assert.doesNotMatch(embeddedSrc,/getStorage\(|createDocumentStorageAdapter\(/);
});
test('UI discloses storage gateway unavailability without leaking internal backend or tenancy',()=>{
  const script=extract(uiSrc,'function landsDocumentFailureMessage(error, operation = "رفع") {','async function refreshDocumentViewAfterMutation(');
  const f=vm.runInNewContext(script+'\nlandsDocumentFailureMessage');
  const out=f({code:'DOCUMENT_STORAGE_UNAVAILABLE',message:'secret-synthetic-firebase-bucket/uid'},'استبدال');
  assert.match(out,/خدمة استبدال المستندات غير متاحة/);
  assert.match(out,/لم تكتمل العملية/);
  assert.doesNotMatch(out,/secret|bucket|firebase|uid|DOCUMENT_STORAGE_UNAVAILABLE/i);
  const upload=f({code:'storage/retry-limit-exceeded'},'رفع');
  assert.match(upload,/لا تفترض نجاح الرفع/);
  assert.match(upload,/التحقق|تحقق/);
});
test('digital file does not equate a metadata record count with uploaded bytes or legal approval',()=>{
  assert.match(uiSrc,/\$\{docs\.length\} سجل مستند/);
  assert.match(uiSrc,/عدد السجلات لا يثبت اكتمال رفع الملفات أو استيفاء متطلبات الاعتماد/);
  assert.match(uiSrc,/spineStep\("سجلات المستندات", docs\.length > 0\)/);
  assert.doesNotMatch(uiSrc,/\$\{docs\.length\} ملف/);
});
