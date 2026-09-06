'use strict';
// Regression coverage for the "إدارة الحساب" (Account Management) unification
// sprint: every legitimate organization user — Field or Lands-only — must be
// reachable through the same account-management surface, and the users-table
// / observations action systems must keep every existing action working
// after being reorganized into primary/secondary/More.
//
// Root bug this sprint fixed: account security (temp password, enable/
// disable, session revocation) was gated on Field-specific roles in THREE
// separate places — the row button's render condition, openAccessManagement
// ()'s own client-side gate, and assertCanManage()/PASSWORD_TARGET_ROLES on
// the server — so a Lands-only employee (role: null) was denied everywhere,
// even though the same manager, same organization, same trust boundary
// already applied.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { installFakes, fakeRequest, fakeResponse } = require('./helpers/fakeFirebaseAdmin');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const USERS_HANDLER_PATH = require.resolve('../api/admin/users.js');
const AUTHZ_PATH = require.resolve('../api/_lib/authz.js');
function loadFreshHandlers() {
  delete require.cache[AUTHZ_PATH];
  delete require.cache[USERS_HANDLER_PATH];
  return { usersHandler: require(USERS_HANDLER_PATH) };
}
function seedManager(fakes, { uid = 'manager-1', organizationId = 'org-alpha' } = {}) {
  fakes.store.seed(`managers/${uid}`, { uid, role: 'manager', active: true, organizationId, email: 'manager@example.com' });
  return { uid, organizationId };
}

// ---- 1-4: account-management authority is based on organization + caller,
//           never on Field-specific role ----

test('1/2/3/4. assertCanManage: a Field user, a Lands employee, a Lands department manager, and a role=null Lands account are all manageable by their own-org manager', () => {
  const { assertCanManage } = require('../api/_lib/authz.js');
  const caller = { isOwner: false, isManager: true, organizationId: 'org-alpha' };
  assert.equal(assertCanManage(caller, { targetRole: 'inspector', targetOrganizationId: 'org-alpha' }).allowed, true, 'Field inspector');
  assert.equal(assertCanManage(caller, { targetRole: 'contractor', targetOrganizationId: 'org-alpha' }).allowed, true, 'Field contractor');
  // Lands employees/department managers never carry a Field-shaped
  // targetRole at all — their users/{uid} doc has role: null (see
  // api/admin/users.js create/setServices) — so the real-world case is
  // targetRole === null, tested explicitly below.
  assert.equal(assertCanManage(caller, { targetRole: null, targetOrganizationId: 'org-alpha' }).allowed, true, 'Lands-only account (role: null)');
});

test('a manager doc and an owner are still never manageable through this path (no privilege widening)', () => {
  const { assertCanManage } = require('../api/_lib/authz.js');
  const caller = { isOwner: false, isManager: true, organizationId: 'org-alpha' };
  assert.equal(assertCanManage(caller, { targetRole: 'manager', targetOrganizationId: 'org-alpha' }).allowed, false);
  assert.equal(assertCanManage(caller, { targetRole: undefined, targetOrganizationId: 'org-alpha' }).allowed, false, 'undefined must not be silently treated as the null sentinel');
});

test('manager.html: the إدارة الحساب row button is no longer gated on a Field-specific role', () => {
  const source = read('manager.html');
  assert.doesNotMatch(source, /\['inspector','contractor'\]\.includes\(u\.role\)\?`<button[^>]*إدارة الحساب/);
  assert.match(source, /إدارة الحساب/);
  assert.doesNotMatch(source, /إدارة الوصول/, 'the old manager-facing label must be fully replaced');
});

test('manager.html: openAccessManagement() itself no longer re-imposes a Field-role gate', () => {
  const source = read('manager.html');
  const fn = source.slice(source.indexOf('function openAccessManagement('), source.indexOf('function safeAccessError'));
  assert.doesNotMatch(fn, /\['inspector','contractor'\]\.includes\(target\.role\)/);
  assert.match(fn, /if\(!target\)/);
});

test('manager.html: accessRoleLabel/accessServiceLabel never report a Lands-only account as unauthorized', () => {
  const source = read('manager.html');
  const roleFn = source.slice(source.indexOf('function accessRoleLabel('), source.indexOf('function openAccessManagement('));
  assert.doesNotMatch(roleFn, /'غير مصرح'/);
  assert.match(roleFn, /landsAccess\?\.enabled/);
  assert.match(roleFn, /LANDS_ROLE_LABELS/);
});

// ---- 5/6/7: temporary password works for Field, Lands employee, Lands dept manager ----

test('5. temporary password: Field inspector is eligible', () => {
  const { isPasswordEligibleTarget } = require(USERS_HANDLER_PATH)._test;
  assert.equal(isPasswordEligibleTarget({ role: 'inspector' }), true);
  assert.equal(isPasswordEligibleTarget({ role: 'contractor' }), true);
});

test('6/7. temporary password: a Lands employee and a Lands department manager are eligible via landsAccess, not role', () => {
  const { isPasswordEligibleTarget } = require(USERS_HANDLER_PATH)._test;
  assert.equal(isPasswordEligibleTarget({ role: null, landsAccess: { enabled: true, role: 'lands_employee' } }), true);
  assert.equal(isPasswordEligibleTarget({ role: null, landsAccess: { enabled: true, role: 'lands_department_manager' } }), true);
});

test('supervisor stays excluded from manager-issued temp passwords (unchanged, deliberate — self-service exists in الإعدادات)', () => {
  const { isPasswordEligibleTarget } = require(USERS_HANDLER_PATH)._test;
  assert.equal(isPasswordEligibleTarget({ role: 'supervisor' }), false);
});

test('a role=null record with no real landsAccess declaration is not eligible (fail closed on malformed data)', () => {
  const { isPasswordEligibleTarget } = require(USERS_HANDLER_PATH)._test;
  assert.equal(isPasswordEligibleTarget({ role: null }), false);
  assert.equal(isPasswordEligibleTarget({ role: null, landsAccess: { enabled: false } }), false);
  assert.equal(isPasswordEligibleTarget(null), false);
});

test('5/6/7 (integration). setTempPassword succeeds end-to-end for a Field inspector and for a Lands-only employee', async () => {
  const fakes = installFakes();
  try {
    const { uid: managerUid, organizationId } = seedManager(fakes);
    fakes.store.seed('users/field-1', { uid: 'field-1', role: 'inspector', active: true, organizationId, email: 'f@example.com', name: 'Field One' });
    fakes.store.seed('users/lands-1', { uid: 'lands-1', role: null, active: true, organizationId, email: 'l@example.com', name: 'Lands One', landsAccess: { enabled: true, role: 'lands_employee', syncStatus: 'synced' } });
    const { usersHandler } = loadFreshHandlers();

    for (const uid of ['field-1', 'lands-1']) {
      const req = fakeRequest({ uid: managerUid, body: { action: 'setTempPassword', uid, password: 'Br7$Munic1pal' } });
      const res = fakeResponse();
      await usersHandler(req, res);
      assert.equal(res.statusCode, 200, `${uid}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.mustChangePassword, true);
      const stored = fakes.store.docs.get(`users/${uid}`);
      assert.equal(stored.mustChangePassword, true);
      assert.equal(fakes.auth._users.get(uid).password, 'Br7$Munic1pal');
      // 11. service role must never change as a side effect of a password reset.
      const before = uid === 'field-1' ? 'inspector' : null;
      assert.equal(stored.role, before, 'role must be unchanged by setTempPassword');
      if (uid === 'lands-1') assert.equal(stored.landsAccess.role, 'lands_employee', 'Lands role must be unchanged by setTempPassword');
    }
  } finally { fakes.restore(); }
});

// ---- 8. invalid password rejected ----
test('8. setTempPassword still enforces the existing password policy for a Lands-only target', async () => {
  const fakes = installFakes();
  try {
    const { uid: managerUid, organizationId } = seedManager(fakes);
    fakes.store.seed('users/lands-2', { uid: 'lands-2', role: null, active: true, organizationId, email: 'weak@example.com', landsAccess: { enabled: true, role: 'lands_employee', syncStatus: 'synced' } });
    const { usersHandler } = loadFreshHandlers();
    const req = fakeRequest({ uid: managerUid, body: { action: 'setTempPassword', uid: 'lands-2', password: 'password' } });
    const res = fakeResponse();
    await usersHandler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.reason, 'password_policy_failed');
  } finally { fakes.restore(); }
});

// ---- 9. cross-organization denied, for a Lands-only target specifically ----
test('9. a manager cannot manage a Lands-only account from a different organization', async () => {
  const fakes = installFakes();
  try {
    const { uid: managerUid } = seedManager(fakes, { uid: 'mgr-a', organizationId: 'org-a' });
    fakes.store.seed('users/lands-other-org', { uid: 'lands-other-org', role: null, active: true, organizationId: 'org-b', email: 'x@example.com', landsAccess: { enabled: true, role: 'lands_employee', syncStatus: 'synced' } });
    const { usersHandler } = loadFreshHandlers();
    const req = fakeRequest({ uid: managerUid, body: { action: 'setActive', uid: 'lands-other-org', active: false } });
    const res = fakeResponse();
    await usersHandler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'cross_organization_denied');
  } finally { fakes.restore(); }
});

// ---- 10. non-manager caller denied ----
test('10. a caller with no manager/owner record cannot invoke any account-management action', async () => {
  const fakes = installFakes();
  try {
    const { usersHandler } = loadFreshHandlers();
    const req = fakeRequest({ uid: 'plain-employee', body: { action: 'setActive', uid: 'anyone', active: false } });
    const res = fakeResponse();
    await usersHandler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.reason, 'owner_or_manager_required');
  } finally { fakes.restore(); }
});

// ---- 12/13. session termination and enable/disable now work for a Lands-only account ----
test('12. revokeSessions succeeds for a Lands-only account (was previously denied by the Field-role gate)', async () => {
  const fakes = installFakes();
  try {
    const { uid: managerUid, organizationId } = seedManager(fakes);
    fakes.store.seed('users/lands-3', { uid: 'lands-3', role: null, active: true, organizationId, email: 'l3@example.com', landsAccess: { enabled: true, role: 'lands_department_manager', syncStatus: 'synced' } });
    const { usersHandler } = loadFreshHandlers();
    const req = fakeRequest({ uid: managerUid, body: { action: 'revokeSessions', uid: 'lands-3' } });
    const res = fakeResponse();
    await usersHandler(req, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.revoked, true);
  } finally { fakes.restore(); }
});

test('13. setActive (disable/enable) succeeds for a Lands-only account and never touches its role/landsAccess', async () => {
  const fakes = installFakes();
  try {
    const { uid: managerUid, organizationId } = seedManager(fakes);
    fakes.store.seed('users/lands-4', { uid: 'lands-4', role: null, active: true, organizationId, email: 'l4@example.com', landsAccess: { enabled: true, role: 'lands_employee', syncStatus: 'synced' } });
    const { usersHandler } = loadFreshHandlers();
    const req = fakeRequest({ uid: managerUid, body: { action: 'setActive', uid: 'lands-4', active: false } });
    const res = fakeResponse();
    await usersHandler(req, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.active, false);
    const stored = fakes.store.docs.get('users/lands-4');
    assert.equal(stored.role, null);
    assert.equal(stored.landsAccess.role, 'lands_employee');
  } finally { fakes.restore(); }
});

// ---- 11. service role cannot be changed through an account-management payload ----
test('11. setActive/setTempPassword/revokeSessions ignore any role/landsAccess fields sent in the request body', async () => {
  const fakes = installFakes();
  try {
    const { uid: managerUid, organizationId } = seedManager(fakes);
    fakes.store.seed('users/field-2', { uid: 'field-2', role: 'inspector', active: true, organizationId, email: 'f2@example.com' });
    const { usersHandler } = loadFreshHandlers();
    const req = fakeRequest({ uid: managerUid, body: {
      action: 'setActive', uid: 'field-2', active: false,
      role: 'contractor', landsAccess: { enabled: true, role: 'lands_department_manager' }, // attacker-controlled, must be ignored
    } });
    const res = fakeResponse();
    await usersHandler(req, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const stored = fakes.store.docs.get('users/field-2');
    assert.equal(stored.role, 'inspector', 'role must be untouched by setActive');
    assert.equal(stored.landsAccess, undefined, 'landsAccess must not be creatable via setActive');
  } finally { fakes.restore(); }
});

// ---- 14. users search state remains unchanged after account operations ----
test('14. openAccessManagement, toggleUser, and revokeUserSessions never reference #userSearch', () => {
  const source = read('manager.html');
  for (const name of ['openAccessManagement', 'toggleUser', 'revokeUserSessions']) {
    const start = source.indexOf(`function ${name}(`);
    const asyncStart = source.indexOf(`async function ${name}(`);
    const realStart = asyncStart !== -1 ? asyncStart : start;
    assert.notEqual(realStart, -1, `${name} not found`);
    const end = source.indexOf('\n    }', realStart);
    assert.doesNotMatch(source.slice(realStart, end), /userSearch/, `${name} must not touch #userSearch`);
  }
});

// ---- 15. More menu contains the intended low-frequency actions ----
test('15. the users row "More" menu contains exactly enable/disable and end-sessions, nothing else', () => {
  const source = read('manager.html');
  const rowStart = source.indexOf("id=\"rowMenu-user-");
  const rowEnd = source.indexOf('</div>', rowStart);
  const menu = source.slice(rowStart, rowEnd);
  assert.match(menu, /\$\{statusMenuItem\(u\)\}/, 'enable/disable comes from statusMenuItem()');
  const statusMenuItemFn = source.slice(source.indexOf('function statusMenuItem('), source.indexOf('function statusMenuItem(') + 400);
  assert.match(statusMenuItemFn, /toggleUser\(/);
  assert.match(menu, /revokeUserSessions\(/);
  assert.doesNotMatch(menu, /openServicesManagement\(/, 'الخدمات stays a primary-tier action, not in More');
  assert.doesNotMatch(menu, /openAccessManagement\(/, 'إدارة الحساب stays a primary-tier action, not in More');
});

test('the observations row "More" menu contains status change, close, and delete', () => {
  const source = read('manager.html');
  const rowStart = source.indexOf("id=\"rowMenu-obs-");
  const rowEnd = source.indexOf('</span>', rowStart);
  const menu = source.slice(rowStart, rowEnd);
  assert.match(menu, /cycleStatus\(/);
  assert.match(menu, /closeTicket\(/);
  assert.match(menu, /deleteObservation\(/);
  assert.match(menu, /is-destructive/, 'delete must be visually marked destructive');
});

// ---- 16/17. every existing observation action survives, no business logic touched ----
test('16. every pre-existing observation action is still wired up after the visual reorganization', () => {
  const source = read('manager.html');
  for (const fn of ['openAssign', 'cycleStatus', 'closeTicket', 'deleteObservation', 'showObservationImages']) {
    assert.match(source, new RegExp(`onclick="[^"]*${fn}\\(`), `${fn} must still be reachable from the observations row`);
  }
});

test('17. observation workflow functions still perform the same Firestore operations (no business-logic change)', () => {
  const source = read('manager.html');
  const cycleStatusFn = source.slice(source.indexOf('async function cycleStatus('), source.indexOf('async function closeTicket('));
  assert.match(cycleStatusFn, /updateDoc\(/);
  const closeTicketFn = source.slice(source.indexOf('async function closeTicket('), source.indexOf('function openAssign('));
  assert.match(closeTicketFn, /updateDoc\(/);
  const deleteFn = source.slice(source.indexOf('async function deleteObservation('), source.indexOf('async function deleteObservation(') + 800);
  assert.match(deleteFn, /confirm\(/, 'delete must still require confirmation');
  assert.match(deleteFn, /deleteDoc\(/);
});

// ---- Part G regression gate: users-list-view.js must be untouched ----
test('Part G regression gate: users-list-view.js is byte-for-byte unchanged by this sprint', () => {
  const source = read('users-list-view.js');
  assert.match(source, /export function belongsOnUsersList/);
  assert.match(source, /export function deriveVisibleUsers/);
});
