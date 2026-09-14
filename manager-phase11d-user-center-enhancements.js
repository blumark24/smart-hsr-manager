(() => {
'use strict';
const U = window.SmartHSRInstitutionalUC;
if (!U || U.__phase11dEnhanced) return;
U.__phase11dEnhanced = true;

const baseWhy = U.why;
const extraWhy = {
  email_confirmation_mismatch: 'تأكيد البريد الإلكتروني لا يطابق البريد الجديد.',
  session_revocation_failed: 'تم إيقاف تغيير البريد لأن إنهاء الجلسات السابقة لم يكتمل بأمان.',
  reconciliation_required: 'تعذر مزامنة هوية الدخول بالكامل. لم تُعتمد العملية وتحتاج مراجعة فنية.',
  linked_auth_user_not_found: 'حساب الدخول المرتبط غير موجود في خدمة الهوية.',
  protected_or_unknown_field: 'تم رفض حقول غير مسموح بها لحماية الحساب.',
  no_changes_requested: 'لا توجد تغييرات جديدة للحفظ.',
};
U.why = reason => extraWhy[reason] || baseWhy(reason);

const actionLabels = {
  employee_create: 'إنشاء سجل الموظف',
  employee_activate: 'إنشاء وتفعيل حساب الدخول',
  employee_activate_partial_failure: 'تعذر استكمال تفعيل الحساب',
  employee_reactivate: 'إعادة تفعيل الحساب',
  employee_suspend: 'إيقاف الحساب',
  employee_assign_products: 'تحديث الخدمات والصلاحيات',
  employee_set_vehicle_eligible: 'تحديث أهلية المركبة',
  employee_transfer: 'تغيير التنظيم الإداري',
  employee_assignment_create: 'إضافة تكليف مؤسسي',
  employee_assignment_end: 'إنهاء تكليف مؤسسي',
  employee_profile_update: 'تحديث بيانات الموظف',
  employee_login_email_change: 'تغيير بريد الدخول',
  employee_login_email_reconciliation_required: 'تنبيه مزامنة بريد الدخول',
  password_reset: 'تغيير كلمة المرور وإنهاء الجلسات',
  sessions_revoked: 'إنهاء الجلسات السابقة',
};

function esc(value) { return U.esc(value == null ? '' : value); }
function when(value) {
  if (!value) return 'الوقت غير متاح';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  try { return new Intl.DateTimeFormat('ar-SA', { dateStyle:'medium', timeStyle:'short' }).format(date); }
  catch (_) { return date.toLocaleString(); }
}
function detailText(event) {
  const d = event && event.detail;
  if (!d || typeof d !== 'object') return '';
  if (event.action === 'employee_transfer') {
    const before = d.before || {}, after = d.after || {};
    const parts = [];
    if (before.administration !== after.administration) parts.push(`الإدارة: ${before.administration || '—'} ← ${after.administration || '—'}`);
    if (before.department !== after.department) parts.push(`القسم: ${before.department || '—'} ← ${after.department || '—'}`);
    return parts.join(' · ');
  }
  if (event.action === 'employee_login_email_change') return `${d.oldEmail || '—'} ← ${d.newEmail || '—'}`;
  if (event.action === 'employee_profile_update' && Array.isArray(d.changedFields)) return `الحقول: ${d.changedFields.join('، ')}`;
  if (event.action === 'employee_assign_products') return 'تمت مزامنة التسكين مع الخدمات المفعلة.';
  if (event.action === 'password_reset') return 'تم تحديث كلمة المرور وإنهاء الجلسات السابقة دون حفظ كلمة المرور في السجل.';
  return '';
}

U.loadHist = async (c, e) => {
  const h = c.querySelector('.hist');
  if (!h) return;
  h.innerHTML = '<div class="msg">جاري تحميل سجل الموظف...</div>';
  try {
    const r = await U.post('/api/organization/context', { action:'userCenter.listHistory', employeeId:e.employeeId });
    const events = r.events || [];
    h.innerHTML = events.length ? `<div class="iuc-timeline">${events.map((event, index) => `
      <article class="iuc-event ${index === 0 ? 'latest' : ''}">
        <div class="iuc-dot"></div>
        <div class="iuc-event-card">
          <div class="iuc-event-head"><b>${esc(actionLabels[event.action] || event.action || 'حدث')}</b><time>${when(event.createdAt)}</time></div>
          <div class="iuc-event-meta">بواسطة: ${esc(event.actorRole === 'manager' ? 'مدير البلدية' : (event.actorRole || 'النظام'))}</div>
          ${detailText(event) ? `<p>${esc(detailText(event))}</p>` : ''}
        </div>
      </article>`).join('')}</div>` : '<div class="msg">لا توجد أحداث مسجلة لهذا الموظف حتى الآن.</div>';
  } catch (error) {
    h.innerHTML = `<div class="msg er">${esc(U.why(error.reason || error.message))}</div>`;
  }
};

U.changeEmail = e => {
  const currentEmail = U.clean(e.email);
  const body = `<div class="sec iuc-security-box">
    <div class="st"><span>تغيير بريد الدخول</span><small>تحديث موحّد للهوية وسجل الموظف</small></div>
    <div class="iuc-current-value"><span>البريد الحالي</span><b>${esc(currentEmail || 'غير محدد')}</b></div>
    <div class="grid">
      ${U.input('البريد الجديد','next-email','',{type:'email',w:true,ac:'email'})}
      ${U.input('تأكيد البريد الجديد','confirm-email','',{type:'email',w:true,ac:'email'})}
    </div>
    <div class="note">عند الحفظ سيتم تحديث Firebase Authentication وسجل المستخدم والموظف معًا، ثم إنهاء الجلسات السابقة وتسجيل العملية في سجل التدقيق.</div>
  </div>
  <div class="act iuc-sticky-actions"><button class="btn pr sv-email">تحديث البريد</button><button class="btn cc-email">إلغاء</button></div><div class="msg"></div>`;
  const { c, close } = U.shell('iuc-email', 'تغيير بريد الدخول', e.name || currentEmail, body, true);
  c.querySelector('.cc-email').onclick = close;
  c.querySelector('.sv-email').onclick = async ev => {
    const button = ev.currentTarget, msg = c.querySelector('.msg');
    const email = U.clean(c.querySelector('#next-email').value).toLowerCase();
    const confirmEmail = U.clean(c.querySelector('#confirm-email').value).toLowerCase();
    if (!email) { msg.className='msg er'; msg.textContent='البريد الجديد مطلوب.'; return; }
    if (email !== confirmEmail) { msg.className='msg er'; msg.textContent='تأكيد البريد لا يطابق البريد الجديد.'; return; }
    button.disabled = true; button.dataset.oldText = button.textContent; button.textContent = 'جاري التحديث...';
    try {
      const result = await U.post('/api/organization/context', { action:'userCenter.changeLoginEmail', employeeId:e.employeeId, email, confirmEmail });
      e.email = result.email;
      U.stale();
      msg.className='msg ok'; msg.textContent='تم تحديث بريد الدخول وإنهاء الجلسات السابقة بنجاح.';
      setTimeout(close, 1200);
    } catch (error) {
      msg.className='msg er'; msg.textContent=U.why(error.reason || error.message);
    } finally {
      button.disabled = false; button.textContent = button.dataset.oldText || 'تحديث البريد';
    }
  };
};

function productCount(e) {
  const p = e.products || {};
  return ['field','lands','mobility'].filter(key => p[key] && p[key].enabled).length;
}
function roleLabel(e) {
  const role = U.inst(e);
  return role === 'general_supervisor' ? 'المشرف العام' : role === 'department_head' ? 'رئيس قسم' : 'موظف';
}
function accountLabel(e) {
  if (!e.authUid) return 'بدون حساب';
  if (e.accountStatus === 'SUSPENDED') return 'موقوف';
  return 'نشط';
}
function inject360(c, e) {
  if (!c || c.querySelector('.iuc-employee360')) return;
  const tabs = c.querySelector('.tabs');
  if (!tabs) return;
  const block = document.createElement('section');
  block.className = 'iuc-employee360';
  block.innerHTML = `
    <div class="iuc-identity"><div class="iuc-avatar">${esc((e.name || 'م').trim().slice(0,2))}</div><div><b>${esc(e.name || 'موظف')}</b><span>${esc(e.jobTitle || roleLabel(e))}${e.employeeRef ? ` · ${esc(e.employeeRef)}` : ''}</span></div></div>
    <div class="iuc-360-metrics">
      <div><span>الحساب</span><b class="state-${e.accountStatus === 'SUSPENDED' ? 'bad' : e.authUid ? 'ok' : 'muted'}">${accountLabel(e)}</b></div>
      <div><span>الخدمات</span><b>${productCount(e)}</b></div>
      <div><span>الدور</span><b>${roleLabel(e)}</b></div>
      <div><span>القسم</span><b>${esc(e.department || 'غير محدد')}</b></div>
    </div>`;
  tabs.before(block);
}

const baseProfile = U.profile;
if (typeof baseProfile === 'function') {
  U.profile = async e => {
    await baseProfile(e);
    const c = document.querySelector('#iuc-profile > div');
    if (!c) return;
    inject360(c, e);
    const securityPane = c.querySelector('.pane[data-id="a"]');
    if (securityPane && c.querySelector('.pwbtn') && !securityPane.querySelector('.emailbtn')) {
      const actionBar = securityPane.querySelector('.act');
      const emailBtn = document.createElement('button');
      emailBtn.className = 'btn emailbtn';
      emailBtn.type = 'button';
      emailBtn.textContent = 'تغيير بريد الدخول';
      emailBtn.onclick = () => U.changeEmail(e);
      actionBar?.prepend(emailBtn);
    }
  };
}

function installTheme() {
  if (document.getElementById('iuc-phase11d-style')) return;
  const style = document.createElement('style');
  style.id = 'iuc-phase11d-style';
  style.textContent = `
    :root{--uc-bg:#f5f7fa;--uc-surface:#fff;--uc-raised:#f8fafc;--uc-border:#e4eaf0;--uc-text:#102236;--uc-muted:#66788a;--uc-accent:#0ea69a;--uc-accent-2:#20c9b0;--uc-danger:#c63f4f;--uc-success:#168d67;--uc-shadow:0 24px 80px rgba(15,35,55,.18)}
    html.dark,body.dark,body.dark-mode,[data-theme="dark"]{--uc-bg:#07111f;--uc-surface:#0b1727;--uc-raised:#101f31;--uc-border:#183049;--uc-text:#f3f8fb;--uc-muted:#90a6b9;--uc-accent:#20c9b0;--uc-accent-2:#4fd1c5;--uc-danger:#ff7180;--uc-success:#45d39c;--uc-shadow:0 30px 90px rgba(0,0,0,.52)}
    @media(prefers-color-scheme:dark){html:not([data-theme="light"]) .iuc{--uc-bg:#07111f;--uc-surface:#0b1727;--uc-raised:#101f31;--uc-border:#183049;--uc-text:#f3f8fb;--uc-muted:#90a6b9;--uc-accent:#20c9b0;--uc-accent-2:#4fd1c5;--uc-danger:#ff7180;--uc-success:#45d39c;--uc-shadow:0 30px 90px rgba(0,0,0,.52)}}
    .iuc{background:rgba(3,10,20,.72)!important;backdrop-filter:blur(14px)!important}
    .iuc>div{background:var(--uc-surface)!important;color:var(--uc-text)!important;border:1px solid var(--uc-border)!important;box-shadow:var(--uc-shadow)!important;border-radius:22px!important}
    .iuc .ih{position:sticky;top:0;z-index:4;background:color-mix(in srgb,var(--uc-surface) 94%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid var(--uc-border);margin:-20px -20px 16px;padding:18px 20px 15px;border-radius:22px 22px 0 0}
    .iuc .ih b,.iuc .st span,.iuc label{color:var(--uc-text)!important}.iuc .ih p,.iuc .st small,.iuc .note{color:var(--uc-muted)!important}
    .iuc .in,.iuc .sel{background:var(--uc-raised)!important;color:var(--uc-text)!important;border:1px solid var(--uc-border)!important}.iuc .in:focus,.iuc .sel:focus{border-color:var(--uc-accent)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--uc-accent) 18%,transparent)!important}
    .iuc .btn.pr{background:linear-gradient(135deg,var(--uc-accent),var(--uc-accent-2))!important;color:#031816!important;border:0!important}.iuc .btn{border-color:var(--uc-border)!important}.iuc .btn:disabled{opacity:.55;cursor:not-allowed}
    .iuc-employee360{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:15px 16px;margin:0 0 15px;border:1px solid var(--uc-border);border-radius:18px;background:linear-gradient(135deg,color-mix(in srgb,var(--uc-accent) 10%,var(--uc-raised)),var(--uc-raised))}
    .iuc-identity{display:flex;align-items:center;gap:11px;min-width:230px}.iuc-identity>div:last-child{display:grid;gap:3px}.iuc-identity b{font-size:15px}.iuc-identity span{font-size:10px;color:var(--uc-muted)}.iuc-avatar{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(135deg,var(--uc-accent),var(--uc-accent-2));color:#02201c;font-weight:900}
    .iuc-360-metrics{display:grid;grid-template-columns:repeat(4,minmax(86px,1fr));gap:8px;flex:1}.iuc-360-metrics>div{padding:9px 10px;border:1px solid var(--uc-border);border-radius:13px;background:var(--uc-surface);display:grid;gap:3px}.iuc-360-metrics span{font-size:9px;color:var(--uc-muted)}.iuc-360-metrics b{font-size:11px}.state-ok{color:var(--uc-success)!important}.state-bad{color:var(--uc-danger)!important}.state-muted{color:var(--uc-muted)!important}
    .iuc-current-value{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;margin:10px 0 14px;border:1px solid var(--uc-border);border-radius:14px;background:var(--uc-raised)}.iuc-current-value span{font-size:10px;color:var(--uc-muted)}.iuc-current-value b{direction:ltr;font-size:12px}
    .iuc-timeline{position:relative;display:grid;gap:0;padding:3px 4px}.iuc-event{position:relative;display:grid;grid-template-columns:22px 1fr;gap:8px;padding-bottom:12px}.iuc-event:before{content:"";position:absolute;right:10px;top:17px;bottom:-3px;width:1px;background:var(--uc-border)}.iuc-event:last-child:before{display:none}.iuc-dot{width:10px;height:10px;margin:5px 5px 0;border-radius:50%;background:var(--uc-border);box-shadow:0 0 0 4px var(--uc-surface);z-index:1}.iuc-event.latest .iuc-dot{background:var(--uc-accent)}.iuc-event-card{padding:11px 12px;border:1px solid var(--uc-border);border-radius:14px;background:var(--uc-raised)}.iuc-event-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.iuc-event-head b{font-size:11px}.iuc-event-head time,.iuc-event-meta{font-size:9px;color:var(--uc-muted)}.iuc-event-card p{font-size:10px;color:var(--uc-muted);margin:7px 0 0}
    @media(max-width:760px){.iuc{padding:8px!important;align-items:flex-end!important}.iuc>div{width:100%!important;max-height:94vh!important;border-radius:22px 22px 0 0!important}.iuc-employee360{align-items:stretch;flex-direction:column}.iuc-360-metrics{grid-template-columns:repeat(2,1fr)}.iuc .tabs{overflow-x:auto;white-space:nowrap;scrollbar-width:none}.iuc-event-head{align-items:flex-start;flex-direction:column;gap:3px}}
  `;
  document.head.appendChild(style);
}
installTheme();
})();
