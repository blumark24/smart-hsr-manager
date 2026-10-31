import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createOciS3SdkReadAdapter} from '../embedded-lands/server/document-oci-s3-sdk-adapter.js';
import {createOciSaudiDocumentInspector} from '../embedded-lands/server/document-oci-inspector.js';

const region='me-jeddah-1',namespace='syntheticnamespace',bucket='isolated-demo-1';
const endpoint=`https://${namespace}.compat.objectstorage.${region}.oci.customer-oci.com`;
const storagePath='landsMunicipalities/municipality_demo_1/documents/landGrants/grant_demo_1/doc_demo_1/attempt-1';
const scope={municipalityId:'municipality_demo_1',documentId:'doc_demo_1',storagePath,attempt:1};
const pdf=Buffer.from('%PDF-1.7 original synthetic data');
const versionId='f09b0816-37f6-4573-8fbe-52f74677fc8c';
class HeadObjectCommand {constructor(input){this.input=input;}}
class GetObjectCommand {constructor(input){this.input=input;}}
function harness({headOverride={},getOverride={},errorOn=null,controlOverride={}}={}){
 const calls=[];
 const client={async send(cmd) {
   calls.push({kind:cmd.constructor.name,input:cmd.input});
   if(cmd.constructor.name===errorOn)throw Error('DO_NOT_LEAK_OCI_SECRET');
   if(cmd instanceof HeadObjectCommand){
      return {VersionId:versionId,ContentLength:pdf.length,
        ContentType:'application/pdf',ETag:'"not-an-integrity-proof"',...headOverride};
   }
   if(cmd instanceof GetObjectCommand){
      return {VersionId:versionId,ContentLength:pdf.length,
        ContentType:'application/pdf',Body:{async transformToByteArray(){return Uint8Array.from(pdf)}},...getOverride};
   }
   throw Error('BAD_COMMAND');
 }};
 const s3=createOciS3SdkReadAdapter({client,HeadObjectCommand,GetObjectCommand});
 const controlPlane={async describeBucket(){calls.push({kind:'control'});return {
   region,namespace,bucket,publicAccessType:'NoPublicAccess',versioning:'Enabled',...controlOverride
 }}};
 const inspector=createOciSaudiDocumentInspector({region,namespace,bucket,endpoint,controlPlane,s3});
 return {calls,s3,inspector};
}
async function denied(h){
 await assert.rejects(()=>h.inspector.inspectAndHash(scope),
    e=>e?.code==='DOCUMENT_STORAGE_VERIFICATION_FAILED'&&
    !/DO_NOT_LEAK|syntheticnamespace|isolated-demo/.test(e.message));
}
test('AWS SDK v3 PascalCase responses are normalized; GET is pinned to HEAD VersionId',async()=>{
 const h=harness();const proof=await h.inspector.inspectAndHash(scope);
 assert.equal(proof.version_id,versionId);
 assert.equal(proof.sha256,createHash('sha256').update(pdf).digest('hex'));
 assert.deepEqual(h.calls.map(x=>x.kind),['control','HeadObjectCommand','GetObjectCommand']);
 assert.deepEqual(h.calls[1].input,{Bucket:bucket,Key:storagePath});
 assert.deepEqual(h.calls[2].input,{Bucket:bucket,Key:storagePath,VersionId:versionId});
});
test('missing uppercase SDK metadata is denied; no unpinned GET proceeds',async()=>{
 for(const headOverride of [{VersionId:undefined},{VersionId:'null'},
   {VersionId:'../escape'},{ContentLength:undefined},{ContentType:undefined}]){
   const h=harness({headOverride});await denied(h);
   assert.equal(h.calls.some(x=>x.kind==='GetObjectCommand'),false);
 }
});
test('GET changed VersionId, type, missing Body, and provider errors fail closed',async()=>{
 for(const getOverride of [{VersionId:'changed-version'},{VersionId:undefined},
  {ContentType:'image/jpeg'},{ContentLength:pdf.length+1},{Body:undefined}]){
  const h=harness({getOverride});await denied(h);
 }
 for(const name of ['HeadObjectCommand','GetObjectCommand']){
  await denied(harness({errorOn:name}));
 }
});
test('SDK never receives caller-supplied traversal or unapproved paths',async()=>{
 const h=harness();
 for(const key of ['../secret','/secret','x//../y','']){
  await assert.rejects(()=>h.s3.headObject({bucket,key}),
    /DOCUMENT_STORAGE_VERIFICATION_FAILED/);
  await assert.rejects(()=>h.s3.getObject({bucket,key,versionId}),
    /DOCUMENT_STORAGE_VERIFICATION_FAILED/);
 }
 assert.equal(h.calls.length,0);
});
test('SDK factory rejects absent dependencies and missing VersionId before network',async()=>{
 assert.throws(()=>createOciS3SdkReadAdapter({client:{send(){}}}),
  /DOCUMENT_STORAGE_VERIFICATION_FAILED/);
 const h=harness();
 await assert.rejects(()=>h.s3.getObject({bucket,key:storagePath}),
  /DOCUMENT_STORAGE_VERIFICATION_FAILED/);
 assert.equal(h.calls.length,0);
});
test('region and public bucket control-plane failures short-circuit SDK calls',async()=>{
 for(const controlOverride of [{region:'us-ashburn-1'},{publicAccessType:'ObjectRead'},
   {versioning:'Suspended'}]){
  const h=harness({controlOverride});await denied(h);
  assert.deepEqual(h.calls.map(x=>x.kind),['control']);
 }
});
