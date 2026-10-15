'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('lands/index.html','utf8');
const css=fs.readFileSync('lands/registry-table.css','utf8');
const get=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const registry=get('function registryView()','function rerenderRegistry(');
const decision=get('function decisionGrantsTab(scoped)','// Decision Twin');
const actions=get('function grantClassicRowActions(', 'function registryView()');

test('restores exact previous-day column order with actions at row end',()=>{
 assert.match(registry,/<thead><tr><th>رقم المنحة<\/th><th>الحالة<\/th><th>المستفيد<\/th>/);
 assert.match(registry,/<th>الإجراءات<\/th><\/tr><\/thead>/);
 assert.match(decision,/<thead><tr><th scope="col">رقم المنحة<\/th><th scope="col">المستفيد<\/th><th scope="col">حالة الإجراء<\/th>/);
 assert.match(decision,/<th>الإجراءات<\/th><\/tr><\/thead>/);
 for(const source of [registry,decision]) {
  assert.match(source,/data-view="table"/);
  assert.doesNotMatch(source,/grantViewControls\(\)/);
  assert.match(source,/grantClassicRowActions\(g,/);
  assert.match(source,/data-table grant-/);
 }
});

function renderActions({status='draft',owner='employee-a',actor='employee-a',manager=false}={}){
 const context={session:{firebaseUid:actor},esc:v=>String(v),icon:()=>''};
 vm.createContext(context);vm.runInContext(actions,context);
 return context.grantClassicRowActions({id:'g1',created_by:owner,status},manager);
}
test('creator can edit and cancel own draft; cannot change others grants',()=>{
 const own=renderActions({});
 assert.match(own,/تعديل/);assert.match(own,/إلغاء المسودة/);
 assert.doesNotMatch(own,/أرشفة المنحة/);
 const other=renderActions({owner:'employee-b'});
 assert.doesNotMatch(other,/تعديل|إلغاء المسودة|أرشفة المنحة/);
 assert.match(other,/فتح ملف المنحة/);
});
test('reviewer sees authorized review and non-destructive archive, not unauthorized edit',()=>{
 const rev=renderActions({owner:'employee-a',actor:'manager',status:'under_review',manager:true});
 assert.match(rev,/مراجعة المنحة/);assert.match(rev,/أرشفة المنحة دون حذف نهائي/);
 assert.doesNotMatch(rev,/تعديل المنحة|إلغاء المسودة/);
 const approved=renderActions({owner:'employee-a',actor:'manager',status:'approved',manager:true});
 assert.doesNotMatch(approved,/تعديل المنحة|إلغاء المسودة|مراجعة المنحة/);
 assert.match(approved,/أرشفة المنحة/);
});
test('native mobile scrolling preserves single row and no sticky action column',()=>{
 const patch=css.slice(css.lastIndexOf('CLASSIC ONE-ROW LANDS REGISTER'));
 assert.ok(patch.length>1900);
 assert.match(patch,/grant-classic-actions\{display:inline-flex;flex-flow:row nowrap/);
 assert.match(patch,/grant-classic-actions \.btn.small[\s\S]*?min-width:44px;min-height:42px/);
 assert.match(patch,/th:last-child,[\s\S]*?td:last-child[\s\S]*?position:static!important/);
 assert.match(patch,/th:first-child,[\s\S]*?td:first-child[\s\S]*?position:sticky!important/);
 assert.match(patch,/overflow-x:auto!important/);
 assert.match(patch,/decision-mobile-grant-list\{display:none!important\}/);
});
test('existing registry filters and official references remain intact',()=>{
 assert.match(registry,/grants\.filter\(g => !g\.archived/);
 assert.match(registry,/g\.created_by === session\.firebaseUid/);
 assert.match(registry,/statusFilter === "all"/);
 assert.match(registry,/maskNationalId\(g\.beneficiary\?\.national_id\)/);
 assert.match(registry,/mod\.grantReferenceLabel\(g, "plan"/);
 assert.match(decision,/grantAttachmentsCell\(g\)/);
 assert.match(decision,/grantCompletenessCell\(g\)/);
});
test('inline browser code is syntactically valid',()=>{
 let at=html.indexOf('function grantClassicRowActions(');
 let start=html.lastIndexOf('<script>',at),end=html.indexOf('</script>',at);
 assert.ok(start>=0&&end>start);
 assert.doesNotThrow(()=>new vm.Script(html.slice(start+8,end)));
});
