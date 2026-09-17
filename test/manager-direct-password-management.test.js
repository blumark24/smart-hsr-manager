'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {installFakes,fakeRequest,fakeResponse}=require('./helpers/fakeFirebaseAdmin');
const USERS=require.resolve('../api/admin/users.js');
const EMPLOYEES=require.resolve('../api/admin/employees.js');
const AUTHZ=require.resolve('../api/_lib/authz.js');

function load(p){delete require.cache[AUTHZ];delete require.cache[p];return require(p);}
function manager(f,org='org-a'){f.store.seed('managers/mgr',{uid:'mgr',role:'manager',active:true,organizationId:org,email:'mgr@example.com'});}
async function call(h,body){const r=fakeResponse();await h(fakeRequest({uid:'mgr',body}),r);return r;}

test('direct manager password edit is final, linked, audited, and never stores the password',async()=>{
  const f=installFakes();
  try{
    manager(f);
    f.store.seed('users/u1',{uid:'u1',employeeId:'e1',organizationId:'org-a',role:'supervisor',active:true,email:'u1@example.com',name:'Employee One',mustChangePassword:true});
    f.store.seed('employees/e1',{employeeId:'e1',authUid:'u1',organizationId:'org-a',name:'Employee One'});
    const password='Br7!Munic1pal';
    const r=await call(load(USERS),{action:'setPassword',uid:'u1',password});
    assert.equal(r.statusCode,200,JSON.stringify(r.body));
    assert.equal(r.body.mustChangePassword,false);
    assert.equal(r.body.revoked,true);
    assert.equal(f.auth._users.get('u1').password,password);
    const stored=f.store.docs.get('users/u1');
    assert.equal(stored.mustChangePassword,false);
    assert.equal(stored.role,'supervisor');
    assert.ok(stored.passwordUpdatedAt);
    assert.ok(stored.sessionsRevokedAt);
    const audits=[...f.store.docs.entries()].filter(([k])=>k.startsWith('adminAuditEvents/')).map(([,v])=>v);
    assert.equal(audits.length,1);
    assert.equal(audits[0].action,'password_change');
    assert.equal(JSON.stringify(stored).includes(password),false);
    assert.equal(JSON.stringify(audits[0]).includes(password),false);
  }finally{f.restore();}
});

test('direct manager password edit fails closed for unsafe targets and weak passwords',async()=>{
  const f=installFakes();
  try{
    manager(f);
    const h=load(USERS),password='Br7!Munic1pal';
    f.store.seed('users/unlinked',{uid:'unlinked',organizationId:'org-a',role:'employee',active:true,email:'u@example.com'});
    let r=await call(h,{action:'setPassword',uid:'unlinked',password});
    assert.equal(r.statusCode,403);assert.equal(r.body.reason,'password_target_denied');

    f.store.seed('users/cross',{uid:'cross',employeeId:'ec',organizationId:'org-b',role:'employee',active:true,email:'c@example.com'});
    f.store.seed('employees/ec',{employeeId:'ec',authUid:'cross',organizationId:'org-b'});
    r=await call(h,{action:'setPassword',uid:'cross',password});
    assert.equal(r.statusCode,403);assert.equal(r.body.reason,'target_organization_mismatch');

    f.store.seed('users/bad',{uid:'bad',employeeId:'eb',organizationId:'org-a',role:'employee',active:true,email:'b@example.com'});
    f.store.seed('employees/eb',{employeeId:'eb',authUid:'different',organizationId:'org-a'});
    r=await call(h,{action:'setPassword',uid:'bad',password});
    assert.equal(r.statusCode,409);assert.equal(r.body.reason,'employee_account_link_mismatch');

    f.store.seed('managers/target',{uid:'target',role:'manager',active:true,organizationId:'org-a'});
    r=await call(h,{action:'setPassword',uid:'target',password});
    assert.equal(r.statusCode,403);assert.equal(r.body.reason,'password_target_denied');

    f.store.seed('users/u2',{uid:'u2',employeeId:'e2',organizationId:'org-a',role:'employee',active:true,email:'u2@example.com',name:'Employee Two'});
    f.store.seed('employees/e2',{employeeId:'e2',authUid:'u2',organizationId:'org-a'});
    r=await call(h,{action:'setPassword',uid:'u2',password:'password'});
    assert.equal(r.statusCode,400);assert.equal(r.body.reason,'password_policy_failed');

    const audits=[...f.store.docs.keys()].filter(k=>k.startsWith('adminAuditEvents/'));
    assert.equal(audits.length,0);
  }finally{f.restore();}
});

test('activation and User Center UI use final-password semantics',async()=>{
  const f=installFakes();
  try{
    manager(f);
    const h=load(EMPLOYEES);
    const c=fakeResponse();
    await h(fakeRequest({uid:'mgr',body:{action:'create',organizationId:'org-a',name:'New Employee'}}),c);
    assert.equal(c.statusCode,200,JSON.stringify(c.body));
    const employeeId=c.body.employee.employeeId,password='Br7!Munic1pal';
    const a=fakeResponse();
    await h(fakeRequest({uid:'mgr',body:{action:'activateAccount',employeeId,email:'new.employee@example.com',password,field:{enabled:true,role:'inspector'}}}),a);
    assert.equal(a.statusCode,200,JSON.stringify(a.body));
    assert.equal(a.body.mustChangePassword,false);
    assert.equal(f.auth._users.get(a.body.authUid).password,password);
    assert.equal(f.store.docs.get(`users/${a.body.authUid}`).mustChangePassword,false);

    const ui=fs.readFileSync('manager-phase11c-user-center-dialogs.js','utf8');
    assert.match(ui,/action:'setPassword'/);
    assert.match(ui,/تعديل كلمة المرور/);
    assert.match(ui,/لا يُطلب تغييرها عند أول دخول/);
    assert.doesNotMatch(ui,/action:'setTempPassword'/);
  }finally{f.restore();}
});

test('setPassword requires a municipality manager with recent authentication',async()=>{
  const f=installFakes();
  try{
    const password='Br7!Munic1pal';
    f.store.seed('users/target-user',{uid:'target-user',employeeId:'target-emp',organizationId:'org-a',role:'employee',active:true,email:'target@example.com',name:'Target Employee'});
    f.store.seed('employees/target-emp',{employeeId:'target-emp',authUid:'target-user',organizationId:'org-a',name:'Target Employee'});

    f.store.seed('users/plain-caller',{uid:'plain-caller',organizationId:'org-a',role:'employee',active:true,email:'plain@example.com'});
    let h=load(USERS),r=fakeResponse();
    await h(fakeRequest({uid:'plain-caller',body:{action:'setPassword',uid:'target-user',password}}),r);
    assert.equal(r.statusCode,403);
    assert.equal(f.auth._users.get('target-user'),undefined);

    manager(f);
    f.auth.verifyIdToken=async token=>{
      const m=/^token-for-(.+)$/.exec(token);
      if(!m)throw new Error('invalid-token');
      return {uid:m[1],auth_time:Math.floor(Date.now()/1000)-601};
    };
    h=load(USERS);r=fakeResponse();
    await h(fakeRequest({uid:'mgr',body:{action:'setPassword',uid:'target-user',password}}),r);
    assert.equal(r.statusCode,401);
    assert.equal(r.body.reason,'reauthentication_required');
    assert.equal(f.auth._users.get('target-user'),undefined);

    const audits=[...f.store.docs.keys()].filter(k=>k.startsWith('adminAuditEvents/'));
    assert.equal(audits.length,0);
  }finally{f.restore();}
});
