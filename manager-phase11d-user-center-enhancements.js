(() => {
'use strict';

const U = window.SmartHSRInstitutionalUC;
if (!U || U.__phase11fRedesignV2) return;
U.__phase11fRedesignV2 = true;

const PRODUCT_LABELS = Object.freeze({ field:'الحصر', lands:'الأراضي', mobility:'الحركة' });
const PRODUCT_CLASS = Object.freeze({ field:'field', lands:'lands', mobility:'mobility' });
const STATUS_LABELS = Object.freeze({
  ACTIVE:'نشط', SUSPENDED:'موقوف', NO_ACCOUNT:'بدون حساب',
  PENDING_ACTIVATION:'بانتظار التفعيل', LEGACY:'حساب قديم غير مرتبط بسجل موظف',
});
const ROLE_LABELS = Object.freeze({
  supervisor:'مشرف', inspector:'مفتش', contractor:'مقاول',
  lands_employee:'موظف أراضي', lands_department_manager:'مدير قسم الأراضي',
  mobility_head:'رئيس الحركة', department_head:'رئيس قسم',
  administrative_affairs:'شؤون إدارية', employee:'موظف',
  general_supervisor:'المشرف العام', manager:'مدير البلدية',
});
const AUDIT_LABELS = Object.freeze({
  employee_create:'إنشاء سجل الموظف', employee_activate:'تفعيل الحساب',
  employee_activate_partial_failure:'تعذر استكمال تفعيل الحساب',
  employee_reactivate:'إعادة تفعيل الحساب', employee_suspend:'إيقاف الحساب',
  employee_assign_products:'تغيير الصلاحيات', employee_set_vehicle_eligible:'تحديث أهلية المركبة',
  employee_transfer:'تغيير القسم', employee_assignment_create:'إضافة تكليف مؤسسي',
  employee_assignment_end:'إنهاء تكليف مؤسسي', employee_profile_update:'تعديل البيانات',
  employee_login_email_change:'تعديل البريد', employee_login_email_reconciliation_required:'تنبيه مزامنة بريد الدخول',
  password_reset:'تم تعديل كلمة المرور', password_change:'تم تعديل كلمة المرور',
  sessions_revoked:'إنهاء الجلسات السابقة',
});

const state = {
  search:'', status:'all', role:'all', product:'all', department:'all', vehicle:'all',
  quick:null, page:1, pageSize:25, sort:'name',
};
let directoryCache = null;
let renderQueued = false;
let renderRequested = false;
let renderGeneration = 0;
let lastRoot = null;

const clean = value => String(value == null ? '' : value).trim();
const esc = value => U.esc ? U.esc(clean(value)) : clean(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lower = value => clean(value).toLocaleLowerCase('ar');
const enabled = (employee, key) => Boolean(employee?.products?.[key]?.enabled);
const roleOf = (employee, key) => employee?.products?.[key]?.role || null;
const initials = name => clean(name).split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('') || 'م';
const safeDate = value => {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value?.seconds ? value.seconds * 1000 : value);
  if (Number.isNaN(date.getTime())) return '—';
  try { return new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium'}).format(date); }
  catch (_) { return date.toLocaleDateString('ar-SA'); }
};

function accountStatus(employee) {
  if (!employee?.authUid) return employee?.accountStatus === 'PENDING_ACTIVATION' ? 'PENDING_ACTIVATION' : 'NO_ACCOUNT';
  if (employee.accountStatus === 'SUSPENDED') return 'SUSPENDED';
  if (employee.accountStatus === 'PENDING_ACTIVATION') return 'PENDING_ACTIVATION';
  return 'ACTIVE';
}
function primaryRole(employee) {
  const roles = ['mobility','lands','field'].map(key => roleOf(employee,key)).filter(Boolean);
  return roles[0] || employee?.role || null;
}
function roleLabel(role) { return ROLE_LABELS[role] || (role ? role : '—'); }
function employeeProducts(employee) { return ['field','lands','mobility'].filter(key => enabled(employee,key)); }
function normalizeRecords(directory) {
  const employees = Array.isArray(directory?.employees) ? directory.employees : [];
  const users = Array.isArray(directory?.users) ? directory.users : [];
  const linked = new Set(employees.map(e => e?.authUid).filter(Boolean));
  const records = employees.map(employee => ({ kind:'employee', employee }));
  for (const user of users) {
    if (!user?.uid || linked.has(user.uid) || user.employeeId) continue;
    records.push({ kind:'legacy', user });
  }
  return records;
}
function recordSearchText(record) {
  if (record.kind === 'legacy') return lower(`${record.user?.name||''} ${record.user?.email||''} ${record.user?.uid||''}`);
  const e = record.employee;
  return lower(`${e?.name||''} ${e?.email||''} ${e?.employeeRef||''} ${e?.jobTitle||''} ${e?.department||''} ${e?.administration||''}`);
}
function matches(record) {
  if (state.search && !recordSearchText(record).includes(lower(state.search))) return false;
  if (record.kind === 'legacy') return state.status === 'all' && state.role === 'all' && state.product === 'all' && state.department === 'all' && state.vehicle === 'all' && !state.quick;
  const e = record.employee;
  const status = accountStatus(e);
  const products = employeeProducts(e);
  const roles = products.map(key => roleOf(e,key)).filter(Boolean);
  const pr = primaryRole(e);
  if (state.status !== 'all' && state.status !== status) return false;
  if (state.role !== 'all' && !roles.includes(state.role) && pr !== state.role) return false;
  if (state.product !== 'all' && !products.includes(state.product)) return false;
  if (state.department !== 'all' && clean(e.department) !== state.department) return false;
  if (state.vehicle === 'eligible' && !(enabled(e,'mobility') && e.products?.mobility?.vehicleEligible === true)) return false;
  if (state.vehicle === 'ineligible' && enabled(e,'mobility') && e.products?.mobility?.vehicleEligible === true) return false;
  if (state.quick === 'active' && status !== 'ACTIVE') return false;
  if (state.quick === 'no-account' && !['NO_ACCOUNT','PENDING_ACTIVATION'].includes(status)) return false;
  if (['field','lands','mobility'].includes(state.quick) && !products.includes(state.quick)) return false;
  return true;
}
function sortedRecords(records) {
  return records.slice().sort((a,b) => {
    if (a.kind !== b.kind) return a.kind === 'employee' ? -1 : 1;
    if (a.kind === 'legacy') return lower(a.user?.name || a.user?.email).localeCompare(lower(b.user?.name || b.user?.email),'ar');
    const ea=a.employee, eb=b.employee;
    if (state.sort === 'status') return accountStatus(ea).localeCompare(accountStatus(eb),'ar');
    if (state.sort === 'department') return clean(ea.department).localeCompare(clean(eb.department),'ar');
    if (state.sort === 'updated') return String(eb.updatedAt||eb.createdAt||'').localeCompare(String(ea.updatedAt||ea.createdAt||''));
    return clean(ea.name).localeCompare(clean(eb.name),'ar');
  });
}
function kpis(records) {
  const employees = records.filter(r => r.kind === 'employee').map(r => r.employee);
  return {
    total:employees.length,
    active:employees.filter(e => accountStatus(e)==='ACTIVE').length,
    noAccount:employees.filter(e => ['NO_ACCOUNT','PENDING_ACTIVATION'].includes(accountStatus(e))).length,
    field:employees.filter(e => enabled(e,'field')).length,
    lands:employees.filter(e => enabled(e,'lands')).length,
    mobility:employees.filter(e => enabled(e,'mobility')).length,
  };
}

function findCenterRoot() {
  if (document.documentElement.dataset.smartHsrManagerView !== 'users') return null;
  const panel = document.querySelector('.manager-view-overlay > .manager-view-panel');
  if (panel) return panel;
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,[role="heading"]'));
  const heading = headings.find(el => !el.closest('.ucv2-app') && /مركز إدارة المستخدمين|مركز المستخدمين|إدارة المستخدمين|المستخدمون والصلاحيات/.test(clean(el.textContent)));
  if (!heading) return null;
  let node = heading;
  for (let depth=0; depth<8 && node?.parentElement; depth+=1) {
    node = node.parentElement;
    const text = clean(node.textContent);
    if ((node.querySelector('table') || /إضافة موظف/.test(text)) && text.length < 80000) return node;
  }
  return heading.parentElement;
}
function hideLegacyPresentation(root) {
  if (!root) return;
  Array.from(root.children).forEach(child => {
    if (child.classList?.contains('ucv2-app')) return;
    child.dataset.ucv2Original = 'true';
    child.style.display = 'none';
  });
}
function buttonByText(root, text) {
  return Array.from(root?.querySelectorAll?.('button,[role="button"]') || []).find(b => clean(b.textContent).includes(text));
}

function productChips(e) {
  const products = employeeProducts(e);
  return products.length ? products.map(key => `<span class="ucv2-chip product ${PRODUCT_CLASS[key]}">${PRODUCT_LABELS[key]}</span>`).join('') : '<span class="ucv2-muted">بدون خدمات</span>';
}
function statusBadge(status) {
  const cls = status==='ACTIVE'?'ok':status==='SUSPENDED'?'danger':status==='PENDING_ACTIVATION'?'warn':'muted';
  return `<span class="ucv2-chip ${cls}">${STATUS_LABELS[status]||status}</span>`;
}
function vehicleBadge(e) {
  if (!enabled(e,'mobility')) return '<span class="ucv2-muted">—</span>';
  return e.products?.mobility?.vehicleEligible === true
    ? '<span class="ucv2-chip ok">مؤهل</span>' : '<span class="ucv2-chip muted">غير مؤهل</span>';
}
function roleMarkup(e) {
  const products = employeeProducts(e);
  const roles = [...new Set(products.map(key => roleOf(e,key)).filter(Boolean))];
  return roles.length ? roles.map(role => `<span class="ucv2-role">${esc(roleLabel(role))}</span>`).join('') : '<span class="ucv2-muted">—</span>';
}
function legacyRow(record, mobile=false) {
  const u=record.user||{};
  if (mobile) return `<article class="ucv2-mobile-card legacy"><div class="ucv2-person"><span class="ucv2-avatar">${esc(initials(u.name||u.email))}</span><div><b>${esc(u.name||'حساب قديم')}</b><small>${esc(u.email||u.uid||'—')}</small></div></div><div class="ucv2-legacy-note">حساب قديم غير مرتبط بسجل موظف</div></article>`;
  return `<tr class="ucv2-legacy"><td><div class="ucv2-person"><span class="ucv2-avatar">${esc(initials(u.name||u.email))}</span><div><b>${esc(u.name||'حساب قديم')}</b><small>${esc(u.uid||'—')}</small></div></div></td><td><span class="ucv2-chip warn">حساب قديم</span></td><td>${esc(u.email||'—')}</td><td colspan="6"><span class="ucv2-legacy-note">حساب قديم غير مرتبط بسجل موظف — لم يتم إنشاء هوية بديلة تلقائيًا.</span></td><td><button class="ucv2-btn ghost" disabled aria-disabled="true">يتطلب مسار ربط آمن</button></td></tr>`;
}
function employeeRow(record, mobile=false) {
  const e=record.employee, status=accountStatus(e), id=esc(e.employeeId);
  if (mobile) return `<article class="ucv2-mobile-card" data-employee-id="${id}"><div class="ucv2-person"><span class="ucv2-avatar">${esc(initials(e.name))}</span><div><b>${esc(e.name||'موظف')}</b><small>${esc(e.employeeRef||e.email||'—')}</small></div></div><div class="ucv2-mobile-meta">${statusBadge(status)}<span>${esc(e.department||'بدون قسم')}</span></div><div class="ucv2-products">${productChips(e)}</div><div class="ucv2-mobile-actions"><button class="ucv2-btn primary" data-open-employee="${id}">عرض الملف</button></div></article>`;
  return `<tr data-employee-id="${id}" tabindex="0"><td><div class="ucv2-person"><span class="ucv2-avatar">${esc(initials(e.name))}</span><div><b>${esc(e.name||'موظف')}</b><small>${esc(e.employeeRef||'—')}</small></div></div></td><td>${statusBadge(status)}</td><td class="ucv2-email">${esc(e.email||'—')}</td><td>${esc(e.administration||'—')}</td><td>${esc(e.department||'—')}</td><td>${esc(e.jobTitle||'—')}</td><td><div class="ucv2-products">${productChips(e)}</div></td><td>${roleMarkup(e)}</td><td>${vehicleBadge(e)}</td><td><span class="ucv2-muted">${esc(safeDate(e.updatedAt||e.createdAt))}</span></td><td><button class="ucv2-btn ghost" data-open-employee="${id}">عرض الملف</button></td></tr>`;
}
function selectOptions(values, current, allLabel='الكل') {
  return `<option value="all">${esc(allLabel)}</option>${values.map(([value,label]) => `<option value="${esc(value)}"${value===current?' selected':''}>${esc(label)}</option>`).join('')}`;
}

async function getDirectory(force=false) {
  if (directoryCache && !force) return directoryCache;
  directoryCache = await U.dir(force);
  return directoryCache;
}
async function renderCenter(force=false) {
  if (document.documentElement.dataset.smartHsrManagerView !== 'users') return;
  if (renderQueued) { renderRequested = true; return; }
  renderQueued = true;
  const generation = renderGeneration;
  try {
    const root = findCenterRoot();
    if (!root) return;
    root.classList.add('ucv2-host');
    root.parentElement?.classList.add('ucv2-shell-overlay');
    if (!root.dataset.ucv2Scrolled) { root.dataset.ucv2Scrolled='1'; window.scrollTo(0,0); }
    lastRoot = root;
    const directory = await getDirectory(force);
    if (generation !== renderGeneration || document.documentElement.dataset.smartHsrManagerView !== 'users' || !root.isConnected) return;
    const records = normalizeRecords(directory);
    const stats = kpis(records);
    const departments = [...new Set(records.filter(r=>r.kind==='employee').map(r=>clean(r.employee.department)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));
    const roleValues = [...new Set(records.filter(r=>r.kind==='employee').flatMap(r=>employeeProducts(r.employee).map(k=>roleOf(r.employee,k))).filter(Boolean))].sort();
    const filtered = sortedRecords(records.filter(matches));
    const maxPage = Math.max(1,Math.ceil(filtered.length/state.pageSize));
    if (state.page > maxPage) state.page=maxPage;
    const start=(state.page-1)*state.pageSize, pageRecords=filtered.slice(start,start+state.pageSize);
    hideLegacyPresentation(root);
    let app=root.querySelector('.ucv2-app');
    if (!app) { app=document.createElement('section'); app.className='ucv2-app'; root.appendChild(app); }
    delete app.dataset.routeGuardLoading;
    app.removeAttribute('aria-busy');
    app.innerHTML=`
      <header class="ucv2-header">
        <div><div class="ucv2-eyebrow">SMART HSR · MUNICIPAL OPERATIONS</div><h1>مركز إدارة المستخدمين</h1><p>إدارة الموظفين والحسابات والصلاحيات والخدمات البلدية</p></div>
        <div class="ucv2-header-actions"><button class="ucv2-btn primary" data-add-employee>+ إضافة موظف</button><button class="ucv2-btn ghost" type="button" data-close-center aria-label="إغلاق مركز إدارة المستخدمين">✕ إغلاق</button></div>
      </header>
      <div class="ucv2-kpis" aria-label="ملخص القوى العاملة">
        ${kpiCard('total','إجمالي الموظفين',stats.total,'total',null)}
        ${kpiCard('active','الحسابات المفعلة',stats.active,'active','active')}
        ${kpiCard('no-account','بدون حساب / غير مفعلة',stats.noAccount,'warning','no-account')}
        ${kpiCard('field','الحصر الميداني',stats.field,'field','field')}
        ${kpiCard('lands','الأراضي',stats.lands,'lands','lands')}
        ${kpiCard('mobility','الحركة',stats.mobility,'mobility','mobility')}
      </div>
      <div class="ucv2-toolbar">
        <label class="ucv2-search"><span class="sr-only">بحث في سجل الموظفين</span><input type="search" data-filter="search" value="${esc(state.search)}" aria-label="بحث في سجل الموظفين" placeholder="بحث بالاسم أو البريد أو الرقم الوظيفي" autocomplete="off"></label>
        <select data-filter="status" aria-label="الحالة">${selectOptions([['ACTIVE','نشط'],['SUSPENDED','موقوف'],['NO_ACCOUNT','بدون حساب'],['PENDING_ACTIVATION','يحتاج تفعيل']],state.status,'كل الحالات')}</select>
        <select data-filter="role" aria-label="الدور">${selectOptions(roleValues.map(r=>[r,roleLabel(r)]),state.role,'كل الأدوار')}</select>
        <select data-filter="product" aria-label="الخدمة البلدية">${selectOptions([['field','الحصر الميداني الذكي'],['lands','الأراضي الذكية'],['mobility','الحركة الذكية']],state.product,'كل الخدمات')}</select>
        <select data-filter="department" aria-label="القسم">${selectOptions(departments.map(d=>[d,d]),state.department,'كل الأقسام')}</select>
        <select data-filter="vehicle" aria-label="أهلية المركبة">${selectOptions([['eligible','مؤهل للمركبة'],['ineligible','غير مؤهل']],state.vehicle,'كل حالات المركبة')}</select>
        <button class="ucv2-btn ghost" data-reset-filters>إعادة تعيين الفلاتر</button>
      </div>
      <div class="ucv2-quick" aria-label="فلاتر سريعة">
        ${quickChip('active','الحسابات المفعلة')}${quickChip('no-account','بدون حساب')}${quickChip('field','الحصر')}${quickChip('lands','الأراضي')}${quickChip('mobility','الحركة')}
      </div>
      <div class="ucv2-grid-head"><span aria-live="polite">عرض ${filtered.length} من ${records.length} سجل</span><label>ترتيب <select data-filter="sort" aria-label="ترتيب سجل المستخدمين"><option value="name"${state.sort==='name'?' selected':''}>الاسم</option><option value="status"${state.sort==='status'?' selected':''}>الحالة</option><option value="department"${state.sort==='department'?' selected':''}>القسم</option><option value="updated"${state.sort==='updated'?' selected':''}>آخر تعديل</option></select></label></div>
      ${pageRecords.length ? `<div class="ucv2-table-wrap"><table class="ucv2-table"><thead><tr><th>الموظف</th><th>الحساب</th><th>البريد</th><th>الإدارة</th><th>القسم</th><th>المسمى</th><th>الخدمات</th><th>الدور التشغيلي</th><th>المركبة</th><th>آخر تعديل</th><th>الإجراءات</th></tr></thead><tbody>${pageRecords.map(r=>r.kind==='legacy'?legacyRow(r):employeeRow(r)).join('')}</tbody></table></div><div class="ucv2-mobile-list">${pageRecords.map(r=>r.kind==='legacy'?legacyRow(r,true):employeeRow(r,true)).join('')}</div>` : emptyState(records.length)}
      ${maxPage>1?pagination(maxPage):''}`;
    bindCenter(app,directory);
  } catch (error) {
    const root=lastRoot||findCenterRoot();
    if(root){ let app=root.querySelector('.ucv2-app'); if(!app){app=document.createElement('section');app.className='ucv2-app';root.appendChild(app);} delete app.dataset.routeGuardLoading; app.removeAttribute('aria-busy'); app.innerHTML=`<div class="ucv2-state error"><b>تعذر تحميل مركز المستخدمين</b><span>${esc(U.why?U.why(error.reason||error.message):error.message)}</span><button class="ucv2-btn ghost" data-retry>إعادة المحاولة</button></div>`; app.querySelector('[data-retry]')?.addEventListener('click',()=>{directoryCache=null;renderCenter(true);}); }
  } finally {
    renderQueued=false;
    if (renderRequested && document.documentElement.dataset.smartHsrManagerView === 'users') {
      renderRequested=false;
      queueMicrotask(() => renderCenter());
    }
  }
}
function kpiCard(key,label,value,accent,quick){ const active=quick&&state.quick===quick,content=`<span class="ucv2-kpi-icon" aria-hidden="true"></span><span><b>${value}</b><small>${label}</small></span>`;return quick?`<button class="ucv2-kpi ${accent}${active?' active':''}" type="button" data-quick="${quick}" aria-pressed="${active?'true':'false'}">${content}</button>`:`<div class="ucv2-kpi ${accent}" aria-label="${esc(label)}: ${value}">${content}</div>`; }
function quickChip(value,label){ const active=state.quick===value;return `<button type="button" class="ucv2-chip-button${active?' active':''}" data-quick="${value}" aria-pressed="${active?'true':'false'}">${label}</button>`; }
function emptyState(total){ return `<div class="ucv2-state"><b>${total?'لا توجد نتائج مطابقة':'لا توجد سجلات موظفين بعد'}</b><span>${total?'غيّر معايير البحث أو أعد تعيين الفلاتر.':'استخدم «إضافة موظف» لإنشاء أول سجل.'}</span></div>`; }
function pagination(max){ return `<nav class="ucv2-pagination" aria-label="التنقل بين صفحات الموظفين"><button class="ucv2-btn ghost" data-page="prev" ${state.page<=1?'disabled':''}>السابق</button><span>صفحة ${state.page} من ${max}</span><button class="ucv2-btn ghost" data-page="next" ${state.page>=max?'disabled':''}>التالي</button></nav>`; }
function resetFilters(){ Object.assign(state,{search:'',status:'all',role:'all',product:'all',department:'all',vehicle:'all',quick:null,page:1,sort:'name'}); }
function showCenterActionError(app,error){let node=app.querySelector('.ucv2-action-error');if(!node){node=document.createElement('div');node.className='ucv2-action-error';node.setAttribute('role','alert');app.querySelector('.ucv2-header')?.after(node);}node.textContent=U.why?U.why(error?.reason||error?.message):'تعذر تنفيذ الإجراء.';}
function bindCenter(app,directory){
  app.querySelector('[data-add-employee]')?.addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;app.setAttribute('aria-busy','true');try{await U.add();decorateAddDialog();}catch(error){showCenterActionError(app,error);}finally{button.disabled=false;app.removeAttribute('aria-busy');}});
  app.querySelector('[data-close-center]')?.addEventListener('click',()=>{ document.querySelector('[data-ucv2-original] button[aria-label="إغلاق"]')?.click(); });
  app.querySelector('[data-reset-filters]')?.addEventListener('click',()=>{ resetFilters(); renderCenter(); });
  app.querySelectorAll('[data-quick]').forEach(btn=>btn.addEventListener('click',()=>{ const q=btn.dataset.quick; state.quick=state.quick===q?null:q; state.page=1; renderCenter(); }));
  app.querySelectorAll('[data-filter]').forEach(control=>{ const key=control.dataset.filter; const event=key==='search'?'input':'change'; control.addEventListener(event,()=>{ state[key]=control.value; state.page=1; const caret=key==='search'?control.selectionStart:null;renderCenter().then(()=>{if(key!=='search')return;const next=lastRoot?.querySelector('[data-filter="search"]');if(!next)return;next.focus();if(Number.isInteger(caret))next.setSelectionRange(caret,caret);}); }); });
  app.querySelectorAll('[data-open-employee]').forEach(btn=>btn.addEventListener('click',async()=>{ const id=btn.dataset.openEmployee; const employee=(directory.employees||[]).find(e=>String(e.employeeId)===id); if(!employee)return;btn.disabled=true;app.setAttribute('aria-busy','true');try{await U.profile(employee);decorateProfileDialog(employee);}catch(error){showCenterActionError(app,error);}finally{btn.disabled=false;app.removeAttribute('aria-busy');} }));
  app.querySelectorAll('tr[data-employee-id]').forEach(row=>row.addEventListener('keydown',event=>{ if((event.key==='Enter'||event.key===' ')&&!event.target.closest('button')){ event.preventDefault(); row.querySelector('[data-open-employee]')?.click(); } }));
  app.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',()=>{ state.page += btn.dataset.page==='next'?1:-1; renderCenter(); }));
}

function shellRoot(id){ return document.querySelector(`#${id} > div`) || document.querySelector(`#${id}`); }
function accessibleDialog(container,label){
  if(!container)return;
  container.setAttribute('role','dialog');container.setAttribute('aria-modal','true');
  const title=container.querySelector('.ih b,h2,h3'); if(title){ if(!title.id)title.id=`ucv2-title-${Math.random().toString(36).slice(2)}`;container.setAttribute('aria-labelledby',title.id); }
  container.classList.add('ucv2-dialog');
}
function decorateAddDialog(){
  const c=shellRoot('iuc-add'); if(!c)return; accessibleDialog(c,'إضافة موظف');c.classList.add('ucv2-add-dialog');
  const header=c.querySelector('.ih'); if(header&&!header.querySelector('.ucv2-dialog-kicker')) header.insertAdjacentHTML('afterbegin','<span class="ucv2-dialog-kicker">NEW EMPLOYEE · 4 STEPS</span>');
  const mk=c.querySelector('#mk-account'); if(mk){ const note=mk.closest('.sec')?.querySelector('.note'); if(note)note.textContent='كلمة المرور التي يحددها مدير البلدية هي كلمة الدخول المعتمدة، ولا يفرض النظام تغييرها عند أول دخول.'; }
  installPasswordToggles(c);
}
function decorateProfileDialog(employee){
  const c=shellRoot('iuc-profile'); if(!c)return; accessibleDialog(c,'ملف الموظف');c.classList.add('ucv2-profile-dialog');
  if(!c.querySelector('.ucv2-employee360')){
    const tabs=c.querySelector('.tabs'); if(tabs){ const block=document.createElement('section');block.className='ucv2-employee360';block.innerHTML=`<div class="ucv2-person"><span class="ucv2-avatar lg">${esc(initials(employee.name))}</span><div><b>${esc(employee.name||'موظف')}</b><small>${esc(employee.jobTitle||roleLabel(primaryRole(employee)))}</small></div></div><div class="ucv2-360-metrics"><div><span>الحساب</span><b>${STATUS_LABELS[accountStatus(employee)]||'—'}</b></div><div><span>الخدمات</span><b>${employeeProducts(employee).length}</b></div><div><span>القسم</span><b>${esc(employee.department||'غير محدد')}</b></div></div>`;tabs.before(block); }
  }
  const security=c.querySelector('.pane[data-id="a"]');
  if(security&&employee.authUid&&!security.querySelector('.emailbtn')){ const bar=security.querySelector('.act'); const b=document.createElement('button');b.className='btn emailbtn';b.type='button';b.textContent='تعديل البريد';b.onclick=()=>changeEmail(employee);bar?.prepend(b); }
  c.querySelector('.pwbtn')?.setAttribute('aria-label','تعديل كلمة المرور');
  installPasswordToggles(c);
}
function installPasswordToggles(root){
  root.querySelectorAll('input[type="password"]').forEach(input=>{ if(input.dataset.ucv2Toggle)return; input.dataset.ucv2Toggle='1'; const wrap=input.parentElement; if(!wrap)return; wrap.classList.add('ucv2-password-field'); const b=document.createElement('button');b.type='button';b.className='ucv2-password-toggle';b.textContent='إظهار';b.setAttribute('aria-label','إظهار كلمة المرور');b.onclick=()=>{ const show=input.type==='password';input.type=show?'text':'password';b.textContent=show?'إخفاء':'إظهار';b.setAttribute('aria-label',show?'إخفاء كلمة المرور':'إظهار كلمة المرور'); };wrap.appendChild(b); });
}

const baseAdd=U.add;
if(typeof baseAdd==='function') U.add=async(...args)=>{ const out=await baseAdd.apply(U,args); decorateAddDialog(); return out; };
const baseProfile=U.profile;
if(typeof baseProfile==='function') U.profile=async employee=>{ const out=await baseProfile.call(U,employee); decorateProfileDialog(employee); return out; };
const basePassword=U.password;
if(typeof basePassword==='function') U.password=async(...args)=>{ const out=await basePassword.apply(U,args); queueMicrotask(()=>{ const candidates=Array.from(document.querySelectorAll('.iuc > div,.iuc')); const c=candidates.find(x=>/تعديل كلمة المرور/.test(clean(x.textContent))); if(c){accessibleDialog(c,'تعديل كلمة المرور');c.classList.add('ucv2-password-dialog');installPasswordToggles(c); const notes=Array.from(c.querySelectorAll('.note,.msg,p')).filter(x=>/مؤقت|أول دخول|إعادة تعيين/.test(clean(x.textContent))); notes.forEach(x=>{x.textContent='سيتم اعتماد كلمة المرور الجديدة وإنهاء الجلسات السابقة بعد الحفظ.';}); } }); return out; };

const baseWhy=U.why;
const WHY={email_confirmation_mismatch:'تأكيد البريد الإلكتروني لا يطابق البريد الجديد.',session_revocation_failed:'تم إيقاف تغيير البريد لأن إنهاء الجلسات السابقة لم يكتمل بأمان.',reconciliation_required:'تعذر مزامنة هوية الدخول بالكامل. لم تُعتمد العملية وتحتاج مراجعة فنية.',linked_auth_user_not_found:'حساب الدخول المرتبط غير موجود في خدمة الهوية.',protected_or_unknown_field:'تم رفض حقول غير مسموح بها لحماية الحساب.',no_changes_requested:'لا توجد تغييرات جديدة للحفظ.'};
U.why=reason=>WHY[reason]||(typeof baseWhy==='function'?baseWhy(reason):reason);

function changeEmail(employee){
  const current=clean(employee.email);
  const body=`<div class="sec ucv2-security-box"><div class="st"><span>تعديل بريد الدخول</span><small>تحديث موحّد للهوية وسجل الموظف</small></div><div class="ucv2-current-value"><span>البريد الحالي</span><b>${esc(current||'غير محدد')}</b></div><div class="grid">${U.input('البريد الجديد','next-email','',{type:'email',w:true,ac:'email'})}${U.input('تأكيد البريد الجديد','confirm-email','',{type:'email',w:true,ac:'email'})}</div><div class="note">يتم التحديث عبر المسار الآمن المخصص، ثم إنهاء الجلسات السابقة وتسجيل العملية.</div></div><div class="act"><button class="btn pr sv-email">اعتماد البريد</button><button class="btn cc-email">إلغاء</button></div><div class="msg"></div>`;
  const {c,close}=U.shell('iuc-email','تعديل البريد',employee.name||current,body,true);accessibleDialog(c,'تعديل البريد');
  c.querySelector('.cc-email').onclick=close;c.querySelector('.sv-email').onclick=async ev=>{const button=ev.currentTarget,msg=c.querySelector('.msg'),email=clean(c.querySelector('#next-email').value).toLowerCase(),confirmEmail=clean(c.querySelector('#confirm-email').value).toLowerCase();if(!email){msg.className='msg er';msg.textContent='البريد الجديد مطلوب.';return;}if(email!==confirmEmail){msg.className='msg er';msg.textContent='تأكيد البريد لا يطابق البريد الجديد.';return;}button.disabled=true;const old=button.textContent;button.textContent='جاري التحديث...';try{const result=await U.post('/api/organization/context',{action:'userCenter.changeLoginEmail',employeeId:employee.employeeId,email,confirmEmail});employee.email=result.email;directoryCache=null;U.stale();msg.className='msg ok';msg.textContent='تم تعديل بريد الدخول وإنهاء الجلسات السابقة بنجاح.';setTimeout(()=>{close();renderCenter(true);},700);}catch(error){msg.className='msg er';msg.textContent=U.why(error.reason||error.message);}finally{button.disabled=false;button.textContent=old;}};
}
U.changeEmail=changeEmail;

function historyDetail(event){ const d=event?.detail;if(!d||typeof d!=='object')return'';if(event.action==='employee_transfer'){const before=d.before||{},after=d.after||{};return `القسم: ${before.department||'—'} ← ${after.department||'—'}`;}if(event.action==='employee_login_email_change')return `${d.oldEmail||'—'} ← ${d.newEmail||'—'}`;if(event.action==='employee_profile_update'&&Array.isArray(d.changedFields))return `الحقول: ${d.changedFields.join('، ')}`;if(['password_reset','password_change'].includes(event.action))return 'تم تعديل كلمة المرور دون حفظها في السجل، مع إنهاء الجلسات السابقة.';return''; }
U.loadHist=async(c,employee)=>{const h=c.querySelector('.hist');if(!h)return;h.innerHTML='<div class="msg">جاري تحميل سجل الموظف...</div>';try{const r=await U.post('/api/organization/context',{action:'userCenter.listHistory',employeeId:employee.employeeId}),events=r.events||[];h.innerHTML=events.length?`<div class="ucv2-timeline">${events.map((event,index)=>`<article class="ucv2-event${index===0?' latest':''}"><span class="ucv2-event-dot"></span><div><div class="ucv2-event-head"><b>${esc(AUDIT_LABELS[event.action]||event.action||'حدث')}</b><time>${esc(safeDate(event.createdAt))}</time></div><small>بواسطة: ${esc(event.actorRole==='manager'?'مدير البلدية':event.actorRole||'النظام')}</small>${historyDetail(event)?`<p>${esc(historyDetail(event))}</p>`:''}</div></article>`).join('')}</div>`:'<div class="msg">لا توجد أحداث مسجلة لهذا الموظف حتى الآن.</div>';}catch(error){h.innerHTML=`<div class="msg er">${esc(U.why(error.reason||error.message))}</div>`;}};

const baseStale=U.stale;
let staleRefreshTimer=0;
if(typeof baseStale==='function') U.stale=(...args)=>{const out=baseStale.apply(U,args);directoryCache=null;clearTimeout(staleRefreshTimer);staleRefreshTimer=setTimeout(()=>renderCenter(true),80);return out;};

function installTheme(){
  if(document.getElementById('ucv2-style'))return;
  const style=document.createElement('style');style.id='ucv2-style';style.textContent=`
:root{--uc-bg:#f4f7fa;--uc-surface:#fff;--uc-surface-raised:#f8fafc;--uc-border:#dce4ec;--uc-border-strong:#c9d5e1;--uc-text:#102338;--uc-text-muted:#66788a;--uc-primary:#1268e3;--uc-success:#12815e;--uc-warning:#a66705;--uc-danger:#bf3445;--uc-field:#0787a6;--uc-lands:#7757c8;--uc-mobility:#0b8b7b;--uc-radius-sm:8px;--uc-radius-md:12px;--uc-radius-lg:18px;--uc-shadow:0 18px 45px rgba(17,40,68,.12)}
html.dark,body.dark,body.dark-mode,[data-theme="dark"]{--uc-bg:#07111f;--uc-surface:#0b1727;--uc-surface-raised:#101f31;--uc-border:#20344a;--uc-border-strong:#2b455f;--uc-text:#f2f6fa;--uc-text-muted:#91a4b7;--uc-primary:#54a2ff;--uc-success:#49c99a;--uc-warning:#f2b95f;--uc-danger:#ff7b8b;--uc-field:#43bfd6;--uc-lands:#ab8cf2;--uc-mobility:#46c9b7;--uc-shadow:0 24px 60px rgba(0,0,0,.38)}
.ucv2-app{direction:rtl;color:var(--uc-text);background:var(--uc-bg);border:1px solid var(--uc-border);border-radius:var(--uc-radius-lg);padding:20px;display:grid;gap:16px;animation:ucv2-in .2s ease-out}.ucv2-app *{box-sizing:border-box}.ucv2-header{display:flex;align-items:center;justify-content:space-between;gap:20px}.ucv2-header h1{font-size:22px;line-height:1.25;margin:2px 0 4px;color:var(--uc-text)}.ucv2-header p{margin:0;color:var(--uc-text-muted);font-size:12px}.ucv2-eyebrow{font-size:9px;letter-spacing:.12em;color:var(--uc-primary);font-weight:800}.ucv2-header-actions{display:flex;gap:8px;flex-wrap:wrap}.ucv2-btn{appearance:none;border:1px solid var(--uc-border-strong);background:var(--uc-surface);color:var(--uc-text);border-radius:10px;min-height:36px;padding:0 13px;font:inherit;font-weight:700;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}.ucv2-btn:hover:not(:disabled){border-color:var(--uc-primary)}.ucv2-btn:active:not(:disabled){transform:translateY(1px)}.ucv2-btn.primary{background:var(--uc-primary);border-color:var(--uc-primary);color:white}.ucv2-btn.ghost{background:var(--uc-surface-raised)}.ucv2-btn:disabled{opacity:.48;cursor:not-allowed}.ucv2-kpis{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:10px}.ucv2-kpi{border:1px solid var(--uc-border);border-radius:var(--uc-radius-md);background:var(--uc-surface);color:var(--uc-text);padding:12px;text-align:right;display:flex;align-items:center;gap:10px;min-height:72px;cursor:default;transition:border-color .15s,background .15s}.ucv2-kpi[data-quick]{cursor:pointer}.ucv2-kpi[data-quick]:hover,.ucv2-kpi.active{border-color:currentColor;background:var(--uc-surface-raised)}.ucv2-kpi-icon{width:4px;height:36px;border-radius:4px;background:currentColor}.ucv2-kpi.total{color:var(--uc-primary)}.ucv2-kpi.active{color:var(--uc-success)}.ucv2-kpi.warning{color:var(--uc-warning)}.ucv2-kpi.field{color:var(--uc-field)}.ucv2-kpi.lands{color:var(--uc-lands)}.ucv2-kpi.mobility{color:var(--uc-mobility)}.ucv2-kpi b{display:block;font-size:21px;line-height:1;color:var(--uc-text)}.ucv2-kpi small{display:block;margin-top:7px;font-size:10px;color:var(--uc-text-muted);font-weight:700}.ucv2-toolbar{display:grid;grid-template-columns:minmax(240px,1.7fr) repeat(5,minmax(120px,.8fr)) auto;gap:8px;align-items:center}.ucv2-toolbar input,.ucv2-toolbar select,.ucv2-grid-head select{width:100%;height:38px;border:1px solid var(--uc-border);border-radius:10px;background:var(--uc-surface);color:var(--uc-text);padding:0 10px;font:inherit}.ucv2-toolbar input:focus,.ucv2-toolbar select:focus,.ucv2-grid-head select:focus{outline:2px solid color-mix(in srgb,var(--uc-primary) 35%,transparent);outline-offset:1px;border-color:var(--uc-primary)}.ucv2-quick{display:flex;flex-wrap:wrap;gap:7px}.ucv2-chip-button{border:1px solid var(--uc-border);border-radius:999px;background:var(--uc-surface);color:var(--uc-text-muted);padding:5px 10px;font:inherit;font-size:10px;font-weight:700;cursor:pointer}.ucv2-chip-button.active{border-color:var(--uc-primary);color:var(--uc-primary);background:color-mix(in srgb,var(--uc-primary) 8%,var(--uc-surface))}.ucv2-grid-head{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--uc-text-muted);font-size:10px}.ucv2-grid-head label{display:flex;align-items:center;gap:7px}.ucv2-grid-head select{height:32px;width:auto}.ucv2-table-wrap{overflow:auto;border:1px solid var(--uc-border);border-radius:var(--uc-radius-md);background:var(--uc-surface);max-height:min(62vh,680px)}.ucv2-table{width:100%;border-collapse:separate;border-spacing:0;font-size:11px;white-space:nowrap}.ucv2-table thead th{position:sticky;top:0;z-index:2;background:var(--uc-surface-raised);color:var(--uc-text-muted);font-size:9.5px;text-align:right;padding:10px 9px;border-bottom:1px solid var(--uc-border)}.ucv2-table td{padding:9px;border-bottom:1px solid var(--uc-border);vertical-align:middle;color:var(--uc-text)}.ucv2-table tbody tr{transition:background .14s}.ucv2-table tbody tr:hover,.ucv2-table tbody tr:focus{background:color-mix(in srgb,var(--uc-primary) 5%,var(--uc-surface));outline:none}.ucv2-person{display:flex;align-items:center;gap:9px;min-width:150px}.ucv2-person>div{display:grid;gap:2px}.ucv2-person b{font-size:11.5px;color:var(--uc-text)}.ucv2-person small{font-size:9px;color:var(--uc-text-muted)}.ucv2-avatar{width:31px;height:31px;border-radius:9px;display:grid;place-items:center;background:color-mix(in srgb,var(--uc-primary) 12%,var(--uc-surface-raised));border:1px solid color-mix(in srgb,var(--uc-primary) 22%,var(--uc-border));color:var(--uc-primary);font-weight:800;font-size:10px;flex:none}.ucv2-avatar.lg{width:42px;height:42px;border-radius:12px;font-size:12px}.ucv2-chip{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--uc-border);border-radius:999px;padding:3px 7px;font-size:9px;font-weight:800;background:var(--uc-surface-raised);color:var(--uc-text-muted)}.ucv2-chip.ok{color:var(--uc-success);border-color:color-mix(in srgb,var(--uc-success) 32%,var(--uc-border));background:color-mix(in srgb,var(--uc-success) 8%,var(--uc-surface))}.ucv2-chip.warn{color:var(--uc-warning);border-color:color-mix(in srgb,var(--uc-warning) 32%,var(--uc-border));background:color-mix(in srgb,var(--uc-warning) 8%,var(--uc-surface))}.ucv2-chip.danger{color:var(--uc-danger);border-color:color-mix(in srgb,var(--uc-danger) 32%,var(--uc-border));background:color-mix(in srgb,var(--uc-danger) 8%,var(--uc-surface))}.ucv2-chip.product.field{color:var(--uc-field)}.ucv2-chip.product.lands{color:var(--uc-lands)}.ucv2-chip.product.mobility{color:var(--uc-mobility)}.ucv2-products{display:flex;gap:4px;flex-wrap:wrap}.ucv2-role{display:block;font-size:9.5px;font-weight:700}.ucv2-muted{color:var(--uc-text-muted);font-size:9.5px}.ucv2-legacy-note{color:var(--uc-warning);font-size:10px}.ucv2-pagination{display:flex;align-items:center;justify-content:flex-end;gap:10px;color:var(--uc-text-muted);font-size:10px}.ucv2-state{min-height:180px;border:1px dashed var(--uc-border-strong);border-radius:var(--uc-radius-md);background:var(--uc-surface);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:7px;padding:24px}.ucv2-state b{font-size:14px}.ucv2-state span{color:var(--uc-text-muted)}.ucv2-state.error b{color:var(--uc-danger)}.ucv2-mobile-list{display:none}.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
.iuc{background:rgba(3,10,20,.7)!important;backdrop-filter:blur(12px)!important}.iuc>div,.ucv2-dialog{background:var(--uc-surface)!important;color:var(--uc-text)!important;border:1px solid var(--uc-border)!important;box-shadow:var(--uc-shadow)!important;border-radius:20px!important;max-width:min(1040px,calc(100vw - 28px))!important;max-height:calc(100vh - 28px)!important}.iuc .ih{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--uc-surface) 96%,transparent)!important;backdrop-filter:blur(14px);border-bottom:1px solid var(--uc-border);margin:-20px -20px 14px;padding:18px 20px 14px;border-radius:20px 20px 0 0}.iuc .ih b,.iuc .st span,.iuc label{color:var(--uc-text)!important}.iuc .ih p,.iuc .st small,.iuc .note{color:var(--uc-text-muted)!important}.iuc .in,.iuc .sel{background:var(--uc-surface-raised)!important;color:var(--uc-text)!important;border:1px solid var(--uc-border)!important}.iuc .in:focus,.iuc .sel:focus{outline:2px solid color-mix(in srgb,var(--uc-primary) 35%,transparent)!important;outline-offset:1px}.iuc .btn.pr{background:var(--uc-primary)!important;color:white!important;border-color:var(--uc-primary)!important}.iuc .tabs{position:sticky;top:67px;z-index:4;background:var(--uc-surface);display:flex;gap:5px;overflow:auto;padding:6px 0;border-bottom:1px solid var(--uc-border)}.iuc .tab{white-space:nowrap;border-radius:9px!important}.iuc .tab.on{background:color-mix(in srgb,var(--uc-primary) 10%,var(--uc-surface))!important;color:var(--uc-primary)!important;border-color:color-mix(in srgb,var(--uc-primary) 25%,var(--uc-border))!important}.ucv2-dialog-kicker{display:block;color:var(--uc-primary);font-size:8px;font-weight:800;letter-spacing:.12em;margin-bottom:3px}.ucv2-employee360{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:12px;padding:12px 14px;border:1px solid var(--uc-border);border-radius:14px;background:var(--uc-surface-raised)}.ucv2-360-metrics{display:grid;grid-template-columns:repeat(3,minmax(100px,1fr));gap:8px}.ucv2-360-metrics>div{display:grid;gap:3px;padding:7px 10px;border-right:1px solid var(--uc-border)}.ucv2-360-metrics span{font-size:8px;color:var(--uc-text-muted)}.ucv2-360-metrics b{font-size:10px}.ucv2-current-value{display:flex;align-items:center;justify-content:space-between;padding:9px 11px;border:1px solid var(--uc-border);border-radius:10px;background:var(--uc-surface-raised);margin-bottom:10px}.ucv2-current-value span{color:var(--uc-text-muted);font-size:9px}.ucv2-password-field{position:relative}.ucv2-password-field input{padding-left:58px!important}.ucv2-password-toggle{position:absolute;left:6px;bottom:6px;height:28px;border:0;background:transparent;color:var(--uc-primary);font:inherit;font-size:9px;font-weight:800;cursor:pointer}.ucv2-timeline{display:grid;gap:0;padding:4px}.ucv2-event{display:grid;grid-template-columns:16px 1fr;gap:8px;position:relative;padding-bottom:14px}.ucv2-event:before{content:"";position:absolute;right:7px;top:12px;bottom:-2px;width:1px;background:var(--uc-border)}.ucv2-event:last-child:before{display:none}.ucv2-event-dot{width:9px;height:9px;border:2px solid var(--uc-surface);border-radius:50%;background:var(--uc-border-strong);margin-top:5px;z-index:1}.ucv2-event.latest .ucv2-event-dot{background:var(--uc-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--uc-primary) 12%,transparent)}.ucv2-event>div{border:1px solid var(--uc-border);border-radius:11px;padding:9px 11px;background:var(--uc-surface-raised)}.ucv2-event-head{display:flex;justify-content:space-between;gap:10px}.ucv2-event-head time,.ucv2-event small{font-size:8.5px;color:var(--uc-text-muted)}.ucv2-event p{font-size:9px;margin:5px 0 0;color:var(--uc-text-muted)}
@media(max-width:1280px){.ucv2-kpis{grid-template-columns:repeat(3,1fr)}.ucv2-toolbar{grid-template-columns:minmax(220px,1.5fr) repeat(3,1fr)}.ucv2-toolbar select[data-filter="department"],.ucv2-toolbar select[data-filter="vehicle"]{display:none}.ucv2-table th:nth-child(4),.ucv2-table td:nth-child(4),.ucv2-table th:nth-child(6),.ucv2-table td:nth-child(6),.ucv2-table th:nth-child(9),.ucv2-table td:nth-child(9),.ucv2-table th:nth-child(10),.ucv2-table td:nth-child(10){display:none}}
@media(max-width:760px){.ucv2-app{padding:12px;border-radius:12px}.ucv2-header{align-items:flex-start;flex-direction:column}.ucv2-header-actions,.ucv2-header-actions .ucv2-btn{width:100%}.ucv2-kpis{grid-template-columns:repeat(2,1fr)}.ucv2-toolbar{grid-template-columns:1fr 1fr}.ucv2-search{grid-column:1/-1}.ucv2-toolbar select[data-filter="role"],.ucv2-toolbar select[data-filter="product"]{display:block}.ucv2-toolbar .ucv2-btn{grid-column:1/-1}.ucv2-table-wrap{display:none}.ucv2-mobile-list{display:grid;gap:8px}.ucv2-mobile-card{border:1px solid var(--uc-border);border-radius:12px;padding:11px;background:var(--uc-surface);display:grid;gap:9px}.ucv2-mobile-meta{display:flex;align-items:center;justify-content:space-between;color:var(--uc-text-muted);font-size:9px}.ucv2-mobile-actions .ucv2-btn{width:100%}.ucv2-employee360{align-items:flex-start;flex-direction:column}.ucv2-360-metrics{width:100%;grid-template-columns:repeat(3,1fr)}.iuc>div,.ucv2-dialog{max-width:100vw!important;max-height:100vh!important;border-radius:0!important}.iuc .ih{border-radius:0}.iuc .grid{grid-template-columns:1fr!important}}
@keyframes ucv2-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.ucv2-app,.ucv2-app *,.iuc,.iuc *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
  document.head.appendChild(style);
}

function boot(){
  installTheme();
  renderCenter();
  let retryTimer=0;
  const requestRender=()=>{
    clearTimeout(retryTimer);
    retryTimer=setTimeout(()=>{
      const root=findCenterRoot();
      const existingApp=root&&root.querySelector('.ucv2-app');
      // manager-dashboard-format.js's route guard claims the route and paints
      // a temporary loading placeholder (marked data-route-guard-loading)
      // before this script even finishes loading, to avoid a flash of the
      // legacy dashboard. That placeholder satisfies the old "already has an
      // .ucv2-app" check below, which was written assuming any .ucv2-app
      // present meant THIS renderer had already run — so real data never
      // took over and the loading screen never resolved. Treat the
      // placeholder the same as no app yet.
      if(root&&(!existingApp||existingApp.dataset.routeGuardLoading==='true'))renderCenter();
    },60);
  };
  const observer=new MutationObserver(mutations=>{
    if(mutations.some(m=>m.type==='attributes'||Array.from(m.addedNodes).some(n=>n.nodeType===1&&/مركز إدارة المستخدمين|إدارة المستخدمين/.test(clean(n.textContent)))))requestRender();
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden']});
  document.addEventListener('click',event=>{if(/مركز إدارة المستخدمين|مركز المستخدمين/.test(clean(event.target?.closest?.('a,button,[role="button"]')?.textContent)))requestRender();},true);
  window.addEventListener('smart-hsr:user-center-lifecycle',event=>{
    renderGeneration+=1;
    renderRequested=false;
    if(event.detail?.active)requestRender();
    else lastRoot=null;
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
