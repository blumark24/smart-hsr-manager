/**
 * SMART HSR — isolated Google Cloud Storage object verifier.
 * No production import, signed URL issuance, upload, overwrite or delete.
 * Bucket must be supplied by a trusted host, never by an HTTP client.
 * Object generation is pinned to avoid verifying mutable "latest" bytes.
 */
import { createHash } from 'node:crypto';
import {
  assertMunicipalityId,assertLandsStorageId,assertDocumentRecordDomain,
  buildLandsStoragePath,LANDS_DOCUMENT_MAX_BYTES
} from '../../lands/client/lands-core.js';

const GEN=/^[1-9][0-9]{0,30}$/;
const MIME=new Set(['application/pdf','image/jpeg','image/png']);
function fail() {
  const e=new Error('DOCUMENT_STORAGE_VERIFICATION_FAILED');
  e.code='DOCUMENT_STORAGE_VERIFICATION_FAILED';
  throw e;
}
function mimeFromBytes(buf) {
  if(buf.length>=5&&buf.subarray(0,5).toString('ascii')==='%PDF-')return 'application/pdf';
  if(buf.length>=3&&buf[0]===0xff&&buf[1]===0xd8&&buf[2]===0xff)return 'image/jpeg';
  if(buf.length>=8&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  return null;
}
function exactPath({municipalityId,documentId,storagePath,attempt}) {
  try {
    assertMunicipalityId(municipalityId);
    assertLandsStorageId(documentId);
    if(!Number.isInteger(attempt)||attempt<1||attempt>3||
       typeof storagePath!=='string')return false;
    const parts=storagePath.split('/');
    if(parts.length!==7||parts[2]!=='documents'||parts[5]!==documentId||
       parts[6]!=='attempt-'+attempt)return false;
    assertDocumentRecordDomain(parts[3]);
    assertLandsStorageId(parts[4]);
    return storagePath===buildLandsStoragePath(
      municipalityId,parts[3],parts[4],documentId
    )+'/attempt-'+attempt;
  } catch {return false;}
}
export function createGcsDocumentInspector({bucket}={}) {
  if(typeof bucket?.file!=='function')fail();
  return Object.freeze({
    async inspectAndHash(scope) {
      if(!exactPath(scope))fail();
      try {
        // First metadata lookup resolves the CURRENT immutable generation.
        const object=bucket.file(scope.storagePath);
        const [head]=await object.getMetadata();
        if(!head||!GEN.test(String(head.generation))||
           !Number.isSafeInteger(Number(head.size))||
           Number(head.size)<1||Number(head.size)>LANDS_DOCUMENT_MAX_BYTES||
           !MIME.has(head.contentType))fail();
        // Pin the generation; never accept bytes from a newer "latest" file.
        const pinned=bucket.file(scope.storagePath,{
          generation:String(head.generation)
        });
        const [version]=await pinned.getMetadata();
        if(!version||String(version.generation)!==String(head.generation)||
           Number(version.size)!==Number(head.size)||
           version.contentType!==head.contentType)fail();
        const [body]=await pinned.download();
        if(!Buffer.isBuffer(body)||body.length!==Number(head.size)||
           body.length>LANDS_DOCUMENT_MAX_BYTES||
           mimeFromBytes(body)!==head.contentType)fail();
        return Object.freeze({
          storage_path:scope.storagePath,
          mime_type:head.contentType,
          size_bytes:body.length,
          sha256:createHash('sha256').update(body).digest('hex'),
          generation:String(head.generation)
        });
      } catch {
        // Never surface bucket name/path, customer data or provider errors.
        fail();
      }
    }
  });
}
