/* SMART HSR municipal organization chart — read-only, same trusted institutional directory as User Center.
 * Phase 1: an independent, movable RTL tree. No employee, permission or account mutations. */
(() => {
  'use strict';
  if (window.__smartHsrMunicipalOrgChart) return;
  window.__smartHsrMunicipalOrgChart = true;
  const S = { generation:0, zoom:1, groups:[], employees:[], users:[], openAdmins:new Set(), openDepts:new Set(), selected:null, loaded:false, orgName:'', notice:'' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const key = (a,d) => JSON.stringify([a,d]);
  const title = role => ({ manager:'مدير البلدية',general_supervisor:'مشرف عام',department_head:'رئيس قسم',employee:'موظف' })[role] || role || 'موظف';
  const activeView = () => document.documentElement.dataset.smartHsrManagerView === 'orgChart';
  const mount = () => activeView() ? document.querySelector('.moc-mount') : null;
  function resolveName() {
    const holder = mount();
    return String(holder?.dataset.orgName || document.querySelector('[data-hsr-weather-org]')?.textContent || 'البلدية').trim();
  }
  function normalizeAdmin(value) {
    const name = String(value || '').trim();
    return ({'ادارة الاراضي والممتلكات':'إدارة الأراضي والممتلكات','دارة الحصر الميداني':'إدارة الحصر الميداني','رئيس قسم الأراضي والممتلكات':'إدارة الأراضي والممتلكات'})[name] || name || 'إدارة غير محددة';
  }
  function compile(directory) {
    const U = window.SmartHSRInstitutionalUC;
    const employees = (directory.employees || []).filter(e => e && e.employmentStatus !== 'inactive');
    const groups = new Map();
    employees.forEach(e => {
      const a = normalizeAdmin(e.administration);
      if (!groups.has(a)) groups.set(a, { name:a, people:[], departments:new Map() });
      const g = groups.get(a);
      g.people.push(e);
      if (String(e.department || '').trim()) {
        const d = String(e.department).trim();
        if (!g.departments.has(d)) g.departments.set(d, []);
        g.departments.get(d).push(e);
      }
    });
    S.groups = [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'ar'));
    S.employees = employees;
    S.users = directory.users || [];
    S.orgName = resolveName();
    S.loaded = true;
    S.notice = '';
    // Do not auto-expand all branches on first load: the tree remains compact.
    S.groups.forEach(g => { if (S.openAdmins.has(g.name)) return; });
  }
  const isHead = e => {
    const U = window.SmartHSRInstitutionalUC;
    return e?.institutionalRole === 'department_head' || U?.inst?.(e) === 'department_head' || /رئيس/.test(e?.jobTitle || '');
  };
  function headFor(people) { return people.find(isHead) || null; }
  function leader() {
    return S.users.find(u => ['manager','municipality_manager'].includes(u.institutionalRole) || ['manager','municipality_manager'].includes(u.role)) || S.employees.find(u => u.institutionalRole === 'manager') || null;
  }
  function renderRoot() {
    const l = leader();
    return '<div class="moc-root-wrap"><button type="button" class="moc-root" data-info="root" aria-label="تفاصيل قيادة البلدية"><span class="moc-root-icon">SH</span><span class="moc-root-copy"><small>SMART HSR · MUNICIPAL LEADERSHIP</small><b>'+esc(S.orgName)+'</b><span>القيادة البلدية · '+esc(l?.name || 'مدير البلدية')+'</span></span><span class="moc-root-chevron">←</span></button><span class="moc-trunk" aria-hidden="true"></span></div>';
  }
  function renderEmployee(e) {
    const t = e.jobTitle || title(e.institutionalRole);
    return '<button type="button" class="moc-person" data-person="'+esc(e.employeeId)+'"><span class="moc-avatar">'+esc((e.name || 'م').slice(0,2))+'</span><span><b>'+esc(e.name || 'موظف')+'</b><small>'+esc(t)+'</small></span><span class="moc-arrow">↗</span></button>';
  }
  function renderDept(g, d, staff, i) {
    const id = key(g.name,d), expanded = S.openDepts.has(id), head = headFor(staff);
    return '<div class="moc-dept"><div class="moc-dept-top"><button type="button" class="moc-dept-name" data-dept-info="'+esc(id)+'" title="تفاصيل المكتب الرقمي"><small>مكتب رقمي · '+String(i+1).padStart(2,'0')+'</small><b>'+esc(d)+'</b><span>'+staff.length+' موظفين'+(head?' · '+esc(head.name):'')+'</span></button><button class="moc-disclose" type="button" data-dept-toggle="'+esc(id)+'" aria-label="'+(expanded?'طي':'فتح')+' قسم '+esc(d)+'" aria-expanded="'+expanded+'">'+(expanded?'−':'+')+'</button></div>'+(expanded?'<div class="moc-staff">'+staff.map(renderEmployee).join('')+'</div>':'')+'</div>';
  }
  function renderAdmin(g,i) {
    const expanded = S.openAdmins.has(g.name);
    const lead = headFor(g.people);
    const depts = [...g.departments.entries()];
    const orphaned = g.people.filter(e=>!String(e.department || '').trim());
    return '<article class="moc-administration"><div class="moc-admin-header"><span class="moc-admin-index">'+String(i+1).padStart(2,'0')+'</span><button type="button" data-admin-info="'+esc(g.name)+'" class="moc-admin-details"><b>'+esc(g.name)+'</b><small>'+g.departments.size+' أقسام · '+g.people.length+' موظفين</small><span>'+esc(lead?.name || 'لم يُحدد مسؤول في بيانات الموظفين')+'</span></button><button type="button" class="moc-disclose moc-admin-toggle" data-admin-toggle="'+esc(g.name)+'" aria-label="'+(expanded?'طي':'فتح')+' '+esc(g.name)+'" aria-expanded="'+expanded+'">'+(expanded?'−':'+')+'</button></div>'+(expanded?'<div class="moc-admin-body">'+depts.map(([d,staff],j)=>renderDept(g,d,staff,j)).join('')+(orphaned.length?'<div class="moc-dept"><small class="moc-unassigned">موظفون دون قسم محدد</small><div class="moc-staff">'+orphaned.map(renderEmployee).join('')+'</div></div>':'')+'</div>':'')+'</article>';
  }
  function chart() {
    const departments = S.groups.reduce((n,g)=>n+g.departments.size,0);
    const warning = !S.groups.length ? '<div class="moc-empty">لا توجد إدارات مسجلة ضمن بيانات الموظفين الحالية. لم نُنشئ بيانات افتراضية.</div>' : '';
    return '<section class="moc-screen" dir="rtl" aria-label="الهيكل الإداري"><header class="moc-header"><div><span class="moc-kicker">SMART HSR · ORGANIZATION MAP</span><h1>الهيكل الإداري</h1><p>الشجرة التفاعلية الرسمية للإدارات والأقسام والمكاتب الرقمية · عرض فقط من سجل البلدية المعتمد</p></div><span class="moc-status">مرتبطة بمركز المستخدمين</span></header>'+
    '<div class="moc-summary"><span><small>الإدارات</small><b>'+S.groups.length+'</b></span><span><small>الأقسام</small><b>'+departments+'</b></span><span><small>الموظفون</small><b>'+S.employees.length+'</b></span><span><small>المكاتب السحابية</small><b class="moc-future">مرحلة لاحقة</b></span></div>'+
    '<div class="moc-toolbar"><span class="moc-toolbar-label">اسحب لتحريك الشجرة · اضغط على العقدة للتفاصيل</span><div class="moc-actions"><button type="button" data-expand="all">توسيع</button><button type="button" data-expand="none">طي الكل</button><button type="button" data-zoom="-1" aria-label="تصغير">−</button><output aria-label="مستوى التكبير">'+Math.round(S.zoom*100)+'%</output><button type="button" data-zoom="1" aria-label="تكبير">+</button><button type="button" data-zoom="reset">إعادة ضبط</button><button type="button" data-reload>تحديث البيانات</button></div></div>'+
    '<div class="moc-stage" tabindex="0" aria-label="شجرة الهيكل الإداري، اسحب لتحريكها"><div class="moc-tree" style="zoom:'+S.zoom+'">'+renderRoot()+('<div class="moc-branches">'+S.groups.map(renderAdmin).join('')+'</div>')+warning+'</div></div>'+
    '<div class="moc-footnote">المكاتب الرقمية تمثل الأقسام الحالية. تشغيل المكاتب السحابية مؤجل، ولا يتغير أي تكليف أو صلاحية من هذه الشاشة.</div><div class="moc-inspector-layer" hidden></div></section>';
  }
  function inspector(type, identifier) {
    const U = window.SmartHSRInstitutionalUC;
    let heading='', kicker='', rows=[];
    if(type === 'root') {
      const l = leader();
      kicker = 'القيادة البلدية'; heading = S.orgName;
      rows = [['المسؤول',l?.name || 'الاسم غير متاح في الدليل'],['المسمى','رئيس / مدير البلدية'],['الإدارات',S.groups.length],['الموظفون',S.employees.length]];
    } else if (type === 'admin') {
      const g = S.groups.find(x=>x.name===identifier); if(!g) return;
      heading=g.name; kicker='إدارة بلدية'; const h=headFor(g.people);
      rows=[['الرئيس / المسؤول',h?.name || 'لم يُحدد في بيانات الموظفين'],['الأقسام',g.departments.size],['الموظفون',g.people.length],['المكتب الرقمي','عرض الأقسام والتسكين']];
    } else if(type === 'dept') {
      let parsed;try{parsed=JSON.parse(identifier)}catch{return}
      const g=S.groups.find(x=>x.name===parsed[0]);const staff=g?.departments.get(parsed[1]);if(!staff)return;
      heading=parsed[1];kicker='مكتب رقمي · قسم';const head=headFor(staff);
      rows=[['الإدارة',g.name],['رئيس القسم',head?.name || 'لم يُحدد في بيانات الموظفين'],['الموظفون',staff.length],['المكتب السحابي','مؤجل للمرحلة القادمة']];
    } else if(type === 'person') {
      const e=S.employees.find(x=>String(x.employeeId)===String(identifier));if(!e)return;
      kicker='الملف الوظيفي · للقراءة فقط';heading=e.name || 'موظف';
      rows=[['الرقم الوظيفي',e.employeeRef || '—'],['الإدارة',normalizeAdmin(e.administration)],['القسم',e.department || 'غير محدد'],['المسمى',e.jobTitle || title(U.inst(e))],['الدور المؤسسي',title(e.institutionalRole || U.inst(e))],['حالة الموظف',e.employmentStatus==='inactive'?'مؤرشف':'موجود بالسجل']];
    }
    const layer=mount()?.querySelector('.moc-inspector-layer');if(!layer)return;
    layer.hidden=false;layer.innerHTML='<div class="moc-inspector-backdrop" data-close></div><aside class="moc-inspector" role="dialog" aria-modal="true" aria-label="تفاصيل '+esc(heading)+'"><div class="moc-inspector-top"><small>'+esc(kicker)+'</small><button type="button" data-close aria-label="إغلاق التفاصيل">×</button></div><h2>'+esc(heading)+'</h2><dl>'+rows.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl><p>هذه تفاصيل مستمدة من سجل المستخدمين، ولا تغير صلاحيات أو سجلات.</p></aside>';
    layer.querySelector('button[data-close]')?.focus();
  }
  function attach(root) {
    const stage=root.querySelector('.moc-stage');
    root.querySelectorAll('[data-info]').forEach(b=>b.addEventListener('click',()=>inspector('root')));
    root.querySelectorAll('[data-admin-info]').forEach(b=>b.addEventListener('click',()=>inspector('admin',b.dataset.adminInfo)));
    root.querySelectorAll('[data-dept-info]').forEach(b=>b.addEventListener('click',()=>inspector('dept',b.dataset.deptInfo)));
    root.querySelectorAll('[data-person]').forEach(b=>b.addEventListener('click',()=>inspector('person',b.dataset.person)));
    root.querySelectorAll('[data-admin-toggle]').forEach(b=>b.addEventListener('click',()=>{const value=b.dataset.adminToggle;S.openAdmins.has(value)?S.openAdmins.delete(value):S.openAdmins.add(value);paint(true)}));
    root.querySelectorAll('[data-dept-toggle]').forEach(b=>b.addEventListener('click',()=>{const value=b.dataset.deptToggle;S.openDepts.has(value)?S.openDepts.delete(value):S.openDepts.add(value);paint(true)}));
    root.querySelectorAll('[data-expand]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.expand==='none'){S.openAdmins.clear();S.openDepts.clear()}else{S.groups.forEach(g=>{S.openAdmins.add(g.name);g.departments.forEach((_,d)=>S.openDepts.add(key(g.name,d)))})}paint(true)}));
    root.querySelectorAll('[data-zoom]').forEach(b=>b.addEventListener('click',()=>{S.zoom=b.dataset.zoom==='reset'?1:Math.max(.65,Math.min(1.5,Math.round((S.zoom+Number(b.dataset.zoom)*.1)*100)/100));paint(true)}));
    root.querySelector('[data-reload]')?.addEventListener('click',()=>load(true));
    root.querySelector('.moc-inspector-layer')?.addEventListener('click',e=>{if(e.target.closest('[data-close]')){root.querySelector('.moc-inspector-layer').hidden=true;root.querySelector('.moc-inspector-layer').innerHTML='';root.querySelector('.moc-stage')?.focus()}});
    if (stage) {
      let drag=null;
      stage.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;drag={x:e.clientX,y:e.clientY,left:stage.scrollLeft,top:stage.scrollTop};stage.setPointerCapture(e.pointerId);stage.classList.add('is-dragging')});
      stage.addEventListener('pointermove',e=>{if(!drag)return;stage.scrollLeft=drag.left+(drag.x-e.clientX);stage.scrollTop=drag.top+(drag.y-e.clientY)});
      const stop=()=>{drag=null;stage.classList.remove('is-dragging')};
      stage.addEventListener('pointerup',stop);stage.addEventListener('pointercancel',stop);
    }
  }
  function paint(preserve=false) {
    const root=mount();if(!root)return;
    const oldStage=root.querySelector('.moc-stage');
    const scroll=preserve&&oldStage?{left:oldStage.scrollLeft,top:oldStage.scrollTop}:null;
    root.innerHTML=chart();attach(root);
    const stage=root.querySelector('.moc-stage');
    if(stage){
      if(scroll){stage.scrollLeft=scroll.left;stage.scrollTop=scroll.top}
      else requestAnimationFrame(()=>{if(stage.isConnected)stage.scrollLeft=-Math.max(0,(stage.scrollWidth-stage.clientWidth)/2)});
    }
  }
  async function load(force=false) {
    const root=mount();if(!root)return;
    const generation=++S.generation;
    root.setAttribute('aria-busy','true');
    root.innerHTML='<div class="moc-loading" role="status"><span class="moc-spinner"></span><b>جاري تحميل الهيكل الإداري</b><small>نقرأ البيانات المعتمدة من مركز المستخدمين دون تعديلها.</small></div>';
    try {
      // Same authenticated, organization-scoped API used by User Center; no alternative data store.
      const U=window.SmartHSRInstitutionalUC;
      if(!U?.dir) throw new Error('directory_not_ready');
      const directory=await U.dir(force);
      if(generation!==S.generation||!mount())return;
      compile(directory);
      paint();
    } catch (error) {
      if(generation!==S.generation||!mount())return;
      root.innerHTML='<div class="moc-error" role="alert"><h2>تعذر عرض الهيكل الإداري</h2><p>'+esc(error?.reason==='request_timeout'?'انتهت مهلة الاتصال، ولم تتغير أي بيانات.':'تعذر تحميل دليل الموظفين المعتمد. لا نعرض أرقامًا صفرية بديلة عند فشل الاتصال.')+'</p><button type="button" data-retry>إعادة المحاولة</button></div>';
      root.querySelector('[data-retry]')?.addEventListener('click',()=>load(true));
    } finally {if(generation===S.generation)mount()?.removeAttribute('aria-busy')}
  }
  function activate() {
    if(!activeView()){S.generation++;return}
    const go=()=>{if(!mount())return;if(S.loaded)paint();else load()};
    if(window.SmartHSRInstitutionalUC?.dir) requestAnimationFrame(go);
    else window.addEventListener('smart-hsr:user-center-ready',()=>requestAnimationFrame(go),{once:true});
  }
  window.addEventListener('smart-hsr:manager-view-change',()=>requestAnimationFrame(activate));
  document.addEventListener('keydown',e=>{if(e.key!=='Escape'||!activeView())return;const layer=mount()?.querySelector('.moc-inspector-layer');if(layer&&!layer.hidden){layer.hidden=true;layer.innerHTML=''}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',activate,{once:true});else activate();
})();
