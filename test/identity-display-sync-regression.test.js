'use strict';
// Profile synchronization regression: HR is authoritative for linked staff,
// organization registry for municipality/manager labels. No RBAC mutations.
const test = require('node:test');
const assert = require('node:assert/strict');
const { installFakes, fakeRequest, fakeResponse } = require('./helpers/fakeFirebaseAdmin');

const AUTHZ_PATH = require.resolve('../api/_lib/authz.js');
const EMPLOYEE_PATH = require.resolve('../api/admin/employees.js');
const USERS_PATH = require.resolve('../api/admin/users.js');
function handlers() {
  delete require.cache[AUTHZ_PATH];
  delete require.cache[EMPLOYEE_PATH];
  delete require.cache[USERS_PATH];
  return { employees: require(EMPLOYEE_PATH), users: require(USERS_PATH) };
}
async function call(handler, uid, body) {
  const res = fakeResponse();
  await handler(fakeRequest({ uid, body }), res);
  return res;
}
function seedStaff(f, organizationId = 'org-a') {
  f.store.seed('managers/manager-a', {
    role: 'manager', active: true, organizationId, name: 'Old Manager'
  });
  f.store.seed('organizations/' + organizationId, {
    name: 'Municipality A', manager: 'New Manager', managerUid: 'manager-a'
  });
  f.store.seed('employees/staff-a', {
    organizationId, name: 'Old Staff', jobTitle: 'Old Title',
    department: 'lands', authUid: 'staff-a', accountStatus: 'ACTIVE',
    employmentStatus: 'active'
  });
  f.store.seed('users/staff-a', {
    organizationId, employeeId: 'staff-a', uid: 'staff-a',
    name: 'Old Staff', jobTitle: 'Old Title', role: 'inspector',
    active: true, department: 'lands'
  });
}

test('staff profile edit atomically updates linked login identity, not role or organization', async () => {
  const f = installFakes();
  try {
    seedStaff(f);
    const h = handlers();
    const result = await call(h.employees, 'manager-a', {
      action: 'updateProfile', employeeId: 'staff-a', name: 'New Staff',
      jobTitle: 'New Title'
    });
    assert.equal(result.statusCode, 200, JSON.stringify(result.body));
    assert.equal(f.store.docs.get('employees/staff-a').name, 'New Staff');
    const user = f.store.docs.get('users/staff-a');
    assert.equal(user.name, 'New Staff');
    assert.equal(user.jobTitle, 'New Title');
    assert.equal(user.role, 'inspector');
    assert.equal(user.organizationId, 'org-a');
  } finally { f.restore(); }
});

test('historical HR rename is reconciled to the authenticated caller only', async () => {
  const f = installFakes();
  try {
    seedStaff(f);
    f.store.docs.get('employees/staff-a').name = 'Updated Earlier';
    const h = handlers();
    const result = await call(h.users, 'staff-a', { action: 'resolveWorkspaces' });
    assert.equal(result.statusCode, 200, JSON.stringify(result.body));
    assert.equal(result.body.profile.name, 'Updated Earlier');
    assert.equal(f.store.docs.get('users/staff-a').name, 'Updated Earlier');
    assert.equal(f.store.docs.get('users/staff-a').role, 'inspector');
  } finally { f.restore(); }
});

test('a mismatched linked account cannot be overwritten by profile edits', async () => {
  const f = installFakes();
  try {
    seedStaff(f);
    f.store.docs.get('users/staff-a').employeeId = 'other-employee';
    const h = handlers();
    const result = await call(h.employees, 'manager-a', {
      action: 'updateProfile', employeeId: 'staff-a', name: 'Unauthorized Rename'
    });
    assert.equal(result.statusCode, 409, JSON.stringify(result.body));
    assert.equal(f.store.docs.get('users/staff-a').name, 'Old Staff');
    assert.equal(f.store.docs.get('employees/staff-a').name, 'Old Staff');
  } finally { f.restore(); }
});

test('verified manager sees owner-updated manager and municipality names', async () => {
  const f = installFakes();
  try {
    seedStaff(f);
    const h = handlers();
    const result = await call(h.users, 'manager-a', { action: 'resolveWorkspaces' });
    assert.equal(result.statusCode, 200, JSON.stringify(result.body));
    assert.equal(result.body.kind, 'manager');
    assert.equal(result.body.profile.name, 'New Manager');
    assert.equal(result.body.profile.organizationName, 'Municipality A');
    assert.equal(f.store.docs.get('managers/manager-a').name, 'Old Manager');
  } finally { f.restore(); }
});
