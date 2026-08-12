'use strict';

const crypto = require('crypto');
const { getDb, FieldValue } = require('../_lib/firebaseAdmin');
const { verifyRequestToken, activeIsNotFalse } = require('../_lib/authz');

function sendJson(res,statusCode,payload){res.statusCode=statusCode;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.end(JSON.stringify(payload));}
function cleanId(value){const v=typeof value==='string'?value.trim():'';return /^[A-Za-z0-9_-]{1,128}$/.test(v)?v:'';}
function pendingUploadId(objectKey){return crypto.createHash('sha256').update(objectKey,'utf8').digest('hex');}
function evaluateFinalization(upload,observation,caller,observationId,objectKey){
  if(upload?.organizationId!==caller.organizationId||observation?.organizationId!==caller.organizationId)return {allowed:false,code:'cross_organization_denied'};
  if(upload?.ownerUid!==caller.uid||observation?.createdByUid!==caller.uid)return {allowed:false,code:'owner_denied'};
  if(upload?.objectKey!==objectKey||upload?.observationId!==observationId||observation?.imageObjectKey!==objectKey)return {allowed:false,code:'evidence_binding_denied'};
  return {allowed:true};
}
async function handler(req,res){
  if(req.method!=='POST')return sendJson(res,405,{error:'method_not_allowed'});
  let decoded;try{decoded=await verifyRequestToken(req);}catch(error){return sendJson(res,error.statusCode||401,{error:'unauthenticated'});}
  const db=getDb();const userSnap=await db.collection('users').doc(decoded.uid).get();const user=userSnap.exists?userSnap.data()||{}:{};
  const organizationId=typeof user.organizationId==='string'?user.organizationId.trim():'';
  if(user.role!=='inspector'||!activeIsNotFalse(user)||!organizationId)return sendJson(res,403,{error:'forbidden'});
  const body=req.body&&typeof req.body==='object'?req.body:{};const observationId=cleanId(body.observationId);const objectKey=typeof body.objectKey==='string'?body.objectKey.trim():'';
  if(!observationId||!objectKey)return sendJson(res,400,{error:'invalid_request'});
  const caller={uid:decoded.uid,organizationId};const uploadRef=db.collection('pendingEvidenceUploads').doc(pendingUploadId(objectKey));const observationRef=db.collection('observations').doc(observationId);
  try{
    const outcome=await db.runTransaction(async transaction=>{const [uploadSnap,observationSnap]=await Promise.all([transaction.get(uploadRef),transaction.get(observationRef)]);if(!uploadSnap.exists||!observationSnap.exists)return {allowed:false,code:'record_not_found'};const decision=evaluateFinalization(uploadSnap.data(),observationSnap.data(),caller,observationId,objectKey);if(!decision.allowed)return decision;transaction.set(uploadRef,{status:'FINALIZED',finalizedAt:FieldValue.serverTimestamp(),expiresAt:null},{merge:true});return {allowed:true};});
    if(!outcome.allowed)return sendJson(res,403,{error:outcome.code});
    return sendJson(res,200,{ok:true});
  }catch(_){return sendJson(res,500,{error:'finalization_failed'});}
}
module.exports=handler;module.exports._test={cleanId,pendingUploadId,evaluateFinalization,handler};
