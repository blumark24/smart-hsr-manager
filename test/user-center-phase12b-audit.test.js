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
const employeeApi = require('../api/admin/employees');

test('Phase 12B User Center layers remain valid JavaScript', () => {
  for (const [file, source] of [
    ['manager-phase11c-user-center-core.js', core],
    ['manager-phase11d-user-center-enhancements.js', center],
    ['manager-phase11f-reference-ui.js', profile],
    ['manager-phase11g-user-center-approved-skin.js', skin],
  ]) assert.doesNotThrow(() => new vm.Script(source, { filename:file }));
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
  assert.match(profile, /if\(p1!==p2\)throw Error/);
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
  assert.match(dialogs, /U\.sync\(e\.employeeId,a\.authUid,x,\{employeeAlreadySynced:true\}\)/);
});

test('partial add-user failure is honest and cannot create a duplicate on retry', () => {
  assert.match(dialogs, /partial=!!id/);
  assert.match(dialogs, /تم حفظ سجل الموظف، لكن لم يكتمل إنشاء حساب الدخول أو التسكين/);
  assert.match(dialogs, /تم حفظ السجل — لا تعد الإرسال/);
  assert.match(core, /تم حفظ السجل/);
});

test('account suspension requires an explicit second confirmation', () => {
  assert.match(profile, /تأكيد إيقاف الحساب/);
  assert.match(profile, /stopImmediatePropagation/);
  assert.match(profile, /aria-label','اضغط مرة أخرى لتأكيد إيقاف الحساب'/);
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
