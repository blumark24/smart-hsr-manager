'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('lands/index.html','utf8');
const css=fs.readFileSync('lands/registry-table.css','utf8');
const patch=css.slice(css.indexOf('/* APPLE-INSPIRED LANDS REGISTER'));
const reg=html.slice(html.indexOf('function registryView()'),html.indexOf('function rerenderRegistry('));
const decision=html.slice(html.indexOf('function decisionGrantsTab('),html.indexOf('// Decision Twin'));
const actions=html.slice(html.indexOf('function grantClassicRowActions('),html.indexOf('function registryView()'));

test('one complete HTML table row per record, with real source record fields',()=>{
 for(const text of [reg,decision]){
  assert.match(text,/<table class="data-table grant-/);
  assert.match(text,/\.map\(g => `<tr/);
  assert.match(text,/grantClassicRowActions\(g,/);
  assert.match(text,/mod\.grantNumberLabel\(g\)/);
  assert.match(text,/mod\.grantReferenceLabel\(g, "plan"/);
  assert.match(text,/mod\.grantReferenceLabel\(g, "parcel"/);
 }
 assert.match(reg,/maskNationalId\(g\.beneficiary\?\.national_id\)/);
 assert.match(decision,/grantAttachmentsCell\(g\)/);
});

test('all columns scroll horizontally as a single real table, with no sticky cells',()=>{
 assert.ok(patch.startsWith('/* APPLE-INSPIRED'));
 assert.match(patch,/body \.grant-register-scroll,body \.grant-registry-scroll\{[\s\S]*?overflow-x:auto!important/);
 assert.match(patch,/direction:rtl/);
 assert.match(patch,/width:max-content!important/);
 assert.match(patch,/body \.grant-register-table th,body \.grant-register-table td,[\s\S]*?position:static!important/);
 assert.doesNotMatch(patch,/position:sticky\s*!important/);
 assert.match(patch,/top:auto!important/);
 assert.match(patch,/z-index:auto!important/);
 assert.match(patch,/body \.grant-classic-actions-cell\{\s*position:static!important/);
});

test('row contents stay in their own cells, no clipping or fixed row heights',()=>{
 assert.match(patch,/white-space:nowrap!important/);
 assert.match(patch,/height:auto!important;max-height:none!important/);
 assert.match(patch,/body \.grant-classic-actions\{[\s\S]*?flex-flow:row nowrap!important/);
 assert.match(patch,/\.grant-icon-action\{[\s\S]*?width:44px!important;height:44px!important/);
 assert.match(patch,/focus-visible/);
 assert.match(patch,/prefers-reduced-motion/);
});

function controls({status='draft',created_by='u-a',actor='u-a',manager=false}={}){
 const context={session:{firebaseUid:actor},esc:String,icon:()=>'<svg></svg>'};
 vm.createContext(context);vm.runInContext(actions,context);
 return context.grantClassicRowActions({id:'g1',status,created_by},manager);
}

test('owner draft shows edit and safe discard but no manager archive',()=>{
 const h=controls();
 assert.match(h,/onclick="openEditDraft/);
 assert.match(h,/onclick="discardDraftGrant/);
 assert.doesNotMatch(h,/onclick="archiveGrant/);
 assert.match(h,/onclick="openFile/);
 assert.doesNotMatch(h,/deleteGrant\(/);
});

test('other employee sees disabled edit, never discard or archive',()=>{
 const h=controls({created_by:'other'});
 assert.match(h,/grant-icon-action is-unavailable/);
 assert.doesNotMatch(h,/onclick="openEditDraft/);
 assert.doesNotMatch(h,/onclick="discardDraftGrant/);
 assert.doesNotMatch(h,/onclick="archiveGrant/);
});

test('authorized manager may archive, review only in review status',()=>{
 const h=controls({created_by:'employee',actor:'manager',status:'under_review',manager:true});
 assert.match(h,/onclick="openReviewGrant/);
 assert.match(h,/onclick="archiveGrant/);
 assert.doesNotMatch(h,/onclick="openEditDraft/);
 const done=controls({created_by:'employee',actor:'manager',status:'approved',manager:true});
 assert.doesNotMatch(done,/onclick="openReviewGrant/);
});

test('inline application script parses and audited record actions remain available',()=>{
 const at=html.indexOf('function grantClassicRowActions(');
 const start=html.lastIndexOf('<script>',at),end=html.indexOf('</script>',at);
 assert.ok(start>=0&&end>start);
 assert.doesNotThrow(()=>new vm.Script(html.slice(start+8,end)));
 assert.match(html,/function archiveGrant\(grantId\)/);
 assert.match(html,/function discardDraftGrant\(grantId\)/);
 assert.match(html,/function openEditDraft\(grantId\)/);
});

test('iOS-inspired edit/delete/archive icons are distinct and touch-accessible',()=>{
 const own=controls();
 assert.match(own,/title="تعديل المنحة"/);
 assert.match(own,/title="إلغاء المسودة مع الاحتفاظ بسجل التدقيق"/);
 assert.match(own,/grant-icon-action edit/);
 assert.match(own,/grant-icon-action discard/);
 const manager=controls({status:'under_review',created_by:'other',actor:'manager',manager:true});
 assert.match(manager,/grant-icon-action archive/);
 assert.match(manager,/grant-icon-action review/);
 assert.match(patch,/border-radius:13px!important/);
 assert.match(patch,/height:44px!important/);
 assert.match(patch,/touch-action:manipulation/);
 assert.match(patch,/grant-icon-action\.discard\{\s*color:/);
 assert.match(patch,/grant-icon-action\.archive\{\s*color:/);
 assert.match(patch,/grant-icon-action\.edit\{\s*color:/);
});

test('both complete RTL grant tables place all real action controls in the LAST column',()=>{
  for (const source of [reg, decision]) {
    const headings=source.split('<thead><tr>')[1]?.split('</tr></thead>')[0];
    assert.ok(headings,'expected table header');
    const labels=headings.split('<th').slice(1).map(chunk=>chunk.split('>')[1]?.split('</th>')[0]);
    assert.equal(labels[0],'رقم المنحة');
    assert.equal(labels.at(-1),'الإجراءات');
  }
  assert.ok(reg.lastIndexOf('class="grant-classic-actions-cell"')>reg.lastIndexOf('completenessPercent(g)}%'));
  assert.ok(decision.lastIndexOf('class="grant-classic-actions-cell"')>decision.lastIndexOf('fmtDate(g.updated_at)}'));
  assert.ok(css.includes('--grant-row-odd:#f1f8f5'));
  assert.ok(css.includes('--grant-row-even:#e8f3ef'));
  assert.ok(css.includes('body.dark .grant-register-scroll'));
});
