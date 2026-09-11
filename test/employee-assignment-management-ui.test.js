'use strict';
// ============================================================================
// ASSIGNMENT MANAGEMENT UI (micro-phase) — source-contract coverage for
// manager.html's new create/end institutional-assignment controls inside
// the existing employee detail drawer, following the same convention as
// test/employee-assignment-shadow-read-ui.test.js and
// test/manager-account-activation-ui.test.js: manager.html has no live
// React/DOM test harness in this repo, so its method bodies and template
// blocks are matched directly as text.
//
// The locked Institutional Assignment Foundation (contract, SHA-256
// SECTION_HEAD lock, atomic create/end, manager-same-org-only authority,
// SaaS-owner/department_head denial, Firestore deny-all) is NOT
// re-implemented or second-guessed here — every assertion below proves
// this UI only ever calls through to that exact backend and never
// fabricates, mutates locally, or bypasses it.
// ============================================================================

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'manager.html'), 'utf8');
const authz = fs.readFileSync(path.join(root, 'api', '_lib', 'authz.js'), 'utf8');
const loginHtml = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
const managerLoginHtml = fs.readFileSync(path.join(root, 'manager-login.html'), 'utf8');
const dashboardAdapter = fs.readFileSync(path.join(root, 'manager-dashboard-adapter.js'), 'utf8');
const smartMobilityAdapter = fs.readFileSync(path.join(root, 'smart-mobility-adapter.js'), 'utf8');

function methodBody(source, signature, maxLen = 3200) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  return source.slice(start, start + maxLen);
}

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `${startMarker} not found`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `${endMarker} not found after ${startMarker}`);
  return source.slice(start, end);
}

const drawerSection = sectionBetween(manager, 'التكليفات المؤسسية', '<sc-if value="{{ incidentDrawerOpen }}">');

// ============================================================================
// CREATE UI
// ============================================================================

test('CREATE UI: "إضافة تكليف" control exists inside the institutional-assignments section', () => {
  assert.match(drawerSection, /إضافة تكليف/);
  assert.match(drawerSection, /openCreateAssignmentForm/);
});

test('CREATE UI: exactly the 3 current products are exposed, nothing invented', () => {
  const start = manager.indexOf('const INSTITUTIONAL_PRODUCT_OPTIONS = [');
  assert.notEqual(start, -1);
  const block = manager.slice(start, manager.indexOf('];', start) + 2);
  const ids = [...block.matchAll(/id:\s*'([a-z]+)'/g)].map(m => m[1]);
  assert.deepEqual(ids.sort(), ['field', 'lands', 'mobility']);
});

test('CREATE UI: exact approved Arabic product labels', () => {
  assert.match(manager, /field:\s*'إدارة الحصر الميداني'/);
  assert.match(manager, /lands:\s*'إدارة الأراضي والممتلكات'/);
  assert.match(manager, /mobility:\s*'إدارة الحركة والسير'/);
});

test('CREATE UI: exactly the 4 allowed assignment types are exposed, nothing invented', () => {
  const start = manager.indexOf('const INSTITUTIONAL_ASSIGNMENT_TYPE_OPTIONS = [');
  assert.notEqual(start, -1);
  const block = manager.slice(start, manager.indexOf('];', start) + 2);
  const ids = [...block.matchAll(/id:\s*'([A-Z_]+)'/g)].map(m => m[1]);
  assert.deepEqual(ids.sort(), ['PRIMARY', 'SECONDARY', 'SECTION_HEAD', 'TEMPORARY']);
});

test('CREATE UI: assignment type labels never expose a technical/internal role name', () => {
  const forbidden = ['GENERAL_SUPERVISOR', 'department_head', 'administrative_affairs', 'mobility_head', 'delegation', 'contractor'];
  for (const term of forbidden) {
    assert.doesNotMatch(drawerSection, new RegExp(term, 'i'), `"${term}" must never appear in the assignment-management section`);
  }
});

test('CREATE UI: PRODUCT scope derives scope.id automatically from the selected product, never a separate typed field', () => {
  const fn = methodBody(manager, 'async submitCreateAssignment() {');
  assert.match(fn, /let scopeId = caProductId;/);
});

test('CREATE UI: SECTION scope requires one validated section identifier/name field', () => {
  const fn = methodBody(manager, 'async submitCreateAssignment() {');
  assert.match(fn, /if \(caScopeType === 'SECTION'\) \{/);
  assert.match(fn, /isValidSectionIdentifier\(caScopeId\)/);
});

test('CREATE UI: organizationId, employeeId, issuedBy, assignmentId, lockId, and status are never editable form fields', () => {
  assert.doesNotMatch(manager, /setCaOrganizationId/);
  assert.doesNotMatch(manager, /setCaEmployeeId/);
  assert.doesNotMatch(manager, /setCaIssuedBy/);
  assert.doesNotMatch(manager, /setCaAssignmentId/);
  assert.doesNotMatch(manager, /setCaLockId/);
  assert.doesNotMatch(manager, /setCaStatus/);
  assert.doesNotMatch(manager, /caOrganizationId|caEmployeeId|caIssuedBy|caAssignmentId|caLockId|caStatus\b/);
});

test('CREATE UI: the create form template never binds an input to organizationId/employeeId/issuedBy/lockId/status', () => {
  const formBlock = sectionBetween(manager, 'إضافة تكليف</div>', 'إلغاء');
  assert.doesNotMatch(formBlock, /organizationId/);
  assert.doesNotMatch(formBlock, /employeeId/);
  assert.doesNotMatch(formBlock, /issuedBy/);
  assert.doesNotMatch(formBlock, /lockId/);
  assert.doesNotMatch(formBlock, /\bstatus\b/);
});

// ============================================================================
// CREATE FLOW
// ============================================================================

test('CREATE FLOW: submitCreateAssignment calls createAssignment through the existing trusted Admin API', () => {
  const fn = methodBody(manager, 'async submitCreateAssignment() {');
  assert.match(fn, /this\.callAdminEmployeesApi\('createAssignment',/);
});

test('CREATE FLOW: employeeId and organizationId are always taken from the selected employee record, never a form field', () => {
  const fn = methodBody(manager, 'async submitCreateAssignment() {');
  assert.match(fn, /employeeId:\s*employee\.id,/);
  assert.match(fn, /organizationId:\s*employee\.organizationId,/);
});

test('CREATE FLOW: productId and scope are taken from the controlled UI selections', () => {
  const fn = methodBody(manager, 'async submitCreateAssignment() {');
  assert.match(fn, /productId:\s*caProductId,/);
  assert.match(fn, /scope:\s*\{\s*type:\s*caScopeType,\s*id:\s*scopeId\s*\},/);
});

test('CREATE FLOW: issuedBy is the authenticated manager session\'s own decoded uid — never typed, never fabricated', () => {
  const fn = methodBody(manager, 'async submitCreateAssignment() {');
  assert.match(fn, /const token = await this\.getAuthToken\?\.\(\);/);
  assert.match(fn, /const issuedBy = decodeJwtUid\(token\);/);
  assert.match(fn, /if \(!issuedBy\) \{ this\.setState\(\{ caError:/, 'must fail visibly, never fabricate, if the uid cannot be safely decoded');
  assert.match(fn, /issuedBy,/);
});

test('CREATE FLOW: request body never sends status, assignmentId, or a client-chosen lockId', () => {
  const fn = methodBody(manager, 'async submitCreateAssignment() {');
  const callStart = fn.indexOf("callAdminEmployeesApi('createAssignment',");
  const callBlock = fn.slice(callStart, fn.indexOf('});', callStart));
  assert.doesNotMatch(callBlock, /status:/);
  assert.doesNotMatch(callBlock, /assignmentId:/);
  assert.doesNotMatch(callBlock, /lockId:/);
});

test('CREATE FLOW: duplicate submission is blocked while a request is already pending', () => {
  const fn = methodBody(manager, 'async submitCreateAssignment() {', 400);
  assert.match(fn, /if \(this\.state\.caSubmitting\) return;/);
});

test('CREATE FLOW: on success, the per-employee cache is invalidated and reloaded from the server — never patched locally', () => {
  const fn = methodBody(manager, 'async submitCreateAssignment() {');
  const tryStart = fn.indexOf('try {');
  const catchStart = fn.indexOf('} catch (e) {', tryStart);
  const tryBlock = fn.slice(tryStart, catchStart);
  assert.match(tryBlock, /this\.invalidateAndReloadAssignments\(employee\);/);
  assert.doesNotMatch(tryBlock, /employeeAssignmentsCurrent:\s*\[/, 'must never locally construct a new assignments array to simulate success');
});

test('CREATE FLOW: invalidateAndReloadAssignments deletes the cache entry, clears displayed state, and reloads via listAssignments', () => {
  const fn = methodBody(manager, 'invalidateAndReloadAssignments(employee) {', 500);
  assert.match(fn, /this\._employeeAssignmentsCache\.delete\(employee\.id\)/);
  assert.match(fn, /employeeAssignmentsCurrent:\s*\[\],\s*employeeAssignmentsHistory:\s*\[\]/);
  assert.match(fn, /this\.loadEmployeeAssignments\(employee\)/);
  const loadFn = methodBody(manager, 'async loadEmployeeAssignments(employee) {');
  assert.match(loadFn, /callAdminEmployeesApi\('listAssignments',/);
});

test('CREATE FLOW: on failure, controls are restored and no fabricated success/UI state occurs', () => {
  const fn = methodBody(manager, 'async submitCreateAssignment() {');
  const catchStart = fn.indexOf('} catch (e) {');
  const catchBlock = fn.slice(catchStart, fn.length);
  assert.match(catchBlock, /caSubmitting:\s*false/);
  assert.match(catchBlock, /caError:\s*this\.adminApiErrorMessage\(e\)/);
  assert.doesNotMatch(catchBlock, /invalidateAndReloadAssignments/, 'a failed create must not trigger a reload as if it had succeeded');
});

// ============================================================================
// SECTION_HEAD
// ============================================================================

test('SECTION_HEAD: the required helper text is shown when SECTION_HEAD is selected', () => {
  assert.match(drawerSection, /caShowSectionHeadHelper/);
  assert.match(drawerSection, /يمكن أن يكون هناك رئيس قسم نشط واحد فقط لهذا النطاق\./);
});

test('SECTION_HEAD: section_head_already_active is mapped to the exact required Arabic message', () => {
  const fn = methodBody(manager, 'adminApiErrorMessage(e) {', 3200);
  assert.match(fn, /section_head_already_active:\s*'يوجد رئيس قسم نشط بالفعل لهذا النطاق\.'/);
});

test('SECTION_HEAD: section_head_lock_inconsistent is mapped to the exact required Arabic message', () => {
  const fn = methodBody(manager, 'adminApiErrorMessage(e) {', 3200);
  assert.match(fn, /section_head_lock_inconsistent:\s*'تعذر تنفيذ التعيين بسبب تعارض في سجل رئيس القسم\. يلزم مراجعة إدارية\.'/);
});

test('SECTION_HEAD: no frontend-only uniqueness check — SECTION_HEAD uses the exact same createAssignment call as every other assignment type', () => {
  const fn = methodBody(manager, 'async submitCreateAssignment() {');
  assert.doesNotMatch(fn, /section_head_already_active/, 'the frontend must never itself decide this conflict — only map the backend\'s response');
  assert.doesNotMatch(fn, /employeeAssignmentLocks/);
  assert.doesNotMatch(fn, /where\(/);
});

test('SECTION_HEAD: no auto-retry on lock inconsistency — the manager must see the error and act manually', () => {
  const catchFn = methodBody(manager, 'async submitCreateAssignment() {');
  const catchBlock = catchFn.slice(catchFn.indexOf('} catch (e) {'));
  assert.doesNotMatch(catchBlock, /retry|setTimeout/i);
});

// ============================================================================
// END FLOW
// ============================================================================

test('END FLOW: the end action exists only inside the CURRENT (ACTIVE) assignments loop, never in history', () => {
  const currentBlockStart = manager.indexOf("<sc-for list=\"{{ employeeCurrentAssignmentRows }}\"");
  const currentBlockEnd = manager.indexOf('</sc-for>', currentBlockStart);
  const currentBlock = manager.slice(currentBlockStart, currentBlockEnd);
  assert.match(currentBlock, /إنهاء التكليف/);
  assert.match(currentBlock, /onStartEndConfirm/);

  const historyBlockStart = manager.indexOf("<sc-for list=\"{{ employeeHistoryAssignmentRows }}\"");
  const historyBlockEnd = manager.indexOf('</sc-for>', historyBlockStart);
  const historyBlock = manager.slice(historyBlockStart, historyBlockEnd);
  assert.doesNotMatch(historyBlock, /إنهاء التكليف/, 'ENDED/CANCELLED cards must never show an end action');
  assert.doesNotMatch(historyBlock, /onStartEndConfirm|onConfirmEnd/);
});

test('END FLOW: history rows (ENDED and CANCELLED together) never carry an end/edit/delete control of any kind', () => {
  const historyBlockStart = manager.indexOf("<sc-for list=\"{{ employeeHistoryAssignmentRows }}\"");
  const historyBlockEnd = manager.indexOf('</sc-for>', historyBlockStart);
  const historyBlock = manager.slice(historyBlockStart, historyBlockEnd);
  assert.doesNotMatch(historyBlock, /<button/i);
  assert.doesNotMatch(historyBlock, /onClick/);
});

test('END FLOW: ending requires an explicit confirmation step before confirmEndAssignment can be called', () => {
  const fn = methodBody(manager, 'startEndConfirm(assignmentId) {', 200);
  assert.match(fn, /endConfirmingId:\s*assignmentId/);
  // confirmEndAssignment is only ever wired to a.onConfirmEnd, which is
  // only rendered inside the `isConfirmingEnd` branch of the template —
  // never reachable directly from the plain "إنهاء التكليف" button.
  const plainButtonBlock = sectionBetween(manager, '!a.isConfirmingEnd }}', 'a.isConfirmingEnd }}');
  assert.doesNotMatch(plainButtonBlock, /onConfirmEnd/);
});

test('END FLOW: confirmEndAssignment calls endAssignment through the existing trusted Admin API with assignmentId and endReason', () => {
  const fn = methodBody(manager, 'async confirmEndAssignment(assignmentId) {');
  assert.match(fn, /this\.callAdminEmployeesApi\('endAssignment',\s*\{/);
  assert.match(fn, /assignmentId,/);
  assert.match(fn, /endReason:/);
});

test('END FLOW: duplicate end submission is blocked while a request is already pending', () => {
  const fn = methodBody(manager, 'async confirmEndAssignment(assignmentId) {', 400);
  assert.match(fn, /if \(this\.state\.endSubmitting\) return;/);
});

test('END FLOW: on success, the per-employee cache is invalidated and reloaded from the server — never marked ended locally', () => {
  const fn = methodBody(manager, 'async confirmEndAssignment(assignmentId) {');
  const tryStart = fn.indexOf('try {');
  const catchStart = fn.indexOf('} catch (e) {', tryStart);
  const tryBlock = fn.slice(tryStart, catchStart);
  assert.match(tryBlock, /this\.invalidateAndReloadAssignments\(employee\);/);
  assert.doesNotMatch(tryBlock, /status:\s*'ENDED'/, 'must never locally flip a row\'s status to simulate success');
});

test('END FLOW: there is no delete path and no reactivate path anywhere in this UI', () => {
  assert.doesNotMatch(manager, /deleteAssignment/);
  assert.doesNotMatch(manager, /reactivateAssignment/i);
  assert.doesNotMatch(manager, /callAdminEmployeesApi\('activateAssignment'/i);
});

test('END FLOW: no manual status change or replace-in-place control exists — only status/endedBy/endedAt/endReason are ever server-derived on end', () => {
  assert.doesNotMatch(manager, /setCaAssignmentStatus|setAssignmentStatus/);
});

// ============================================================================
// SECURITY
// ============================================================================

test('SECURITY: no direct Firestore access to employeeAssignments or employeeAssignmentLocks anywhere in manager.html', () => {
  assert.doesNotMatch(manager, /collection\(\s*db\s*,\s*['"]employeeAssignments['"]\s*\)/);
  assert.doesNotMatch(manager, /collection\(\s*db\s*,\s*['"]employeeAssignmentLocks['"]\s*\)/);
  assert.doesNotMatch(manager, /firestoreApi\.collection\([^)]*employeeAssignment/);
});

test('SECURITY: no Authorization Cutover — authz.js, login.html, manager-login.html, manager-dashboard-adapter.js, and smart-mobility-adapter.js remain untouched by employeeAssignments', () => {
  assert.doesNotMatch(authz, /employeeAssignments/);
  assert.doesNotMatch(loginHtml, /employeeAssignments/);
  assert.doesNotMatch(managerLoginHtml, /employeeAssignments/);
  assert.doesNotMatch(dashboardAdapter, /employeeAssignments/);
  assert.doesNotMatch(smartMobilityAdapter, /employeeAssignments/);
});

test('SECURITY: no raw innerHTML/dangerouslySetInnerHTML is used for any user-supplied assignment field', () => {
  assert.doesNotMatch(manager, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(drawerSection, /innerHTML/);
});

test('SECURITY: no technical/internal role name is exposed anywhere in the assignment-management section', () => {
  const forbidden = ['GENERAL_SUPERVISOR', 'department_head', 'administrative_affairs', 'mobility_head', 'contractor'];
  for (const term of forbidden) {
    assert.doesNotMatch(drawerSection, new RegExp(term));
  }
});

test('SECURITY: client-side validation exists for section identifiers, free text (reason/endReason), and date strings — defense in depth, never a replacement for backend validation', () => {
  assert.match(manager, /function isValidSectionIdentifier\(s\) \{/);
  assert.match(manager, /function isValidFreeText\(s, maxLen = 500\) \{/);
  assert.match(manager, /function isValidDateString\(s\) \{/);
});

// ============================================================================
// FAIL CLOSED — required Arabic reason mappings
// ============================================================================

test('FAIL CLOSED: adminApiErrorMessage covers every reason code required by this phase', () => {
  const fn = methodBody(manager, 'adminApiErrorMessage(e) {', 3200);
  for (const reason of [
    'manager_required_for_assignments', 'cross_organization_denied', 'section_head_already_active',
    'section_head_lock_inconsistent', 'assignment_not_active', 'assignment_not_found',
    'invalid_request', 'unauthenticated',
  ]) {
    assert.match(fn, new RegExp(reason), `expected a real Arabic message for reason code "${reason}"`);
  }
});

console.log('employee-assignment-management-ui source-contract tests OK');
