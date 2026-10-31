'use strict';
// SMART HSR synthetic-only, read-only Lands assistant regression suite.
// No tokens, Firebase, real tenant datasets, external AI, HTTP or browsers.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const src=fs.readFileSync(path.resolve(__dirname,'../lands/index.html'),'utf8');
function pick(from,to) {
  const start=src.indexOf(from),stop=src.indexOf(to,start+from.length);
  assert.ok(start>=0&&stop>start,'Missing expected code boundary: '+from);
  return src.slice(start,stop);
}
const rules=pick('const AutomationEngine = {','// Read-only grounded Lands answers');
const grounded=pick('function answerGroundedLandsQuestion(raw,scope) {','function aiAnswer(action, scope) {');
const answering=pick('function aiAnswer(action, scope) {','function submitAiQuestion(rawText, presetAction) {');
const helper=pick('function aiAttentionRowText(item) {','function renderAiAttention() {');
const attentionView=pick('function renderAiAttention() {','function attentionShowMissing(number) {');
const daily=pick('function createDailyBriefing() {','function openAiPanel() {');
const fake=(id,status='under_review',pct=100,missing=[])=>({
  id,status,archived:false,parcel_id:null,
  completeness:{status:pct===100?'complete':'incomplete',missing,percentage:pct},
  allocation_decision:{number:'DEMO-2026'},beneficiary:{name:'SYNTHETIC_BENEFICIARY_'+id}
});
function run(items,{role='lands_employee',storedIds=[]}={}) {
  const all=[...items];
  const storage=new Set(storedIds);
  const context={
    grants:all,
    session:{role},
    AXIS_LABELS:{identity:'بيانات المستفيد',decision:'قرار التخصيص'},
    TWIN_LAYERS:[],twinLayerFilter:'all',reviewModeDecisions:[],
    domains:{plans:[],parcels:[]},
    mod:{canReviewGrant(x){return x==='lands_department_manager';},
      isGeoreferenced(){return false;}},
    decisionGroups(){return [{number:'DEMO-2026',grants:all}];},
    documentsForGrant(id){return storage.has(id)?[{id:'synthetic-metadata',record_id:id}]:[];},
    completenessPercent(g){return g.completeness.percentage;},
    parcelById(){return null;},
    setView(){},setTwinLayerFilter(){},openDecision(){},openTwinForDecision(){},
    selectParcelSlot(){},setTwinPlanFilter(){},
    document:{getElementById(){return null;}},
    icon(){return ''},esc(s){return String(s);}
  };
  vm.createContext(context);
  vm.runInContext(rules+'\n'+grounded+'\n'+answering+'\n'+helper,context);
  return {ctx:context,eval:(expression)=>vm.runInContext(expression,context)};
}
function messages(r) {
  return {
    answer:(action,scope)=>r.ctx.aiAnswer(action,scope),
    scope:{kind:'overview',grants:r.ctx.grants}
  };
}

test('review-only complete grant does not trigger fake missing or overdue claims',()=>{
  const r=run([fake('reviewed')]);
  const item=r.eval('AutomationEngine.attentionItems()[0]');
  assert.equal(item.review,1);
  assert.equal(item.needsWork,0);
  assert.equal(item.avgPercent,100);
  const label=r.ctx.aiAttentionRowText(item);
  assert.match(label,/1 تحت المراجعة/);
  assert.doesNotMatch(label,/0 تحتاج|متأخر|اعتماد/);
  const out=messages(r).answer('map.worst',messages(r).scope);
  assert.match(out,/تحت المراجعة/);
  assert.doesNotMatch(out,/0 يحتاج استكمال|متأخر/);
});

test('incomplete and review counts use mutually exclusive categories and do not invent deadlines',()=>{
  const r=run([fake('review','under_review',100),fake('incomplete','draft',40,['identity'])],{role:'lands_department_manager'});
  const item=r.eval('AutomationEngine.attentionItems()[0]');
  assert.equal(item.needsWork,1);assert.equal(item.review,1);
  assert.match(r.ctx.aiAttentionRowText(item),/1 تحتاج استكمال بيانات، 1 تحت المراجعة/);
  const overdue=messages(r).answer('overview.late',messages(r).scope);
  assert.match(overdue,/تستلزم متابعة لاستكمال البيانات/);
  assert.match(overdue,/لا تتوفر هنا مدة تأخير مثبتة/);
  assert.doesNotMatch(overdue,/ملفات متأخرة:/);
  const response=messages(r).answer('decision.overdue',{kind:'decision',number:'DEMO-2026',grants:r.ctx.grants});
  assert.match(response,/لا أصفها بمتأخرة زمنيًا دون موعد نهائي موثّق/);
  assert.doesNotMatch(response,/SYNTHETIC_BENEFICIARY/);
});

test('assistant priority never widens a restricted scope to all grants or exposes beneficiary names',()=>{
  const r=run([fake('allowed'),fake('other')],{storedIds:['allowed']});
  const result=messages(r).answer('overview.priority',{kind:'overview',grants:[r.ctx.grants[0]]});
  assert.match(result,/لا توجد منح بلا قيود مستندات/);
  assert.doesNotMatch(result,/other|SYNTHETIC_BENEFICIARY|أهم الملفات/);
  const scoped=messages(r).answer('overview.priority',{kind:'overview',grants:[r.ctx.grants[1]]});
  assert.match(scoped,/other/);
  assert.doesNotMatch(scoped,/allowed|SYNTHETIC_BENEFICIARY/);
});

test('document answers explicitly distinguish metadata records from actual uploaded bytes',()=>{
  const r=run([fake('withDoc'),fake('withoutDoc')],{storedIds:['withDoc']});
  const out=r.ctx.answerGroundedLandsQuestion('المستندات',{kind:'overview',grants:r.ctx.grants});
  assert.match(out,/بلا سجلات مرفقات/);
  assert.match(out,/1 من 2/);
  assert.match(out,/لا يثبت وجود الملف المخزن أو صلاحيته/);
  const priority=messages(r).answer('overview.priority',messages(r).scope);
  assert.match(priority,/وجود قيد مستند لا يثبت اكتمال رفع الملف/);
});

test('AI attention summary and daily briefing distinguish review from missing data',()=>{
  assert.match(attentionView,/aiAttentionRowText\(item\)/);
  assert.doesNotMatch(attentionView,/\$\{item\.needsWork\} يحتاج استكمال/);
  assert.doesNotMatch(attentionView,/item\.overdueCount.*متأخر/);
  assert.match(daily,/aiAttentionRowText\(i\)/);
  assert.match(daily,/لا يتضمن هذا قياس التأخر الزمني أو اعتماد المنح/);
});

test('executive report still requires elevated role and there is no remote AI request',()=>{
  const r=run([fake('one')],{role:'lands_employee'});
  assert.match(messages(r).answer('report.generate',messages(r).scope),/صلاحية المراجعة/);
  assert.match(src,/لا يوجد نموذج لغوي خارجي مفعّل في هذه النسخة/);
  const agent=pick('function submitAiQuestion(rawText, presetAction) {','// ---- future real-AI integration boundary ----');
  assert.doesNotMatch(agent,/\bfetch\s*\(|XMLHttpRequest|storage|firebase|googleapis|anthropic/i);
  assert.match(agent,/if \(!text \|\| !session\) return/);
});

test('structural identity stays untouched: frozen RTL/sidebar and official logo are not changed by assistant patches',()=>{
  assert.match(src,/<aside class="side" id="landsSidebar"/);
  assert.match(src,/src="\/smart-hsr-mark\.svg"/);
  assert.match(src,/id="headerMunicipalityName"/);
  assert.match(src,/id="aiPanel"/);
  assert.match(src,/function resetLandsAssistantContext\(\)/);
  assert.match(src,/const AutomationEngine = \{/);
});
