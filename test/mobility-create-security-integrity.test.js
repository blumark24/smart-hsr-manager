'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ACTION_CREATE_MISSION, ACTION_CREATE_INCIDENT, handleTrustedMobilityCreate } = require('../api/_lib/mobilityCreate');

const FieldValue = { serverTimestamp: () => 'SERVER_TIME' };
const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
class Snap { constructor(v){ this.v=v; this.exists=v!==undefined; } data(){ return clone(this.v); } }
class Ref { constructor(db,col,id){ this.db=db; this.col=col; this.id=id; } }
class Col { constructor(db,col){ this.db=db; this.col=col; } doc(id){ return new Ref(this.db,this.col,id); } }
class FakeDb {
  constructor(seed={}) { this.data=new Map(Object.entries(seed).map(([k,v])=>[k,clone(v)])); this.failAudit=false; }
  collection(n){ return new Col(this,n); }
  key(r){ return `${r.col}/${r.id}`; }
  async runTransaction(fn){
    const staged=[];
    const tx={ get:async r=>new Snap(this.data.get(this.key(r))), set:(r,v)=>staged.push([r,clone(v)]) };
    const out=await fn(tx);
    if (out && out.ok===false) return out;
    if (this.failAudit && staged.some(([r])=>r.col==='auditEvents')) throw new Error('forced_audit_failure');
    for (const [r,v] of staged) this.data.set(this.key(r),v);
    return out;
  }
}
const user=(role,extra={})=>({role,active:true,organizationId:'orgA',department:'Traffic',name:'Actor',...extra});
const call=(db,action,uid,body)=>handleTrustedMobilityCreate({action,db,FieldValue,decoded:{uid,email:`${uid}@test`},body});

test('trusted create is wired through existing organization/context endpoint',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','api','organization','context.js'),'utf8');
  assert.match(src,/MOBILITY_CREATE_ACTIONS\.has\(body\.action\)/);
  assert.match(src,/verifyRequestToken\(req\)/);
  assert.match(src,/handleTrustedMobilityCreate\(\{/);
});

test('mission create is atomic, idempotent, and rejects spoofing/wrong role',async()=>{
  const db=new FakeDb({'users/dept1':user('department_head')});
  const body={clientRequestId:'req_mission_0001',type:'ميدانية',destination:'Site'};
  const first=await call(db,ACTION_CREATE_MISSION,'dept1',body);
  assert.equal(first.ok,true); assert.ok(db.data.has(`missions/${first.missionId}`)); assert.ok(db.data.has(`auditEvents/create_${first.missionId}`));
  const replay=await call(db,ACTION_CREATE_MISSION,'dept1',body);
  assert.equal(replay.replayed,true); assert.equal(replay.missionId,first.missionId);
  assert.equal((await call(db,ACTION_CREATE_MISSION,'dept1',{...body,type:'Other'})).reason,'idempotency_conflict');
  assert.equal((await call(new FakeDb({'users/dept1':user('department_head')}),ACTION_CREATE_MISSION,'dept1',{clientRequestId:'req_mission_0002',organizationId:'orgB'})).reason,'server_derived_fields_forbidden');
  assert.equal((await call(new FakeDb({'users/emp1':user('employee')}),ACTION_CREATE_MISSION,'emp1',{clientRequestId:'req_mission_0003'})).reason,'department_head_required');
});

test('forced mission audit failure commits neither resource nor audit',async()=>{
  const db=new FakeDb({'users/dept1':user('department_head')}); db.failAudit=true;
  await assert.rejects(call(db,ACTION_CREATE_MISSION,'dept1',{clientRequestId:'req_mission_0004'}));
  assert.equal([...db.data.keys()].some(k=>k.startsWith('missions/')),false);
  assert.equal([...db.data.keys()].some(k=>k.startsWith('auditEvents/')),false);
});

test('incident create validates tenant/assignment/vehicle and replay is idempotent',async()=>{
  const seed={
    'users/emp1':user('employee'),'users/emp2':user('employee'),
    'missions/m1':{organizationId:'orgA',department:'Traffic',assignedEmployeeUid:'emp1',status:'IN_PROGRESS',vehicleId:'V1'},
    'vehicles/V1':{organizationId:'orgA',assignedEmployeeUid:'emp1',currentMissionId:'m1',status:'IN_MISSION'}
  };
  const db=new FakeDb(seed);
  const body={clientRequestId:'req_incident_001',missionId:'m1',vehicleId:'V1',severity:'CRITICAL'};
  const first=await call(db,ACTION_CREATE_INCIDENT,'emp1',body);
  assert.equal(first.ok,true); assert.ok(db.data.has(`incidents/${first.incidentId}`)); assert.ok(db.data.has(`auditEvents/create_${first.incidentId}`));
  db.data.get('missions/m1').status='INCIDENT_HOLD';
  assert.equal((await call(db,ACTION_CREATE_INCIDENT,'emp1',body)).replayed,true);
  assert.equal((await call(new FakeDb(seed),ACTION_CREATE_INCIDENT,'emp2',{clientRequestId:'req_incident_002',missionId:'m1'})).reason,'mission_not_assigned_to_employee');
  const cross={...seed,'users/emp1':user('employee',{organizationId:'orgB'})};
  assert.equal((await call(new FakeDb(cross),ACTION_CREATE_INCIDENT,'emp1',{clientRequestId:'req_incident_003',missionId:'m1'})).reason,'cross_organization_denied');
  assert.equal((await call(new FakeDb(seed),ACTION_CREATE_INCIDENT,'emp1',{clientRequestId:'req_incident_004',missionId:'m1',vehicleId:'V2'})).reason,'vehicle_mismatch');
  assert.equal((await call(new FakeDb(seed),ACTION_CREATE_INCIDENT,'emp1',{clientRequestId:'req_incident_005',missionId:'m1',actorId:'spoof'})).reason,'server_derived_fields_forbidden');
});

test('forced incident audit failure commits neither resource nor audit',async()=>{
  const db=new FakeDb({
    'users/emp1':user('employee'),
    'missions/m1':{organizationId:'orgA',department:'Traffic',assignedEmployeeUid:'emp1',status:'IN_PROGRESS',vehicleId:'V1'},
    'vehicles/V1':{organizationId:'orgA',assignedEmployeeUid:'emp1',currentMissionId:'m1'}
  }); db.failAudit=true;
  await assert.rejects(call(db,ACTION_CREATE_INCIDENT,'emp1',{clientRequestId:'req_incident_006',missionId:'m1',vehicleId:'V1'}));
  assert.equal([...db.data.keys()].some(k=>k.startsWith('incidents/')),false);
  assert.equal([...db.data.keys()].some(k=>k.startsWith('auditEvents/')),false);
});
