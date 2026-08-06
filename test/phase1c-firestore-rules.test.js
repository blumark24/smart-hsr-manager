'use strict';

const { before, after, beforeEach, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, writeBatch } = require('firebase/firestore');
const { ORG_A, ORG_B, UID, assignment, observation } = require('./fixtures/phase1c-fixtures');

const PROJECT_ID = 'demo-smart-hsr-phase1c';
const RULES_PATH = path.resolve(__dirname, '..', 'firestore.rules.phase-1c-candidate');
let env;

before(async () => {
  env = await initializeTestEnvironment({ projectId:PROJECT_ID, firestore:{ rules:fs.readFileSync(RULES_PATH,'utf8'), host:'127.0.0.1', port:8080 } });
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seed(); });
const db = uid => env.authenticatedContext(uid).firestore();

async function seed() {
  await env.withSecurityRulesDisabled(async context => {
    const x=context.firestore();
    await setDoc(doc(x,'managers',UID.managerA),{role:'manager',active:true,organizationId:ORG_A});
    await setDoc(doc(x,'managers',UID.managerB),{role:'manager',active:true,organizationId:ORG_B});
    for(const [uid,role,org] of [[UID.supervisorA,'supervisor',ORG_A],[UID.inspectorA,'inspector',ORG_A],[UID.inspectorA2,'inspector',ORG_A],[UID.inspectorB,'inspector',ORG_B],[UID.contractorA,'contractor',ORG_A],[UID.contractorA2,'contractor',ORG_A],[UID.contractorNoOrg,'contractor',null]]){
      const value={role,active:true};if(org)value.organizationId=org;await setDoc(doc(x,'users',uid),value);
    }
    const pairs=[
      ['pendingOwn','a-own',UID.contractorA,'ACTIVE',2,{}],['pendingOther','a-other',UID.contractorA2,'ACTIVE',1,{}],
      ['progressOwn','a-progress',UID.contractorA,'ACTIVE',1,{}],['inactive','a-inactive',UID.contractorA,'INACTIVE',1,{endedAt:2}],
      ['replaced','a-replaced',UID.contractorA,'REPLACED',1,{endedAt:2,replacedByAssignmentId:'new'}],['stale','a-stale',UID.contractorA,'ACTIVE',2,{}]
    ];
    for(const [obsId,aid,cid,status,version,extra] of pairs){await setDoc(doc(x,'assignments',aid),assignment(aid,obsId,cid,status,version,extra));const obsStatus=obsId==='progressOwn'?'IN_PROGRESS':'PENDING';await setDoc(doc(x,'observations',obsId),observation(obsStatus,{currentAssignmentId:aid,currentAssignmentVersion:obsId==='stale'?3:version,assignedContractorUid:cid}));}
    await setDoc(doc(x,'observations','own'),observation('PENDING'));
    await setDoc(doc(x,'observations','otherInspector'),observation('PENDING',{createdByUid:UID.inspectorA2}));
    await setDoc(doc(x,'observations','review'),observation('PENDING_REVIEW'));
    await setDoc(doc(x,'observations','completed'),observation('COMPLETED',{currentAssignmentId:'a-completed',currentAssignmentVersion:1,assignedContractorUid:UID.contractorA}));
    await setDoc(doc(x,'assignments','a-completed'),assignment('a-completed','completed',UID.contractorA));
    await setDoc(doc(x,'observations','orgB'),{organizationId:ORG_B,createdByUid:UID.inspectorB,status:'PENDING'});
  });
}

const contractorUpdate=(uid,id,payload)=>updateDoc(doc(db(uid),'observations',id),{...payload,updatedByUid:uid,updatedAt:3});

test('ALLOW contractor starts own ACTIVE PENDING',()=>assertSucceeds(contractorUpdate(UID.contractorA,'pendingOwn',{status:'IN_PROGRESS'})));
test('DENY contractor starts another assignment',()=>assertFails(contractorUpdate(UID.contractorA,'pendingOther',{status:'IN_PROGRESS'})));
test('DENY contractor inactive assignment',()=>assertFails(contractorUpdate(UID.contractorA,'inactive',{status:'IN_PROGRESS'})));
test('DENY contractor replaced assignment',()=>assertFails(contractorUpdate(UID.contractorA,'replaced',{status:'IN_PROGRESS'})));
test('DENY contractor stale assignment version',()=>assertFails(contractorUpdate(UID.contractorA,'stale',{status:'IN_PROGRESS'})));
test('ALLOW contractor submits own evidence',()=>assertSucceeds(contractorUpdate(UID.contractorA,'progressOwn',{status:'PENDING_REVIEW',afterImagePath:'private-key',resolutionNote:'done'})));
test('DENY contractor submits another assignment evidence',()=>assertFails(contractorUpdate(UID.contractorA2,'progressOwn',{status:'PENDING_REVIEW',afterImagePath:'private-key',resolutionNote:'wrong'})));
test('DENY contractor completes',()=>assertFails(contractorUpdate(UID.contractorA,'progressOwn',{status:'COMPLETED'})));
test('DENY contractor reopens COMPLETED',()=>assertFails(contractorUpdate(UID.contractorA,'completed',{status:'PENDING'})));

test('ALLOW inspector updates own permitted PENDING observation',()=>assertSucceeds(updateDoc(doc(db(UID.inspectorA),'observations','own'),{resolutionNote:'own'})));
test('DENY inspector updates another inspector observation',()=>assertFails(updateDoc(doc(db(UID.inspectorA),'observations','otherInspector'),{resolutionNote:'wrong'})));
test('DENY inspector completes',()=>assertFails(updateDoc(doc(db(UID.inspectorA),'observations','own'),{status:'COMPLETED'})));
test('DENY inspector cross-org read',()=>assertFails(getDoc(doc(db(UID.inspectorA),'observations','orgB'))));
test('DENY inspector cross-org write',()=>assertFails(updateDoc(doc(db(UID.inspectorA),'observations','orgB'),{resolutionNote:'wrong'})));

test('ALLOW manager reviews PENDING_REVIEW without status change',()=>assertSucceeds(updateDoc(doc(db(UID.managerA),'observations','review'),{supervisorNote:'reviewed',updatedByUid:UID.managerA,updatedAt:3})));
test('ALLOW manager returns PENDING_REVIEW',()=>assertSucceeds(updateDoc(doc(db(UID.managerA),'observations','review'),{status:'IN_PROGRESS',updatedByUid:UID.managerA,updatedAt:3})));
test('ALLOW manager completes PENDING_REVIEW',()=>assertSucceeds(updateDoc(doc(db(UID.managerA),'observations','review'),{status:'COMPLETED',closedAt:3,updatedByUid:UID.managerA,updatedAt:3})));
test('DENY manager reopens COMPLETED',()=>assertFails(updateDoc(doc(db(UID.managerA),'observations','completed'),{status:'PENDING',updatedByUid:UID.managerA,updatedAt:3})));
test('DENY manager cross-org access',async()=>{await assertFails(getDoc(doc(db(UID.managerA),'observations','orgB')));await assertFails(updateDoc(doc(db(UID.managerA),'observations','orgB'),{status:'IN_PROGRESS',updatedByUid:UID.managerA,updatedAt:3}));});

test('ALLOW supervisor reviews and returns',async()=>{await assertSucceeds(updateDoc(doc(db(UID.supervisorA),'observations','review'),{supervisorNote:'reviewed',updatedByUid:UID.supervisorA,updatedAt:3}));await assertSucceeds(updateDoc(doc(db(UID.supervisorA),'observations','review'),{status:'IN_PROGRESS',updatedByUid:UID.supervisorA,updatedAt:4}));});
test('DENY supervisor completes',()=>assertFails(updateDoc(doc(db(UID.supervisorA),'observations','review'),{status:'COMPLETED',updatedByUid:UID.supervisorA,updatedAt:3})));
test('DENY missing organization context',async()=>{await assertFails(getDoc(doc(db(UID.contractorNoOrg),'observations','pendingOwn')));await assertFails(contractorUpdate(UID.contractorNoOrg,'pendingOwn',{status:'IN_PROGRESS'}));});
test('DENY invalid transition',()=>assertFails(updateDoc(doc(db(UID.managerA),'observations','own'),{status:'COMPLETED',updatedByUid:UID.managerA,updatedAt:3})));
test('DENY COMPLETED to every other status',async()=>{for(const status of ['PENDING','IN_PROGRESS','PENDING_REVIEW'])await assertFails(updateDoc(doc(db(UID.managerA),'observations','completed'),{status,updatedByUid:UID.managerA,updatedAt:3}));});

test('DENY second ACTIVE assignment without atomic pointer replacement',async()=>{await assertFails(setDoc(doc(db(UID.managerA),'assignments','a-second'),assignment('a-second','pendingOwn',UID.contractorA,'ACTIVE',3)));});
test('ALLOW atomic assignment replacement batch',async()=>{const x=db(UID.managerA),batch=writeBatch(x),ended=4;batch.update(doc(x,'assignments','a-own'),{status:'REPLACED',replacedByAssignmentId:'a-next',endedAt:ended,updatedAt:ended});batch.set(doc(x,'assignments','a-next'),assignment('a-next','pendingOwn',UID.contractorA2,'ACTIVE',3,{assignedAt:ended,createdAt:ended,updatedAt:ended}));batch.update(doc(x,'observations','pendingOwn'),{currentAssignmentId:'a-next',currentAssignmentVersion:3,assignedContractorUid:UID.contractorA2,assignedByUid:UID.managerA,assignedAt:ended,updatedByUid:UID.managerA,updatedAt:ended});await assertSucceeds(batch.commit());});
