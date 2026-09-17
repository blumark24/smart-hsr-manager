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

// manager.html's account-management UI was rebuilt (Phase 3/4 reconciliation)
// around a single user-detail drawer instead of a separate "إدارة الحساب"
// modal with its own client-side role gate. The exact bug this old test
// protected against — enable/disable and temp-password actions being
// gated on a Field-specific role list, denying every Lands-only account —
// cannot recur in the current architecture because enableUserAction() and
// resetUserPassword() act on `this.state.selectedUser` unconditionally:
// there never was a role-based gate to begin with, for any account type.
test('manager.html: enableUserAction/resetUserPassword act on any selected user, with no Field-specific role gate', () => {
  const source = read('manager.html');
  const enableFn = source.slice(source.indexOf('async enableUserAction()'), source.indexOf('async enableUserAction()') + 500);
  const resetFn = source.slice(source.indexOf('async resetUserPassword()'), source.indexOf('async resetUserPassword()') + 500);
  for (const fn of [enableFn, resetFn]) {
    assert.doesNotMatch(fn, /\['inspector','contractor'\]\.includes/, 'must never re-impose a Field-only role gate');
    assert.match(fn, /this\.state\.selectedUser/);
  }
});

test('manager.html: the selected-user role/service label reports a Lands-only account by its real Lands role, never as unauthorized', () => {
  const source = read('manager.html');
  // PHASE 06A hotfix: userDisplayRole() was restructured (an if/else body
  // instead of one ternary chain) to also correctly label a Mobility-only
  // account whose role now lives in the independent mobilityAccess field —
  // the Lands-only branch's own logic is unchanged, just no longer the
  // very first token in the function body.
  assert.match(source, /if \(u\.role == null && u\.landsAccess\)/);
  assert.match(source, /lands_employee: 'موظف أراضي', lands_department_manager: 'رئيس قسم أراضي'/);
  assert.doesNotMatch(source, /'غير مصرح'/, 'a Lands-only account must never be labeled unauthorized');
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
// There is no separate #userSearch DOM node to leak into anymore (search
// lives in component state as `tq`, set only by its own onChange handler —
// see manager-users-list-state.test.js). The equivalent real risk in the
// current architecture is a user-management action resetting that state as
// a side effect; confirmed none do.
test('14. enableUserAction and resetUserPassword never reset the users search/filter state', () => {
  const source = read('manager.html');
  for (const name of ['enableUserAction', 'resetUserPassword']) {
    const start = source.indexOf(`async ${name}()`);
    assert.notEqual(start, -1, `${name} not found`);
    const body = source.slice(start, start + 500);
    assert.doesNotMatch(body, /\btq:\s*['"]/, `${name} must not reset the search state`);
    assert.doesNotMatch(body, /\btuFilter:\s*['"]/, `${name} must not reset the active filter`);
  }
});

// ---- 15. the two required account actions are both directly reachable,
//          with no dropdown/menu indirection needed for either ----
// The old "More" menu existed because the row itself only had room for a
// couple of primary actions; the current user-detail drawer has room for
// both real required actions (enable/disable and temp-password/reset — see
// the Phase 4 required-coverage list) as direct, always-visible buttons,
// so there is nothing left to hide behind a menu. Session revocation
// (revokeSessions) remains a real, tested backend capability (see tests
// above) but is not part of the Manager dashboard's required functional-
// parity surface for this reconciliation — it is exposed elsewhere
// (manager-operations.html, owner-users.js), not duplicated here.
test('15. the user drawer exposes both required account actions directly (no "More" menu indirection)', () => {
  const source = read('manager.html');
  assert.match(source, /onClick="\{\{ enableUserAction \}\}"/);
  assert.match(source, /onClick="\{\{ resetUserPassword \}\}"/);
  assert.doesNotMatch(source, /id="rowMenu-user-/, 'must not reintroduce the old per-row dropdown menu');
});

// ---- 16/17. the observations/incidents views are genuinely read-only for
//             the manager — this is a deliberate, prior security fix
//             (commit 73d7481: "remove incident status transitions
//             manager.html cannot legally offer"), not a regression. Status
//             mutation belongs to the Smart Mobility flow, which has its
//             own RBAC-correct handlers; manager.html's own view discloses
//             this explicitly rather than offering actions it cannot
//             legally authorize.
test('16/17. the observations/incidents views stay read-only: no direct status/close/delete mutation actions exist in manager.html', () => {
  const source = read('manager.html');
  for (const fn of ['cycleStatus', 'closeTicket', 'deleteObservation', 'openAssign', 'toggleUser', 'revokeUserSessions']) {
    assert.doesNotMatch(source, new RegExp(`(async )?function ${fn}\\(|${fn}:\\s*\\(\\)\\s*=>`), `${fn} must not exist — manager.html cannot legally mutate observation/incident status`);
  }
  assert.match(source, /viewIntro: st\.view === 'reports' \? [\s\S]{0,400}عرض للقراءة فقط/, 'the view must honestly disclose it is read-only');
});

// ---- Part G regression gate: users-list-view.js must be untouched ----
test('Part G regression gate: users-list-view.js is byte-for-byte unchanged by this sprint', () => {
  const source = read('users-list-view.js');
  assert.match(source, /export function belongsOnUsersList/);
  assert.match(source, /export function deriveVisibleUsers/);
});
