'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const core = read('manager-phase11c-user-center-core.js');
const center = read('manager-phase11d-user-center-enhancements.js');
const profile = read('manager-phase11f-reference-ui.js');
const skin = read('manager-phase11g-user-center-approved-skin.js');
const dialogs = read('manager-phase11c-user-center-dialogs.js');
const manager = read('manager.html');
const managerFormat = read('manager-dashboard-format.js');
const employeeApi = require('../api/admin/employees');

test('Phase 12B User Center layers remain valid JavaScript', () => {
  for (const [file, source] of [
    ['manager-phase11c-user-center-core.js', core],
    ['manager-phase11d-user-center-enhancements.js', center],
    ['manager-phase11f-reference-ui.js', profile],
    ['manager-phase11g-user-center-approved-skin.js', skin],
  ]) assert.doesNotThrow(() => new vm.Script(source, { filename:file }));
});

test('User Center lifecycle is owned by the real Manager view and tears down on navigation', () => {
  assert.match(manager, /smart-hsr:manager-view-change/);
  // componentDidUpdate defends against a missing prevState (the host
  // framework can call it with only one argument) rather than dereferencing
  // it directly — see test/manager-component-did-update-regression.test.js.
  assert.match(manager, /const previous = prevState \|\| \{\};/);
  assert.match(manager, /previous\.view !== this\.state\.view/);
  assert.match(managerFormat, /dataset\.smartHsrManagerView === 'users'/);
  assert.match(managerFormat, /const release = \(\) =>/);
  assert.match(managerFormat, /root\.querySelector\(':scope > \.ucv2-app'\)\?\.remove\(\)/);
  assert.match(managerFormat, /root\.classList\.remove\('ucv2-route-guard-host', 'ucv2-host'\)/);
  // PHASE13D.3 — the sidebar/background isolation this used to assert
  // (node.inert = true) was a P0 defect: User Center is a normal sibling
  // view now, not a position:fixed modal, so isolating "the rest of the
  // page" behind it isolated the persistent sidebar instead, silently
  // swallowing every click on it (e.g. مركز القيادة) until an unrelated
  // DOM mutation happened to clear it. See
  // test/phase13d3-command-center-dead-click-regression.test.js.
  assert.doesNotMatch(managerFormat, /node\.inert = true/);
  assert.match(core, /smart-hsr:user-center-lifecycle/);
  assert.match(core, /delete modal\.dataset\.busy/);
  assert.match(center, /renderGeneration/);
  assert.match(center, /!el\.closest\('\.ucv2-app'\)/);
});

test('route guard and directory renderer recognize the Manager users heading', () => {
  const title = manager.match(/st\.view === 'users' \? '(مركز المستخدمين)'/)?.[1];
  assert.equal(title, 'مركز المستخدمين');
  for (const source of [managerFormat, center]) {
    // PHASE13D.1 — both root-finders now target the normal in-<main>
    // Manager view mount point, not the shared modal-overlay panel.
    assert.match(source, /document\.querySelector\('\.manager-users-mount'\)/);
    const headingPattern = source.match(/const heading = headings\.find\([^\n]*?&& \/([^/]+)\/\.test\(clean\(el\.textContent\)\)/)?.[1];
    assert.ok(headingPattern, 'User Center heading selector exists');
    assert.match(title, new RegExp(headingPattern));
  }
});

test('User Center reuses the server-verified Manager organization context before directory reads', () => {
  assert.match(manager, /organizationId: this\.state\.orgId \|\| ''/);
  assert.match(core, /event\.detail\?\.view==='users'&&org/);
  assert.match(core, /if\(U\.cache\.org\)return U\.cache\.org/);
});

test('dialogs expose labels, focus containment, focus restoration, and pending-close protection', () => {
  assert.match(core, /<label for="\$\{id\}">/);
  assert.match(core, /aria-labelledby/);
  assert.match(core, /aria-label="إغلاق/);
  assert.match(core, /e\.key!==['"]Tab['"]/);
  assert.match(core, /prior\?\.isConnected/);
  assert.match(core, /m\.dataset\.busy==='true'/);
  assert.match(core, /aria-busy/);
});

test('registry search and filters retain clear municipal semantics and keyboard focus', () => {
  assert.match(center, /aria-label="بحث في سجل الموظفين"/);
  assert.match(center, /aria-label="الخدمة البلدية"/);
  assert.match(center, /الحصر الميداني الذكي/);
  assert.match(center, /الأراضي الذكية/);
  assert.match(center, /الحركة الذكية/);
  assert.match(center, /next\.focus\(\)/);
  assert.match(center, /setSelectionRange\(caret,caret\)/);
  assert.match(center, /aria-live="polite"/);
  assert.match(center, /aria-pressed=/);
});

test('profile save validates first and submits only sections that actually changed', () => {
  assert.match(profile, /function profileSnapshot/);
  assert.match(profile, /if\(p1!==p2\)\{[^}]*throw Error\('كلمتا المرور غير متطابقتين\.'\);\}/);
  assert.match(profile, /if\(!clean\(panel\.querySelector\('#edit-name'\)/);
  assert.match(profile, /current\.basic!==initial\.basic/);
  assert.match(profile, /current\.organization!==initial\.organization/);
  assert.match(profile, /current\.products!==initial\.products/);
  assert.match(profile, /لا توجد تغييرات جديدة للحفظ/);
  assert.doesNotMatch(profile, /const steps=\[\[panel\.querySelector\('\.savep'\)/);
});

test('account activation does not repeat the employee entitlement write already committed by activateAccount', () => {
  assert.match(core, /employeeAlreadySynced/);
  assert.match(dialogs, /U\.sync\(id,a\.authUid,x,\{employeeAlreadySynced:true\}\)/);
  assert.match(dialogs, /U\.sync\(e\.employeeId,a\.authUid,x,\{employeeAlreadySynced:true(?:,[^}]*)?\}\)/);
});

test('partial add-user failure is honest and cannot create a duplicate on retry', () => {
  assert.match(dialogs, /partial=!!id/);
  assert.match(dialogs, /تم حفظ سجل الموظف، لكن لم يكتمل إنشاء حساب الدخول أو التسكين/);
  assert.match(dialogs, /تم حفظ السجل — لا تعد الإرسال/);
  assert.match(core, /تم حفظ السجل/);
});

test('account suspension requires an explicit second confirmation', () => {
  // Phase12c-user-center-refero-v1 — approved UX change: the previous
  // two-click label-swap confirmation is replaced with a real confirmation
  // dialog (same setAccountStatus workflow, no new endpoint/permission).
  assert.match(profile, /تأكيد إيقاف الحساب/);
  assert.match(profile, /stopImmediatePropagation/);
  assert.match(profile, /iuc-suspend-confirm/);
  assert.match(profile, /ucv21-confirm-toggle/);
  assert.match(profile, /الحالة الحالية/);
  assert.match(profile, /الحالة بعد التأكيد/);
});

test('employee registry serializes real audit timestamps for the Last Updated column', () => {
  const { timestampToIso, safeEmployee } = employeeApi._test;
  assert.equal(timestampToIso({ seconds:1_700_000_000 }), '2023-11-14T22:13:20.000Z');
  assert.equal(timestampToIso({ _seconds:1_700_000_000 }), '2023-11-14T22:13:20.000Z');
  const employee = safeEmployee('e1', { organizationId:'org-a', name:'موظف', createdAt:{ _seconds:1_700_000_000 } });
  assert.equal(employee.createdAt, '2023-11-14T22:13:20.000Z');
  assert.equal(employee.updatedAt, null);
});

test('approved visual composition adds responsive accessibility hardening', () => {
  assert.match(skin, /:focus-visible/);
  assert.match(skin, /@media\(max-width:1024px\)/);
  assert.match(skin, /min-height:44px/);
  assert.match(skin, /@media\(max-width:820px\)/);
  assert.match(skin, /font-size:16px/);
  assert.match(skin, /backdrop-filter:none/);
  assert.match(skin, /@media\(max-width:480px\)/);
});

test('Phase 12B does not add data, authentication, authorization, or rule mutations to presentation layers', () => {
  for (const source of [core, center, profile, skin]) {
    assert.doesNotMatch(source, /firebase-admin|firestore\.rules|createUserWithEmailAndPassword/);
  }
  assert.doesNotMatch(skin, /fetch\s*\(|\/api\//);
});
