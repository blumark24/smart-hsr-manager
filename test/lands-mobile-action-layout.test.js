'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('lands/registry-table.css','utf8');
const html=fs.readFileSync('lands/index.html','utf8');
const patch=css.slice(css.indexOf('MOBILE ROW REGISTER — ACTIONS WITHOUT COLLISION'));
test('both grant tables keep the original row actions and record references',()=>{
  const registry=html.slice(html.indexOf('function registryView()'),html.indexOf('function rerenderRegistry('));
  const decision=html.slice(html.indexOf('function decisionGrantsTab('),html.indexOf('// Decision Twin'));
  for(const section of [registry,decision]){
    assert.match(section,/grant-row-actions-cell/);
    assert.match(section,/mod\.grantNumberLabel\(g\)/);
    assert.match(section,/openFile\('/);
    assert.match(section,/archiveGrant\('/);
  }
  assert.match(registry,/maskNationalId\(g\.beneficiary\?\.national_id\)/);
});
test('the second column is unpinned and may grow to its natural action widths',()=>{
  assert.ok(patch.length>900);
  assert.match(patch,/th:nth-child\(2\)/);
  assert.match(patch,/td:nth-child\(2\)/);
  assert.match(patch,/position:static!important/);
  assert.match(patch,/right:auto!important/);
  assert.match(patch,/max-width:none!important/);
  assert.match(patch,/width:max-content!important/);
});
test('action buttons never wrap, overlap, or shrink and meet mobile touch size',()=>{
  assert.match(patch,/\.grant-row-actions-cell \.row-actions\s*\{[^}]*flex-wrap:nowrap!important/s);
  assert.match(patch,/\.grant-row-actions-cell \.btn\.small\s*\{[^}]*flex:0 0 auto!important/s);
  assert.match(patch,/\.grant-row-actions-cell \.btn\.small\s*\{[^}]*min-height:44px!important/s);
  assert.match(patch,/\.grant-row-actions-cell \.btn\.small\s*\{[^}]*white-space:nowrap!important/s);
});
test('mobile retains just one sticky grant-number column and horizontal scroll',()=>{
  assert.match(patch,/overflow-x:auto!important/);
  assert.match(patch,/grant-register-table th:first-child/);
  assert.match(patch,/grant-registry-table td:first-child/);
  assert.match(patch,/position:sticky!important/);
  assert.match(patch,/right:0!important/);
  assert.match(patch,/@media \(max-width:359px\)/);
  assert.match(patch,/focus-visible/);
});
