'use strict';

// Manual billing DRAFT records, exclusively behind verified Owner context.
// This is not payment collection, ZATCA issuance, or a legal tax document.
const ID=/^[a-zA-Z0-9_-]{20,100}$/;
const ORG=/^[a-zA-Z0-9_-]{1,160}$/;
const PLANS=new Set(['Basic','Pro','Enterprise']);
const CYCLES=new Set(['monthly','yearly']);
function deny(status,error){return {status,payload:{ok:false,error}};}
function amountInHalalas(value){
  if(typeof value!=='number'||!Number.isFinite(value)||value<=0||
      value>1000000||Math.abs(value*100-Math.round(value*100))>1e-7)return null;
  return Math.round(value*100);
}
async function handleOwnerManualBilling({body,decoded,db,FieldValue,sendJson,res}){
  const organizationId=body?.organizationId;
  const requestId=body?.requestId;
  const plan=body?.plan;
  const billingCycle=body?.billingCycle;
  const amountHalalas=amountInHalalas(body?.amount);
  if(typeof organizationId!=='string'||!ORG.test(organizationId)||
     typeof requestId!=='string'||!ID.test(requestId)||
     !PLANS.has(plan)||!CYCLES.has(billingCycle)||amountHalalas===null||
     // Client must not decide whether money was received.
     body?.status!==undefined&&body.status!=='pending'){
    return sendJson(res,400,{ok:false,error:'invalid_pending_billing_request'});
  }
  if(typeof decoded?.uid!=='string'||!decoded.uid)
    return sendJson(res,403,{ok:false,error:'owner_identity_required'});
  const invoiceId='DRAFT-'+requestId;
  const documentId='manual_'+requestId;
  const invoiceRef=db.collection('invoices').doc(documentId);
  const orgRef=db.collection('organizations').doc(organizationId);
  const auditRef=db.collection('platformAdminAuditEvents').doc(documentId);
  const atIso=new Date().toISOString();
  const outcome=await db.runTransaction(async tx=>{
    const [existing,orgSnapshot]=await Promise.all([tx.get(invoiceRef),tx.get(orgRef)]);
    if(existing.exists){
      const previous=existing.data()||{};
      if(previous.recordType!=='manual_pending_billing'||
         previous.organization_id!==organizationId||previous.plan!==plan||
         previous.billingCycle!==billingCycle||previous.amount!==amountHalalas/100)
        return deny(409,'manual_billing_idempotency_conflict');
      // Existing record must never be marked paid merely by a retry.
      return {status:200,payload:{ok:true,idempotent:true,documentId,invoiceId,
        billingStatus:previous.status,paymentConfirmed:previous.paymentConfirmed===true}};
    }
    if(!orgSnapshot.exists)return deny(404,'organization_not_found');
    const org=orgSnapshot.data()||{};
    if(!['active','trial'].includes(org.status))
      return deny(409,'organization_not_active');
    const amount=amountHalalas/100;
    const vat=Math.round(amountHalalas*0.15)/100;
    const total=(amountHalalas+Math.round(amountHalalas*0.15))/100;
    const now=FieldValue.serverTimestamp();
    tx.create(invoiceRef,{
      invoiceId,organization_id:organizationId,
      organization_name:String(org.name||'').slice(0,180),
      plan,billingCycle,amount,vat,total,status:'pending',
      paymentConfirmed:false,recordType:'manual_pending_billing',
      sourceRequestId:requestId,createdAt:atIso,createdByUid:decoded.uid
    });
    tx.create(auditRef,{actorUid:decoded.uid,actorRole:'owner',
      organizationId,resourceType:'billing_draft',resourceId:documentId,
      action:'manual_pending_billing_created',detail:{plan,billingCycle,total,status:'pending'},
      createdAt:now});
    return {status:201,payload:{ok:true,idempotent:false,documentId,invoiceId,
      billingStatus:'pending',paymentConfirmed:false}};
  });
  return sendJson(res,outcome.status,outcome.payload);
}
module.exports={handleOwnerManualBilling};
