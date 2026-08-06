'use strict';

function observation(id, overrides={}) { return { id, organizationId:'org-a', status:'PENDING', createdByUid:'inspector-a', ...overrides }; }
function assignment(id, observationId, overrides={}) { return { assignmentId:id, observationId, organizationId:'org-a', contractorId:'contractor-a', status:'ACTIVE', version:1, assignedAt:'t1', assignedBy:'manager-a', createdAt:'t1', updatedAt:'t1', ...overrides }; }

const fixtures=[];
for(let i=1;i<=8;i++){const id=`canonical-${i}`,aid=`a-${id}`;fixtures.push({name:id,observation:observation(id,{currentAssignmentId:aid,currentAssignmentVersion:1}),assignment:assignment(aid,id),expected:'canonical'});}
fixtures.push({name:'canonical-completed',observation:observation('completed',{status:'COMPLETED',currentAssignmentId:'a-completed',currentAssignmentVersion:1}),assignment:assignment('a-completed','completed'),expected:'canonical'});
fixtures.push({name:'canonical-replaced',observation:observation('replaced',{currentAssignmentId:'a-replaced',currentAssignmentVersion:1}),assignment:assignment('a-replaced','replaced',{status:'REPLACED',endedAt:'t2',replacedByAssignmentId:'a-next'}),expected:'canonical'});
fixtures.push({name:'canonical-inactive',observation:observation('inactive',{currentAssignmentId:'a-inactive',currentAssignmentVersion:1}),assignment:assignment('a-inactive','inactive',{status:'INACTIVE',endedAt:'t2'}),expected:'canonical'});
for(let i=1;i<=7;i++)fixtures.push({name:`legacy-unassigned-${i}`,observation:observation(`legacy-u-${i}`),expected:'legacy-compatible'});
for(let i=1;i<=8;i++)fixtures.push({name:`legacy-string-contractor-${i}`,observation:observation(`legacy-a-${i}`,{assignedContractorUid:`contractor-${i}`,assignedByUid:'manager-a',assignedAt:'t1'}),expected:'legacy-compatible'});
for(let i=1;i<=7;i++)fixtures.push({name:`ambiguous-${i}`,observation:observation(`ambiguous-${i}`,{assignedContractorUid:`contractor-${i}`,...(i%2?{}:{assignedAt:'t1'})}),expected:'ambiguous'});
fixtures.push({name:'invalid-missing-observation-id',observation:{organizationId:'org-a'},expected:'invalid'});
fixtures.push({name:'invalid-missing-organization',observation:{id:'missing-org'},expected:'invalid'});
fixtures.push({name:'invalid-organization-mismatch',observation:observation('org-mismatch',{currentAssignmentId:'a-org',currentAssignmentVersion:1}),assignment:assignment('a-org','org-mismatch',{organizationId:'org-b'}),expected:'invalid'});
fixtures.push({name:'invalid-observation-mismatch',observation:observation('obs-mismatch',{currentAssignmentId:'a-obs',currentAssignmentVersion:1}),assignment:assignment('a-obs','other-observation'),expected:'invalid'});
fixtures.push({name:'invalid-stale-version',observation:observation('stale',{currentAssignmentId:'a-stale',currentAssignmentVersion:2}),assignment:assignment('a-stale','stale'),expected:'invalid'});
fixtures.push({name:'invalid-missing-contractor',observation:observation('missing-contractor',{currentAssignmentId:'a-missing-contractor',currentAssignmentVersion:1}),assignment:assignment('a-missing-contractor','missing-contractor',{contractorId:''}),expected:'invalid'});
fixtures.push({name:'invalid-pointer-id',observation:observation('pointer',{currentAssignmentId:'other',currentAssignmentVersion:1}),assignment:assignment('a-pointer','pointer'),expected:'invalid'});

if(fixtures.length!==40)throw new Error(`Expected 40 fixtures, received ${fixtures.length}`);
module.exports=Object.freeze({fixtures:Object.freeze(fixtures)});
