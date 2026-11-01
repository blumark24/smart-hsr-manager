'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {handleOwnerManualBilling}=require('../api/_lib/ownerManualBilling');
const RID='test-idempotency-20261101-A9F3',ORG='municipality_synthetic_A';
function harness(org={name:'Synthetic municipality',plan:'Basic',status:'active',billingCycle:'monthly'}){
 let docs=new Map();if(org)docs.set('organizations/'+ORG,{...org});
 let failPath=null;
 function ref(p){return {path:p,collection(n){return ref(p+'/'+n)},doc(id){return ref(p+'/'+id)}};}
 const db={collection(n){return ref(n)},async runTransaction(cb){
   const write=[];let seenWrite=false;
   const tx={async get(r){assert.equal(seenWrite,false,'Firestore reads before writes');
     const d=docs.get(r.path);return {exists:d!==undefined,data:()=>d&&structuredClone(d)};},
     create(r,data){seenWrite=true;write.push({path:r.path,data})}};
   const out=await cb(tx),staged=new Map(docs);
   for(const step of write){
     if(step.path===failPath)throw Error('SIMULATED_TRANSACTION_FAILURE');
     if(staged.has(step.path))throw Error('SIMULATED_DUPLICATE');
     staged.set(step.path,step.data);
   }
   docs=staged;return out;
 }};
 return {db,fail(path){failPath=path},get(path){return docs.get(path)},
   count(prefix){return [...docs.keys()].filter(k=>k.startsWith(prefix)).length}};
}
async function create(db,overrides={}){
 let status,payload;
 await handleOwnerManualBilling({body:{organizationId:ORG,requestId:RID,
  plan:'Basic',billingCycle:'monthly',amount:0.29,...overrides},
  decoded:{uid:'synthetic-owner'},db,FieldValue:{serverTimestamp:()=> 'synthetic-timestamp'},
  res:{},sendJson(_r,s,p){status=s;payload=p}});
 return {status,payload};
}
test('manual record is PENDING, never paid; precise cents and atomic audit',async()=>{
 const h=harness(),r=await create(h.db);
 assert.equal(r.status,201);assert.equal(r.payload.paymentConfirmed,false);
 const row=h.get('invoices/manual_'+RID);
 assert.equal(row.status,'pending');assert.equal(row.paymentConfirmed,false);
 assert.equal(row.amount,0.29);assert.equal(row.vat,0.04);assert.equal(row.total,0.33);
 assert.equal(row.organization_id,ORG);
 assert.equal(h.count('invoices/'),1);
 assert.equal(h.count('platformAdminAuditEvents/'),1);
});
test('retry is idempotent and a conflicting payload is refused',async()=>{
 const h=harness();await create(h.db);
 const repeat=await create(h.db);assert.equal(repeat.status,200);
 assert.equal(repeat.payload.idempotent,true);
 assert.equal((await create(h.db,{amount:0.5})).status,409);
 assert.equal((await create(h.db,{organizationId:'other_tenant'})).status,409);
 assert.equal(h.count('invoices/'),1);assert.equal(h.count('platformAdminAuditEvents/'),1);
});
test('audit creation failure rolls back invoice atomically',async()=>{
 const h=harness();h.fail('platformAdminAuditEvents/manual_'+RID);
 await assert.rejects(create(h.db),/SIMULATED_TRANSACTION_FAILURE/);
 assert.equal(h.count('invoices/'),0);assert.equal(h.count('platformAdminAuditEvents/'),0);
});
test('server rejects forged paid status, malformed ids, negative and excess precision',async()=>{
 const h=harness();
 for(const data of [
  {status:'paid'},{status:'overdue'},{organizationId:'../invalid'},
  {requestId:'x'},{amount:0},{amount:-1},{amount:1.123},{amount:1000001},
  {plan:'trial'},{billingCycle:'unknown'}
 ]){
   const r=await create(h.db,data);assert.equal(r.status,400,JSON.stringify(data));
 }
 assert.equal(h.count('invoices/'),0);
});
test('archived and missing org cannot receive manual bills',async()=>{
 for(const o of [{status:'archived'},null]){
  const h=harness(o),result=await create(h.db);
  assert.equal(result.status,o===null?404:409);assert.equal(h.count('invoices/'),0);
 }
});
test('Owner-only routing; UI no longer writes invoices or auto-marks paid',()=>{
 const root=path.join(__dirname,'..');
 const ui=fs.readFileSync(path.join(root,'owner-invoices.js'),'utf8');
 const ops=fs.readFileSync(path.join(root,'api/_lib/ownerOpsSupport.js'),'utf8');
 assert.match(ops,/const owner = await requireOwner\(decoded, getCallerContext, sendJson, res\)/);
 assert.match(ops,/action === 'ownerInvoiceCreatePending'/);
 assert.match(ops,/payment_verification_required/);
 assert.match(ui,/ownerInvoiceCreatePending/);
 assert.doesNotMatch(ui,/addDoc\(|status='paid'/);
 const start=ui.indexOf('async function createInvoice(');
 const end=ui.indexOf('// تنزيل PDF من الجدول',start);
 assert.ok(start>0&&end>start);
 assert.doesNotMatch(ui.slice(start,end),/docPdf\.save|collection\(/);
});
