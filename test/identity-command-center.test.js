'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function harness(directory){
  const controls=new Map();
  const node=()=>({dataset:{},classList:{add(){},remove(){}},setAttribute(){},append(){},appendChild(){},addEventListener(){},focus(){},matches(){return false;},querySelector(){return null;},querySelectorAll(){return []},isConnected:true});
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
  const views=['registry','hierarchy','health'].map(view=>Object.assign(node(),{dataset:{view}}));
  surface.querySelectorAll=selector=>selector==='[data-person]'?[person]:selector==='[data-view]'?views:[];
  window.SmartHSRInstitutionalUC.commandCenter.render(host,surface,directory,async()=>{});
  return {surface,person,views,window};
}
const employee={employeeId:'e1',name:'<img src=x onerror=alert(1)>',employeeRef:'REF-1',administration:'إدارة الحصر الميداني',department:'قسم الحصر',institutionalRole:'department_head',employmentStatus:'active',authUid:'u1',accountStatus:'ACTIVE',products:{field:{enabled:true,role:'inspector'}}};
const user={uid:'u1',organizationId:'org-test',active:true,role:'inspector',institutionalRole:'department_head',administration:employee.administration,department:employee.department};
test('registry is default, has six columns, escapes employee content, and has no empty inspector',()=>{
  const h=harness({org:'org-test',employees:[employee],users:[user]});
  assert.equal((h.surface.innerHTML.match(/<th>/g)||[]).length,6);
  assert.match(h.surface.innerHTML,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(h.surface.innerHTML,/<aside class="icc-inspector"/);
  assert.doesNotMatch(h.surface.innerHTML,/ucv2-kpis/);
});
test('selection renders inspector using shared authorization, with unknown sessions explicitly unavailable',()=>{
  const h=harness({org:'org-test',employees:[employee],users:[user]});h.person.onclick();
  assert.match(h.surface.innerHTML,/<aside class="icc-inspector"/);
  assert.match(h.surface.innerHTML,/✓ الحصر الميداني الذكي/);
  assert.match(h.surface.innerHTML,/Session —/);
  assert.doesNotMatch(h.surface.innerHTML,/Session ✓/);
});
test('account-health exceptions exclude healthy disabled-service sync metadata',()=>{
  const h=harness({org:'org-test',employees:[employee],users:[{...user,landsAccess:{enabled:false,syncStatus:'pending_trusted_sync'}}]});h.views[2].onclick();
  assert.match(h.surface.innerHTML,/لا توجد استثناءات في السجلات المتاحة/);
});
test('enabled Lands pending state is visible as an exception; hierarchy retains actionable employee nodes',()=>{
  const h=harness({org:'org-test',employees:[employee],users:[{...user,landsAccess:{enabled:true,role:'lands_employee',syncStatus:'pending_trusted_sync'}}]});h.views[2].onclick();
  assert.match(h.surface.innerHTML,/مزامنة الأراضي: pending_trusted_sync/);
  h.views[1].onclick();assert.match(h.surface.innerHTML,/قسم الحصر/);assert.match(h.surface.innerHTML,/data-person="e1"/);
});
test('new surface is loaded after shared resolver and delegates before legacy presentation',()=>{
  const loader=fs.readFileSync(path.join(root,'manager-dashboard-format.js'),'utf8');
  assert.ok(loader.indexOf("'./workspace-access.js'")<loader.indexOf("'./manager-identity-command-center.js'"));
  assert.match(fs.readFileSync(path.join(root,'manager-phase11d-user-center-enhancements.js'),'utf8'),/U\.commandCenter\.render\(root, app, directory/);
});


test("center remains integrated and only task sheets isolate the shell",()=>{const source=fs.readFileSync(path.join(root,"manager-identity-command-center.js"),"utf8");assert.match(source,/setAttribute\('role','region'\)/);assert.doesNotMatch(source,/setAttribute\('aria-modal','true'\)/);assert.doesNotMatch(source,/backdrop=document.createElement/);assert.match(source,/const open=!!document.querySelector\('.iuc'\)/);});


test('registry uses administration-first enterprise columns',()=>{
  const h=harness({org:'org-test',employees:[employee],users:[user]});
  assert.match(h.surface.innerHTML,/<th>الإدارة<\/th><th>القسم<\/th><th>الدور \/ المسمى<\/th><th>الحساب<\/th>/);
  assert.doesNotMatch(h.surface.innerHTML,/<th>الخدمات<\/th>/);
  assert.match(h.surface.innerHTML,/IDENTITY COMMAND CENTER/);
});
