'use strict';

const { createDecision } = require('./decision');

// municipality_manager reuses the existing 'manager' account (managers/{uid})
// rather than a new role value — same actor, same organizationId scope.
const MOBILITY_ROLES = Object.freeze({
  MUNICIPALITY_MANAGER: 'manager',
  MOBILITY_HEAD: 'mobility_head',
  DEPARTMENT_HEAD: 'department_head',
  ADMINISTRATIVE_AFFAIRS: 'administrative_affairs',
  EMPLOYEE: 'employee',
});

const MOBILITY_ROLE_VALUES = Object.freeze(Object.values(MOBILITY_ROLES));

const MOBILITY_ROLE_AUTHORITY = Object.freeze({
  manager: Object.freeze({
    organizationScope: 'organization',
    canCreateMissionRequest: false,
    canApproveMissionRequest: false,
    canAllocateVehicle: false,
    canAssignEmployee: false,
    canReceiveHandover: false,
    canReturnVehicle: false,
    canCreateIncidentReport: false,
    canProcessIncident: false,
    canManageUsers: true,
  }),
  mobility_head: Object.freeze({
    organizationScope: 'organization',
    canCreateMissionRequest: false,
    canApproveMissionRequest: false,
    canAllocateVehicle: true,
    canAssignEmployee: true,
    canReceiveHandover: false,
    canReturnVehicle: false,
    canCreateIncidentReport: false,
    canProcessIncident: true,
    canManageUsers: false,
  }),
  department_head: Object.freeze({
    organizationScope: 'department',
    canCreateMissionRequest: true,
    canApproveMissionRequest: false,
    canAllocateVehicle: false,
    canAssignEmployee: false,
    canReceiveHandover: false,
    canReturnVehicle: false,
    canCreateIncidentReport: false,
    canProcessIncident: false,
    canManageUsers: false,
  }),
  administrative_affairs: Object.freeze({
    organizationScope: 'organization',
    canCreateMissionRequest: false,
    canApproveMissionRequest: true,
    canAllocateVehicle: false,
    canAssignEmployee: false,
    canReceiveHandover: false,
    canReturnVehicle: false,
    canCreateIncidentReport: false,
    canProcessIncident: false,
    canManageUsers: false,
  }),
  employee: Object.freeze({
    organizationScope: 'self',
    canCreateMissionRequest: false,
    canApproveMissionRequest: false,
    canAllocateVehicle: false,
    canAssignEmployee: false,
    canReceiveHandover: true,
    canReturnVehicle: true,
    canCreateIncidentReport: true,
    canProcessIncident: false,
    canManageUsers: false,
  }),
});

function getMobilityRoleAuthority(role) {
  return MOBILITY_ROLE_AUTHORITY[role] || null;
}

function evaluateMobilityRoleAuthority(role, capability) {
  const authority = getMobilityRoleAuthority(role);
  if (!authority) {
    return createDecision(false, 'ROLE_NOT_RECOGNIZED', 'The actor role is not a verified Smart Mobility role.', { role });
  }
  if (authority[capability] !== true) {
    return createDecision(false, 'ROLE_AUTHORITY_DENIED', 'The actor role does not hold the requested Smart Mobility authority.', { role, capability });
  }
  return createDecision(true, 'ROLE_AUTHORITY_CONFIRMED', 'The actor role holds the requested Smart Mobility authority.', { role, capability });
}

module.exports = Object.freeze({
  MOBILITY_ROLES,
  MOBILITY_ROLE_VALUES,
  MOBILITY_ROLE_AUTHORITY,
  getMobilityRoleAuthority,
  evaluateMobilityRoleAuthority,
});
