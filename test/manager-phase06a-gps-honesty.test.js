'use strict';
// PHASE 06A hotfix — GPS Honesty. smart-mobility.html/smart-mobility-adapter.js
// have no real device/location source anywhere; this locks in that no
// misleading "GPS is active/was activated" wording remains, and that the
// honest replacement wording is present. Mission status must never be
// presented as GPS status.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const mobilityPage = read('smart-mobility.html');
const adapter = read('smart-mobility-adapter.js');

test('no misleading "GPS is live/was activated" wording remains anywhere in the Mobility app', () => {
  const misleadingPhrases = [
    'GPS نشط أثناء المهمة',
    'تم تفعيل GPS',
    'انتهى التتبع بانتهاء المهمة',
    'GPS نشط أثناء المهمة المعتمدة',
  ];
  for (const phrase of misleadingPhrases) {
    assert.doesNotMatch(mobilityPage, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `misleading phrase "${phrase}" must not remain`);
  }
});

test('the honest replacement wording is actually present (not just the misleading text removed)', () => {
  assert.match(mobilityPage, /التتبع الفعلي للموقع غير متاح/);
  assert.match(mobilityPage, /المسار تخطيطي/);
});

test('GPS status is never rendered as visually "active/live" — no pulsing animation, no live-green color tied to mission status', () => {
  const renderFn = mobilityPage.slice(mobilityPage.indexOf("if (s === 'emp') {"), mobilityPage.indexOf("if (s === 'emp') {") + 3000);
  assert.match(renderFn, /out\.gpsAnim = 'none'/, 'GPS status must never animate/pulse — that implies real live activity');
  assert.doesNotMatch(renderFn, /gpsAnim = 'mBreathe/, 'no pulsing animation may ever be assigned to the GPS status indicator');
});

test('the mission detail drawer reports an honest location-status label, never a raw "GPS status: active" claim', () => {
  assert.doesNotMatch(mobilityPage, /حالة GPS['"]?\s*,\s*v:\s*m\.gps \? 'نشط أثناء المهمة'/);
  assert.match(mobilityPage, /حالة الموقع/);
});

test('the adapter documents that the raw gps boolean is mission-lifecycle context only, never a real GPS claim', () => {
  const fn = adapter.slice(adapter.indexOf('function normalizeMission'), adapter.indexOf('function normalizeMission') + 1300);
  assert.match(fn, /never a claim/);
  assert.match(fn, /gps: data\.status === 'IN_PROGRESS' \|\| data\.status === 'HANDED_OVER'/);
});

test('the existing honest map/twin disclosure (already correct, unrelated to this hotfix) is still intact', () => {
  assert.match(mobilityPage, /مواقع تخطيطية — لا تتوفر بيانات GPS حقيقية/);
});
