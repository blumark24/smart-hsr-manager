/* Presentation owner for the municipal identity window. All mutations continue
 * through InstitutionalUC; the shared workspace resolver remains authoritative. */
(() => {
  'use strict';
  const U = window.SmartHSRInstitutionalUC;
  if (!U || U.commandCenter) return;
  const esc = U.esc;
  const services = {field:'الحصر الميداني',lands:'الأراضي والممتلكات',mobility:'حركة السير'};
  const roles = {manager:'مدير البلدية',general_supervisor:'مشرف عام',department_head:'رئيس قسم',employee:'موظف'};
  const state = {view:'registry',mode:'hierarchy',selected:null,search:'',admin:'',role:'',service:'',status:'',smartFilter:'all',page:1,zoom:1};
  let current, refresh, host, surface, priorFocus, backdrop;
  const isolated = new Map();
  const account = e => !e.authUid ? 'بدون حساب' : e.accountStatus === 'SUSPENDED' ? 'معطل' : e.accountStatus === 'PENDING_ACTIVATION' ? 'تحتاج مراجعة' : e.employmentStatus === 'inactive' ? 'مؤرشف' : 'نشط';
  const userFor = e => current.users.find(u => u.uid === e.authUid);
  function unlinkedAccounts(){return current.users.filter(u=>!current.employees.some(e=>e.authUid===u.uid));}
  function accountInspector(u){return `<aside class="icc-inspector" aria-label="ملف الموظف"><div class="icc-between"><h2>${esc(u.name||u.email||u.uid)}</h2>${button('×','data-dismiss aria-label="إغلاق ملف الموظف"')}</div><p class="icc-muted">حساب غير مرتبط بسجل موظف</p><dl>${[['المؤسسة',u.organizationId],['البريد',u.email],['الدور',roles[u.institutionalRole]||u.role],['الإدارة',u.administration],['القسم',u.department]].map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v||'—')}</dd></div>`).join('')}</dl><h3>مساحات العمل المصرح بها</h3>${window.SmartHSRWorkspaceAccess.resolveWorkspaces(u).workspaces.map(w=>`<p>✓ ${esc(w.title)}</p>`).join('')||'<p>لا توجد مساحة مؤكدة.</p>'}<p class="note">تعديل الموظف يتطلب سجلًا مؤسسيًا مرتبطًا؛ لا يتم إنشاء سجل أو ربطه تلقائيًا.</p></aside>`;}
  const enabled = e => Object.keys(services).filter(k => U.state(e,k).en);
  function exceptions(e) {
    const issues = [];
    if (account(e) !== 'نشط') issues.push(account(e));
    if (e.authUid && !userFor(e)) issues.push('غير مرتبط بسجل حساب');
    if (!e.administration || !e.department) issues.push('تعيين مؤسسي غير مكتمل');
    const sync = userFor(e)?.landsAccess?.syncStatus;
    if (userFor(e)?.landsAccess?.enabled && sync && !['synced','success','ready'].includes(sync)) issues.push('مزامنة الأراضي: '+sync);
    return issues;
  }
  function resolution(e, products) {
    if (!products) return window.SmartHSRWorkspaceAccess.resolveWorkspaces(userFor(e) || {organizationId:current.org,active:false});
    // Mirror the existing U.sync payload for a proposed selection, without I/O.
    const role = products.field.enabled ? products.field.role : products.mobility.enabled ? products.mobility.role : products.lands.enabled ? products.lands.role : 'employee';
    return window.SmartHSRWorkspaceAccess.resolveWorkspaces({organizationId:current.org,active:true,institutionalRole:e.institutionalRole,administration:e.administration,department:e.department,role,landsAccess:products.lands,mobilityAccess:products.mobility,vehicleEligible:products.vehicleEligible});
  }
  const button = (label,attrs='') => `<button type="button" ${attrs}>${label}</button>`;
  const chips = e => enabled(e).map(k=>`<span class="icc-chip ${k}">${services[k]}</span>`).join(' ') || '<span class="icc-muted">—</span>';
  function select(label,key,values) {
    return `<label class="icc-filter"><span>${label}</span><select data-filter="${key}" aria-label="${label}"><option value="">الكل</option>${values.map(v=>`<option value="${esc(v[0])}" ${state[key]===v[0]?'selected':''}>${esc(v[1])}</option>`).join('')}</select></label>`;
  }
  function inspector(e) {
    const r=resolution(e), issues=exceptions(e), sync=userFor(e)?.landsAccess?.enabled?userFor(e)?.landsAccess?.syncStatus:null;
    return `<aside class="icc-inspector" aria-label="ملف الموظف"><div class="icc-between"><span class="icc-muted">USER INSPECTOR</span>${button('×','data-dismiss aria-label="إغلاق ملف الموظف"')}</div><div class="icc-person"><span class="icc-avatar">${esc((e.name||'م')[0])}</span><div><h2>${esc(e.name)}</h2><span>${esc(e.employeeRef||'—')} · ${esc(e.jobTitle||roles[U.inst(e)])}</span></div></div><div class="icc-health"><span class="icc-ring">${issues.length?'!':'✓'}</span><div><b>صحة الهوية التشغيلية</b><p>${issues.length?esc(issues.join(' · ')):'لا توجد استثناءات في البيانات المتاحة'}</p></div></div><div class="icc-pulse" dir="ltr">Identity ${e.department?'✓':'⚠'} · Access ${r.workspaces.length?'✓':'⚠'} · Account ${account(e)==='نشط'?'✓':'⚠'} · Session — · Sync ${sync?esc(sync):'—'}</div><p class="icc-muted">حالة الجلسة غير متاحة في السجل الحالي.</p><dl>${[['المؤسسة',current.org],['الإدارة',e.administration],['القسم',e.department],['الدور',roles[U.inst(e)]],['الحساب',account(e)],['بريد الدخول',userFor(e)?.email||e.email]].map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v||'—')}</dd></div>`).join('')}</dl><h3>مساحات العمل المصرح بها</h3>${r.workspaces.length?r.workspaces.map(w=>`<p>✓ ${esc(w.title)}</p>`).join(''):'<p class="icc-muted">لا توجد مساحة مؤكدة من سجل الحساب.</p>'}<div class="icc-actions">${button('تعديل الموظف','data-edit class="primary"')}${button('الحساب والأمان','data-security') }<details><summary aria-label="إجراءات الموظف">⋯</summary>${e.authUid?button('تعطيل حساب الدخول','data-sensitive="disable"')+button('إنهاء الجلسات','data-sensitive="sessions"'):''}${button('حذف / أرشفة','data-sensitive="remove"')}</details></div></aside>`;
  }
  function openProfile(e) {
    if (!e) return;
    const linked=userFor(e), r=resolution(e), issues=exceptions(e);
    const body=`<div class="icc-profile-hero">
      <span class="icc-profile-avatar">${esc((e.name||'م').slice(0,2))}</span>
      <div><b>${esc(e.name||'—')}</b><p>${esc(e.employeeRef||'—')} · ${esc(e.jobTitle||roles[U.inst(e)]||'—')}</p></div>
      <span class="icc-account ${account(e)==='نشط'?'is-active':account(e)==='تحتاج مراجعة'?'is-review':'is-muted'}"><i></i>${account(e)}</span>
    </div>
    <div class="icc-profile-grid">
      <div><span>الإدارة</span><b>${esc(e.administration||'—')}</b></div>
      <div><span>القسم</span><b>${esc(e.department||'—')}</b></div>
      <div><span>الدور المؤسسي</span><b>${esc(roles[U.inst(e)]||'—')}</b></div>
      <div><span>بريد الدخول</span><b dir="ltr">${esc(linked?.email||e.email||'—')}</b></div>
    </div>
    <div class="icc-profile-path"><span>البلدية</span><i>←</i><span>${esc(e.administration||'غير معيّن')}</span><i>←</i><span>${esc(e.department||'غير معيّن')}</span><i>←</i><span>${esc(e.jobTitle||roles[U.inst(e)]||'—')}</span></div>
    <div class="icc-profile-access"><div><span>الوصول الحالي</span><b>${r.workspaces.length?r.workspaces.map(w=>esc(w.title)).join(' · '):'لا توجد مساحة مؤكدة'}</b></div>${issues.length?`<p class="note">يحتاج إجراء: ${esc(issues.join(' · '))}</p>`:''}</div>
    <div class="act icc-profile-actions">
      ${button('تعديل الموظف','class="btn pr icc-profile-edit"')}
      ${button('الحساب والأمان','class="btn icc-profile-security"')}
      ${button('إغلاق','class="btn icc-profile-close"')}
    </div>`;
    const shell=U.shell('iuc-profile-v3','ملف الموظف',e.name||e.employeeRef||'',body,false);
    styleSheet(shell.c);
    shell.c.classList.add('icc-profile-sheet');
    shell.c.querySelector('.icc-profile-close').onclick=shell.close;
    shell.c.querySelector('.icc-profile-edit').onclick=()=>{shell.close();openEditor(e);};
    shell.c.querySelector('.icc-profile-security').onclick=()=>{shell.close();openEditor(e,'account');};
  }
  function registry(rows) {
    const filtered=rows.filter(e=>
      (!state.search||`${e.name||''} ${e.employeeRef||''} ${e.email||''}`.toLowerCase().includes(state.search.toLowerCase()))&&
      (!state.admin||e.administration===state.admin)&&
      (!state.role||U.inst(e)===state.role)&&
      (!state.service||enabled(e).includes(state.service))&&
      (!state.status||account(e)===state.status)&&
      (state.smartFilter==='all'||(state.smartFilter==='active'&&account(e)==='نشط')||(state.smartFilter==='action'&&exceptions(e).length>0))
    );
    state.page=Math.min(state.page,Math.max(1,Math.ceil(filtered.length/25)));
    const page=filtered.slice((state.page-1)*25,state.page*25);
    const administrations=[...new Set(rows.map(e=>e.administration).filter(Boolean))];
    const departments=[...new Set(rows.map(e=>e.department).filter(Boolean))];
    const activeFilters=[state.admin,state.role,state.service,state.status].filter(Boolean).length;
    return `<div class="icc-registry-head"><div><b>سجل المستخدمين</b><span>${filtered.length} نتيجة</span></div>${button('+ إضافة موظف','data-add class="primary"')}</div>
      <div class="icc-registry-controls">
        <label class="icc-search"><span class="sr-only">بحث المستخدمين</span><input type="search" data-search value="${esc(state.search)}" placeholder="ابحث بالاسم، الرقم الوظيفي أو البريد · Ctrl K" aria-label="بحث المستخدمين"></label>
        <details class="icc-filter-details">
          <summary>فلترة متقدمة${activeFilters?` <b>${activeFilters}</b>`:''}</summary>
          <div class="icc-filter-panel">
            <div class="icc-filter-panel-head"><div><b>فلترة متقدمة</b><small>الإدارة، الدور، نطاق العمل وحالة الحساب</small></div></div>
            <div class="icc-filter-grid">
              ${select('الإدارة','admin',administrations.map(v=>[v,v]))}
              ${select('الدور','role',Object.entries(roles))}
              ${select('نطاق العمل','service',Object.entries(services))}
              ${select('حالة الحساب','status',['نشط','بدون حساب','معطل','تحتاج مراجعة','مؤرشف'].map(v=>[v,v]))}
            </div>
            <div class="icc-filter-actions">${button('مسح الفلاتر','data-reset-filters')}${button('تم','data-close-filters class="primary"')}</div>
          </div>
        </details>
      </div>
      <div class="icc-table-wrap"><table class="icc-table"><thead><tr><th>الموظف</th><th>التعيين المؤسسي</th><th>الدور / المسمى</th><th>الحساب</th><th>الإجراءات</th></tr></thead><tbody>
        ${page.map(e=>`<tr>
          <td>${button(`<span class="icc-avatar-mini">${esc((e.name||'م').slice(0,2))}</span><span class="icc-name-copy"><b>${esc(e.name)}</b><small>${esc(e.employeeRef||'—')}</small></span>`,`data-person="${esc(e.employeeId)}" class="icc-name"`)}</td>
          <td><span class="icc-assignment"><b>${esc(e.administration||'—')}</b><small>${esc(e.department||'—')}</small></span></td>
          <td><span class="icc-role-title">${esc(e.jobTitle||roles[U.inst(e)]||'—')}</span><small>${esc(roles[U.inst(e)]||'—')}</small></td>
          <td><span class="icc-account ${account(e)==='نشط'?'is-active':account(e)==='تحتاج مراجعة'?'is-review':'is-muted'}"><i></i>${account(e)}</span></td>
          <td>${button('⋯',`data-person="${esc(e.employeeId)}" class="icc-more" aria-label="فتح ملف ${esc(e.name)}"`)}</td>
        </tr>`).join('')||'<tr><td colspan="5">لا توجد نتائج مطابقة.</td></tr>'}
      </tbody></table></div>
      <footer class="icc-between icc-registry-footer"><span class="icc-muted">${filtered.length} سجل · صفحة ${state.page}</span><div>${button('السابق',`data-page="-1" ${state.page===1?'disabled':''}`)} ${button('التالي',`data-page="1" ${state.page*25>=filtered.length?'disabled':''}`)}</div></footer>`;
  }
  function hierarchy(rows) {
    const groups=new Map();
    rows.forEach(e=>{
      const admin=e.administration||'غير معيّن',dept=e.department||'بدون قسم';
      if(!groups.has(admin))groups.set(admin,new Map());
      const departments=groups.get(admin);
      if(!departments.has(dept))departments.set(dept,[]);
      departments.get(dept).push(e);
    });
    const adminStats=[...groups].map(([admin,depts])=>{
      const people=[...depts.values()].flat();
      const head=people.find(e=>U.inst(e)==='department_head')||people.find(e=>/رئيس/.test(e.jobTitle||''));
      const issues=people.filter(e=>exceptions(e).length).length;
      return {admin,depts,people,head,issues};
    });
    const employeeNode=e=>button(
      `<span class="icc-node-avatar">${esc((e.name||'م').slice(0,2))}</span><span class="icc-node-copy"><b>${esc(e.name||'—')}</b><small>${esc(e.jobTitle||roles[U.inst(e)]||'—')}</small></span><span class="icc-node-state ${exceptions(e).length?'warn':'ok'}"></span>`,
      `data-person="${esc(e.employeeId)}" class="icc-node"`
    );
    const adminCard=({admin,depts,people,head,issues},index)=>`<article class="icc-org-unit">
      <header>
        <span class="icc-org-index">${String(index+1).padStart(2,'0')}</span>
        <div><h3>${esc(admin)}</h3><p>${depts.size} أقسام · ${people.length} موظفين</p></div>
        <span class="icc-org-health ${issues?'warn':'ok'}">${issues?issues+' تحتاج إجراء':'جاهز'}</span>
      </header>
      <div class="icc-org-lead"><span>الرئيس / المسؤول</span><b>${esc(head?.name||'غير معيّن')}</b><small>${esc(head?.jobTitle||roles[U.inst(head||{})]||'—')}</small></div>
      <div class="icc-org-depts">${[...depts].map(([dept,staff])=>{
        const deptHead=staff.find(e=>U.inst(e)==='department_head')||staff.find(e=>/رئيس/.test(e.jobTitle||''));
        const others=staff.filter(e=>e!==deptHead);
        return `<details class="icc-org-dept" ${staff.length<=5?'open':''}>
          <summary><span><b>${esc(dept)}</b><small>${staff.length} موظفين</small></span><i>⌄</i></summary>
          <div class="icc-org-people">
            ${deptHead?`<div class="icc-head-label">رئيس القسم</div>${employeeNode(deptHead)}`:''}
            ${others.length?`<div class="icc-staff-label">الفريق</div>${others.map(employeeNode).join('')}`:''}
          </div>
        </details>`;
      }).join('')}</div>
    </article>`;
    return `<div class="icc-org-toolbar">
      <div><span class="icc-kicker" dir="ltr">ORGANIZATIONAL INTELLIGENCE</span><h2>الهيكل المؤسسي</h2><p>خريطة تشغيلية للعلاقات الإدارية والتعيينات داخل البلدية.</p></div>
      <div class="icc-view-switch">${button('هيكلي',`data-mode="hierarchy" aria-pressed="${state.mode==='hierarchy'}"`)}${button('مكاني',`data-mode="spatial" aria-pressed="${state.mode==='spatial'}"`)}</div>
    </div>
    <div class="icc-org-summary">
      <span><small>الإدارات</small><b>${groups.size}</b></span>
      <span><small>الأقسام</small><b>${adminStats.reduce((n,g)=>n+g.depts.size,0)}</b></span>
      <span><small>الموظفون</small><b>${rows.length}</b></span>
      <span><small>تحتاج إجراء</small><b>${rows.filter(e=>exceptions(e).length).length}</b></span>
    </div>
    ${state.mode==='hierarchy'?
      `<section class="icc-org-canvas hierarchy">
        <div class="icc-org-root"><span class="icc-root-mark">SH</span><div><small>SMART HSR</small><b>البلدية · ${esc(current.org)}</b><p>القيادة المؤسسية</p></div></div>
        <div class="icc-org-trunk"></div>
        <div class="icc-org-grid">${adminStats.map(adminCard).join('')}</div>
      </section>`
      :
      `<section class="icc-spatial-v4" tabindex="0" aria-label="التوأم المؤسسي المكاني">
        <div class="icc-spatial-toolbar"><span>Human Digital Twin · العلاقات المؤسسية</span><div>${button('−','data-zoom="-0.1" aria-label="تصغير"')}${button('+','data-zoom="0.1" aria-label="تكبير"')}${button('إعادة ضبط','data-zoom="reset"')}</div></div>
        <div class="icc-spatial-stage">
          <div class="icc-spatial-network" style="zoom:${state.zoom}">
            <div class="icc-spatial-core"><span class="icc-root-mark">SH</span><b>البلدية</b><small>${esc(current.org)}</small></div>
            <div class="icc-spatial-ring">${adminStats.map((g,index)=>`<article class="icc-spatial-unit" style="--unit-index:${index}">
              <header><span class="icc-node-dot ${['field','lands','mobility','admin'][index%4]}"></span><div><b>${esc(g.admin)}</b><small>${g.people.length} موظفين · ${g.depts.size} أقسام</small></div><i class="${g.issues?'warn':'ok'}"></i></header>
              <div class="icc-spatial-people">${g.people.slice(0,8).map(e=>button(esc((e.name||'م').slice(0,2)),`data-person="${esc(e.employeeId)}" title="${esc(e.name||'موظف')}" class="icc-spatial-person ${exceptions(e).length?'warn':''}"`)).join('')}${g.people.length>8?`<span class="icc-spatial-more">+${g.people.length-8}</span>`:''}</div>
            </article>`).join('')}</div>
          </div>
        </div>
        <div class="icc-spatial-legend"><span><i class="ok"></i> جاهز</span><span><i class="warn"></i> يحتاج إجراء</span><span>اضغط على الموظف لفتح ملفه</span></div>
      </section>`}
    `;
  }
  function paint() {
    if(!surface?.isConnected)return;
    const rows=current.employees;
    const total=rows.length+current.users.filter(u=>!rows.some(e=>e.authUid===u.uid)).length;
    const active=rows.filter(e=>account(e)==='نشط').length;
    const needsAction=rows.filter(e=>exceptions(e).length).length+unlinkedAccounts().length;
    surface.innerHTML=`<header class="icc-header"><div><span class="icc-kicker" dir="ltr"><i></i> SMART HSR · USER CENTER</span><div class="icc-title-line"><h1>مركز المستخدمين</h1><span class="icc-context">إدارة الهوية المؤسسية</span></div><p class="icc-header-copy">إدارة المستخدمين والتعيينات والحسابات من داخل لوحة مدير البلدية.</p></div></header>
      <div class="icc-smart-cards" aria-label="ملخص المستخدمين">
        <button type="button" class="icc-smart-card total ${state.smartFilter==='all'?'is-selected':''}" data-smart="all"><span class="icc-smart-card-shine"></span><div><small>إجمالي المستخدمين</small><b>${total}</b><p>جميع السجلات المرتبطة بالمؤسسة</p></div><i class="icc-signal"><em></em><em></em><em></em></i></button>
        <button type="button" class="icc-smart-card active ${state.smartFilter==='active'?'is-selected':''}" data-smart="active"><span class="icc-smart-card-shine"></span><div><small>المستخدمون النشطون</small><b>${active}</b><p>حسابات جاهزة للاستخدام</p></div><span class="icc-live">LIVE</span></button>
        <button type="button" class="icc-smart-card action ${state.smartFilter==='action'?'is-selected':''}" data-smart="action"><span class="icc-smart-card-shine"></span><div><small>يحتاج إجراء</small><b>${needsAction}</b><p>بدون حساب · معطل · تعيين ناقص</p></div><span class="icc-action-mark">›</span></button>
      </div>
      <nav class="icc-tabs" aria-label="أقسام مركز المستخدمين">${[['registry','المستخدمون'],['hierarchy','الهيكل المؤسسي']].map(([v,l])=>button(l,`data-view="${v}" aria-current="${state.view===v?'page':'false'}"`)).join('')}</nav>
      <div class="icc-split"><section class="icc-content">${state.view==='registry'?registry(rows):hierarchy(rows)}</section></div>
      <div class="icc-feedback" role="status" aria-live="polite"></div>`;
    surface.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;paint();});
    surface.querySelectorAll('[data-smart]').forEach(b=>b.onclick=()=>{state.smartFilter=b.dataset.smart;state.view='registry';state.page=1;paint();});
    surface.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>openProfile(rows.find(e=>e.employeeId===b.dataset.person)));
    surface.querySelectorAll('[data-filter]').forEach(c=>c.onchange=()=>{state[c.dataset.filter]=c.value;state.page=1;paint();});
    surface.querySelector('[data-search]')?.addEventListener('input',event=>{const p=event.target.selectionStart;state.search=event.target.value;state.page=1;paint();const input=surface.querySelector('[data-search]');input.focus();if(p!==null)input.setSelectionRange(p,p);});
    surface.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{state.page+=Number(b.dataset.page);paint();});
    surface.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;paint();});
    surface.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>{state.zoom=b.dataset.zoom==='reset'?1:Math.max(.6,Math.min(1.6,state.zoom+Number(b.dataset.zoom)));paint();});
    surface.querySelector('[data-add]')?.addEventListener('click',()=>openEditor());
    surface.querySelector('[data-reset-filters]')?.addEventListener('click',()=>{state.admin='';state.role='';state.service='';state.status='';state.smartFilter='all';state.page=1;paint();});
    surface.querySelector('[data-close-filters]')?.addEventListener('click',event=>{event.target.closest('details')?.removeAttribute('open');});
    const spatial=surface.querySelector('.icc-spatial');
    if(spatial){let drag;spatial.onpointerdown=ev=>{if(ev.target.closest('button'))return;drag={x:ev.clientX,y:ev.clientY,left:spatial.scrollLeft,top:spatial.scrollTop};spatial.setPointerCapture(ev.pointerId);};spatial.onpointermove=ev=>{if(drag){spatial.scrollLeft=drag.left+drag.x-ev.clientX;spatial.scrollTop=drag.top+drag.y-ev.clientY;}};spatial.onpointerup=()=>drag=null;spatial.onpointercancel=()=>drag=null;}
  }
  async function sensitive(e,action) {
    const title={remove:'حذف / أرشفة الموظف',disable:'تعطيل حساب الدخول',sessions:'إنهاء الجلسات'}[action];
    const s=U.shell('iuc-impact',title,e.name,`<div class="sec"><p>السجل: ${esc(e.name)} · الحسابات المرتبطة: ${e.authUid?1:0} · الخدمات المفعلة: ${enabled(e).length}</p><p>الموظفون التابعون: ${current.employees.filter(x=>x.directManagerEmployeeId===e.employeeId).length}</p><p class="note">${action==='remove'?'الخادم يحدد الحذف للسجل غير المستخدم أو الأرشفة مع حفظ التاريخ. عدد المهام والجلسات غير متاح.':'يُعتمد الإجراء بعد تأكيد الخادم فقط.'}</p></div><div class="act">${button('تأكيد','class="btn bad save"')}${action==='remove'&&e.authUid?button('تعطيل بدل الحذف','class="btn alternative"'):''}${button('إلغاء','class="btn cancel"')}</div><div class="msg"></div>`,true);
    styleSheet(s.c);s.c.querySelector('.cancel').onclick=s.close;
    async function run(kind) {const b=s.c.querySelector('.save'),msg=s.c.querySelector('.msg');b.disabled=true;s.m.dataset.busy='true';msg.textContent='جاري التنفيذ…';try{if(kind==='sessions')await U.post('/api/admin/users',{action:'revokeSessions',uid:e.authUid});else await U.post('/api/admin/employees',kind==='remove'?{action:'removeEmployee',employeeId:e.employeeId}:{action:'setAccountStatus',employeeId:e.employeeId,status:'SUSPENDED'});await refresh();msg.textContent='تم التنفيذ ✓';delete s.m.dataset.busy;b.disabled=false;s.close();}catch(error){msg.textContent=U.why(error.reason||error.message);delete s.m.dataset.busy;b.disabled=false;}}
    s.c.querySelector('.save').onclick=()=>run(action);s.c.querySelector('.alternative')?.addEventListener('click',()=>run('disable'));
  }
  function styleSheet(panel) {panel.classList.add('icc-sheet');panel.closest('.iuc').classList.add('icc-sheet-overlay');}
  const baseShell=U.shell,baseWhy=U.why;
  U.why=reason=>{const message=baseWhy(reason);if(message!=='تعذر تنفيذ الإجراء.'||!reason)return message;return /^[a-z0-9_.-]+$/i.test(String(reason))?`${message} (${String(reason).slice(0,120)})`:String(reason).slice(0,240);};
  U.shell=(...args)=>{
    const previous=document.querySelector('.iuc');
    if(previous){if(previous.dataset.busy==='true')throw Error('request_in_progress');previous.querySelector('.ix')?.click();}
    const shell=baseShell(...args);styleSheet(shell.c);
    if(host)host.inert=true;
    return shell;
  };
  function syncSheetIsolation(){const open=!!document.querySelector('.iuc');if(open&&host?.isConnected){for(let branch=host;branch&&branch!==document.body;branch=branch.parentElement){for(const sibling of branch.parentElement?.children||[]){if(sibling===branch||sibling.matches('script,style,link,.iuc'))continue;if(!isolated.has(sibling)){isolated.set(sibling,sibling.inert);sibling.inert=true;}}}host.inert=true;}else{if(host)host.inert=false;for(const [node,value] of isolated)node.inert=value;isolated.clear();}}
  const sheetObserver=new MutationObserver(syncSheetIsolation);
  sheetObserver.observe(document.body,{childList:true});
  async function openEditor(employee,initial='data') {
    if(document.querySelector('.iuc'))return;
    try{if(employee)await U.profile(employee);else await U.add();
      const panel=document.querySelector(employee?'#iuc-profile > div':'#iuc-add > div');
      if(!panel)return;
      styleSheet(panel);
      const titleNode=panel.querySelector('.ih b');
      const subNode=panel.querySelector('.ih p');
      if(titleNode)titleNode.textContent=employee?'تعديل '+(employee.name||'الموظف'):'إضافة موظف جديد';
      if(subNode)subNode.textContent=employee?'تحديث البيانات أو التعيين المؤسسي مع معاينة الأثر قبل الحفظ.':'إنشاء سجل مؤسسي وربطه بالإدارة والقسم والحساب.';
      panel.classList.remove('ucv21-single-page');
      const groups={data:[],access:[],account:[]};
      if(employee){
        ['p','o'].forEach(id=>groups.data.push(panel.querySelector(`.pane[data-id="${id}"]`)));
        groups.access.push(panel.querySelector('.pane[data-id="r"]'));
        groups.account.push(panel.querySelector('.pane[data-id="a"]'));
      }else{
        [1,2].forEach(id=>groups.data.push(panel.querySelector(`[data-step-pane="${id}"]`)));
        groups.access.push(panel.querySelector('[data-step-pane="3"]'));
        groups.account.push(panel.querySelector('[data-step-pane="4"]'));
      }
      panel.querySelectorAll('.wiz-steps,.ucv21-progress,.ucv21-profile-nav,.wiz-prev,.wiz-next,.tabs,.hier,.wiz-role-seg,.wiz-role-desc,.ucv21-role-seg').forEach(el=>el.hidden=true);
      panel.querySelectorAll('.savep,.saveo,.ucv2-employee360,.ucv21-role-helper').forEach(el=>el.hidden=true);
      panel.querySelectorAll('.ucv21-step-panel').forEach(el=>{el.classList.remove('ucv21-step-hidden');el.hidden=false;});
      const role=panel.querySelector('#inst-role');if(role?.closest('.f')){role.closest('.f').hidden=false;role.closest('.f').classList.remove('ucv21-role-native');}
      const nav=document.createElement('nav');nav.className='icc-sheet-tabs';nav.setAttribute('aria-label','أقسام الموظف');
      nav.innerHTML=[['data','البيانات'],['access','الإدارة والوصول'],['account','الحساب']].map(([k,l])=>button(l,`data-sheet-tab="${k}"`)).join('');panel.querySelector('.ih').after(nav);
      const content=document.createElement('div');content.className='icc-sheet-content';nav.after(content);
      Object.entries(groups).forEach(([key,nodes])=>{const section=document.createElement('section');section.dataset.sheetSection=key;nodes.filter(Boolean).forEach(n=>{n.hidden=false;section.append(n);});content.append(section);});
      const footer=panel.querySelector(employee?'.ucv21-profile-footer':'.wiz-footer');if(footer)panel.append(footer);
      const passwordFields=panel.querySelector('.ucv21-password-inline');
      if(passwordFields)panel.querySelector('[data-sheet-section="account"]').append(passwordFields);
      const history=panel.querySelector('.ucv21-history-wrap');
      if(history){const detail=document.createElement('details');detail.innerHTML='<summary>السجل والتكليفات</summary>';detail.append(history);panel.querySelector('[data-sheet-section="account"]').append(detail);}
      // Retain original nodes for captured validation callbacks; their empty
      // wizard surface no longer participates in layout.
      panel.querySelector('.wiz')?.setAttribute('hidden','');
      panel.querySelector('.ucv21-profile-stage')?.setAttribute('hidden','');
      panel.querySelector('.save')?.removeAttribute('hidden');
      const departmentLabels={field:'إدارة الحصر الميداني',lands:'إدارة الأراضي والممتلكات',mobility:'إدارة حركة السير'};panel.querySelectorAll('.pc').forEach(p=>{const title=p.querySelector('.pt b');if(title&&departmentLabels[p.dataset.p])title.textContent=departmentLabels[p.dataset.p];});const accessTitle=panel.querySelector('.rolebox .st span');if(accessTitle)accessTitle.textContent='الإدارة والوصول';const accessSub=panel.querySelector('.rolebox .st small');if(accessSub)accessSub.textContent='حدّد نطاق الوصول التشغيلي وفق الإدارة والقسم.';panel.classList.add('icc-employee-sheet');
      if(employee){
        const assignmentPreview=document.createElement('section');
        assignmentPreview.className='icc-assignment-preview';
        const currentPath=[employee.administration,employee.department,employee.jobTitle||roles[U.inst(employee)]].filter(Boolean).join(' ← ')||'غير معيّن';
        assignmentPreview.innerHTML=`<div><span>التعيين الحالي</span><b>${esc(currentPath)}</b></div><div><span>بعد الحفظ</span><b data-next-assignment>${esc(currentPath)}</b></div>`;
        panel.querySelector('[data-sheet-section="data"]')?.prepend(assignmentPreview);
        const updateAssignmentPreview=()=>{
          const a=panel.querySelector('#edit-admin')?.value||employee.administration||'غير معيّن';
          const d=panel.querySelector('#edit-dept')?.value||employee.department||'غير معيّن';
          const t=panel.querySelector('#edit-title')?.value||employee.jobTitle||roles[U.inst(employee)]||'—';
          const target=assignmentPreview.querySelector('[data-next-assignment]');
          if(target)target.textContent=[a,d,t].filter(Boolean).join(' ← ');
        };
        panel.addEventListener('input',updateAssignmentPreview);
        panel.addEventListener('change',updateAssignmentPreview);
        updateAssignmentPreview();
      }
      const simulation=document.createElement('aside');simulation.className='icc-simulation';groups.access[0]?.append(simulation);
      const presets=document.createElement('select');presets.setAttribute('aria-label','إعداد سريع');presets.innerHTML='<option value="">إعداد سريع — راجع قبل الحفظ</option>'+['رئيس إدارة الحصر الميداني','مراقب ميداني','رئيس إدارة الأراضي والممتلكات','موظف منح الأراضي','رئيس إدارة الحركة والتشغيل','رئيس الشؤون الإدارية','موظف حركة'].map((l,i)=>`<option value="${i}">${l}</option>`).join('');groups.access[0]?.prepend(presets);
      presets.onchange=()=>{if(presets.value==='')return;const index=Number(presets.value),preset=[
        {service:'field',head:true,administration:'إدارة الحصر الميداني',title:'رئيس قسم الحصر الميداني'},
        {service:'field',head:false,administration:'إدارة الحصر الميداني',title:'مراقب ميداني'},
        {service:'lands',head:true,administration:'إدارة الأراضي والممتلكات',title:'رئيس قسم الأراضي والممتلكات'},
        {service:'lands',head:false,administration:'إدارة الأراضي والممتلكات',title:'موظف أراضي'},
        {service:'mobility',head:true,administration:'إدارة حركة السير',title:'رئيس الحركة',scope:'mobility_head'},
        {service:'mobility',head:true,administration:'إدارة الشؤون الإدارية',title:'رئيس الشؤون الإدارية',scope:'administrative_affairs'},
        {service:'mobility',head:false,administration:'إدارة حركة السير',title:'موظف حركة'}
      ][index],service=preset.service,head=preset.head,prefix=employee?'edit':'add',adminInput=panel.querySelector(`#${prefix}-admin`),titleInput=panel.querySelector(`#${prefix}-title`);if(adminInput){adminInput.value=preset.administration;adminInput.dispatchEvent(new Event('input',{bubbles:true}));}if(titleInput){titleInput.value=preset.title;titleInput.dispatchEvent(new Event('input',{bubbles:true}));}role.value=head?'department_head':'employee';role.dispatchEvent(new Event('change',{bubbles:true}));panel.querySelectorAll('.pc').forEach(p=>{const toggle=p.querySelector('.pe');toggle.checked=p.dataset.p===service;toggle.dispatchEvent(new Event('change',{bubbles:true}));const lv=p.querySelector('[id^="lv-"]');if(lv&&p.dataset.p===service){lv.value=head?'head':'employee';lv.dispatchEvent(new Event('change',{bubbles:true}));}});const mobility=panel.querySelector('.pc[data-p="mobility"] .ctl');if(service==='mobility'&&head&&!panel.querySelector('#mob-scope'))mobility.insertAdjacentHTML('beforeend',U.sel('نطاق رئيس القسم','mob-scope',preset.scope||'mobility_head',[['department_head','رئيس قسم محدد'],['mobility_head','رئيس الحركة'],['administrative_affairs','الشؤون الإدارية']]));else if(service==='mobility'&&head)panel.querySelector('#mob-scope').value=preset.scope||'mobility_head';updateSimulation();};
      function show(key){panel.querySelectorAll('[data-sheet-section]').forEach(s=>s.hidden=s.dataset.sheetSection!==key);nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.dataset.sheetTab===key?'page':'false'));}
      nav.querySelectorAll('button').forEach(b=>b.onclick=()=>show(b.dataset.sheetTab));show(initial);
      function updateSimulation(){
        const prefix=employee?'edit':'add',mobilityOn=panel.querySelector('.pc[data-p="mobility"] .pe')?.checked;
        const vehicle=panel.querySelector('.vehicle-eligibility-control');if(vehicle)vehicle.hidden=!mobilityOn;
        try{const clone=panel.cloneNode(true);panel.querySelectorAll('input,select').forEach((input,i)=>{const copy=clone.querySelectorAll('input,select')[i];copy.value=input.value;if('checked'in input)copy.checked=input.checked;});const products=U.readProducts(clone,role.value);const r=resolution({administration:panel.querySelector(`#${prefix}-admin`)?.value,department:panel.querySelector(`#${prefix}-dept`)?.value,institutionalRole:role.value},products);
          simulation.innerHTML='<h3>محاكاة الوصول قبل الحفظ</h3>'+Object.entries(services).map(([k,l])=>`<p>${r.workspaces.some(w=>w.id===k)?'✓':'×'} ${l}</p>`).join('')+`<p>${r.workspaces.some(w=>w.route==='manager.html')?'✓':'×'} لوحة مدير البلدية</p><p>المساحة الأساسية: ${esc(r.workspaces.find(w=>w.id===r.primary)?.title||'غير معيّنة')}</p>`+(products.vehicleEligible&&!mobilityOn?'<p class="note">أهلية المركبة تحتاج وصول الحركة لتصبح فعالة؛ راجع الإعداد الحالي.</p>':'');
        }catch(error){simulation.innerHTML=`<h3>محاكاة الوصول</h3><p role="alert">${esc(U.why(error.reason||error.message))}</p>`;}
      }
      panel.addEventListener('input',updateSimulation);panel.addEventListener('change',updateSimulation);updateSimulation();
      if(employee?.authUid){
        const controls=document.createElement('div');
        controls.className='act';
        controls.innerHTML=button('إنهاء الجلسات','class="btn"');
        controls.firstElementChild.onclick=()=>sensitive(employee,'sessions');
        const accountSection=panel.querySelector('[data-sheet-section="account"]');
        accountSection.append(controls);
        const sync=userFor(employee)?.landsAccess;
        if(sync?.enabled&&sync.syncStatus){
          const note=document.createElement('p');
          note.textContent='مزامنة الأراضي: '+sync.syncStatus;
          controls.before(note);

          // Gate 2 recovery — explicit, readback-only reconciliation.
          // This button NEVER calls setServices / entitlement.* and therefore
          // cannot repeat the original Lands mutation. It is only offered for
          // the one recoverable local state that requires authoritative
          // readback: pending_trusted_sync.
          if(sync.syncStatus==='pending_trusted_sync'){
            const reconcile= document.createElement('button');
            reconcile.type='button';
            reconcile.className='btn';
            reconcile.textContent='تحقق ومزامنة آمنة';
            const result=document.createElement('p');
            result.className='note';
            result.hidden=true;
            controls.before(reconcile,result);
            reconcile.onclick=async()=>{
              if(reconcile.disabled)return;
              reconcile.disabled=true;
              const original=reconcile.textContent;
              reconcile.textContent='جاري التحقق…';
              result.hidden=false;
              result.textContent='يتم التحقق من عضوية الأراضي الموثوقة بدون إعادة أي صلاحية.';
              try{
                const outcome=await U.post('/api/admin/users',{action:'reconcileLandsAccess',uid:employee.authUid});
                if(outcome?.lands?.syncStatus!=='synced'){
                  throw Object.assign(new Error('lands_reconciliation_incomplete'),{reason:'lands_reconciliation_incomplete'});
                }
                result.textContent='تمت المزامنة الآمنة ✓';
                note.textContent='مزامنة الأراضي: synced';
                reconcile.textContent='تم التحقق ✓';
                await refresh();
              }catch(error){
                reconcile.disabled=false;
                reconcile.textContent=original;
                result.textContent=U.why(error.reason||error.message);
              }
            };
          }
        }
      }
      panel.scrollTop=0;
      const save=panel.querySelector(employee?'.ucv21-save':'.save'),originalSave=save?.onclick;
      // Gate 2 P1 — preserve the existing service-only save path inside
      // "الإدارة والوصول". The command-center wrapper must never force a
      // permissions-only change through the broad employee save because that
      // can also persist inferred organization fields (e.g. department).
      const serviceSave=employee?panel.querySelector('.saver'):null;
      if(serviceSave){
        serviceSave.hidden=false;
        serviceSave.textContent='حفظ الصلاحيات والخدمات';
        nav.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
          if(save) save.hidden=b.dataset.sheetTab==='access';
        }));
        if(save&&initial==='access') save.hidden=true;
      }
      if(save&&originalSave)save.onclick=async event=>{
        const name=panel.querySelector(employee?'#edit-name':'#add-name');
        if(!U.clean(name?.value)){show('data');name?.focus();const msg=panel.querySelector(employee?'.ucv21-profile-msg':'.msg');msg.textContent='اسم الموظف مطلوب.';msg.classList.add('er');return;}
        const label=save.textContent;save.textContent='جاري الحفظ…';
        try{await originalSave(event);}finally{if(save.isConnected){if(panel.querySelector('.msg.ok,.ucv21-profile-msg.ok'))save.textContent='تم الحفظ ✓';else save.textContent=label;}}
      };
      // Replace nested password sheet with existing inline password fields.
      panel.querySelector('.pwbtn')?.addEventListener('click',event=>{event.stopImmediatePropagation();panel.querySelector('#ucv21-npw')?.focus();},true);
    }catch(error){surface.querySelector('.icc-feedback').textContent=U.why(error.reason||error.message);}
  }
  function render(root,app,directory,reload){
    current=directory;refresh=reload;host=root;surface=app;root.classList.add('icc-host');app.classList.add('icc-app');
    root.setAttribute('role','region');root.setAttribute('aria-label','مركز المستخدمين');
    if(!root.dataset.iccOpened){root.dataset.iccOpened='true';Object.assign(state,{view:'registry',selected:null,search:'',page:1});}
    paint();
  }
  document.addEventListener('keydown',event=>{
    if(!surface?.isConnected||document.documentElement.dataset.smartHsrManagerView!=='users'||document.querySelector('.iuc'))return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();state.view='registry';paint();surface.querySelector('[data-search]')?.focus();}
  });
  window.addEventListener('smart-hsr:user-center-lifecycle',event=>{if(event.detail?.active===false){state.selected=null;state.view='registry';backdrop?.remove();for(const [node,value] of isolated)node.inert=value;isolated.clear();priorFocus?.isConnected&&priorFocus.focus();}});
  U.commandCenter={render};
  U.stale();
})();

