'use strict';

const organization={id:'demo-org-001',name:'Demo Municipality One'};
const users=Object.freeze([
  {id:'demo-manager-001',role:'manager',organizationId:organization.id,active:true,name:'Demo Manager'},
  {id:'demo-supervisor-001',role:'supervisor',organizationId:organization.id,active:true,name:'Demo Supervisor'},
  {id:'demo-inspector-001',role:'inspector',organizationId:organization.id,active:true,name:'Demo Inspector'},
  {id:'demo-contractor-001',role:'contractor',organizationId:organization.id,active:true,name:'Demo Contractor One'},
  {id:'demo-contractor-002',role:'contractor',organizationId:organization.id,active:true,name:'Demo Contractor Two'},
]);
const observations=Object.freeze([
  {id:'demo-obs-pending',organizationId:organization.id,createdByUid:'demo-inspector-001',status:'PENDING'},
  {id:'demo-obs-progress',organizationId:organization.id,createdByUid:'demo-inspector-001',status:'IN_PROGRESS',currentAssignmentId:'demo-assignment-active',currentAssignmentVersion:2,assignedContractorUid:'demo-contractor-001'},
  {id:'demo-obs-review',organizationId:organization.id,createdByUid:'demo-inspector-001',status:'PENDING_REVIEW'},
  {id:'demo-obs-completed',organizationId:organization.id,createdByUid:'demo-inspector-001',status:'COMPLETED'},
  {id:'demo-obs-ambiguous',organizationId:organization.id,createdByUid:'demo-inspector-001',status:'PENDING',assignedContractorUid:'demo-contractor-002'},
  {id:'demo-obs-invalid',organizationId:'demo-org-mismatch',createdByUid:'demo-inspector-001',status:'PENDING',currentAssignmentId:'demo-assignment-invalid',currentAssignmentVersion:1},
]);
const assignments=Object.freeze([
  {assignmentId:'demo-assignment-active',observationId:'demo-obs-progress',organizationId:organization.id,contractorId:'demo-contractor-001',status:'ACTIVE',version:2,assignedAt:'2026-01-01T00:00:00.000Z',assignedBy:'demo-manager-001',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'},
  {assignmentId:'demo-assignment-replaced',observationId:'demo-obs-progress',organizationId:organization.id,contractorId:'demo-contractor-002',status:'REPLACED',version:1,assignedAt:'2025-12-01T00:00:00.000Z',assignedBy:'demo-manager-001',createdAt:'2025-12-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',endedAt:'2026-01-01T00:00:00.000Z',replacedByAssignmentId:'demo-assignment-active'},
  {assignmentId:'demo-assignment-inactive',observationId:'demo-obs-completed',organizationId:organization.id,contractorId:'demo-contractor-001',status:'INACTIVE',version:1,assignedAt:'2025-11-01T00:00:00.000Z',assignedBy:'demo-manager-001',createdAt:'2025-11-01T00:00:00.000Z',updatedAt:'2025-11-02T00:00:00.000Z',endedAt:'2025-11-02T00:00:00.000Z'},
  {assignmentId:'demo-assignment-invalid',observationId:'demo-obs-invalid',organizationId:organization.id,contractorId:'',status:'ACTIVE',version:1,assignedAt:'2026-01-01T00:00:00.000Z',assignedBy:'demo-manager-001',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'},
]);
module.exports=Object.freeze({assignments,observations,organization:Object.freeze(organization),users});
