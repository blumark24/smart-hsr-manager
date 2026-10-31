'use strict';
// Pure synthetic UX/session contract for the approved Manager-sourced Lands
// header. Never logs in, fetches municipality data, invokes an LLM or writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.resolve(__dirname, '../lands/index.html'), 'utf8');
function excerpt(from, to) {
  const start = src.indexOf(from);
  const end = src.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, 'extract exact original Lands function: ' + from);
  return src.slice(start, end);
}
const style = excerpt('<style id="lands-executive-parity-accessibility-20261031">', '</style>');

test('approved Manager executive header markup, SMART HSR logo, tenant name and profile stay in place', () => {
  assert.match(src, /<header class="hsr-manager-header lands-manager-source-header"/);
  assert.match(src, /id="headerMunicipalityName" data-hsr-weather-org/);
  assert.match(src, /id="headerProfileName"/);
  assert.match(src, /id="headerProfileRole"/);
  assert.match(src, /id="headerProfileAvatar"/);
  assert.match(src, /src="\/smart-hsr-mark\.svg"/);
  assert.match(src, /class="hsr-manager-environment-cluster"/);
  assert.match(src, /id="headerClockTime"/);
  assert.match(src, /data-hsr-weather-org-selector="#headerMunicipalityName"/);
  assert.match(style, /header\.lands-manager-source-header \.lands-manager-primary/);
  assert.match(style, /header\.lands-manager-source-header \.lands-manager-secondary/);
  assert.match(style, /header\.lands-manager-source-header \.lands-manager-search/);
  assert.doesNotMatch(style, /owner\.|firebase|firestore\.rules|LANDS_EMBEDDED_RUNTIME/);
});

test('light/dark account popup use local styling, readable contrast and mobile geometry', () => {
  assert.match(style, /body:not\(\.dark\) #appShell > header\.lands-manager-source-header \.account-menu/);
  assert.match(style, /body\.dark #appShell > header\.lands-manager-source-header \.account-menu/);
  assert.match(style, /#appShell > header\.lands-manager-source-header \.manager-profile-button:focus-visible/);
  assert.match(style, /@media\(max-width:700px\)/);
  assert.match(style, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(src, /id="themeDayButton"[^>]*onclick="applyTheme\('light'\)"/);
  assert.match(src, /id="themeNightButton"[^>]*onclick="applyTheme\('dark'\)"/);
});

function mockDom() {
  const objects = {};
  const make = id => ({
    id, value: 'stale', textContent: 'sensitive previous employee',
    hidden: true, dataset: { state: 'thinking' }, classList: {
      flags: new Set(['open']),
      add(t) { this.flags.add(t); }, remove(t) { this.flags.delete(t); },
      contains(t) { return this.flags.has(t); },
      toggle(t, b) { b ? this.flags.add(t) : this.flags.delete(t); }
    },
    attrs: {}, setAttribute(k, v) { this.attrs[k] = v; },
    focus() {}
  });
  return {
    objects,
    document: { getElementById(id) { return objects[id] ||= make(id); } }
  };
}

test('profile dropdown opens full read-only municipal identity immediately, then closes cleanly', () => {
  const { objects, document } = mockDom();
  const code = excerpt('function toggleAccountMenu(event) {', '// Workspaces are supplied');
  const closeCode = excerpt('function closeAccountMenu() {', '// وضع المدير');
  const context = {
    document, session: { firebaseUid: 'synthetic', municipalityId: 'synthetic' },
    closeAccountMenu: () => {},
  };
  vm.runInNewContext(closeCode, context);
  vm.runInNewContext(code, context);
  const menu = document.getElementById('accountMenu');
  menu.classList.remove('open');
  context.toggleAccountMenu({ stopPropagation() {} });
  assert.equal(menu.classList.contains('open'), true);
  assert.equal(objects.accountButton.attrs['aria-expanded'], 'true');
  assert.equal(objects.landsReadOnlyProfileDetails.hidden, false);
  assert.equal(objects.landsReadOnlyProfileToggle.attrs['aria-expanded'], 'true');
  context.closeAccountMenu();
  assert.equal(menu.classList.contains('open'), false);
  assert.equal(objects.accountButton.attrs['aria-expanded'], 'false');
  assert.equal(objects.landsReadOnlyProfileDetails.hidden, true);
});

test('AI conversation, input and panel are purged on context reset; button ARIA remains truthful', () => {
  const { objects, document } = mockDom();
  const code = excerpt('let aiThread = [];', 'function currentAiScope() {');
  const context = { document };
  vm.runInNewContext(code + '\naiThread=[{role:"bot",text:"SECRET_SYNTHETIC_BENEFICIARY"}];', context);
  vm.runInNewContext('resetLandsAssistantContext();', context);
  assert.equal(vm.runInNewContext('aiThread.length', context), 0);
  assert.equal(objects.aiInput.value, '');
  assert.equal(objects.aiThread.textContent, '');
  assert.equal(objects.aiContext.textContent, '');
  assert.equal(objects.aiQuickActions.textContent, '');
  assert.equal(objects.aiAttentionSummary.textContent, '');
  assert.equal(objects.aiAttentionSummary.hidden, true);
  assert.equal(objects.aiAttentionBadge.hidden, true);
  assert.equal(objects.aiPanel.attrs['aria-hidden'], 'true');
  assert.equal(objects.aiTrigger.attrs['aria-expanded'], 'false');
  assert.equal(objects.aiTrigger.dataset?.state ?? 'idle', 'idle');
});

test('auth transition and switching UID/tenant force assistant scrub without modifying auth logic', () => {
  const showScreen = excerpt('function showScreen(name) {', 'function icon(n) {');
  assert.match(showScreen, /name !== "app"[\s\S]*resetLandsAssistantContext\(\)/);
  assert.match(showScreen, /lastLandsAssistantIdentity = null/);
  const identityRender = excerpt('function renderShellChrome() {', 'const roleLabel');
  assert.match(identityRender, /session\.firebaseUid/);
  assert.match(identityRender, /session\.municipalityId/);
  assert.match(identityRender, /session\.role/);
  assert.match(identityRender, /identity !== lastLandsAssistantIdentity[\s\S]*resetLandsAssistantContext\(\)/);
  const logout = excerpt('async function handleLogout() {', 'async function loadWorkspace() {');
  assert.match(logout, /resetLandsAssistantContext\(\)/);
  assert.match(logout, /closeAccountMenu\(\)/);
});

test('assistant stays deterministic, no external model and disabled when no verified session', () => {
  assert.match(src, /قواعد محلية · قراءة فقط/);
  assert.match(src, /لا يوجد نموذج لغوي خارجي مفعّل/);
  const toggler = excerpt('function toggleAiPanel(forceOpen) {', '// Keyboard-friendly and pointer');
  assert.match(toggler, /if \(open && !session\) return/);
  assert.match(toggler, /panel\.setAttribute\("aria-hidden", String\(!open\)\)/);
  assert.match(toggler, /trigger\.setAttribute\("aria-expanded", String\(open\)\)/);
  assert.match(src, /aiThread\.map\(m => `<div class="ai-msg \$\{m\.role\}">\$\{esc\(m\.text\)\}/);
  assert.match(src, /async function submitAiPrompt\(message\) \{ return submitAiQuestion\(message\); \}/);
});

test('assistant never describes five-axis data completeness as official grant approval', () => {
  const ai = excerpt('function aiAnswer(action, scope) {', 'function submitAiQuestion(rawText, presetAction) {');
  assert.match(ai, /اكتمال البيانات لا يعني اعتماد المنحة/);
  assert.match(ai, /هذا ليس عدد المنح المعتمدة رسميًا/);
  assert.match(ai, /اكتمال البيانات منفصل عن الاعتماد/);
  assert.match(ai, /مكتملة البيانات خارج المراجعة/);
  assert.doesNotMatch(ai, /مكتملة رسميًا|نسبة إنجاز قرار رقم/);
  assert.match(ai, /if \(!session \|\| !mod\.canReviewGrant\(session\.role\)\) return "الملخص التنفيذي يتطلب صلاحية المراجعة/);
  assert.match(src, /لا يوجد نموذج لغوي خارجي مفعّل في هذه النسخة/);
});
