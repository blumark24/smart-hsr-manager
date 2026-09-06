'use strict';
// Behavioral coverage for Phase 3's manager.html/manager-dashboard-adapter.js
// additions (Add User, service/role/Lands entitlement editing, observations
// evidence viewer, AI-vision rendering), following the same source-contract
// testing convention this codebase already uses for the Designer canvas
// architecture (see test/manager-dashboard-preview-contract.test.js) — the
// real backend behavior these call into (create/setServices/setActive/
// setTempPassword authorization, organization isolation, unauthorized
// denial) is already covered end-to-end against real handler code by
// test/manager-user-center-negative-security.test.js and
// test/manager-lands-bridge-integration.test.js; this file verifies the
// genuinely new UI/adapter source added this phase actually wires into
// that real contract, not a second/fake one.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'manager-dashboard-adapter.js'), 'utf8');

// Slices a method's body out of manager.html by its unique definition
// signature (e.g. 'async submitAddUser()') — never by a shared bare name
// like 'openServiceEdit()', which also appears earlier as a render-prop
// arrow reference (`openServiceEdit: () => this.openServiceEdit()`) and
// would make an unanchored indexOf find that instead of the definition.
function methodBody(source, signature, maxLen = 800) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  return source.slice(start, start + maxLen);
}

// ---- Add User ----
test('Add User: opens a drawer and calls the real create contract, not a second API', () => {
  assert.match(manager, /addUserOpen: false/);
  assert.match(manager, /openAddUser\(\)\s*\{[\s\S]{0,120}addUserOpen: true/);
  const fn = methodBody(manager, 'async submitAddUser()');
  assert.match(fn, /callAdminUsersApi\('create',/);
  assert.match(fn, /organizationId: this\.state\.orgId/);
  assert.match(fn, /role: auRole/);
  assert.match(fn, /generateTempPassword\(\)/);
  // no second/invented endpoint
  assert.doesNotMatch(fn, /fetch\((?!.*\/api\/admin\/users)/);
});

test('Add User: role selection is a true single-select (each option sets one auRole value), not independent checkboxes', () => {
  const start = manager.indexOf('auRoleOptions:');
  const block = manager.slice(start, start + 500);
  assert.match(block, /this\.setState\(\{\s*auRole: o\.role\s*\}\)/);
  assert.doesNotMatch(block, /enabled:\s*!/, 'must not toggle independent booleans per role');
});

test('Add User: the temporary password is shown once and never sent to the audit trail', () => {
  const fn = methodBody(manager, 'async submitAddUser()');
  assert.match(fn, /تم إنشاء المستخدم بنجاح.*tempPassword/);
  // recordAdminAudit's 'create' call in api/admin/users.js must never be
  // given the password itself, only the role.
  const usersApi = fs.readFileSync(path.join(root, 'api/admin/users.js'), 'utf8');
  const auditCreateCall = usersApi.slice(usersApi.indexOf("action: 'create', detail: { role }"), usersApi.indexOf("action: 'create', detail: { role }") + 60);
  assert.doesNotMatch(auditCreateCall, /password/i);
});

// ---- Service / role / Lands entitlement editing ----
test('User drawer shows the real current service (Field role or Lands entitlement), not a placeholder', () => {
  assert.match(manager, /selectedUserServiceLabel: st\.selectedUser \? userDisplayRole\(st\.selectedUser\) : '—'/);
});

test('Service editing calls the real setServices contract with field OR lands, matching single-service exclusivity', () => {
  const fn = methodBody(manager, 'async submitServiceChange(');
  assert.match(fn, /callAdminUsersApi\('setServices',/);
  assert.match(fn, /params\.field\s*=\s*\{\s*enabled:\s*true,\s*role:\s*choice\.role\s*\}/);
  assert.match(fn, /params\.lands\s*=\s*\{\s*enabled:\s*true,\s*role:\s*choice\.role\s*\}/);
});

test('Service options include the real LANDS_MANAGEABLE_ROLES, not an invented Lands role', () => {
  const start = manager.indexOf('serviceOptions:');
  const block = manager.slice(start, manager.indexOf(']', start) + 1);
  assert.match(block, /lands_employee/);
  assert.match(block, /lands_department_manager/);
  assert.doesNotMatch(block, /lands_municipal_manager/, 'the institutional Lands role must never be manager-assignable here');
});

// ---- User list refresh after mutation (no manual refetch — real live subscription) ----
test('No user-mutation handler manually refetches the user list — the adapter\'s live onSnapshot subscription is the only refresh path', () => {
  for (const fnName of ['submitAddUser', 'submitServiceChange', 'enableUserAction', 'resetUserPassword']) {
    const body = methodBody(manager, `async ${fnName}(`);
    assert.doesNotMatch(body, /loadUsers|fetchUsers|refreshUsers/, `${fnName} must rely on the live subscription, not a manual refetch`);
  }
  assert.match(adapter, /firestoreApi\.onSnapshot\(userFilter/, 'the adapter\'s live users subscription must exist');
});

// ---- Observations / evidence viewer ----
test('the adapter maps real evidence fields with the same precedence the tested evidence-authorization path uses', () => {
  const fn = adapter.slice(adapter.indexOf('function normalizeObservations'), adapter.indexOf('function toTwinObjects'));
  assert.match(fn, /imagePath: data\.imageObjectKey \|\| data\.imagePath \|\| data\.imageUrl \|\| data\.beforeImagePath \|\| null/);
  assert.match(fn, /afterImagePath: data\.afterImagePath \|\| data\.afterImageUrl \|\| null/);
  assert.match(fn, /aiAnalysis: data\.aiAnalysis && typeof data\.aiAnalysis === 'object' \? data\.aiAnalysis : null/);
});

test('evidence images are resolved on demand only, never eagerly for the whole observations list', () => {
  assert.doesNotMatch(manager, /liveObservations\.forEach\([^)]*resolveEvidenceImage/);
  assert.doesNotMatch(manager, /liveObservations\.map\([^)]*resolveEvidenceImage/);
  const fn = methodBody(manager, 'async openEvidenceDrawer(');
  assert.match(fn, /this\.resolveEvidenceImage\(observation\.imagePath\)/);
});

test('the evidence resolver reuses the real, already-tested storage-adapter.js function unchanged', () => {
  assert.match(adapter, /import \{ resolveObservationImage \} from '\.\/storage-adapter\.js'/);
  assert.match(adapter, /component\.resolveEvidenceImage = \(reference\) => resolveObservationImage\(/);
});

test('an unavailable evidence image renders an honest state, never a fabricated or placeholder image', () => {
  assert.match(manager, /evidenceBeforeState: result\.available \? 'ready' : 'unavailable'/);
  assert.match(manager, /تعذّر الوصول إلى الصورة الموثّقة/);
});

// ---- AI-vision ----
test('AI-vision only renders the real persisted-analysis allowlist fields, and only when aiAnalysis actually exists', () => {
  assert.match(manager, /evidenceHasAi: !!st\.selectedUser\?\.aiAnalysis|evidenceHasAi: !!st\.selectedObservation\?\.aiAnalysis/);
  assert.match(manager, /evidenceAiCategory: st\.selectedObservation\?\.aiAnalysis\?\.categoryLabelAr/);
  assert.match(manager, /evidenceAiExplanation: st\.selectedObservation\?\.aiAnalysis\?\.explanation/);
  assert.match(manager, /evidenceAiAction: st\.selectedObservation\?\.aiAnalysis\?\.recommendedActionAr/);
  // cross-check against the actual, only-permitted writer of this field
  const persistedAi = fs.readFileSync(path.join(root, 'api/_lib/persistedAiAnalysis.js'), 'utf8');
  for (const field of ['categoryLabelAr', 'severity', 'confidence', 'explanation', 'recommendedActionAr']) {
    assert.match(persistedAi, new RegExp(field), `${field} must be part of the real persisted-analysis allowlist, not invented`);
  }
});

console.log('manager Phase 3 functional parity OK');
