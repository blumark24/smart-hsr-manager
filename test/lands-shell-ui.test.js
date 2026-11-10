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


test('Lands visual unification keeps manager shell parity and role-aware chrome', () => {
  assert.match(lands, /LANDS VISUAL UNIFICATION V1/);
  assert.match(lands, /class="header-context"/);
  assert.match(lands, /data-review-only/);
  assert.match(lands, /data-admin-only/);
  assert.match(lands, /mod\.canReviewGrant\(session\.role\)/);
  assert.match(lands, /mod\.canManageEntitlements\(session\.role\)/);
  assert.match(lands, /managerModeToggle\.hidden = !canReview/);
  assert.match(lands, /if \(!session \|\| !mod\.canReviewGrant\(session\.role\)\) return;/);
});

test('Lands dashboard separates GIS empty state from map initialization errors', () => {
  assert.match(lands, /لا توجد حدود GIS موثّقة حاليًا/);
  assert.match(lands, /if \(fc\.features\.length\) requestAnimationFrame\(\(\) => mountGisMap\("gisMapDash"/);
  assert.match(lands, /gisMapErrorMarkup\(\)/);
  assert.doesNotMatch(lands, /سجل التدقيق مقصور على أدوار المراجعة/);
});
