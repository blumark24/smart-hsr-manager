'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('lands/index.html','utf8');
const css=fs.readFileSync('lands/registry-table.css','utf8');
const reg=html.slice(html.indexOf('function registryView()'),html.indexOf('function rerenderRegistry('));
const decision=html.slice(html.indexOf('function decisionGrantsTab(scoped)'),html.indexOf('// Decision Twin'));
const actions=html.slice(html.indexOf('function grantClassicRowActions('),html.indexOf('function registryView()'));
const patch=css.slice(css.lastIndexOf('LANDS MOBILE ROW REGISTER R3'));

test('each register renders a single horizontal record with mobile actions right after number',()=>{
  for(const src of [reg,decision]){
    assert.match(src, /<th class="grant-mobile-tools-head" scope="col">أدوات<\/th>/);
    assert.match(src, /<td class="grant-mobile-tools-cell">\$\{grantClassicRowActions\(g,/);
    assert.match(src, /<td class="grant-classic-actions-cell">\$\{grantClassicRowActions\(g,/);
    assert.match(src, /data-view="table"/);
    assert.match(src, /<td><b class="mono">\$\{esc\(mod\.grantNumberLabel\(g\)\)\}<\/b><\/td><td class="grant-mobile-tools-cell">/);
  }
  assert.match(reg, /colspan="11"/);
  assert.match(decision, /colspan="13"/);
});

test('all columns swipe together without sticky overlays or overlapping fixed-width actions',()=>{
  assert.ok(patch.length>3300);
  assert.match(patch, /overflow-x:auto!important/);
  assert.match(patch, /body \.grant-display \.grant-register-table th,[\s\S]+?position:static!important/);
  assert.match(patch, /body \.grant-display \.grant-registry-table th/);
  assert.match(patch, /table-layout:auto!important/);
  assert.match(patch, /width:max-content!important/);
  assert.match(patch, /body \.grant-display \.grant-register-table th:last-child/);
  assert.match(patch, /display:none!important/);
  assert.match(patch, /\.grant-mobile-tools-cell/);
  assert.match(patch, /display:table-cell!important/);
});

test('icons have 44-pixel touch targets, do not wrap, and retain button labels for assistive technology',()=>{
  assert.match(patch, /\.grant-mobile-tools-cell \.grant-classic-actions \.btn\.small\{[\s\S]*?width:44px!important;height:44px!important/);
  assert.match(patch, /flex-wrap:nowrap!important/);
  assert.match(patch, /\.grant-mobile-tools-cell \.grant-classic-actions \.btn\.small span\{\s*display:none!important/);
  for(const word of ['فتح ملف المنحة','تعديل المنحة','إلغاء المسودة مع الاحتفاظ بسجل التدقيق','أرشفة المنحة دون حذف نهائي']) {
    assert.ok(actions.includes(word),word);
  }
});

function render({status='draft',actor='e1',creator='e1',manager=false}={}){
  const ctx={session:{firebaseUid:actor},esc:x=>String(x),icon:()=>''};
  vm.createContext(ctx);vm.runInContext(actions,ctx);
  return ctx.grantClassicRowActions({id:'grant-1',status,created_by:creator},manager);
}
test('own draft can be edited/soft-discarded; unrelated employee never receives that authority',()=>{
  assert.match(render(), /openEditDraft/);
  assert.match(render(), /discardDraftGrant/);
  assert.doesNotMatch(render({creator:'other'}), /openEditDraft|discardDraftGrant|archiveGrant/);
});
test('manager only gets archive and review where authorized; nothing triggers hard delete',()=>{
  assert.match(render({status:'under_review',actor:'manager',creator:'other',manager:true}), /openReviewGrant|archiveGrant/);
  assert.doesNotMatch(render({status:'under_review',actor:'manager',creator:'other',manager:true}), /openEditDraft|discardDraftGrant/);
  assert.doesNotMatch(actions, /deleteGrant\(/);
});
test('inline app remains JavaScript-parseable and data filters are unchanged',()=>{
  let at=html.indexOf('function grantClassicRowActions('),a=html.lastIndexOf('<script>',at),b=html.indexOf('</script>',at);
  assert.ok(a>=0&&b>a);assert.doesNotThrow(()=>new vm.Script(html.slice(a+8,b)));
  assert.match(reg, /grants\.filter\(g => !g\.archived/);
  assert.match(reg, /maskNationalId\(g\.beneficiary\?\.national_id\)/);
  assert.match(reg, /mod\.grantReferenceLabel\(g, "plan"/);
  assert.match(decision, /grantAttachmentsCell\(g\)/);
});
