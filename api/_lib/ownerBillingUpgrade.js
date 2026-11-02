'use strict';

// SMART HSR — isolated Owner subscription upgrade transaction.
// Not an e-invoicing/payment processor; creates a pending billing record only.
const REQUEST_ID = /^[A-Za-z0-9_-]{20,100}$/;
const ORGANIZATION_ID = /^[A-Za-z0-9_-]{1,160}$/;
const PLANS = Object.freeze({Trial:'Pro',Basic:'Pro',Pro:'Enterprise'});
const MONTHLY_AMOUNT_SAR = Object.freeze({Pro:499,Enterprise:1499});
function failResponse(status,reason){return {status,payload:{ok:false,error:reason}};}

async function handleOwnerBillingUpgrade({body,decoded,db,FieldValue,sendJson,res}) {
  const organizationId=body?.organizationId;
  const requestId=body?.requestId;
  const expectedPlan=body?.expectedPlan;
  if(typeof organizationId!=='string'||!ORGANIZATION_ID.test(organizationId)||
     typeof requestId!=='string'||!REQUEST_ID.test(requestId)||
     !Object.hasOwn(PLANS,expectedPlan)) {
    return sendJson(res,400,{ok:false,error:'invalid_upgrade_request'});
  }
  if(typeof decoded?.uid!=='string'||!decoded.uid) {
    return sendJson(res,403,{ok:false,error:'owner_identity_required'});
  }
  const orgRef=db.collection('organizations').doc(organizationId);
  const requestRef=orgRef.collection('billingUpgradeRequests').doc(requestId);
  const recordId=`upgrade_${organizationId}_${requestId}`;
  const invoiceRef=db.collection('invoices').doc(recordId);
  const auditRef=db.collection('platformAdminAuditEvents').doc(recordId);
  const result=await db.runTransaction(async tx=>{
    // Firestore read-before-write discipline; all changes in one transaction.
    const [prior,orgSnapshot]=await Promise.all([tx.get(requestRef),tx.get(orgRef)]);
    if(prior.exists){
      const event=prior.data()||{};
      if(event.organizationId!==organizationId||event.expectedPlan!==expectedPlan)
        return failResponse(409,'upgrade_request_conflict');
      return {status:200,payload:{ok:true,idempotent:true,organizationId,
        plan:event.newPlan,billingRecordId:event.billingRecordId,billingStatus:'pending'}};
    }
    if(!orgSnapshot.exists) return failResponse(404,'organization_not_found');
    const org=orgSnapshot.data()||{};
    if(org.plan!==expectedPlan) return failResponse(409,'organization_plan_changed');
    if(['archived','expired'].includes(org.status))
      return failResponse(409,'organization_not_active');
    const nextPlan=PLANS[expectedPlan];
    if(!nextPlan) return failResponse(409,'plan_upgrade_unavailable');
    // No approved yearly pricing contract: never invent or charge one.
    const billingCycle=org.billingCycle||'monthly';
    if(billingCycle!=='monthly') return failResponse(409,'billing_price_review_required');
    const amount=MONTHLY_AMOUNT_SAR[nextPlan];
    const vat=Number((amount*0.15).toFixed(2));
    const total=Number((amount+vat).toFixed(2));
    const now=FieldValue.serverTimestamp();
    // Explicitly not paid or a legally compliant ZATCA invoice.
    tx.update(orgRef,{plan:nextPlan,status:'active',updatedAt:now});
    tx.create(invoiceRef,{
      invoiceId:`UPGRADE-${requestId}`,
      organization_id:organizationId,
      organization_name:String(org.name||'').slice(0,180),
      plan:nextPlan,billingCycle,
      amount,vat,total,status:'pending',paymentConfirmed:false,
      recordType:'subscription_upgrade_pending_billing',
      sourceRequestId:requestId,createdAt:now
    });
    tx.create(requestRef,{organizationId,expectedPlan,newPlan:nextPlan,
      billingRecordId:recordId,actorUid:decoded.uid,createdAt:now});
    tx.create(auditRef,{actorUid:decoded.uid,actorRole:'owner',
      action:'organization_upgrade_pending_billing',organizationId,
      resourceType:'billing_upgrade',resourceId:recordId,
      detail:{fromPlan:expectedPlan,toPlan:nextPlan,billingCycle,total,
        paymentStatus:'pending'},createdAt:now});
    return {status:200,payload:{ok:true,idempotent:false,organizationId,
      plan:nextPlan,billingRecordId:recordId,billingStatus:'pending'}};
  });
  return sendJson(res,result.status,result.payload);
}
module.exports={handleOwnerBillingUpgrade};
