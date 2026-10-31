import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGcsDocumentInspector } from '../embedded-lands/server/document-gcs-inspector.js';

const documentId='document_demo_1';
const municipalityId='municipality_demo_1';
const path='landsMunicipalities/'+municipalityId+
  '/documents/landGrants/grant_demo_1/'+documentId+'/attempt-1';
const scope={municipalityId,documentId,storagePath:path,attempt:1};
const pdf=Buffer.from('%PDF-1.7\nsynthetic no-personal-data');
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from('fake-image')]);
const jpg=Buffer.from([255,216,255,224,0,7,1,2,3]);
const hex=buf=>createHash('sha256').update(buf).digest('hex');

function fakeBucket({bytes=pdf,mime='application/pdf',generation='42',
  size=String(bytes.length),pinnedGeneration,failDownload=false,
  failMetadata=false,bucketLocation='ME-CENTRAL2',
  bucketLocationType='region',failBucketMetadata=false}={}) {
  const calls=[];
  const bucket={
    async getMetadata() {
      if(failBucketMetadata)throw Error('SECRET_BUCKET_LOCATION_DETAIL');
      return [{location:bucketLocation,locationType:bucketLocationType}];
    },
    file(objectPath,options) {
      calls.push({path:objectPath,generation:options?.generation||null});
      return {
        async getMetadata() {
          if(failMetadata)throw Error('SECRET_PROVIDER_ERROR');
          const gen=options?.generation ? (pinnedGeneration||generation) : generation;
          return [{generation:gen,size,contentType:mime}];
        },
        async download() {
          if(failDownload)throw Error('SECRET_RAW_BUCKET_TOKEN');
          return [bytes];
        }
      };
    }
  };
  return {bucket,calls};
}
async function inspect(options={},request=scope){
  const fake=fakeBucket(options);
  const value=await createGcsDocumentInspector({bucket:fake.bucket}).inspectAndHash(request);
  return {value,calls:fake.calls};
}
async function denied(options={},request=scope){
  const fake=fakeBucket(options);
  await assert.rejects(
    createGcsDocumentInspector({bucket:fake.bucket}).inspectAndHash(request),
    e=>e?.code==='DOCUMENT_STORAGE_VERIFICATION_FAILED'&&
       !/BUCKET|TOKEN|SECRET|municipality_demo/i.test(e.message)
  );
  return fake.calls;
}

test('real-looking PDF bytes generate trusted digest from pinned immutable generation',async()=>{
  const {value,calls}=await inspect();
  assert.deepEqual(value,{
    storage_path:path,mime_type:'application/pdf',size_bytes:pdf.length,
    sha256:hex(pdf),generation:'42'
  });
  assert.deepEqual(calls,[
    {path,generation:null},{path,generation:'42'}
  ]);
});

test('PNG and JPEG signatures accept only correct verified content types',async()=>{
  for(const [bytes,mime] of [[png,'image/png'],[jpg,'image/jpeg']]){
    const {value}=await inspect({bytes,mime});
    assert.equal(value.mime_type,mime);
    assert.equal(value.sha256,hex(bytes));
  }
});

test('wrong tenant, document ID, domain and attempt path reject BEFORE touching bucket',async()=>{
  for(const tamper of [
    {...scope,municipalityId:'other_tenant'},
    {...scope,documentId:'other_doc'},
    {...scope,storagePath:path.replace('/landGrants/','/auditLogs/')},
    {...scope,storagePath:path+'/../secret'},
    {...scope,storagePath:path.replace('attempt-1','attempt-2')},
    {...scope,attempt:4},
    {...scope,storagePath:'../../secret'}
  ]){
    const calls=await denied({},tamper);
    assert.equal(calls.length,0);
  }
});

test('mismatched declared content type and byte signature are denied',async()=>{
  await denied({bytes:pdf,mime:'image/png'});
  await denied({bytes:Buffer.from('plain text'),mime:'application/pdf'});
  await denied({bytes:jpg,mime:'application/pdf'});
});

test('size mismatch, zero size and size beyond 10MB reject before trusting proof',async()=>{
  await denied({bytes:pdf,size:'2'});
  await denied({bytes:pdf,size:'0'});
  await denied({bytes:pdf,size:String(10*1024*1024+1)});
});

test('bad or switched object generation fails closed with no verification proof',async()=>{
  await denied({generation:'0'});
  await denied({generation:'not-generation'});
  await denied({generation:'42',pinnedGeneration:'43'});
});

test('cloud errors are sanitized; no bucket or tenant content disclosed',async()=>{
  await denied({failDownload:true});
  await denied({failMetadata:true});
});

test('no bucket means fail closed',()=>{
  assert.throws(()=>createGcsDocumentInspector({}),/DOCUMENT_STORAGE_VERIFICATION_FAILED/);
});

test('rejects non-Dammam, unknown, or non-regional GCS bucket BEFORE object access',async()=>{
  for(const region of ['US-CENTRAL1','ME-CENTRAL1','EUROPE-WEST1','',null]) {
    const calls=await denied({bucketLocation:region});
    assert.equal(calls.length,0);
  }
  for(const type of ['multi-region','',null]) {
    const calls=await denied({bucketLocationType:type});
    assert.equal(calls.length,0);
  }
  const calls=await denied({failBucketMetadata:true});
  assert.equal(calls.length,0);
});

test('Dammam metadata in lower or upper case passes regional proof gate',async()=>{
  const {value}=await inspect({bucketLocation:'me-central2',bucketLocationType:'REGION'});
  assert.equal(value.storage_path,path);
});

test('bucket without location read capability fails closed',()=>{
  assert.throws(()=>createGcsDocumentInspector({bucket:{file(){}}}),
    /DOCUMENT_STORAGE_VERIFICATION_FAILED/);
});
