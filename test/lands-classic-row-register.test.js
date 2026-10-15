'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html=fs.readFileSync('lands/index.html','utf8');
const css=fs.readFileSync('lands/registry-table.css','utf8');
const registry=html.slice(html.indexOf('function registryView()'),html.indexOf('function rerenderRegistry('));
const decision=html.slice(html.indexOf('function decisionGrantsTab('),html.indexOf('// Decision Twin'));

test('both registers render the original single-row table format with actions immediately after grant number',()=>{
  for (const section of [registry,decision]){
    assert.match(section, /<th(?: scope="col")?>رقم المنحة<\/th><th(?: scope="col")?>الإجراءات<\/th>/);
    assert.match(section, /class="grant-row-actions-cell"/);
    assert.match(section, /<b class="mono">\$\{esc\(mod\.grantNumberLabel\(g\)\)\}<\/b><\/td><td class="grant-row-actions-cell">/);
    assert.match(section, /openFile\('/);
    assert.match(section, /archiveGrant\('/);
  }
  assert.match(registry,/openEditDraft\('/);
  assert.match(registry,/discardDraftGrant\('/);
  assert.match(decision,/openEditDraft\('/);
  assert.match(registry,/maskNationalId\(g\.beneficiary\?\.national_id\)/);
  assert.match(decision,/maskNationalId\(g\.beneficiary\?\.national_id\)/);
});

test('edit and archive remain permission controlled, not made globally available',()=>{
  assert.match(registry,/g\.status === "draft" \|\| g\.status === "incomplete"\) && g\.created_by === session\.firebaseUid/);
  assert.match(registry,/mod\.canReviewGrant\(session\.role\) \? /);
  assert.match(decision,/g\.created_by === session\.firebaseUid/);
  assert.match(decision,/canArchiveGrant \? /);
  assert.match(registry,/g\.status === "draft" && g\.created_by === session\.firebaseUid/);
});

test('mobile cards are hidden and table remains scrollable in both routes',()=>{
  assert.match(css,/\.grant-display \.grant-view-controls,/);
  assert.match(css,/\.grant-display \.decision-mobile-grant-list\{display:none!important\}/);
  assert.match(css,/\.grant-display \.grant-register-scroll,/);
  assert.match(css,/\.grant-display \.grant-registry-scroll\{/);
  assert.match(css,/overflow-x:auto!important/);
  assert.match(css,/position:sticky!important;right:0!important/);
  assert.match(css,/position:sticky!important;right:105px!important/);
  assert.match(css,/@media\(max-width:359px\)/);
});

test('record source, key fields and backend security paths remain unchanged',()=>{
  assert.match(registry,/grants\.filter\(g => !g\.archived/);
  assert.match(registry,/g\.created_by === session\.firebaseUid/);
  assert.match(registry,/mod\.grantReferenceLabel\(g, "plan"/);
  assert.match(registry,/mod\.grantReferenceLabel\(g, "parcel"/);
  assert.match(decision,/grantAttachmentsCell\(g\)/);
  assert.match(decision,/grantCompletenessCell\(g\)/);
  assert.match(registry,/statusFilter === "all"/);
});

test('inline lands browser code parses',()=>{
  const at=html.indexOf('function registryView()');
  const open=html.lastIndexOf('<script>',at);
  const close=html.indexOf('</script>',at);
  assert.ok(open>=0 && close>open);
  assert.doesNotThrow(()=>new vm.Script(html.slice(open+'<script>'.length,close)));
});
