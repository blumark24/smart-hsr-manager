'use strict';

const { createDecision } = require('./decision');

const ROLES = Object.freeze({
  OWNER: 'owner',
  MANAGER: 'manager',
  SUPERVISOR: 'supervisor',
  INSPECTOR: 'inspector',
  CONTRACTOR: 'contractor',
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

const ROLE_AUTHORITY = Object.freeze({
  owner: Object.freeze({
    organizationScope: 'platform',
    canCreateObservation: false,
    canEditObservation: false,
    canAssign: false,
    canReview: false,
    canReturn: false,
    canComplete: false,
  }),
  manager: Object.freeze({
    organizationScope: 'organization',
    canCreateObservation: false,
    canEditObservation: false,
    canAssign: true,
    canReview: true,
    canReturn: true,
    canComplete: true,
  }),
  supervisor: Object.freeze({
    organizationScope: 'organization',
    canCreateObservation: false,
    canEditObservation: false,
    canAssign: true,
    canReview: true,
    canReturn: true,
    canComplete: false,
  }),
  inspector: Object.freeze({
    organizationScope: 'organization',
    canCreateObservation: true,
    canEditObservation: true,
    canAssign: false,
    canReview: false,
    canReturn: false,
    canComplete: false,
  }),
  contractor: Object.freeze({
    organizationScope: 'organization',
    canCreateObservation: false,
    canEditObservation: false,
    canAssign: false,
    canReview: false,
    canReturn: false,
    canComplete: false,
  }),
});

function getRoleAuthority(role) {
  return ROLE_AUTHORITY[role] || null;
}

function evaluateRoleAuthority(role, capability) {
  const authority = getRoleAuthority(role);
  if (!authority) {
    return createDecision(false, 'ROLE_NOT_RECOGNIZED', 'The actor role is not a verified Smart HSR role.', { role });
  }
  if (authority[capability] !== true) {
    return createDecision(false, 'ROLE_AUTHORITY_DENIED', 'The actor role does not hold the requested authority.', { role, capability });
  }
  return createDecision(true, 'ROLE_AUTHORITY_CONFIRMED', 'The actor role holds the requested authority.', { role, capability });
}

module.exports = Object.freeze({ ROLES, ROLE_VALUES, ROLE_AUTHORITY, getRoleAuthority, evaluateRoleAuthority });
