'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {handleOwnerBillingUpgrade}=require('../api/_lib/ownerBillingUpgrade');
const RID='synthetic-uuid-1234567890-1234',ORG='municipality_synthetic_A';
function fakeDb(organization={name:'Synthetic A',plan:'Basic',status:'active',billingCycle:'monthly'}){
 let docs=new Map();if(organization)docs.set('organizations/'+ORG,{...organization});
 let failAt=null;
 function ref(p){return {path:p,collection(s){return ref(p+'/'+s)},doc(id){return ref(p+'/'+(id||'generated'))}}}
 const db={collection(n){return ref(n)},async runTransaction(cb){
   let pending=[],wrote=false;
   const tx={
     async get(r){assert.equal(wrote,false,'Firestore read-before-write');const v=docs.get(r.path);return {exists:v!==undefined,data:()=>v&&structuredClone(v)}},
     update(r,data){wrote=true;pending.push(['update',r.path,data])},
     create(r,data){wrote=true;pending.push(['create',r.path,data])}
   };
   const result=await cb(tx),next=new Map(docs);
   for(const [op,p,data] of pending){
     if(p===failAt)throw Error('SIMULATED_WRITE_FAILURE');
     if(op==='create'&&next.has(p))throw Error('SIMULATED_DUPLICATE');
     if(op==='update'&&!next.has(p))throw Error('SIMULATED_MISSING');
     next.set(p,{...next.get(p),...data});
   }
   docs=next;return result;
 }};
 return {db,get:p=>docs.get(p),count:p=>[...docs.keys()].filter(k=>k.startsWith(p)).length,fail:p=>failAt=p};
}
async function upgrade(db,body={}){
 let status,response;
 await handleOwnerBillingUpgrade({body:{organizationId:ORG,expectedPlan:'Basic',requestId:RID,...body},
 decoded:{uid:'synthetic-owner'},db,FieldValue:{serverTimestamp:()=> 'synthetic-time'},
 sendJson(_res,s,b){status=s;response=b},res:{}});
 return {status,response};
}
test('atomic pending billing + audit, never auto-paid',async()=>{
 const h=fakeDb(),result=await upgrade(h.db);
 assert.equal(result.status,200);assert.equal(h.get('organizations/'+ORG).plan,'Pro');
 const bill=h.get('invoices/upgrade_'+ORG+'_'+RID);
 assert.equal(bill.status,'pending');assert.equal(bill.paymentConfirmed,false);
 assert.equal(bill.total,573.85);assert.equal(h.count('invoices/'),1);
 assert.equal(h.count('platformAdminAuditEvents/'),1);
 assert.equal(h.count('organizations/'+ORG+'/billingUpgradeRequests/'),1);
});
test('idempotent replay, and different key cannot silently upgrade twice',async()=>{
 const h=fakeDb();await upgrade(h.db);
 assert.equal((await upgrade(h.db)).response.idempotent,true);
 assert.equal((await upgrade(h.db,{requestId:'synthetic-another-request-12345'})).status,409);
 assert.equal(h.count('invoices/'),1);assert.equal(h.count('platformAdminAuditEvents/'),1);
});
test('failed invoice creation rolls back plan, invoice, request and audit',async()=>{
 const h=fakeDb();h.fail('invoices/upgrade_'+ORG+'_'+RID);
 await assert.rejects(upgrade(h.db),/SIMULATED_WRITE_FAILURE/);
 assert.equal(h.get('organizations/'+ORG).plan,'Basic');
 assert.equal(h.count('invoices/'),0);assert.equal(h.count('platformAdminAuditEvents/'),0);
 assert.equal(h.count('organizations/'+ORG+'/billingUpgradeRequests/'),0);
});
test('archived and yearly plans or absent organization fail closed',async()=>{
 for(const [org,reason] of [
 [{plan:'Basic',status:'archived',billingCycle:'monthly'},'organization_not_active'],
 [{plan:'Basic',status:'active',billingCycle:'yearly'},'billing_price_review_required'],
 [null,'organization_not_found']
 ]){const h=fakeDb(org),r=await upgrade(h.db);assert.equal(r.response.error,reason);assert.equal(h.count('invoices/'),0)}
});
test('rejects arbitrary billing requests, path characters and unsupported plans',async()=>{
 const h=fakeDb();
 for(const value of [{requestId:'../../oops'},{organizationId:'../other'},{expectedPlan:'Enterprise'}]){
  assert.equal((await upgrade(h.db,value)).status,400);
 }
 assert.equal(h.count('invoices/'),0);
});
test('upgrades are routed only through the existing Owner guard, not client writes',()=>{
 const root=path.join(__dirname,'..');
 const ops=fs.readFileSync(path.join(root,'api/_lib/ownerOpsSupport.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'owner-organizations.js'),'utf8');
 assert.match(ops,/const owner = await requireOwner\(decoded, getCallerContext, sendJson, res\)/);
 assert.match(ops,/action === 'ownerUpgradeOrganizationWithInvoice'/);
 const start=html.indexOf("if(act==='upgrade')"),end=html.indexOf("if(act==='archive')",start);
 assert.ok(start>0&&end>start);
 const action=html.slice(start,end);
 assert.match(action,/ownerUpgradeOrganizationWithInvoice/);
 assert.doesNotMatch(action,/updateDoc\(|createInvoice\(/);
});
