'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('draft discard is an audited closed operation, not a hard delete', async () => {
  const { TRUSTED_LANDS_MUTATIONS } = await import('../embedded-lands/server/trusted-lands-mutations.js');
  assert.equal(TRUSTED_LANDS_MUTATIONS['land_grant.discard_draft'].action, 'land_grant.draft_discarded');
  const { createLandsMutationExecutor } = await import('../embedded-lands/server/lands-mutation-executor.js');
  for (const status of ['draft','under_review','approved','incomplete']) {
    const writes=[];
    const db={doc:path=>path, runTransaction:async fn=>fn({
      get:async path=>path.includes('/auditLogs/')?{exists:false}:{exists:true,data:()=>({municipality_id:'org-a',created_by:'employee-a',status,archived:false})},
      update:(path,fields)=>writes.push({path,fields}), set:(path,fields)=>writes.push({path,fields}), delete:()=>{throw Error('HARD_DELETE_FORBIDDEN')}
    })};
    const execute=createLandsMutationExecutor({db});
    const run=()=>execute({municipality_id:'org-a',actor_uid:'employee-a'}, {operation:'land_grant.discard_draft',record_id:'grant-a',audit_command:{domain:'landGrants'}},{event_id:'event-a',occurred_at:'2026-10-15T00:00:00Z'},{reason:'Created in error'});
    if(status==='draft'){await run();assert.equal(writes[0].fields.archived,true);assert.equal(writes[0].fields.archived_by,'employee-a');assert.equal(writes.length,2)}
    else{await assert.rejects(run());assert.equal(writes.length,0)}
  }
});

test('other employees, another tenant, and successor managers cannot discard a creators draft', async()=>{
  const { createLandsAuthorizer }=await import('../embedded-lands/server/lands-authorization.js');
  const db={doc:path=>({get:async()=>({exists:true,data:()=>({municipality_id:'org-a',created_by:'employee-a',status:'draft'})})})};
  const auth=createLandsAuthorizer({db});
  const command={operation:'land_grant.discard_draft',record_id:'grant-a',audit_command:{action:'land_grant.draft_discarded',domain:'landGrants'}};
  assert.equal(await auth.authorizeMutation({municipality_id:'org-a',actor_uid:'employee-a',lands_role:'lands_employee'},command),true);
  assert.equal(await auth.authorizeMutation({municipality_id:'org-a',actor_uid:'employee-b',lands_role:'lands_employee'},command),false);
  assert.equal(await auth.authorizeMutation({municipality_id:'org-a',actor_uid:'new-manager',lands_role:'lands_department_manager'},command),false);
  assert.equal(await auth.authorizeMutation({municipality_id:'org-b',actor_uid:'employee-a',lands_role:'lands_employee'},command),false);
});

test('registry displays masked identifiers and official plan and parcel references',()=>{
  const source=fs.readFileSync('lands/index.html','utf8');
  const registry=source.slice(source.indexOf('function registryView()'),source.indexOf('// ---- القرارات'));
  assert.match(registry,/maskNationalId\(g\.beneficiary\?\.national_id\)/);
  assert.match(registry,/mod\.grantReferenceLabel\(g, "plan"/);
  assert.match(registry,/mod\.grantReferenceLabel\(g, "parcel"/);
  assert.match(registry,/discardDraftGrant/);
});
