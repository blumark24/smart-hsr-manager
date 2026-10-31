'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '../department-head.html'), 'utf8');
const start = src.indexOf("if (st.role === 'dept' && st.screen === 'deptops') {");
const end = src.indexOf("if (st.screen === 'map') {", start);
const section = start >= 0 && end > start ? src.slice(start, end) : '';

test('Field command center never claims zero visual-distortion cases without a verified feed', () => {
  assert.ok(section, 'Department command-center block missing');
  assert.doesNotMatch(section, /const observations = \[\]/, 'no invented empty case source');
  assert.doesNotMatch(section, /K\('(حالات التشوه|تحت المعالجة|بانتظار التحقق|مغلقة)',\s*0\s*,/, 'no fabricated zero case KPIs');
  assert.match(section, /unavailableCaseKpi\('حالات التشوه'/);
  assert.match(section, /sideACount:\s*'غير متاح'/);
  assert.match(section, /لا يعني ذلك عدم وجود بلاغات/);
});

test('UI repair keeps live team count and does not introduce authorization logic', () => {
  assert.match(section, /K\('مراقبو القسم', team\.length, 'متاحة'\)/);
  assert.match(section, /const team = this\.state\.liveEmployees \|\| \[\]/);
  assert.doesNotMatch(section, /firebase|Firestore|setCustomUserClaims|collection\(/i);
});
