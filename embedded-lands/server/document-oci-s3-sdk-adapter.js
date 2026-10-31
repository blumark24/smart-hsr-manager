/**
 * OCI S3-compatible AWS SDK v3 response adapter, standalone and inert.
 *
 * The trusted host owns the S3Client, credential/region/endpoint configuration,
 * authorization, and OCI Native API regional-bucket attestation. Never accept
 * these from an HTTP caller. This module does not create or configure clients.
 * SDK v3 uses PascalCase (VersionId/ContentLength/Body); our independent
 * inspector accepts normalized lower-camel fields only.
 */
const error=()=>{const e=new Error('DOCUMENT_STORAGE_VERIFICATION_FAILED');e.code=e.message;throw e;};
const VERSION=/^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const BUCKET=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PATH=/^[a-zA-Z0-9_./-]{1,520}$/;
function safeBucketKey(bucket,key){
 if(typeof bucket!=='string'||!BUCKET.test(bucket)||typeof key!=='string'||
    !PATH.test(key)||key.includes('..')||key.startsWith('/')||key.endsWith('/'))error();
}
function normalizeMetadata(source){
 if(!source||typeof source.VersionId!=='string'||!VERSION.test(source.VersionId)||
    !Number.isSafeInteger(source.ContentLength)||source.ContentLength<1||
    typeof source.ContentType!=='string')error();
 return {versionId:source.VersionId,contentType:source.ContentType,
   contentLength:source.ContentLength};
}
export function createOciS3SdkReadAdapter({client,HeadObjectCommand,GetObjectCommand}={}){
 if(typeof client?.send!=='function'||typeof HeadObjectCommand!=='function'||
    typeof GetObjectCommand!=='function')error();
 return Object.freeze({
   async headObject({bucket,key}={}){
     safeBucketKey(bucket,key);
     try{
       const raw=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
       return Object.freeze(normalizeMetadata(raw));
     }catch{error();}
   },
   async getObject({bucket,key,versionId}={}){
     safeBucketKey(bucket,key);
     if(typeof versionId!=='string'||!VERSION.test(versionId))error();
     try{
       const raw=await client.send(new GetObjectCommand({
         Bucket:bucket,Key:key,VersionId:versionId
       }));
       const meta=normalizeMetadata(raw);
       if(meta.versionId!==versionId||!raw.Body)error();
       return Object.freeze({...meta,body:raw.Body});
     }catch{error();}
   }
 });
}
