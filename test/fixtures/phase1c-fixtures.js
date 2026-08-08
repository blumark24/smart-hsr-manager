'use strict';

const ORG_A = 'orgA';
const ORG_B = 'orgB';
const UID = Object.freeze({ managerA:'manager-a', managerB:'manager-b', supervisorA:'supervisor-a', inspectorA:'inspector-a', inspectorA2:'inspector-a2', inspectorB:'inspector-b', contractorA:'contractor-a', contractorA2:'contractor-a2', contractorNoOrg:'contractor-no-org' });

function assignment(id, observationId, contractorId, status = 'ACTIVE', version = 1, overrides = {}) {
  return { assignmentId:id, organizationId:ORG_A, observationId, contractorId, status, version, assignedAt:1, assignedBy:UID.managerA, createdAt:1, updatedAt:1, ...overrides };
}

function observation(status, overrides = {}) {
  return { organizationId:ORG_A, createdByUid:UID.inspectorA, status, title:'Observation', ...overrides };
}

module.exports = Object.freeze({ ORG_A, ORG_B, UID, assignment, observation });
