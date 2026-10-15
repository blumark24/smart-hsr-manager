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

test('registers preserve one row per grant and put compact actions beside the identifier',()=>{
 assert.match(registry,/<thead><tr><th>رقم المنحة<\/th><th>الإجراءات<\/th><th>الحالة<\/th><th>المستفيد<\/th>/);
 assert.match(registry,/<th>نسبة الاكتمال<\/th><\/tr><\/thead>/);
 assert.match(decision,/<thead><tr><th scope="col">رقم المنحة<\/th><th scope="col">الإجراءات<\/th><th scope="col">المستفيد<\/th><th scope="col">حالة الإجراء<\/th>/);
 assert.match(decision,/<th>آخر تحديث<\/th><\/tr><\/thead>/);
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
 assert.doesNotMatch(own,/archiveGrant\(/);
 const other=renderActions({owner:'employee-b'});
 assert.doesNotMatch(other,/openEditDraft|discardDraftGrant|archiveGrant/);
 assert.match(other,/disabled/);
 assert.match(other,/فتح ملف المنحة/);
});
test('reviewer sees authorized review and non-destructive archive, not unauthorized edit',()=>{
 const rev=renderActions({owner:'employee-a',actor:'manager',status:'under_review',manager:true});
 assert.match(rev,/مراجعة المنحة/);assert.match(rev,/أرشفة المنحة دون حذف نهائي/);
 assert.doesNotMatch(rev,/openEditDraft|discardDraftGrant/);
 const approved=renderActions({owner:'employee-a',actor:'manager',status:'approved',manager:true});
 assert.doesNotMatch(approved,/openEditDraft|discardDraftGrant|openReviewGrant/);
 assert.match(approved,/أرشفة المنحة/);
});
test('every mobile table column scrolls together, with 44px icon controls',()=>{
 const patch=css.slice(css.lastIndexOf('LANDS ROW REGISTER R3'));
 assert.ok(patch.length>3000);
 assert.match(patch,/overflow-x:auto!important/);
 assert.match(patch,/table-layout:auto!important/);
 assert.match(patch,/position:static!important/);
 assert.doesNotMatch(patch,/position:sticky!important/);
 assert.match(patch,/grant-icon-action\.btn\.small/);
 assert.match(patch,/min-height:44px!important/);
 assert.match(patch,/decision-mobile-grant-list/);
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
