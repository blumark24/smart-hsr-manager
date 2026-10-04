'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const lands = read('lands/index.html');
const manager = read('manager.html');

test('Lands shell uses the local SMART HSR identity only', () => {
  assert.match(lands, /src="\/smart-hsr-mark\.svg"/);
  assert.match(lands, /SMART HSR — الأراضي الذكية/);
  assert.match(lands, /إدارة الأراضي والممتلكات/);
  assert.doesNotMatch(lands, /pike\.replit\.dev\/attached_assets/);
});

test('Lands navigation views resolve to a renderer or the assistant overlay', () => {
  const views = [...lands.matchAll(/data-view="([^"]+)"/g)].map(m => m[1]);
  assert.ok(views.length >= 9);
  for (const view of new Set(views)) {
    if (view === 'assistant') {
      assert.match(lands, /if \(v === "assistant"\) \{ openAiPanel\(\); return; \}/);
      continue;
    }
    assert.match(lands, new RegExp('\\b' + view + '\\s*:\\s*[A-Za-z_$][\\w$]*View\\b'));
  }
});

test('day/night theme is persistent but cannot break when storage is unavailable', () => {
  assert.match(lands, /body\.dark\{/);
  assert.match(lands, /function applyTheme\(theme\)/);
  assert.match(lands, /try \{ localStorage\.setItem\("slgr-theme", theme\); \} catch/);
  assert.match(lands, /aria-label="تبديل الوضع الليلي"/);
});

test('GIS state is honest and plots only verified spatial geometry', () => {
  assert.match(lands, /بيانات مكانية موثّقة من سجلات القطع/);
  assert.match(lands, /بانتظار بيانات GIS موثّقة للقطع/);
  assert.match(lands, /buildFeatureCollection\(/);
  assert.match(lands, /isGeoreferenced\(/);
  assert.match(lands, /لا توجد بيانات مكانية موثّقة لهذا النطاق/);
});

test('Lands shell is visually aligned with the manager shell without copying manager runtime', () => {
  assert.match(lands, /MUNICIPAL SHELL ALIGNMENT V4/);
  assert.match(manager, /class="hsr-manager-header"/);
  assert.match(lands, /--shell-radius:16px/);
  assert.match(lands, /--shadow-card:/);
  assert.match(lands, /prefers-reduced-motion/);
});


test('role-aware shell hides manager-only controls from a Lands employee', () => {
  assert.match(lands, /if \(!session \|\| !mod\.canReviewGrant\(session\.role\)\) return;/);
  assert.match(lands, /managerToggle\.hidden = !canReview/);
  assert.match(lands, /\[data-view="audit"\]/);
  assert.match(lands, /\[data-view="users"\]/);
  assert.match(lands, /canManageUsers = mod\.canManageEntitlements\(session\.role\)/);
});

test('release chrome is environment-truthful and does not expose dead primary actions', () => {
  assert.match(lands, /isProductionHost\(\) \? "بيئة الإنتاج" : "بيئة المعاينة"/);
  assert.doesNotMatch(lands, /id="envBadge">بيئة ما قبل الإنتاج/);
  assert.doesNotMatch(lands, /onclick='openDigitize\(\)'/);
  assert.doesNotMatch(lands, /رفع مستند عام للقرار غير مفعّل/);
  assert.doesNotMatch(lands, /التخزين السحابي لهذه البيئة غير مهيأ حاليًا/);
});

test('GIS empty states never ask the user to select a parcel when no verified geometry exists', () => {
  const honestNotes = lands.match(/fc\.features\.length \? "اختر قطعة لعرض المنحة المرتبطة بها" : "بانتظار بيانات GIS موثّقة للقطع"/g) || [];
  assert.ok(honestNotes.length >= 3);
});
