'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MOBILITY_MANAGEABLE_ROLES,
  MANAGEABLE_ROLES,
  MANAGER_SCOPED_ROLES,
  collectionForRole,
  assertCanManage,
} = require('../api/_lib/authz');

test('the four Smart Mobility roles are manageable and manager-scoped', () => {
  for (const role of MOBILITY_MANAGEABLE_ROLES) {
    assert.equal(MANAGEABLE_ROLES.includes(role), true, `${role} should be manageable`);
    assert.equal(MANAGER_SCOPED_ROLES.includes(role), true, `${role} should be manager-scoped`);
    assert.equal(collectionForRole(role), 'users', `${role} should live in users/`);
  }
});

test('owner role is never added to the manageable set (no escalation surface)', () => {
  assert.equal(MANAGEABLE_ROLES.includes('owner'), false);
  assert.equal(MANAGER_SCOPED_ROLES.includes('owner'), false);
});

test('a manager may create a mobility_head within their own organization', () => {
  const caller = { uid: 'mgr-1', isOwner: false, isManager: true, role: 'manager', organizationId: 'org-a' };
  const decision = assertCanManage(caller, { targetRole: 'mobility_head', targetOrganizationId: 'org-a' });
  assert.equal(decision.allowed, true);
});

test('a manager may not create an employee in a different organization', () => {
  const caller = { uid: 'mgr-1', isOwner: false, isManager: true, role: 'manager', organizationId: 'org-a' };
  const decision = assertCanManage(caller, { targetRole: 'employee', targetOrganizationId: 'org-b' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'cross_organization_denied');
});

test('a manager may not create another manager through this path', () => {
  const caller = { uid: 'mgr-1', isOwner: false, isManager: true, role: 'manager', organizationId: 'org-a' };
  const decision = assertCanManage(caller, { targetRole: 'manager', targetOrganizationId: 'org-a' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'manager_cannot_manage_managers');
});

test('an owner may create any Smart Mobility role in any organization', () => {
  const caller = { uid: 'owner-1', isOwner: true, isManager: false, role: 'owner', organizationId: null };
  for (const role of MOBILITY_MANAGEABLE_ROLES) {
    const decision = assertCanManage(caller, { targetRole: role, targetOrganizationId: 'org-z' });
    assert.equal(decision.allowed, true, `${role} should be owner-manageable`);
  }
});

// UI regression: the existing secure user-management workflow (not a new,
// unsafe browser-only flow) offers the four Smart Mobility roles, and the
// Manager's Smart Mobility exec screen links to it.
test('manager-operations.html offers the Smart Mobility roles in its role select and access gate', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'manager-operations.html'), 'utf8');
  for (const role of MOBILITY_MANAGEABLE_ROLES) {
    assert.match(html, new RegExp(`<option value="${role}">`));
  }
  assert.match(html, /'mobility_head','department_head','administrative_affairs','employee'/);
  assert.doesNotMatch(html, /sesión|<!--\s*password\s*:/i);
});

test('smart-mobility.html routes the Manager role to the existing secure user-management page', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'smart-mobility.html'), 'utf8');
  assert.match(html, /window\.location\.href = 'manager-operations\.html#users'/);
});

console.log('mobility user management contract OK');
