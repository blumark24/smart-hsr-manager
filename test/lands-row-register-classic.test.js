'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('lands/index.html','utf8');
const css = fs.readFileSync('lands/registry-table.css','utf8');
const helper=html.slice(html.indexOf('function grantRowActions('),html.indexOf('function registryView('));

function actions({status,creator='employee',actor='employee',manager=false}={}){
  const context={session:{firebaseUid:actor},mod:{grantNumberLabel:()=> '001/1448'},esc:x=>String(x),icon:()=>''};
  vm.createContext(context);vm.runInContext(helper,context);
  return context.grantRowActions({id:'g1',status,created_by:creator},manager);
}

test('employee draft: own record may edit/discard but cannot archive or approve',()=>{
  const h=actions({status:'draft'});assert.match(h,/فتح/);assert.match(h,/تعديل/);assert.match(h,/إلغاء مسودتي/);
  assert.doesNotMatch(h,/أرشفة/);assert.doesNotMatch(h,/مراجعة/);
});
test('employee cannot edit or discard another employees draft',()=>{
  const h=actions({status:'draft',creator:'other'});assert.match(h,/فتح/);
  for (const forbidden of ['تعديل','إلغاء مسودتي','أرشفة','مراجعة']) assert.doesNotMatch(h,new RegExp(forbidden));
});
test('reviewer has review/archive authority while approved grant remains read-only',()=>{
  const review=actions({status:'under_review',manager:true,creator:'other'});
  assert.match(review,/مراجعة/);assert.match(review,/أرشفة/);assert.doesNotMatch(review,/تعديل/);
  const approved=actions({status:'approved',manager:true});
  assert.match(approved,/أرشفة/);assert.doesNotMatch(approved,/تعديل/);assert.doesNotMatch(approved,/مراجعة/);
});
test('main and decision registers show one-row action strips with no card toggle',()=>{
  const main=html.slice(html.indexOf('function registryView('),html.indexOf('function rerenderRegistry('));
  const decision=html.slice(html.indexOf('function decisionGrantsTab('),html.indexOf('// Decision Twin'));
  for (const scope of [main,decision]) {
    assert.match(scope,/grantRowActions\(g,/);
    assert.doesNotMatch(scope,/grantViewControls\(\)/);
    assert.match(scope,/registry-row-help/);
  }
  assert.match(main,/maskNationalId\(g\.beneficiary\?\.national_id\)/);
  assert.match(main,/mod\.grantReferenceLabel\(g, "plan"/);
  assert.match(decision,/grantAttachmentsCell\(g\)/);
});
test('mobile CSS shows horizontal table and hides oversized cards',()=>{
  assert.match(css,/body \.grant-display \.decision-mobile-grant-list\{display:none!important\}/);
  assert.match(css,/body \.grant-display \.grant-registry-scroll\{display:block!important/);
  assert.match(css,/body \.grant-row-actions \.btn\{min-height:40px/);
  assert.match(css,/max-width:720px/);
  assert.match(css,/focus-visible/);
});
test('inline JS remains parseable',()=>{
 const at=html.indexOf('function grantRowActions('),open=html.lastIndexOf('<script>',at),close=html.indexOf('</script>',at);
 assert.ok(open>=0 && close>open);
 assert.doesNotThrow(()=>new vm.Script(html.slice(open+8,close)));
});
