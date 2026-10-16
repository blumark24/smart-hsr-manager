'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('lands/index.html', 'utf8');
const serverSource = fs.readFileSync('embedded-lands/server/lands-authorization.js', 'utf8');
const executorSource = fs.readFileSync('embedded-lands/server/lands-mutation-executor.js', 'utf8');
const actions = html.slice(html.indexOf('function grantClassicRowActions('), html.indexOf('function registryView()'));

async function canMutate({role, actor, recordOwner='employee-a', tenant='org-a', recordTenant='org-a', operation='land_grant.update',action}={}) {
  const {createLandsAuthorizer} = await import('../embedded-lands/server/lands-authorization.js');
  const db={ doc:(path)=>({get:async()=>({
    exists:true, data:()=>({municipality_id:recordTenant,created_by:recordOwner,status:'draft',archived:false})
  })}) };
  const auth=createLandsAuthorizer({db});
  return auth.authorizeMutation(
    {municipality_id:tenant,actor_uid:actor,lands_role:role},
    {operation,record_id:'grant-a',audit_command:{action: action || (operation==='land_grant.update'?'land_grant.updated':operation==='land_grant.transition'?'land_grant.workflow_transitioned':'land_grant.draft_discarded'),domain:'landGrants'}}
  );
}

test('municipality and Lands department managers can edit another creator draft in their municipality',async()=>{
 for(const role of ['municipal_manager','lands_department_manager']) {
  assert.equal(await canMutate({role,actor:'manager-b'}),true,role);
 }
});

test('employees remain creator-only; unauthorised roles cannot edit',async()=>{
 assert.equal(await canMutate({role:'lands_employee',actor:'employee-b'}),false);
 assert.equal(await canMutate({role:'lands_employee',actor:'employee-a'}),true);
 assert.equal(await canMutate({role:'not_a_lands_role',actor:'other'}),false);
});

test('manager cross-municipality update is rejected regardless of role',async()=>{
 for(const role of ['municipal_manager','lands_department_manager']) {
   assert.equal(await canMutate({role,actor:'manager-b',tenant:'org-b',recordTenant:'org-a'}),false);
 }
});

test('manager edit does not allow submitting or discarding employee drafts',async()=>{
 assert.equal(await canMutate({role:'municipal_manager',actor:'manager-b',operation:'land_grant.transition'}),false);
 assert.equal(await canMutate({role:'lands_department_manager',actor:'manager-b',operation:'land_grant.discard_draft'}),false);
 assert.equal(await canMutate({role:'lands_employee',actor:'employee-a',operation:'land_grant.transition'}),true);
});

test('edit mutation is audited and status-limited on trusted server',()=>{
 assert.match(executorSource,/case 'land_grant.update'/);
 assert.match(executorSource,/record.status !== 'draft' && record.status !== 'incomplete'/);
 assert.match(executorSource,/record.archived === true/);
 assert.match(executorSource,/validateLandGrantContentChanges/);
 assert.match(executorSource,/transaction.set\(auditRef, event\)/);
 assert.match(serverSource,/record.municipality_id !== context.municipality_id/);
});

function controls(role,actor,recordOwner,status='draft') {
 const context={session:{firebaseUid:actor,role},esc:String,icon:()=>'<svg></svg>'};
 vm.createContext(context);
 vm.runInContext(actions,context);
 return context.grantClassicRowActions({id:'grant-a',created_by:recordOwner,status}, role==='municipal_manager'||role==='lands_department_manager');
}
test('manager sees edit on draft or incomplete but not approved/under_review',()=>{
 for(const role of ['municipal_manager','lands_department_manager']) {
  for(const status of ['draft','incomplete']) {
    assert.match(controls(role,'manager-b','employee-a',status),/onclick="openEditDraft/);
  }
  for(const status of ['approved','under_review']) {
    assert.doesNotMatch(controls(role,'manager-b','employee-a',status),/onclick="openEditDraft/);
  }
 }
});

test('employee cannot edit another creator record and manager cannot discard their draft',()=>{
 assert.doesNotMatch(controls('lands_employee','employee-b','employee-a'),/onclick="openEditDraft/);
 assert.doesNotMatch(controls('municipal_manager','manager-b','employee-a'),/onclick="discardDraftGrant/);
});

test('file, mobile and workflow show manager edit without delegating submit',()=>{
 assert.match(html,/const canEditDraft = canEditGrantContent\(g\)/);
 assert.match(html,/canEditGrantContent\(g\) \? \x60<button type="button"/);
 assert.match(html,/\$\{canSubmit \? \x60<button class="btn primary"/);
 assert.match(html,/const canSubmit = \(g.status === "draft" \|\| g.status === "incomplete"\) && isOwner/);
 assert.match(html,/if \(!canEditGrantContent\(grantById\(grantId\)\)\)/);
 const at=html.indexOf('function grantClassicRowActions(');
 const start=html.lastIndexOf('<script>',at);
 const end=html.indexOf('</script>',at);
 assert.ok(start>=0 && end>start);
 assert.doesNotThrow(()=>new vm.Script(html.slice(start+8,end)));
});
