import { auth } from './owner-firebase-client.js';
import { runOwnerSupportDiagnostics, applyOwnerSafeRepairs, summarizeSupportResults } from './owner-support.js';

const ACCOUNTS_API = '/api/admin/platform-accounts';

function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value);
  }
  if (html) node.innerHTML = html;
  return node;
}

async function accountsCall(payload) {
  const user = auth.currentUser;
  if (!user) throw new Error('owner_session_required');
  const token = await user.getIdToken();
  const response = await fetch(ACCOUNTS_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) {
    const error = new Error(data.error || `http_${response.status}`);
    error.payload = data;
    throw error;
  }
  return data;
}

function ensureStyles() {
  if (document.getElementById('ownerExtensionStyles')) return;
  const style = el('style', { id: 'ownerExtensionStyles' });
  style.textContent = `
    .owner-ext-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .owner-ext-stat{padding:14px;border:1px solid var(--stroke);border-radius:14px;background:var(--chip)}
    .owner-ext-stat strong{display:block;font-size:1.55rem;margin-top:4px}
    .owner-ext-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .owner-ext-list{display:grid;gap:10px;margin-top:12px}
    .owner-ext-row{border:1px solid var(--stroke);border-radius:14px;padding:12px;background:var(--card)}
    .owner-ext-row[data-level="critical"]{border-inline-start:4px solid var(--rose)}
    .owner-ext-row[data-level="manual"]{border-inline-start:4px solid var(--amber)}
    .owner-ext-row[data-level="repairable"]{border-inline-start:4px solid var(--cyan)}
    .owner-ext-row[data-level="ok"]{border-inline-start:4px solid var(--emerald)}
    .owner-ext-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .owner-ext-form label{display:grid;gap:5px;font-size:.82rem;font-weight:700}
    .owner-ext-form input,.owner-ext-form select{min-height:44px;border:1px solid var(--stroke);border-radius:12px;background:transparent;color:var(--text);padding:8px 10px}
    .owner-ext-account{border:1px solid var(--stroke);border-radius:16px;padding:14px;background:var(--card)}
    .owner-ext-account-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
    .owner-ext-perms{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:10px}
    .owner-ext-perms label{display:flex;align-items:center;gap:7px;font-size:.8rem}
    .owner-ext-message{min-height:22px;font-size:.82rem;margin-top:8px}
    @media(max-width:900px){.owner-ext-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:640px){.owner-ext-grid,.owner-ext-form,.owner-ext-perms{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function ensureNavigation() {
  const nav = document.querySelector('aside nav');
  if (!nav) return;
  if (!nav.querySelector('[data-route-link="/support"]')) {
    const label = el('div', { class: 'sidebar-group-label', 'data-owner-extension': 'support-group' }, 'الدعم والإدارة العليا');
    const support = el('a', { class: 'sidebar-link', 'data-route-link': '/support', href: '#/support' }, '🛠️ الدعم الفني الذكي');
    const accounts = el('a', { class: 'sidebar-link', 'data-route-link': '/accounts', href: '#/accounts' }, '👑 الحسابات العليا');
    nav.append(label, support, accounts);
  }
}

function ensureSupportView(main) {
  let view = main.querySelector('[data-route="/support"]');
  if (view) return view;
  view = el('div', { class: 'module-view hidden space-y-4', 'data-route': '/support' });
  view.innerHTML = `
    <div>
      <h2 class="text-xl font-extrabold title">مركز الدعم الفني الذكي</h2>
      <p class="muted text-xs mt-1">فحص حقيقي لبيانات المؤسسات والحسابات والخريطة والفواتير، مع إصلاحات آمنة ومحدودة فقط.</p>
    </div>
    <section class="card p-4">
      <div class="owner-ext-toolbar">
        <button id="ownerSupportScan" class="btn btn-primary" type="button">فحص الآن</button>
        <button id="ownerSupportRepair" class="btn btn-outline" type="button" disabled>إصلاح آمن تلقائي</button>
        <span id="ownerSupportLastRun" class="muted text-xs">لم يتم الفحص بعد</span>
      </div>
      <p id="ownerSupportMessage" class="owner-ext-message" role="status" aria-live="polite"></p>
    </section>
    <section class="owner-ext-grid">
      <div class="owner-ext-stat"><span class="muted text-xs">سليم</span><strong id="supportOk">—</strong></div>
      <div class="owner-ext-stat"><span class="muted text-xs">قابل للإصلاح الآمن</span><strong id="supportRepairable">—</strong></div>
      <div class="owner-ext-stat"><span class="muted text-xs">يحتاج تدخل</span><strong id="supportManual">—</strong></div>
      <div class="owner-ext-stat"><span class="muted text-xs">حرج</span><strong id="supportCritical">—</strong></div>
    </section>
    <section class="card p-4">
      <div class="flex items-center justify-between gap-2 flex-wrap"><h3 class="font-bold title">نتائج الفحص</h3><span class="pill">Live Diagnostics</span></div>
      <div id="ownerSupportResults" class="owner-ext-list"><p class="muted text-sm">اضغط «فحص الآن» لقراءة الحالة الفعلية.</p></div>
    </section>
  `;
  const footer = main.querySelector('footer');
  if (footer) main.insertBefore(view, footer); else main.appendChild(view);
  return view;
}

function ensureAccountsView(main) {
  let view = main.querySelector('[data-route="/accounts"]');
  if (view) return view;
  view = el('div', { class: 'module-view hidden space-y-4', 'data-route': '/accounts' });
  view.innerHTML = `
    <div>
      <h2 class="text-xl font-extrabold title">إدارة الحسابات العليا</h2>
      <p class="muted text-xs mt-1">حد أقصى 3 حسابات Owner و3 مساعدين إداريين. كلمات المرور لا تُعرض ولا تُخزن في Firestore.</p>
    </div>
    <section class="card p-4">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div><h3 class="font-bold title">إضافة حساب</h3><p class="muted text-xs mt-1">Owner أو مساعد إداري بصلاحيات تشغيلية محدودة.</p></div>
        <button id="ownerAccountsRefresh" class="btn btn-outline" type="button">تحديث الحسابات</button>
      </div>
      <form id="ownerAccountCreateForm" class="owner-ext-form mt-4" autocomplete="off">
        <label>نوع الحساب<select name="type"><option value="assistant">مساعد إداري</option><option value="owner">Owner</option></select></label>
        <label>الاسم<input name="name" maxlength="100" required></label>
        <label>البريد الإلكتروني<input name="email" type="email" autocomplete="off" required></label>
        <label>كلمة مرور أولية<input name="password" type="password" autocomplete="new-password" minlength="12" required></label>
        <div class="md:col-span-2 owner-ext-toolbar"><button class="btn btn-primary" type="submit">إنشاء الحساب</button><span class="muted text-xs">12+ حرف، كبير وصغير ورقم ورمز.</span></div>
      </form>
      <p id="ownerAccountsMessage" class="owner-ext-message" role="status" aria-live="polite"></p>
    </section>
    <section class="card p-4">
      <div class="flex items-center justify-between gap-2 flex-wrap"><h3 class="font-bold title">الحسابات الحالية</h3><span id="ownerAccountsLimit" class="pill">حد الحسابات: 3 لكل نوع</span></div>
      <div id="ownerAccountsList" class="owner-ext-list"><p class="muted text-sm">جاري تحميل الحسابات عند فتح القسم.</p></div>
    </section>
  `;
  const footer = main.querySelector('footer');
  if (footer) main.insertBefore(view, footer); else main.appendChild(view);
  return view;
}

function setMessage(id, text, ok = false) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = text || '';
  node.style.color = ok ? 'var(--emerald)' : text ? 'var(--rose)' : '';
}

let latestSupportResults = [];
let supportBound = false;
function bindSupport() {
  if (supportBound) return;
  const scan = document.getElementById('ownerSupportScan');
  const repair = document.getElementById('ownerSupportRepair');
  const output = document.getElementById('ownerSupportResults');
  if (!scan || !repair || !output) return;
  supportBound = true;

  async function runScan() {
    scan.disabled = true;
    repair.disabled = true;
    setMessage('ownerSupportMessage', 'جاري تنفيذ الفحص الفعلي…', true);
    try {
      latestSupportResults = await runOwnerSupportDiagnostics();
      const summary = summarizeSupportResults(latestSupportResults);
      document.getElementById('supportOk').textContent = summary.ok;
      document.getElementById('supportRepairable').textContent = summary.repairable;
      document.getElementById('supportManual').textContent = summary.manual;
      document.getElementById('supportCritical').textContent = summary.critical;
      document.getElementById('ownerSupportLastRun').textContent = `آخر فحص: ${new Date().toLocaleString('ar-SA')}`;
      output.replaceChildren();
      for (const item of latestSupportResults) {
        const row = el('div', { class: 'owner-ext-row', 'data-level': item.level });
        row.innerHTML = `<div class="font-bold">${escapeHtml(item.title)}</div><div class="muted text-xs mt-1">${escapeHtml(item.detail)}</div>`;
        output.appendChild(row);
      }
      repair.disabled = summary.repairable === 0;
      setMessage('ownerSupportMessage', `اكتمل الفحص: ${latestSupportResults.length} نتيجة موثقة.`, true);
    } catch (error) {
      setMessage('ownerSupportMessage', `تعذر إكمال الفحص: ${humanError(error)}`);
    } finally {
      scan.disabled = false;
    }
  }

  scan.addEventListener('click', runScan);
  repair.addEventListener('click', async () => {
    if (!latestSupportResults.some((item) => item.level === 'repairable')) return;
    repair.disabled = true;
    setMessage('ownerSupportMessage', 'جاري تطبيق الإصلاحات الآمنة فقط…', true);
    try {
      const result = await applyOwnerSafeRepairs(latestSupportResults);
      setMessage('ownerSupportMessage', `تم تعديل ${result.changedFields} حقلًا في ${result.organizationsTouched} مؤسسة. سيعاد الفحص الآن.`, true);
      await runScan();
    } catch (error) {
      setMessage('ownerSupportMessage', `فشل الإصلاح الآمن: ${humanError(error)}`);
    }
  });
}

const PERMISSION_LABELS = Object.freeze({
  'organizations.read': 'قراءة المؤسسات',
  'organizations.manage': 'إدارة المؤسسات',
  'support.read': 'قراءة الدعم',
  'support.manage': 'إدارة الدعم',
  'billing.read': 'قراءة الفواتير',
  'billing.manage': 'إدارة الفواتير',
  'reports.read': 'قراءة التقارير',
  'integrations.read': 'قراءة التكاملات',
});

let accountsBound = false;
let accountsLoaded = false;
async function loadAccounts() {
  const list = document.getElementById('ownerAccountsList');
  if (!list) return;
  list.innerHTML = '<p class="muted text-sm">جاري قراءة الحسابات من Firebase Auth وFirestore…</p>';
  try {
    const data = await accountsCall({ action: 'list' });
    accountsLoaded = true;
    document.getElementById('ownerAccountsLimit').textContent = `الحد: ${data.maxPerRole} Owner + ${data.maxPerRole} مساعد`;
    list.replaceChildren();
    if (!Array.isArray(data.accounts) || data.accounts.length === 0) {
      list.innerHTML = '<p class="muted text-sm">لا توجد حسابات متاحة.</p>';
      return;
    }
    for (const account of data.accounts) list.appendChild(renderAccount(account, data.assistantPermissionKeys || []));
    setMessage('ownerAccountsMessage', `تم تحميل ${data.accounts.length} حسابًا.`, true);
  } catch (error) {
    list.replaceChildren();
    list.innerHTML = `<p class="text-sm" style="color:var(--rose)">${escapeHtml(humanError(error))}</p>`;
    setMessage('ownerAccountsMessage', `تعذر تحميل الحسابات: ${humanError(error)}`);
  }
}

function renderAccount(account, permissionKeys) {
  const card = el('div', { class: 'owner-ext-account', 'data-account-uid': account.uid });
  const roleLabel = account.type === 'owner' ? 'Owner' : 'مساعد إداري';
  const status = account.active ? 'نشط' : 'معطّل';
  card.innerHTML = `
    <div class="owner-ext-account-head">
      <div><div class="font-bold">${escapeHtml(account.name || account.email || account.uid)}</div><div class="muted text-xs mt-1" dir="ltr">${escapeHtml(account.email || '')}</div></div>
      <div class="flex gap-2 flex-wrap"><span class="pill">${roleLabel}</span><span class="pill">${status}</span></div>
    </div>
    <div class="muted text-xs mt-2">آخر دخول: ${account.lastSignInTime ? escapeHtml(new Date(account.lastSignInTime).toLocaleString('ar-SA')) : 'لا تتوفر بيانات دخول'}</div>
    <div class="owner-ext-toolbar mt-3">
      <button class="btn btn-outline" data-action="email" type="button">تغيير البريد</button>
      <button class="btn btn-outline" data-action="password" type="button">تغيير كلمة المرور</button>
      <button class="btn btn-outline" data-action="sessions" type="button">سحب الجلسات</button>
      <button class="btn ${account.active ? 'btn-warn' : 'btn-primary'}" data-action="active" type="button">${account.active ? 'تعطيل' : 'تفعيل'}</button>
    </div>
  `;

  if (account.type === 'assistant') {
    const perms = el('div', { class: 'owner-ext-perms' });
    for (const key of permissionKeys) {
      const id = `perm-${account.uid}-${key.replace(/[^a-z0-9]/gi, '-')}`;
      const label = el('label');
      label.innerHTML = `<input id="${id}" type="checkbox" data-permission="${escapeAttr(key)}" ${account.permissions && account.permissions[key] ? 'checked' : ''}><span>${escapeHtml(PERMISSION_LABELS[key] || key)}</span>`;
      perms.appendChild(label);
    }
    const save = el('button', { class: 'btn btn-primary', type: 'button', 'data-action': 'permissions' }, 'حفظ صلاحيات المساعد');
    card.append(perms, save);
  }

  card.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    button.disabled = true;
    try {
      if (action === 'email') {
        const email = window.prompt('البريد الإلكتروني الجديد:', account.email || '');
        if (!email || email.trim() === account.email) return;
        await accountsCall({ action: 'updateEmail', uid: account.uid, email: email.trim() });
        setMessage('ownerAccountsMessage', 'تم تغيير البريد وسحب الجلسات القديمة.', true);
      } else if (action === 'password') {
        const password = window.prompt('أدخل كلمة مرور جديدة قوية (12 حرفًا على الأقل):');
        if (!password) return;
        await accountsCall({ action: 'setPassword', uid: account.uid, password });
        setMessage('ownerAccountsMessage', 'تم تغيير كلمة المرور وسحب الجلسات القديمة.', true);
      } else if (action === 'sessions') {
        await accountsCall({ action: 'revokeSessions', uid: account.uid });
        setMessage('ownerAccountsMessage', 'تم سحب جلسات الحساب.', true);
      } else if (action === 'active') {
        const desired = !account.active;
        const label = desired ? 'تفعيل' : 'تعطيل';
        if (!window.confirm(`تأكيد ${label} الحساب؟`)) return;
        await accountsCall({ action: 'setActive', uid: account.uid, active: desired });
        setMessage('ownerAccountsMessage', `تم ${label} الحساب.`, true);
      } else if (action === 'permissions') {
        const permissions = {};
        card.querySelectorAll('[data-permission]').forEach((input) => { permissions[input.dataset.permission] = input.checked; });
        await accountsCall({ action: 'setAssistantPermissions', uid: account.uid, permissions });
        setMessage('ownerAccountsMessage', 'تم حفظ صلاحيات المساعد الإداري.', true);
      }
      await loadAccounts();
    } catch (error) {
      setMessage('ownerAccountsMessage', `تعذر تنفيذ الإجراء: ${humanError(error)}`);
    } finally {
      button.disabled = false;
    }
  });
  return card;
}

function bindAccounts() {
  if (accountsBound) return;
  const form = document.getElementById('ownerAccountCreateForm');
  const refresh = document.getElementById('ownerAccountsRefresh');
  if (!form || !refresh) return;
  accountsBound = true;
  refresh.addEventListener('click', loadAccounts);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const data = new FormData(form);
      await accountsCall({
        action: 'create',
        type: data.get('type'),
        name: String(data.get('name') || '').trim(),
        email: String(data.get('email') || '').trim(),
        password: String(data.get('password') || ''),
      });
      form.reset();
      setMessage('ownerAccountsMessage', 'تم إنشاء الحساب فعليًا في Firebase Auth وربطه بدوره.', true);
      await loadAccounts();
    } catch (error) {
      setMessage('ownerAccountsMessage', `تعذر إنشاء الحساب: ${humanError(error)}`);
    } finally {
      submit.disabled = false;
    }
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}
function escapeAttr(value) { return escapeHtml(value); }
function humanError(error) {
  const code = String(error && error.message || 'unknown_error');
  const map = {
    owner_required: 'هذه العملية تتطلب حساب Owner نشط.',
    account_limit_reached: 'تم الوصول إلى الحد الأقصى للحسابات من هذا النوع.',
    last_active_owner_protected: 'لا يمكن تعطيل آخر حساب Owner نشط.',
    weak_password: 'كلمة المرور لا تحقق سياسة الأمان المطلوبة.',
    invalid_email: 'البريد الإلكتروني غير صالح.',
    email_already_exists: 'البريد مستخدم في حساب آخر.',
    account_not_found: 'الحساب غير موجود.',
  };
  return map[code] || code;
}

export function ensureOwnerExtensions() {
  ensureStyles();
  ensureNavigation();
  const main = document.querySelector('main');
  if (!main) return;
  ensureSupportView(main);
  ensureAccountsView(main);
  bindSupport();
  bindAccounts();
}

export async function onOwnerExtensionRoute(route) {
  if (route === '/accounts' && !accountsLoaded) await loadAccounts();
}
