'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function harness(directory){
  const controls=new Map();
  const node=()=>({dataset:{},classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},append(){},appendChild(){},addEventListener(){},focus(){},matches(){return false;},querySelector(){return null;},querySelectorAll(){return []},isConnected:true});
  const body=node();body.children=[];
  const document={body,head:node(),documentElement:{dataset:{theme:'dark',smartHsrManagerView:'users'}},activeElement:null,addEventListener(){},getElementById(){return null;},createElement:node,querySelector(){return null;},querySelectorAll(){return []}};
  const window={addEventListener(){},SmartHSRWorkspaceAccess:require('../workspace-access.js')};
  const context=vm.createContext({window,document,MutationObserver:class{observe(){}},queueMicrotask(){},setTimeout,clearTimeout,AbortController,console});
  vm.runInContext(fs.readFileSync(path.join(root,'manager-phase11c-user-center-core.js'),'utf8'),context);
  window.SmartHSRInstitutionalUC.stale=()=>{};
  vm.runInContext(fs.readFileSync(path.join(root,'manager-identity-command-center.js'),'utf8'),context);
  const host=node();host.parentElement=body;body.children=[host];
  const surface=node();surface.querySelector=selector=>{if(!controls.has(selector))controls.set(selector,node());return controls.get(selector);};
  const person=node();person.dataset.person='e1';
  const views=['registry','hierarchy'].map(view=>Object.assign(node(),{dataset:{view}}));
  surface.querySelectorAll=selector=>selector==='[data-person]'?[person]:selector==='[data-view]'?views:[];
  window.SmartHSRInstitutionalUC.commandCenter.render(host,surface,directory,async()=>{});
  return {surface,person,views,window};
}
const employee={employeeId:'e1',name:'<img src=x onerror=alert(1)>',employeeRef:'REF-1',administration:'إدارة الحصر الميداني',department:'قسم الحصر',institutionalRole:'department_head',employmentStatus:'active',authUid:'u1',accountStatus:'ACTIVE',products:{field:{enabled:true,role:'inspector'}}};
const user={uid:'u1',organizationId:'org-test',active:true,role:'inspector',institutionalRole:'department_head',administration:employee.administration,department:employee.department};

test('registry is default, premium five-column table, and escapes employee content',()=>{
  const h=harness({org:'org-test',employees:[employee],users:[user]});
  assert.equal((h.surface.innerHTML.match(/<th>/g)||[]).length,5);
  assert.match(h.surface.innerHTML,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(h.surface.innerHTML,/icc-smart-cards/);
  assert.match(h.surface.innerHTML,/فلترة متقدمة/);
  assert.doesNotMatch(h.surface.innerHTML,/<th>الخدمات<\/th>/);
  assert.doesNotMatch(h.surface.innerHTML,/صحة الحسابات/);
});

test('registry uses assignment-first enterprise columns',()=>{
  const h=harness({org:'org-test',employees:[employee],users:[user]});
  assert.match(h.surface.innerHTML,/<th>الموظف<\/th><th>التعيين المؤسسي<\/th><th>الدور \/ المسمى<\/th><th>الحساب<\/th><th>الإجراءات<\/th>/);
  assert.match(h.surface.innerHTML,/SMART HSR · USER CENTER/);
});

test('hierarchy remains available and employee nodes stay actionable',()=>{
  const h=harness({org:'org-test',employees:[employee],users:[user]});
  h.views[1].onclick();
  assert.match(h.surface.innerHTML,/الهيكل المؤسسي/);
  assert.match(h.surface.innerHTML,/قسم الحصر/);
  assert.match(h.surface.innerHTML,/data-person="e1"/);
});

test('employee profile, add/edit, security and sensitive actions use centered task sheets',()=>{
  const source=fs.readFileSync(path.join(root,'manager-identity-command-center.js'),'utf8');
  assert.match(source,/openProfile\(e\)/);
  assert.match(source,/U\.shell\('iuc-profile-v3'/);
  assert.match(source,/openEditor\(e\)/);
  assert.match(source,/openEditor\(e,'account'\)/);
  assert.match(source,/classList\.add\('icc-sheet'\)/);
  assert.match(source,/setAttribute\('role','region'\)/);
  assert.doesNotMatch(source,/setAttribute\('aria-modal','true'\)/);
});

test('service names are filters/access vocabulary, not registry columns',()=>{
  const source=fs.readFileSync(path.join(root,'manager-identity-command-center.js'),'utf8');
  assert.match(source,/select\('نطاق العمل','service'/);
  assert.match(source,/mobility:'حركة السير'/);
  assert.doesNotMatch(source,/\['الموظف','الإدارة','القسم','الدور \/ المسمى','الحساب','الإجراءات'\]/);
});

test('new surface loads after shared resolver and delegates before legacy fallback',()=>{
  const loader=fs.readFileSync(path.join(root,'manager-dashboard-format.js'),'utf8');
  assert.ok(loader.indexOf("'./workspace-access.js'")<loader.indexOf("'./manager-identity-command-center.js'"));
  assert.match(fs.readFileSync(path.join(root,'manager-phase11d-user-center-enhancements.js'),'utf8'),/U\.commandCenter\.render\(root, app, directory/);
});


test('v4 smart cards are actionable presentation filters',()=>{
  const source=fs.readFileSync(path.join(root,'manager-identity-command-center.js'),'utf8');
  assert.match(source,/data-smart="all"/);
  assert.match(source,/data-smart="active"/);
  assert.match(source,/data-smart="action"/);
  assert.match(source,/state\.smartFilter/);
});

test('v4 hierarchy exposes organizational intelligence and spatial human twin',()=>{
  const source=fs.readFileSync(path.join(root,'manager-identity-command-center.js'),'utf8');
  assert.match(source,/ORGANIZATIONAL INTELLIGENCE/);
  assert.match(source,/icc-org-canvas/);
  assert.match(source,/icc-spatial-v4/);
  assert.match(source,/Human Digital Twin/);
  assert.match(source,/data-mode="hierarchy"/);
  assert.match(source,/data-mode="spatial"/);
});

test('edit workflow shows before and after institutional assignment preview',()=>{
  const source=fs.readFileSync(path.join(root,'manager-identity-command-center.js'),'utf8');
  assert.match(source,/icc-assignment-preview/);
  assert.match(source,/التعيين الحالي/);
  assert.match(source,/بعد الحفظ/);
  assert.match(source,/تحديث البيانات أو التعيين المؤسسي مع معاينة الأثر قبل الحفظ/);
});


test('v5 header keeps SMART HSR as restrained brand signature and removes duplicate user-center english label',()=>{
  const source=fs.readFileSync(path.join(root,'manager-identity-command-center.js'),'utf8');
  assert.match(source,/icc-brand-wordmark/);
  assert.match(source,/>SMART<\/span><b>HSR<\/b>/);
  assert.doesNotMatch(source,/SMART HSR · USER CENTER/);
  assert.match(source,/إدارة الهوية والتعيينات المؤسسية/);
});

test('v5 hierarchy includes a digital building drill-down mode',()=>{
  const source=fs.readFileSync(path.join(root,'manager-identity-command-center.js'),'utf8');
  assert.match(source,/data-mode="building"/);
  assert.match(source,/icc-building/);
  assert.match(source,/المقر الرقمي للبلدية/);
  assert.match(source,/كل إدارة طابق رقمي، وكل قسم مكتب تشغيلي/);
  assert.match(source,/icc-floor-offices/);
});

test('v5 organization twin keeps administrative and spatial modes',()=>{
  const source=fs.readFileSync(path.join(root,'manager-identity-command-center.js'),'utf8');
  assert.match(source,/data-mode="hierarchy"/);
  assert.match(source,/data-mode="spatial"/);
  assert.match(source,/التوأم المؤسسي الذكي/);
  assert.match(source,/الهيكل الإداري/);
});
