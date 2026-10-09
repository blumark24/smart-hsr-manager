'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'department-head.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'smart-hsr-unified-shell.css'), 'utf8');

test('Mobility command center uses canonical service and role terminology', () => {
  assert.match(page, /title: 'مركز عمليات الحركة الذكية'/);
  assert.match(page, /: r === 'mobility' \? 'رئيس قسم الحركة'/);
  assert.match(page, /const productAreaTitle = mobilityMode \? 'إدارة حركة السير'/);
  assert.doesNotMatch(page, /title: 'مركز عمليات إدارة الحصر الميداني'/);
});

test('Mobility release navigation is grouped and hides unreleased committees', () => {
  const mobilityNav = page.match(/if \(r === 'mobility'\) return \[[\s\S]*?\n    \];/);
  assert.ok(mobilityNav, 'mobility navigation block must exist');
  const nav = mobilityNav[0];
  assert.match(nav, /section: 'التشغيل'/);
  assert.match(nav, /section: 'المتابعة'/);
  assert.match(nav, /section: 'النظام'/);
  assert.doesNotMatch(nav, /label: 'اللجان'/);
  assert.match(page, /hsr-nav-section/);
});

test('Mobility command center exposes exactly six decision KPIs', () => {
  const ops = page.match(/if \(st\.role === 'mobility' && st\.screen === 'ops'\) \{[\s\S]*?sideATitle:/);
  assert.ok(ops, 'mobility ops block must exist');
  const block = ops[0];
  const labels = [
    'المركبات المتاحة',
    'في مهمة الآن',
    'بانتظار التخصيص',
    'بانتظار التسليم',
    'متأخرة في العودة',
    'الحوادث المفتوحة'
  ];
  labels.forEach(label => assert.match(block, new RegExp("K\\('" + label + "'")));
  assert.equal((block.match(/\bK\('/g) || []).length, 6);
  assert.doesNotMatch(block, /K\('إجمالي المركبات'/);
  assert.doesNotMatch(block, /K\('محجوزة'/);
  assert.doesNotMatch(block, /K\('في الصيانة'/);
});

test('Ready-for-handover KPI requires authorized vehicle operation', () => {
  assert.match(page, /this\.missionStatus\(m\.id\) === 'تم تخصيص المركبة' && m\.authorizationStatus === 'AUTHORIZED'/);
});

test('Attention Required is built only from real operational conditions', () => {
  assert.match(page, /bottomCTitle: 'يتطلب الانتباه'/);
  assert.match(page, /مهمة بانتظار مركبة/);
  assert.match(page, /مركبة بانتظار الإعادة/);
  assert.match(page, /openIncidents/);
  assert.match(page, /لا توجد عناصر تتطلب تدخلاً تشغيليًا الآن/);
});

test('Fleet health and request distribution replace secondary KPI clutter', () => {
  assert.match(page, /bottomATitle: 'صحة الأسطول'/);
  assert.match(page, /bottomBTitle: 'توزيع الطلبات حسب الأقسام'/);
});

test('Six KPI grid is responsive without changing workflow logic', () => {
  assert.match(css, /data-product="الحركة الذكية"\] \.dh-kpi-grid[\s\S]*repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:1450px\)[\s\S]*repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*repeat\(2,minmax\(0,1fr\)\)/);
});
