'use strict';
const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const sdk = require('firebase/firestore');
const { createFirestoreAssignmentStore } = require('../platform/assignments/firestore-assignment-store');
const { createCanonicalAssignmentWriteService } = require('../platform/assignments/canonical-assignment-write-service');

const PROJECT_ID='demo-smart-hsr-phase1d'; let env;
const manager={role:'manager',uid:'manager-a',organizationId:'org-a'};
const observation={id:'obs-a',organizationId:'org-a',createdByUid:'inspector-a',status:'PENDING'};

before(async()=>{env=await initializeTestEnvironment({projectId:PROJECT_ID,firestore:{rules:fs.readFileSync(path.resolve(__dirname,'..','firestore.rules.phase-1c-candidate'),'utf8'),host:'127.0.0.1',port:8080}});});
after(async()=>{if(env)await env.cleanup();});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();await sdk.setDoc(sdk.doc(db,'managers',manager.uid),{role:'manager',active:true,organizationId:'org-a'});await sdk.setDoc(sdk.doc(db,'observations',observation.id),observation);});});

function service(){const db=env.authenticatedContext(manager.uid).firestore();return createCanonicalAssignmentWriteService({store:createFirestoreAssignmentStore({db,sdk}),idFactory:()=> 'generated',clock:()=> '2026-08-06T00:00:00.000Z'});}
async function read(collection,id){let value;await env.withSecurityRulesDisabled(async context=>{value=(await sdk.getDoc(sdk.doc(context.firestore(),collection,id))).data();});return value;}
async function readAll(collection){let value;await env.withSecurityRulesDisabled(async context=>{value=(await sdk.getDocs(sdk.collection(context.firestore(),collection))).docs.map(x=>x.data());});return value;}

test('V2 service creates canonical assignment atomically against candidate rules',async()=>{const out=await service().createAssignment({actor:manager,observation,contractorId:'contractor-a',assignmentId:'a-1'});assert.equal(out.allowed,true);assert.equal((await read('observations','obs-a')).currentAssignmentId,'a-1');assert.equal((await read('assignments','a-1')).status,'ACTIVE');});
test('V2 service denies a second ACTIVE assignment',async()=>{const s=service();assert.equal((await s.createAssignment({actor:manager,observation,contractorId:'contractor-a',assignmentId:'a-1'})).allowed,true);const current=await read('observations','obs-a');const out=await s.createAssignment({actor:manager,observation:{id:'obs-a',...current},contractorId:'contractor-b',assignmentId:'a-2'});assert.equal(out.allowed,false);assert.equal((await readAll('assignments')).filter(x=>x.status==='ACTIVE').length,1);});
test('V2 service replaces atomically with one ACTIVE assignment',async()=>{const s=service();await s.createAssignment({actor:manager,observation,contractorId:'contractor-a',assignmentId:'a-1'});const current=await read('observations','obs-a');const out=await s.replaceAssignment({actor:manager,observation:{id:'obs-a',...current},contractorId:'contractor-b',assignmentId:'a-2'});assert.equal(out.allowed,true);assert.equal((await read('assignments','a-1')).status,'REPLACED');assert.equal((await read('assignments','a-2')).version,2);assert.equal((await read('observations','obs-a')).currentAssignmentId,'a-2');});
test('V2 service ends assignment and removes current pointer atomically',async()=>{const s=service();await s.createAssignment({actor:manager,observation,contractorId:'contractor-a',assignmentId:'a-1'});const current=await read('observations','obs-a');const out=await s.endAssignment({actor:manager,observation:{id:'obs-a',...current}});assert.equal(out.allowed,true);assert.equal((await read('assignments','a-1')).status,'INACTIVE');assert.equal('currentAssignmentId' in await read('observations','obs-a'),false);});
test('V2 service denies cross-organization before any write',async()=>{const out=await service().createAssignment({actor:{...manager,organizationId:'org-b'},observation,contractorId:'contractor-a',assignmentId:'a-1'});assert.equal(out.allowed,false);assert.equal(await read('assignments','a-1'),undefined);});
