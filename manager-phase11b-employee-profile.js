(() => {
  'use strict';

  const STYLE_ID = 'phase11b-employee-profile-style';
  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const clean = value => String(value ?? '').trim();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  let cache = { orgId: null, at: 0, employees: [], users: [] };

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .hsr-profile-extra{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;margin-top:4px}
      .hsr-profile-field{display:flex;flex-direction:column;gap:5px;min-width:0}
      .hsr-profile-field.wide{grid-column:1/-1}
      .hsr-profile-field label{font-size:10px;color:var(--tx3,#7d8ea6);font-weight:650}
      .hsr-profile-field input,.hsr-profile-field select{width:100%;height:38px;border-radius:10px;background:var(--field,rgba(12,20,36,.78));border:1px solid var(--ctlBd,rgba(122,164,224,.18));color:var(--tx,#e9f1fb);font-size:11.5px;padding:0 11px;outline:none}
      .hsr-profile-field input:focus,.hsr-profile-field select:focus{border-color:rgba(79,209,197,.6);box-shadow:0 0 0 3px rgba(79,209,197,.08)}
      .hsr-profile-field input:disabled{opacity:.62;cursor:not-allowed}
      .hsr-profile-hint{font-size:9.5px;line-height:1.75;color:var(--tx3,#7d8ea6)}
      .hsr-profile-save{width:100%;height:39px;border-radius:10px;border:1px solid rgba(98,232,183,.38);background:linear-gradient(180deg,rgba(33,190,133,.98),rgba(18,139,101,.96));color:#effff9;font-size:11.5px;font-weight:800;cursor:pointer}
      .hsr-profile-save:disabled{opacity:.55;cursor:not-allowed}
      .hsr-profile-edit-btn{width:100%;height:36px;border-radius:9px;border:1px solid rgba(79,209,197,.28);background:rgba(18,91,91,.18);color:#95e8de;font-size:11.5px;font-weight:750;cursor:pointer;margin-top:2px}
      .hsr-profile-modal{position:fixed;inset:0;z-index:220;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,6,13,.76);backdrop-filter:blur(8px)}
      .hsr-profile-card{width:min(820px,100%);max-height:calc(100vh - 36px);overflow:auto;padding:20px;border-radius:20px;border:1px solid rgba(79,209,197,.24);background:linear-gradient(155deg,rgba(12,23,40,.995),rgba(6,13,25,.998));box-shadow:0 40px 110px -38px rgba(0,0,0,.98);color:var(--tx,#eef6ff)}
      .hsr-profile-head{display:flex;align-items:flex-start;gap:12px;padding-bottom:14px;border-bottom:1px solid rgba(122,164,224,.13);margin-bottom:15px}
      .hsr-profile-head-main{flex:1;min-width:0}
      .hsr-profile-eyebrow{font-size:9.5px;color:#4fd1c5;font-weight:800;margin-bottom:5px}
      .hsr-profile-head h3{font-size:17px;margin:0;color:#f3f8ff}
      .hsr-profile-head p{font-size:10px;line-height:1.7;color:#7f96ad;margin:5px 0 0}
      .hsr-profile-x{width:32px;height:32px;border-radius:9px;border:1px solid rgba(122,164,224,.15);background:rgba(18,31,52,.75);color:#8ca2b8;cursor:pointer}
      .hsr-profile-section{padding:13px;border-radius:14px;background:rgba(11,22,39,.58);border:1px solid rgba(122,164,224,.12);margin-bottom:11px}
      .hsr-profile-section-title{font-size:11px;font-weight:800;color:#b8ccde;margin-bottom:10px}
      .hsr-profile-status{min-height:18px;margin-top:9px;font-size:10.5px;line-height:1.7;color:#8fa7bf}
      .hsr-profile-status.ok{color:#65d7b0}.hsr-profile-status.err{color:#f08f8f}
      .hsr-password-card{width:min(520px,100%)}
      .hsr-password-rules{font-size:9.5px;line-height:1.8;color:#8199b1;margin-top:7px}
      @media(max-width:680px){.hsr-profile-extra{grid-template-columns:1fr}.hsr-profile-field.wide{grid-column:auto}.hsr-profile-card{padding:15px}}
    `;
    document.head.appendChild(style);
  }

  function fixedOverlays() {
    return Array.from(document.querySelectorAll('div')).filter(el => {
      try { return getComputedStyle(el).position === 'fixed'; } catch (_) { return false; }
    });
  }

  function getOrgId() {
    const bodyText = document.body.innerText || '';
    const match = bodyText.match(/org-[A-Za-z0-9_-]+/);
    return match ? match[0] : null;
  }

  async function token() {
    const [appApi, authApi] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'),
    ]);
    const app = appApi.getApps().find(item => item.name === 'smart-hsr-manager-session') || appApi.getApps()[0];
    if (!app) throw new Error('no_session');
    const user = authApi.getAuth(app).currentUser;
    if (!user) throw new Error('no_session');
    return user.getIdToken();
  }

  async function post(path, payload) {
    const idToken = await token();
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.reason || body.error || 'request_failed');
      error.reason = body.reason || body.error || 'request_failed';
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async function refreshDirectory(force = false) {
    const orgId = getOrgId();
    if (!orgId) throw new Error('organization_not_found');
    if (!force && cache.orgId === orgId && Date.now() - cache.at < 15000) return cache;
    const [employeesResult, usersResult] = await Promise.all([
      post('/api/admin/employees', { action: 'list', organizationId: orgId }),
      post('/api/admin/users', { action: 'list', organizationId: orgId }),
    ]);
    cache = {
      orgId,
      at: Date.now(),
      employees: Array.isArray(employeesResult.employees) ? employeesResult.employees : [],
      users: Array.isArray(usersResult.users) ? usersResult.users : [],
    };
    return cache;
  }

  function errorMessage(reason) {
    const messages = {
      name_required: 'الاسم مطلوب.',
      invalid_email: 'البريد الإلكتروني غير صالح.',
      invalid_employment_status: 'الحالة الوظيفية غير صالحة.',
      employee_not_found: 'تعذر العثور على سجل الموظف.',
      cross_organization_denied: 'الموظف خارج نطاق الجهة الحالية.',
      manager_required: 'هذا الإجراء متاح لمدير الجهة فقط.',
      linked_account_email_change_requires_account_flow: 'البريد مرتبط بحساب دخول مفعّل؛ تغييره يحتاج مسار أمان مستقل.',
      password_policy_failed: 'كلمة المرور لا تطابق سياسة الأمان.',
      reauthentication_required: 'يلزم تسجيل دخول حديث للمدير قبل تغيير كلمة المرور.',
      password_management_denied: 'تعيين كلمة المرور متاح لمدير الجهة فقط.',
      password_target_denied: 'هذا الحساب غير مؤهل لإدارة كلمة المرور من هنا.',
      target_organization_mismatch: 'الحساب خارج نطاق الجهة الحالية.',
      no_session: 'الجلسة غير موثقة. أعد تسجيل الدخول.',
      organization_not_found: 'تعذر تحديد الجهة الحالية.',
      request_failed: 'تعذر تنفيذ الطلب الآن.',
      temporary_failure: 'تعذر تنفيذ الطلب مؤقتًا.',
    };
    return messages[reason] || 'تعذر تنفيذ الإجراء. راجع البيانات وحاول مرة أخرى.';
  }

  function field(label, id, value = '', opts = {}) {
    const wide = opts.wide ? ' wide' : '';
    const type = opts.type || 'text';
    const disabled = opts.disabled ? ' disabled' : '';
    const autocomplete = opts.autocomplete || 'off';
    return `<div class="hsr-profile-field${wide}"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${escapeHtml(value)}" autocomplete="${autocomplete}"${disabled}></div>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  }

  function selectField(label, id, value, options, opts = {}) {
    const wide = opts.wide ? ' wide' : '';
    return `<div class="hsr-profile-field${wide}"><label for="${id}">${label}</label><select id="${id}">${options.map(([v,l]) => `<option value="${escapeHtml(v)}"${String(value)===String(v)?' selected':''}>${escapeHtml(l)}</option>`).join('')}</select></div>`;
  }

  function findAddEmployeeOverlay() {
    return fixedOverlays().find(overlay => {
      const t = text(overlay);
      return (t.includes('إضافة موظف بلا حساب') || t.includes('إضافة موظف')) && t.includes('إضافة السجل') && !overlay.id.includes('phase11b-import');
    });
  }

  function patchAddEmployee() {
    const overlay = findAddEmployeeOverlay();
    if (!overlay || overlay.dataset.hsrEmployeeAddEnhanced === 'true') return;
    const panel = Array.from(overlay.children).find(el => el.nodeType === 1) || overlay;
    const nativeInputs = Array.from(panel.querySelectorAll('input'));
    const nativeSave = Array.from(panel.querySelectorAll('button')).find(btn => text(btn) === 'إضافة السجل');
    if (nativeInputs.length < 4 || !nativeSave) return;

    overlay.dataset.hsrEmployeeAddEnhanced = 'true';
    const title = Array.from(panel.querySelectorAll('div')).find(el => !el.children.length && text(el) === 'إضافة موظف بلا حساب');
    if (title) title.textContent = 'إضافة موظف';

    const note = Array.from(panel.querySelectorAll('div')).find(el => !el.children.length && text(el).includes('هذا السجل لا يُنشئ حساب دخول'));
    const extras = document.createElement('div');
    extras.className = 'hsr-profile-extra';
    extras.dataset.hsrAddFields = 'true';
    extras.innerHTML = [
      field('الرقم الوظيفي', 'hsr-add-employee-ref'),
      field('رقم الجوال', 'hsr-add-phone', '', { type: 'tel' }),
      field('البريد الإلكتروني', 'hsr-add-email', '', { type: 'email' }),
      selectField('الحالة الوظيفية', 'hsr-add-employment-status', 'active', [['active','على رأس العمل'],['inactive','غير نشط']]),
      selectField('المدير المباشر', 'hsr-add-direct-manager', '', [['','بدون تحديد']]),
    ].join('');
    (note?.parentElement || nativeSave.parentElement?.parentElement || panel).insertBefore(extras, note || nativeSave.parentElement || null);

    refreshDirectory().then(({ employees }) => {
      const select = extras.querySelector('#hsr-add-direct-manager');
      employees.forEach(employee => {
        const option = document.createElement('option');
        option.value = employee.employeeId;
        option.textContent = employee.name + (employee.department ? ` · ${employee.department}` : '');
        select.appendChild(option);
      });
    }).catch(() => undefined);

    if (note) note.textContent = 'ينشئ هذا الإجراء سجل الموظف المؤسسي فقط. حساب الدخول والصلاحيات تُفعّل لاحقًا عند الحاجة.';
    nativeSave.style.display = 'none';
    nativeSave.setAttribute('aria-hidden', 'true');

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'hsr-profile-save';
    save.textContent = 'حفظ الموظف';
    const status = document.createElement('div');
    status.className = 'hsr-profile-status';
    nativeSave.parentElement.append(save, status);

    save.addEventListener('click', async () => {
      const [nameInput, administrationInput, departmentInput, jobTitleInput] = nativeInputs;
      const name = clean(nameInput.value);
      if (!name) { status.className='hsr-profile-status err'; status.textContent='الاسم مطلوب.'; return; }
      save.disabled = true;
      status.className = 'hsr-profile-status';
      status.textContent = 'جاري حفظ سجل الموظف...';
      try {
        await post('/api/admin/employees', {
          action: 'create',
          organizationId: getOrgId(),
          name,
          employeeRef: clean(extras.querySelector('#hsr-add-employee-ref').value) || undefined,
          email: clean(extras.querySelector('#hsr-add-email').value) || undefined,
          phone: clean(extras.querySelector('#hsr-add-phone').value) || undefined,
          administration: clean(administrationInput.value) || undefined,
          department: clean(departmentInput.value) || undefined,
          jobTitle: clean(jobTitleInput.value) || undefined,
          employmentStatus: extras.querySelector('#hsr-add-employment-status').value,
          directManagerEmployeeId: extras.querySelector('#hsr-add-direct-manager').value || undefined,
        });
        cache.at = 0;
        status.className = 'hsr-profile-status ok';
        status.textContent = 'تم حفظ الموظف في السجل المؤسسي.';
        await sleep(450);
        const close = panel.querySelector('button[aria-label="إغلاق"]');
        if (close) close.click();
        else overlay.click();
      } catch (error) {
        status.className = 'hsr-profile-status err';
        status.textContent = errorMessage(error.reason || error.message);
      } finally {
        save.disabled = false;
      }
    });
  }

  async function resolveEmployeeFromDrawer(drawer) {
    const directory = await refreshDirectory();
    const drawerText = text(drawer);
    const candidates = directory.employees.filter(employee => employee.name && drawerText.includes(employee.name));
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      const stronger = candidates.filter(employee => [employee.department, employee.administration, employee.jobTitle, employee.employeeRef].filter(Boolean).some(v => drawerText.includes(v)));
      if (stronger.length === 1) return stronger[0];
    }
    return null;
  }

  function findEmployeeDrawer() {
    return fixedOverlays().find(overlay => {
      const t = text(overlay);
      return t.includes('سجل موظف') && (t.includes('حالة الحساب') || t.includes('إنشاء حساب')) && !overlay.classList.contains('hsr-profile-modal');
    });
  }

  function patchEmployeeDrawer() {
    const drawer = findEmployeeDrawer();
    if (!drawer || drawer.dataset.hsrEmployeeProfileAction === 'true') return;
    drawer.dataset.hsrEmployeeProfileAction = 'true';
    const panel = Array.from(drawer.children).find(el => el.nodeType === 1) || drawer;
    const anchor = Array.from(panel.querySelectorAll('button')).find(btn => text(btn).includes('إنشاء حساب')) || panel.querySelector('button[aria-label="إغلاق"]');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hsr-profile-edit-btn';
    button.textContent = 'تعديل بيانات الموظف';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const employee = await resolveEmployeeFromDrawer(drawer);
        if (!employee) throw new Error('employee_not_found');
        await openEmployeeProfile(employee);
      } catch (error) {
        window.alert(errorMessage(error.reason || error.message));
      } finally {
        button.disabled = false;
      }
    });
    if (anchor && anchor.parentElement) anchor.parentElement.insertBefore(button, anchor);
    else panel.appendChild(button);
  }

  async function openEmployeeProfile(employee) {
    document.getElementById('hsr-employee-profile-modal')?.remove();
    const directory = await refreshDirectory();
    const linked = Boolean(employee.authUid);
    const managers = [['','بدون تحديد'], ...directory.employees
      .filter(item => item.employeeId !== employee.employeeId)
      .map(item => [item.employeeId, item.name + (item.department ? ` · ${item.department}` : '')])];

    const modal = document.createElement('div');
    modal.id = 'hsr-employee-profile-modal';
    modal.className = 'hsr-profile-modal';
    modal.innerHTML = `<div class="hsr-profile-card" role="dialog" aria-modal="true" aria-label="تعديل بيانات الموظف">
      <div class="hsr-profile-head"><div class="hsr-profile-head-main"><div class="hsr-profile-eyebrow">SMART HSR · ملف الموظف المؤسسي</div><h3>تعديل بيانات الموظف</h3><p>${escapeHtml(employee.name)} · التغييرات الإدارية الحساسة تحفظ في سجل تدقيق مستقل.</p></div><button class="hsr-profile-x" type="button" aria-label="إغلاق">×</button></div>
      <div class="hsr-profile-section"><div class="hsr-profile-section-title">البيانات الأساسية</div><div class="hsr-profile-extra">
        ${field('الاسم', 'hsr-edit-name', employee.name, { wide:true })}
        ${field('الرقم الوظيفي', 'hsr-edit-ref', employee.employeeRef || '')}
        ${field('رقم الجوال', 'hsr-edit-phone', employee.phone || '', { type:'tel' })}
        ${field('البريد الإلكتروني', 'hsr-edit-email', employee.email || '', { type:'email', disabled: linked })}
        ${field('المسمى الوظيفي', 'hsr-edit-title', employee.jobTitle || '')}
        ${selectField('الحالة الوظيفية', 'hsr-edit-employment', employee.employmentStatus || 'active', [['active','على رأس العمل'],['inactive','غير نشط']])}
      </div>${linked ? '<div class="hsr-profile-hint">البريد مرتبط بحساب دخول فعّال، لذلك لا يغيّر من هذا النموذج. تغيير بريد الدخول يحتاج مسار تحقق أمني مستقل.</div>' : ''}</div>
      <div class="hsr-profile-section"><div class="hsr-profile-section-title">العمل والتنظيم</div><div class="hsr-profile-extra">
        ${field('الإدارة', 'hsr-edit-administration', employee.administration || '')}
        ${field('القسم', 'hsr-edit-department', employee.department || '')}
        ${selectField('المدير المباشر', 'hsr-edit-manager', employee.directManagerEmployeeId || '', managers, { wide:true })}
      </div><div class="hsr-profile-hint">أي تغيير في الإدارة أو القسم أو المدير المباشر يسجل كحركة تنظيمية في Transfer History.</div></div>
      <button class="hsr-profile-save" type="button">حفظ التعديلات</button><div class="hsr-profile-status" aria-live="polite"></div>
    </div>`;
    document.body.appendChild(modal);
    const card = modal.querySelector('.hsr-profile-card');
    const close = () => modal.remove();
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    card.querySelector('.hsr-profile-x').addEventListener('click', close);

    const save = card.querySelector('.hsr-profile-save');
    const status = card.querySelector('.hsr-profile-status');
    save.addEventListener('click', async () => {
      const name = clean(card.querySelector('#hsr-edit-name').value);
      if (!name) { status.className='hsr-profile-status err'; status.textContent='الاسم مطلوب.'; return; }
      save.disabled = true;
      status.className='hsr-profile-status';
      status.textContent='جاري حفظ التعديلات...';
      try {
        const profilePayload = {
          action: 'updateProfile',
          employeeId: employee.employeeId,
          name,
          employeeRef: clean(card.querySelector('#hsr-edit-ref').value),
          phone: clean(card.querySelector('#hsr-edit-phone').value),
          jobTitle: clean(card.querySelector('#hsr-edit-title').value),
          employmentStatus: card.querySelector('#hsr-edit-employment').value,
        };
        if (!linked) profilePayload.email = clean(card.querySelector('#hsr-edit-email').value);
        await post('/api/admin/employee-profile', profilePayload);

        const administration = clean(card.querySelector('#hsr-edit-administration').value);
        const department = clean(card.querySelector('#hsr-edit-department').value);
        const directManagerEmployeeId = card.querySelector('#hsr-edit-manager').value;
        const moved = administration !== clean(employee.administration) || department !== clean(employee.department) || directManagerEmployeeId !== clean(employee.directManagerEmployeeId);
        if (moved) {
          await post('/api/admin/employees', {
            action: 'transfer',
            employeeId: employee.employeeId,
            administration,
            department,
            directManagerEmployeeId,
          });
        }
        cache.at = 0;
        status.className='hsr-profile-status ok';
        status.textContent='تم حفظ بيانات الموظف وتسجيل التغييرات.';
        await sleep(600);
        close();
      } catch (error) {
        status.className='hsr-profile-status err';
        status.textContent=errorMessage(error.reason || error.message);
      } finally {
        save.disabled = false;
      }
    });
  }

  function findUserDrawer() {
    return fixedOverlays().find(overlay => {
      const t = text(overlay);
      return t.includes('إعادة تعيين كلمة المرور') && t.includes('البريد الإلكتروني') && !overlay.classList.contains('hsr-profile-modal');
    });
  }

  async function resolveUserFromDrawer(drawer) {
    const directory = await refreshDirectory();
    const drawerText = text(drawer);
    const emailMatches = drawerText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
    for (const email of emailMatches) {
      const match = directory.users.find(user => clean(user.email).toLowerCase() === email.toLowerCase());
      if (match) return match;
    }
    const nameMatches = directory.users.filter(user => user.name && drawerText.includes(user.name));
    return nameMatches.length === 1 ? nameMatches[0] : null;
  }

  function patchManualPassword() {
    const drawer = findUserDrawer();
    if (!drawer || drawer.dataset.hsrManualPassword === 'true') return;
    drawer.dataset.hsrManualPassword = 'true';
    const button = Array.from(drawer.querySelectorAll('button')).find(btn => text(btn) === 'إعادة تعيين كلمة المرور');
    if (!button) return;
    button.textContent = 'تعيين كلمة المرور';
    button.setAttribute('aria-label', 'تعيين كلمة مرور جديدة للمستخدم');
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      try {
        const user = await resolveUserFromDrawer(drawer);
        if (!user) throw new Error('record_not_found');
        openPasswordDialog(user);
      } catch (error) {
        window.alert(errorMessage(error.reason || error.message));
      }
    }, true);
  }

  function validPassword(password) {
    return password.length >= 8 && password === password.trim() && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
  }

  function openPasswordDialog(user) {
    document.getElementById('hsr-password-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'hsr-password-modal';
    modal.className = 'hsr-profile-modal';
    modal.innerHTML = `<div class="hsr-profile-card hsr-password-card" role="dialog" aria-modal="true" aria-label="تعيين كلمة المرور">
      <div class="hsr-profile-head"><div class="hsr-profile-head-main"><div class="hsr-profile-eyebrow">الحساب والأمان</div><h3>تعيين كلمة المرور</h3><p>${escapeHtml(user.email || user.name || 'المستخدم')} · لن يتم حفظ كلمة المرور في قاعدة البيانات.</p></div><button class="hsr-profile-x" type="button" aria-label="إغلاق">×</button></div>
      <div class="hsr-profile-extra">
        ${field('كلمة المرور الجديدة', 'hsr-new-password', '', { type:'password', wide:true, autocomplete:'new-password' })}
        ${field('تأكيد كلمة المرور', 'hsr-confirm-password', '', { type:'password', wide:true, autocomplete:'new-password' })}
      </div>
      <div class="hsr-password-rules">8 أحرف على الأقل، وتتضمن حرفًا إنجليزيًا كبيرًا وصغيرًا ورقمًا ورمزًا خاصًا. بعد التعيين تُلغى الجلسات السابقة ويُطلب من المستخدم تغييرها عند دخوله التالي.</div>
      <button class="hsr-profile-save" type="button" style="margin-top:14px">تعيين كلمة المرور</button><div class="hsr-profile-status" aria-live="polite"></div>
    </div>`;
    document.body.appendChild(modal);
    const card = modal.querySelector('.hsr-profile-card');
    const close = () => modal.remove();
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    card.querySelector('.hsr-profile-x').addEventListener('click', close);
    const save = card.querySelector('.hsr-profile-save');
    const status = card.querySelector('.hsr-profile-status');
    save.addEventListener('click', async () => {
      const password = card.querySelector('#hsr-new-password').value;
      const confirmation = card.querySelector('#hsr-confirm-password').value;
      if (password !== confirmation) { status.className='hsr-profile-status err'; status.textContent='كلمتا المرور غير متطابقتين.'; return; }
      if (!validPassword(password)) { status.className='hsr-profile-status err'; status.textContent='كلمة المرور لا تطابق سياسة الأمان الموضحة.'; return; }
      save.disabled = true;
      status.className='hsr-profile-status';
      status.textContent='جاري تعيين كلمة المرور وإلغاء الجلسات السابقة...';
      try {
        await post('/api/admin/users', { action:'setTempPassword', uid:user.uid, password });
        status.className='hsr-profile-status ok';
        status.textContent='تم تعيين كلمة المرور وإلغاء الجلسات السابقة بنجاح.';
        card.querySelector('#hsr-new-password').value='';
        card.querySelector('#hsr-confirm-password').value='';
        await sleep(800);
        close();
      } catch (error) {
        status.className='hsr-profile-status err';
        status.textContent=errorMessage(error.reason || error.message);
      } finally {
        save.disabled = false;
      }
    });
  }

  function patchAll() {
    patchAddEmployee();
    patchEmployeeDrawer();
    patchManualPassword();
  }

  function start() {
    injectStyle();
    patchAll();
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; patchAll(); });
    }).observe(document.body, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();