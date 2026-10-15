'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('lands/index.html','utf8');
const css = fs.readFileSync('lands/registry-table.css','utf8');
const registry = html.slice(html.indexOf('function registryView()'),html.indexOf('function rerenderRegistry('));
const decision = html.slice(html.indexOf('function decisionGrantsTab('),html.indexOf('// Decision Twin'));
const cards = html.slice(html.indexOf('function decisionGrantMobileCard('),html.indexOf('function decisionGrantsTab('));

test('mobile defaults to the scrollable table and provides optional cards without data duplication',()=>{
  assert.match(html,/let grantMobileMode = "table"/);
  assert.match(html,/function setGrantMobileMode\(mode\)/);
  assert.match(html,/mode !== "table" && mode !== "cards"/);
  assert.match(html,/setAttribute\("aria-pressed"/);
  for(const source of [registry,decision]){
    assert.match(source,/class="grant-display" data-view="\$\{grantMobileMode\}"/);
    assert.match(source,/class="registry-row-help"/);
    assert.match(source,/grantRowActions\(g,/);
    assert.match(source,/class="decision-mobile-grant-list"/);
  }
  assert.match(registry,/class="table-wrap grant-register-scroll"/);
  assert.match(decision,/class="table-wrap grant-registry-scroll"/);
  assert.match(registry,/shown\.map\(g => decisionGrantMobileCard\(g,/);
  assert.match(decision,/scoped\.map\(g => decisionGrantMobileCard\(g,/);
});

test('compact cards keep actual grant identifiers, authorization and evidence',()=>{
  assert.match(cards,/mod\.grantNumberLabel\(g\)/);
  assert.match(cards,/statusBadge\(g\)/);
  assert.match(cards,/g\.beneficiary\?\.name/);
  assert.match(cards,/mod\.grantReferenceLabel\(g, "plan"/);
  assert.match(cards,/mod\.grantReferenceLabel\(g, "parcel"/);
  assert.match(cards,/grantDocumentCounts\(g, domains\.documents/);
  assert.match(cards,/completenessPercent\(g\)/);
  assert.match(cards,/<details class="decision-mobile-extra">/);
  assert.match(cards,/grantAttachmentsCell\(g\)/);
  assert.match(cards,/grantCompletenessCell\(g\)/);
  assert.match(cards,/g\.status === "draft" && g\.created_by === session\.firebaseUid/);
  assert.match(cards,/mod\.canReviewGrant|canArchiveGrant/);
});

test('RTL and responsive behavior retain desktop tables and mobile horizontal swipe',()=>{
  assert.match(css,/\.grant-display\[data-view="table"\] \.grant-registry-scroll/);
  assert.match(css,/\.grant-display\[data-view="cards"\] \.grant-registry-scroll/);
  assert.match(css,/\.grant-display\[data-view="table"\] \.decision-mobile-grant-list/);
  assert.match(css,/\.grant-view-controls,\.grant-swipe-hint\{display:none\}/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/overflow-x:auto!important/);
  assert.match(css,/position:sticky;right:0/);
  assert.match(css,/focus-visible/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(html,/aria-label="جدول المنح، اسحب أفقيًا/);
});

test('existing filters, masking, record ownership and status fields preserved',()=>{
  assert.match(registry,/grants\.filter\(g => !g\.archived/);
  assert.match(registry,/g\.created_by === session\.firebaseUid/);
  assert.match(registry,/statusFilter === "all"/);
  assert.match(registry,/completenessFilter === "all"/);
  assert.match(registry,/maskNationalId\(g\.beneficiary\?\.national_id\)/);
  assert.match(registry,/mod\.grantReferenceLabel\(g, "plan"/);
  assert.match(decision,/grantAttachmentsCell\(g\)/);
  assert.match(decision,/grantCompletenessCell\(g\)/);
  assert.match(decision,/openFile\('/);
});

test('modified inline classic script parses',()=>{
  const at=html.indexOf('function decisionGrantMobileCard(');
  const open=html.lastIndexOf('<script>',at);
  const close=html.indexOf('</script>',at);
  assert.ok(open>=0&&close>open);
  assert.doesNotThrow(()=>new vm.Script(html.slice(open+'<script>'.length,close)));
});
