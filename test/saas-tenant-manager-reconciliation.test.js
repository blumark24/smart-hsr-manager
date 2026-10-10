'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname,'../api/_lib/ownerOpsSupport.js'),'utf8');
function loadHandler(name, nextName) {
  const start = source.indexOf('async function ' + name + '(');
  const end = source.indexOf('async function ' + nextName + '(', start);
  assert.ok(start > 0 && end > start, name + ' must be exported as an isolated handler');
  return vm.runInNewContext(source.slice(start,end) + '\n' + name, {
    cleanText: (value,max=4000) => typeof value === 'string' ? value.trim().slice(0,max) : '',
    passwordPolicyReason: pw => (typeof pw !== 'string' || pw.length < 12 ? 'password_too_weak' : ''),
  });
}
const restore = loadHandler('handleOwnerRestoreTenantManager','handleOwnerTenantIdentityAudit');
const edit = loadHandler('handleOwnerOrganizationDetails','handleOwnerRestoreTenantManager');
const initialOrg = {
  name:'Test Municipality', manager:'Admin One', email:'manager@test.invalid',
  phone:'0550000000', plan:'Trial', billingCycle:'monthly',
  status:'active', expiresAt:'2027-12-01', managerUid:'',
};
function createMock({org={...initialOrg},managers={},authUsers={},owners={},users={}}={}) {
  const data = {
    organizations:new Map([['tenant-A',{...org}]]),
    managers:new Map(Object.entries(managers)), owners:new Map(Object.entries(owners)),
    users:new Map(Object.entries(users)), platformAdminAuditEvents:new Map(),
  };
  let counter=0;
  const ref=(table,id)=>({
    table,id,
    get:async()=>snap(table,id),
  });
  const snap=(table,id)=>{
    const record=data[table]?.get(id);
    return { id,exists:record!==undefined,data:()=>record };
  };
  const collection=table=>({
    doc:(id)=>ref(table,id||'audit-'+(++counter)),
    where:(field,op,value)=>({
      limit:max=>({
        get:async()=>({
          docs:[...data[table].entries()].filter(([,item])=>item[field]===value)
            .slice(0,max).map(([id,item])=>({id,data:()=>item})),
        }),
      }),
    }),
  });
  const apply=operations=>{for(const op of operations) op();};
  const writeOps=()=> {
    const actions=[];
    return {
      actions,
      get:async r=>snap(r.table,r.id),
      update:(r,patch)=>actions.push(()=>data[r.table].set(r.id,{...data[r.table].get(r.id),...patch})),
      create:(r,val)=>actions.push(()=>{
        if(data[r.table].has(r.id)) throw new Error('document already exists');
        data[r.table].set(r.id,val);
      }),
      set:(r,val)=>actions.push(()=>data[r.table].set(r.id,val)),
      commit:async()=>apply(actions),
    };
  };
  const db={
    collection,
    runTransaction:async fn=>{
      const tx=writeOps();const outcome=await fn(tx);
      if(outcome!==false) await tx.commit();
      return outcome;
    },
    batch:()=>{
      const tx=writeOps();
      return {update:tx.update,create:tx.create,set:tx.set,commit:tx.commit};
    },
  };
  const accounts=new Map(Object.entries(authUsers));
  const calls={created:0,deleted:0};
  const auth={
    getUser:async uid=>{
      if(!accounts.has(uid))throw Object.assign(new Error('not found'),{code:'auth/user-not-found'});
      return {uid,...accounts.get(uid)};
    },
    getUserByEmail:async email=>{
      const match=[...accounts.entries()].find(([,v])=>v.email===email);
      if(!match)throw Object.assign(new Error('not found'),{code:'auth/user-not-found'});
      return {uid:match[0],...match[1]};
    },
    createUser:async attrs=>{
      calls.created++;
      const uid='new-user-'+calls.created;
      accounts.set(uid,{email:attrs.email,disabled:false});
      return {uid};
    },
    deleteUser:async uid=>{calls.deleted++;accounts.delete(uid);},
  };
  const context={db,auth,decoded:{uid:'owner-1'},
    FieldValue:{serverTimestamp:()=> 'server-time'},
    sendJson:(res,status,body)=>{res.status=status;res.body=body;return body;},
  };
  const invoke=async(body,fn=restore)=>{
    const res={};
    await fn({...context,body,res});
    return res;
  };
  return {db,data,accounts,calls,invoke};
}

test('relinks only one verified manager from the same organization and email',async()=>{
  const c=createMock({
    managers:{'manager-A':{role:'manager',organizationId:'tenant-A',active:true,
      name:'Manager A',email:'manager@test.invalid'}},
    authUsers:{'manager-A':{email:'manager@test.invalid',disabled:false}},
  });
  const res=await c.invoke({organizationId:'tenant-A',mode:'linkExisting',
    managerUid:'manager-A',confirmation:true});
  assert.equal(res.status,200);
  assert.equal(c.data.organizations.get('tenant-A').managerUid,'manager-A');
  assert.equal(c.calls.created,0);
  assert.equal(c.data.platformAdminAuditEvents.size,1);
});

test('blocks cross-organization assignment and preserves both data and identities',async()=>{
  const c=createMock({
    managers:{'manager-B':{role:'manager',organizationId:'tenant-B',active:true,
      email:'manager@test.invalid'}},
    authUsers:{'manager-B':{email:'manager@test.invalid'}},
  });
  const res=await c.invoke({organizationId:'tenant-A',mode:'linkExisting',
    managerUid:'manager-B',confirmation:true});
  assert.equal(res.status,409);
  assert.equal(c.data.organizations.get('tenant-A').managerUid,'');
  assert.equal(c.calls.created,0);
});

test('creates missing manager inside an existing tenant without changing tenant id',async()=>{
  const c=createMock();
  const res=await c.invoke({organizationId:'tenant-A',mode:'createMissing',
    password:'DistinctStrong-Passphrase#812',confirmation:true});
  assert.equal(res.status,200);
  assert.equal(c.data.organizations.size,1);
  assert.equal(c.data.organizations.get('tenant-A').managerUid,'new-user-1');
  assert.equal(c.data.managers.get('new-user-1').organizationId,'tenant-A');
  assert.equal(c.accounts.get('new-user-1').email,'manager@test.invalid');
  assert.equal(c.calls.deleted,0);
});

test('refuses to provision an already-registered Auth email',async()=>{
  const c=createMock({authUsers:{'existing-A':{email:'manager@test.invalid'}}});
  const res=await c.invoke({organizationId:'tenant-A',mode:'createMissing',
    password:'DistinctStrong-Passphrase#812',confirmation:true});
  assert.equal(res.status,409);
  assert.equal(c.calls.created,0);
  assert.equal(c.data.organizations.get('tenant-A').managerUid,'');
});

test('refuses to create over an existing but inactive manager document',async()=>{
  const c=createMock({managers:{'old-manager':{
    role:'manager',organizationId:'tenant-A',active:false,email:'manager@test.invalid',
  }}});
  const res=await c.invoke({organizationId:'tenant-A',mode:'createMissing',
    password:'DistinctStrong-Passphrase#812',confirmation:true});
  assert.equal(res.status,409);
  assert.equal(c.calls.created,0);
});

test('confirmation and strong password are mandatory for mutating repair',async()=>{
  const c=createMock();
  const noApproval=await c.invoke({organizationId:'tenant-A',mode:'createMissing',
    password:'DistinctStrong-Passphrase#812'});
  const weak=await c.invoke({organizationId:'tenant-A',mode:'createMissing',
    password:'weak',confirmation:true});
  assert.equal(noApproval.status,400);
  assert.equal(weak.status,400);
  assert.equal(c.calls.created,0);
});

test('metadata changes never alter the saved manager email or managerUid',async()=>{
  const c=createMock({org:{...initialOrg,managerUid:'manager-A'}});
  const res=await c.invoke({organizationId:'tenant-A',organization:{
    name:'Edited municipality',phone:'0551111111',plan:'Pro',
    status:'active',billingCycle:'yearly',expiresAt:'2028-02-20',notes:'',
    email:'attacker@invalid.test',managerUid:'attacker-uid',manager:'Attacker',
  }},edit);
  assert.equal(res.status,200);
  const org=c.data.organizations.get('tenant-A');
  assert.equal(org.email,'manager@test.invalid');
  assert.equal(org.managerUid,'manager-A');
  assert.equal(org.manager,'Admin One');
  assert.equal(org.name,'Edited municipality');
  assert.equal(c.data.platformAdminAuditEvents.size,1);
});

test('Firestore client writes cannot change SaaS tenant identity or create tenants',()=>{
  const rules=fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8');
  const start=rules.indexOf('match /organizations/{orgId}');
  const end=rules.indexOf('match /invoices/{invoiceId}',start);
  const body=rules.slice(start,end);
  assert.match(body,/allow create, delete: if false/);
  assert.match(body,/affectedKeys\(\)\.hasOnly/);
  assert.doesNotMatch(body,/'managerUid'|'email'|'manager'/);
});


test('archived tenant cannot authorize manager API context; restore regains normal same-tenant access',async()=>{
  const authz = fs.readFileSync(path.join(__dirname,'../api/_lib/authz.js'),'utf8');
  const h0 = authz.indexOf('async function tenantNotArchived(');
  const h1 = authz.indexOf('function collectionForRole(',h0);
  const g0 = authz.indexOf('async function getCallerContext(');
  const g1 = authz.indexOf('// PHASE 06A.2',g0);
  assert.ok(h0>0 && g0>h0 && g1>g0);
  const helperSource=authz.slice(h0,authz.indexOf('\n}',h0)+2);
  const ctxSource=authz.slice(g0,g1);
  const createCtx=vm.runInNewContext('(getDb, tenantNotArchived)=>{' +
    'const activeIsNotFalse = d => !(d && d.active === false);' +
    'const resolveMobilityRole=()=>null;' +
    helperSource + ctxSource +
    'return getCallerContext;' +
    '}',{});
  const store = {
    owners:{},
    managers:{'mgr-A':{role:'manager',organizationId:'org-A',active:true}},
    organizations:{'org-A':{status:'archived'}},users:{},
  };
  const db = {collection:name=>({
    doc:uid=>({get:async()=>({
      exists:Object.hasOwn(store[name]||{},uid),
      data:()=>store[name]?.[uid] || {},
    })}),
  })};
  const managerContext=createCtx(()=>db, async(_db,id)=>{
    const record=store.organizations[id];
    return !record || record.status!=='archived';
  });
  let role=await managerContext('mgr-A');
  assert.equal(role.isManager,false);
  store.organizations['org-A'].status='active';
  role=await managerContext('mgr-A');
  assert.equal(role.isManager,true);
  assert.equal(role.organizationId,'org-A');
});

test('trusted server role gates reject archived organization for all managed staff roles',()=>{
  const authz=fs.readFileSync(path.join(__dirname,'../api/_lib/authz.js'),'utf8');
  const roleGuards=[
    "d.role === 'manager' && activeIsNotFalse(d) && orgId && await tenantNotArchived(db, orgId)",
    "d.role === 'supervisor' && activeIsNotFalse(d) && orgId && await tenantNotArchived(db, orgId)",
    "isLegacyDepartmentHead) && activeIsNotFalse(d) && orgId && dept && await tenantNotArchived(db, orgId)",
    "resolveMobilityRole(d) === 'mobility_head' && activeIsNotFalse(d) && orgId && await tenantNotArchived(db, orgId)",
    "hasVehicleCapability && await tenantNotArchived(db, orgId)",
    "d.role === 'contractor' && activeIsNotFalse(d) && orgId && await tenantNotArchived(db, orgId)",
  ];
  for(const guard of roleGuards)assert.ok(authz.includes(guard),guard);
  assert.match(authz,/async function tenantNotArchived\(db, organizationId\)/);
  assert.match(authz,/\.status !== 'archived'/);
});

test('Firestore rules deny operational role when tenant is archived',()=>{
  const rules=fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8');
  assert.match(rules,/function tenantNotArchived\(orgId\)/);
  assert.match(rules,/\.data\.status != 'archived'/);
  assert.match(rules,/managerRecord\(\)\.data\.organizationId\.size\(\) > 0\s+&& tenantNotArchived\(managerRecord\(\)\.data\.organizationId\)/);
  assert.match(rules,/userRecord\(\)\.data\.organizationId\.size\(\) > 0\s+&& tenantNotArchived\(userRecord\(\)\.data\.organizationId\)/);
  const start=rules.indexOf('match /organizations/{orgId}');
  const end=rules.indexOf('match /invoices/{invoiceId}',start);
  const ownerRules=rules.slice(start,end);
  assert.match(ownerRules,/resource\.data\.status != 'archived'/);
  assert.match(ownerRules,/request\.resource\.data\.status != 'archived'/);
});


test('direct Mobility workflow caller is also blocked for an archived municipality',()=>{
  const trustedApi=fs.readFileSync(path.join(__dirname,'../api/admin/users.js'),'utf8');
  const start=trustedApi.indexOf('async function getMobilityOperationalCaller(');
  const end=trustedApi.indexOf('\nfunction resolvedActorCapability(',start);
  assert.ok(start>0 && end>start);
  const caller=trustedApi.slice(start,end);
  assert.match(caller,/collection\('organizations'\)\.doc\(organizationId\)\.get\(\)/);
  assert.match(caller,/orgSnap\.exists && \(orgSnap\.data\(\) \|\| \{\}\)\.status === 'archived'/);
  assert.match(caller,/return null/);
});
