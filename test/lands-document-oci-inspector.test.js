import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createOciSaudiDocumentInspector as factory} from '../embedded-lands/server/document-oci-inspector.js';
const municipalityId='municipality_demo_1',documentId='doc_demo_1';
const storagePath='landsMunicipalities/'+municipalityId+'/documents/landGrants/grant_demo_1/'+documentId+'/attempt-1';
const scope={municipalityId,documentId,storagePath,attempt:1};
const body=Buffer.from('%PDF-1.7 synthetic data');
const version='2d528a44-5b15-40dc-b303-20993d1ade66';
function setup(o={}){
 const calls=[];const region=o.region??'me-jeddah-1',namespace=o.namespace??'testnamespace',bucket=o.bucket??'synthetic-private-bucket';
 const endpoint=o.endpoint??`https://${namespace}.compat.objectstorage.${region}.oci.customer-oci.com`;
 const controlPlane={async describeBucket(){calls.push('control');if(o.error)throw Error('SECRET');
  return {region:o.bucketRegion??region,namespace,bucket,publicAccessType:o.visibility??'NoPublicAccess',versioning:o.versioning??'Enabled'};}};
 const s3={async headObject(){calls.push('head');return {versionId:o.headVersion===undefined?version:o.headVersion,contentType:o.headMime??'application/pdf',contentLength:o.headLength??body.length}},
  async getObject({versionId}){calls.push('get:'+versionId);return {versionId:o.getVersion??version,contentType:o.getMime??'application/pdf',contentLength:o.getLength??body.length,
    body:o.bytes??body};}};
 return {calls,create:()=>factory({region,namespace,bucket,endpoint,controlPlane,s3})};
}
async function rejects(o,req=scope){const v=setup(o);
 await assert.rejects(async()=>v.create().inspectAndHash(req),
 e=>e?.code==='DOCUMENT_STORAGE_VERIFICATION_FAILED'&&!/SECRET|synthetic-private-bucket/.test(e.message));
 return v.calls;
}
test('signed Saudi Jeddah bucket, immutable version, real bytes and SHA-256',async()=>{
 const s=setup(),p=await s.create().inspectAndHash(scope);
 assert.equal(p.provider,'oci');assert.equal(p.version_id,version);
 assert.equal(p.sha256,createHash('sha256').update(body).digest('hex'));
 assert.deepEqual(s.calls,['control','head','get:'+version]);
});
test('Saudi Riyadh accepted',async()=>{const s=setup({region:'me-riyadh-1'});assert.equal((await s.create().inspectAndHash(scope)).size_bytes,body.length)});
test('non Saudi region, altered endpoint or tenant-namespace rejected before I/O',()=>{
 for(const cfg of [{region:'us-ashburn-1'},{region:'me-dubai-1'},
 {endpoint:'http://testnamespace.compat.objectstorage.me-jeddah-1.oci.customer-oci.com'},
 {endpoint:'https://testnamespace.compat.objectstorage.us-ashburn-1.oci.customer-oci.com'},
 {namespace:'invalid/namespace'}]){const s=setup(cfg);assert.throws(s.create,/DOCUMENT_STORAGE_VERIFICATION_FAILED/);assert.equal(s.calls.length,0)}
});
test('signed bucket region mismatch, public bucket and missing versioning fail before read',async()=>{
 for(const cfg of [{bucketRegion:'me-riyadh-1'},{visibility:'ObjectRead'},
 {versioning:'Disabled'},{versioning:'Suspended'},{error:true}]){
  assert.deepEqual(await rejects(cfg),['control']);
 }
});
test('cross tenant, path traversal, modified documentId and attempt rejected pre-I/O',async()=>{
 for(const req of [{...scope,municipalityId:'other'},
 {...scope,documentId:'other'},
 {...scope,storagePath:'../../oops'},
 {...scope,storagePath:storagePath.replace('attempt-1','attempt-2')},
 {...scope,attempt:4}])assert.deepEqual(await rejects({},req),[]);
});
test('missing or changed OCI object version denied',async()=>{
 for(const cfg of [{headVersion:null},{headVersion:'../escape'},
 {getVersion:'wrong-version'}])await rejects(cfg);
});
test('MIME, bytes, size mismatch and oversized metadata denied',async()=>{
 for(const cfg of [{bytes:Buffer.from('not a PDF')},{getMime:'image/png'},
 {getLength:1},{headMime:'application/octet-stream'},
 {headLength:10*1024*1024+1}])await rejects(cfg);
});
