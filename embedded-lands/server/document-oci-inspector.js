/**
 * OCI Saudi Region document byte verifier: isolated prototype, NO LIVE ROUTE.
 * Trusted host injects authenticated OCI Native control plane and S3 adapters.
 * This code performs no credentials, writes, account changes or HTTP calls.
 */
import {createHash} from 'node:crypto';
import {assertMunicipalityId,assertLandsStorageId,assertDocumentRecordDomain,
 buildLandsStoragePath,LANDS_DOCUMENT_MAX_BYTES} from '../../lands/client/lands-core.js';
const ALLOWED=new Set(['me-jeddah-1','me-riyadh-1']);
const VERSION=/^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const validVersion=(v)=>typeof v==='string'&&VERSION.test(v)&&
 v.toLowerCase()!=='null'&&v.toLowerCase()!=='undefined';
const TYPES=new Set(['application/pdf','image/jpeg','image/png']);
const deny=()=>{const e=new Error('DOCUMENT_STORAGE_VERIFICATION_FAILED');e.code=e.message;throw e;};
function validPath({municipalityId,documentId,storagePath,attempt}={}) {
 try{
  assertMunicipalityId(municipalityId); assertLandsStorageId(documentId);
  if(!Number.isInteger(attempt)||attempt<1||attempt>3||typeof storagePath!=='string')return false;
  const p=storagePath.split('/');
  if(p.length!==7||p[2]!=='documents'||p[5]!==documentId||p[6]!=='attempt-'+attempt)return false;
  assertDocumentRecordDomain(p[3]);assertLandsStorageId(p[4]);
  return storagePath===buildLandsStoragePath(municipalityId,p[3],p[4],documentId)+'/attempt-'+attempt;
 }catch{return false;}
}
function sniff(b) {
 if(b.length>=5&&b.subarray(0,5).toString('ascii')==='%PDF-')return 'application/pdf';
 if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 return null;
}
// OCI's SDK returns Node Readable streams. Never use transformToByteArray():
// it can buffer an untrusted response in full before the declared size is
// checked. Abort during iteration once the verified maximum is exceeded.
async function bytesOf(body){
 if(Buffer.isBuffer(body)){
  if(body.length<1||body.length>LANDS_DOCUMENT_MAX_BYTES)deny();
  return body;
 }
 if(typeof body?.[Symbol.asyncIterator]!=='function')deny();
 const chunks=[];let total=0;
 for await(const chunk of body){
  if(!(chunk instanceof Uint8Array))deny();
  total+=chunk.byteLength;
  if(total>LANDS_DOCUMENT_MAX_BYTES)deny();
  chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
 }
 if(total<1)deny();
 return Buffer.concat(chunks,total);
}
export function createOciSaudiDocumentInspector({region,namespace,bucket,endpoint,
 controlPlane,s3}={}){
 if(!ALLOWED.has(region)||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(namespace??'')||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(bucket??'')||
    endpoint!==`https://${namespace}.compat.objectstorage.${region}.oci.customer-oci.com`||
    typeof controlPlane?.describeBucket!=='function'||
    typeof s3?.headObject!=='function'||typeof s3?.getObject!=='function')deny();
 return Object.freeze({async inspectAndHash(scope){
  if(!validPath(scope))deny();
  try{
   // A configured URL is not proof of Saudi residency: signed OCI Native
   // control-plane attestation must confirm the bucket and private versioning.
   const info=await controlPlane.describeBucket({region,namespace,bucket});
   if(!info||info.region!==region||info.namespace!==namespace||
      info.bucket!==bucket||info.publicAccessType!=='NoPublicAccess'||
      info.versioning!=='Enabled')deny();
   const head=await s3.headObject({bucket,key:scope.storagePath});
   if(!validVersion(head?.versionId)||
      !TYPES.has(head.contentType)||!Number.isSafeInteger(head.contentLength)||
      head.contentLength<1||head.contentLength>LANDS_DOCUMENT_MAX_BYTES)deny();
   // OCI S3 VersionId is not a GCS numeric generation. ETag is not SHA-256.
   const obj=await s3.getObject({bucket,key:scope.storagePath,versionId:head.versionId});
   if(obj?.versionId!==head.versionId||obj.contentType!==head.contentType||
      obj.contentLength!==head.contentLength)deny();
   const body=await bytesOf(obj.body);
   if(body.length!==head.contentLength||sniff(body)!==head.contentType)deny();
   return Object.freeze({provider:'oci',storage_path:scope.storagePath,
     mime_type:head.contentType,size_bytes:body.length,
     sha256:createHash('sha256').update(body).digest('hex'),version_id:head.versionId});
  }catch{deny();}
 }});
}
