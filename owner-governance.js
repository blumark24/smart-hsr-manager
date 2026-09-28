import { auth } from './owner-firebase-client.js';

const ADMIN_API = '/api/admin/users';
let cache = null;
let loadedAt = 0;
const CACHE_MS = 15000;

function e(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  if (text !== '') node.textContent = text;
  return node;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function money(value) {
  return new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 2 }).format(Number(value) || 0);
}

async function call(action, extra = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('owner_session_required');
  const token = await user.getIdToken();
  const res = await fetch(ADMIN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, ...extra }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.reason || body.error || 'request_failed');
  return body;
}

export async function getOwnerOpsSnapshot(force = false) {
  if (!force && cache && Date.now() - loadedAt < CACHE_MS) return cache;
  cache = await call('ownerOpsSnapshot');
  loadedAt = Date.now();
  return cache;
}

function ensureLiveShell(route, title, subtitle) {
  const root = document.querySelector('[data-route="' + route + '"]');
  if (!root) return null;
  if (root.dataset.liveOwnerOps === '1') return root;
  root.dataset.liveOwnerOps = '1';
  root.innerHTML = '';
  const head = e('div');
  head.innerHTML = `
    <div class="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-xl font-extrabold title">${esc(title)}</h2>
        <p class="muted text-xs mt-1">${esc(subtitle)}</p>
      </div>
      <button type="button" class="btn btn-outline" data-owner-ops-refresh>تحديث حي</button>
    </div>
    <p class="owner-ext-message" data-owner-ops-message role="status" aria-live="polite"></p>
    <div data-owner-ops-body class="space-y-4"></div>
  `;
  root.appendChild(head);
  root.querySelector('[data-owner-ops-refresh]').addEventListener('click', () => renderRoute(route, true));
  return root;
}

function stat(label, value, detail = '') {
  return `<div class="owner-ext-stat"><span class="muted text-xs">${esc(label)}</span><strong>${esc(value)}</strong>${detail ? '<div class="muted text-xs mt-1">'+esc(detail)+'</div>' : ''}</div>`;
}

function renderAudit(snapshot, body) {
  const events = Array.isArray(snapshot.audit) ? snapshot.audit : [];
  body.innerHTML = `
    <section class="owner-ext-grid">
      ${stat('الأحداث المعروضة', events.length)}
      ${stat('مصادر التدقيق', snapshot.health?.auditSourcesReadable ?? 0, 'من 3 مصادر')}
      ${stat('آخر تحديث', new Date(snapshot.observedAt).toLocaleTimeString('ar-SA'))}
      ${stat('الحالة', events.length ? 'نشط' : 'لا توجد أحداث')}
    </section>
    <section class="card p-4">
      <div class="flex items-center justify-between gap-2 flex-wrap"><h3 class="font-bold title">سجل الإجراءات الفعلي</h3><span class="pill">Append-only sources</span></div>
      <div class="owner-ext-list" data-audit-list></div>
    </section>
  `;
  const list = body.querySelector('[data-audit-list]');
  if (!events.length) {
    list.innerHTML = '<p class="muted text-sm">لا توجد أحداث مدققة ضمن النطاق الحالي.</p>';
    return;
  }
  for (const item of events) {
    const row = e('div', { class: 'owner-ext-row', 'data-level': 'ok' });
    row.innerHTML = `
      <div class="flex justify-between gap-2 flex-wrap">
        <strong>${esc(item.action)}</strong><span class="pill">${esc(item.source)}</span>
      </div>
      <div class="muted text-xs mt-1">الدور: ${esc(item.actorRole || '—')} · المؤسسة: ${esc(item.organizationId || '—')} · المورد: ${esc(item.resourceType || '—')}</div>
      <div class="muted text-xs mt-1">الوقت: ${item.at ? esc(new Date(item.at).toLocaleString('ar-SA')) : 'غير متاح'}</div>
    `;
    list.appendChild(row);
  }
}

function renderSecurity(snapshot, body) {
  const s = snapshot.security || {};
  const issues = [];
  if (s.ownerLimitExceeded) issues.push('عدد حسابات Owner تجاوز الحد المعتمد (3).');
  if (s.orphanManagers) issues.push(`يوجد ${s.orphanManagers} مدير مرتبط بمؤسسة غير موجودة.`);
  if (s.orphanUsers) issues.push(`يوجد ${s.orphanUsers} مستخدم مرتبط بمؤسسة غير موجودة.`);
  if (s.duplicateManagerOrganizations) issues.push(`يوجد ${s.duplicateManagerOrganizations} مؤسسة لها أكثر من مدير.`);
  if (s.currentOwnerAuth?.disabled) issues.push('حساب Owner الحالي معطّل في Firebase Auth.');
  body.innerHTML = `
    <section class="owner-ext-grid">
      ${stat('Owners', s.owners?.active ?? 0, 'نشط')}
      ${stat('المديرون', s.managers?.active ?? 0, 'نشط')}
      ${stat('المستخدمون', s.users?.active ?? 0, 'نشط')}
      ${stat('ملاحظات الأمان', issues.length, issues.length ? 'تحتاج مراجعة' : 'لا توجد ملاحظات بنيوية')}
    </section>
    <section class="card p-4">
      <h3 class="font-bold title">فحص العزل والحسابات</h3>
      <div class="owner-ext-list" data-security-list></div>
    </section>
  `;
  const list = body.querySelector('[data-security-list]');
  const facts = [
    ['حساب Owner الحالي', s.currentOwnerAuth?.lookupFailed ? 'تعذر التحقق' : (s.currentOwnerAuth?.disabled ? 'معطل' : 'نشط')],
    ['Owners غير النشطين', s.owners?.inactive ?? 0],
    ['مديرون غير نشطين', s.managers?.inactive ?? 0],
    ['مستخدمون غير نشطين', s.users?.inactive ?? 0],
    ['مديرون بلا مؤسسة', s.orphanManagers ?? 0],
    ['مستخدمون بلا مؤسسة', s.orphanUsers ?? 0],
    ['مؤسسات بأكثر من مدير', s.duplicateManagerOrganizations ?? 0],
  ];
  for (const [label, value] of facts) {
    const row = e('div', { class: 'owner-ext-row', 'data-level': String(value) === '0' || value === 'نشط' ? 'ok' : 'manual' });
    row.innerHTML = '<div class="font-bold">'+esc(label)+'</div><div class="muted text-xs mt-1">'+esc(value)+'</div>';
    list.appendChild(row);
  }
  if (issues.length) {
    for (const issue of issues) {
      const row = e('div', { class: 'owner-ext-row', 'data-level': 'manual' });
      row.textContent = issue;
      list.appendChild(row);
    }
  }
}

function renderReports(snapshot, body) {
  const r = snapshot.reports || {};
  const org = r.organizations || {};
  const inv = r.invoices || {};
  const workforce = r.workforce || {};
  body.innerHTML = `
    <section class="owner-ext-grid">
      ${stat('إجمالي المؤسسات', org.total ?? 0, 'نشطة: '+(org.active ?? 0))}
      ${stat('الإيراد المحصل', money(inv.paidTotal))}
      ${stat('المبالغ غير المحصلة', money(inv.outstandingTotal))}
      ${stat('القوى التشغيلية', workforce.total ?? 0, 'مديرون + مستخدمون')}
    </section>
    <section class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div class="card p-4"><h3 class="font-bold title">المؤسسات حسب الخطة</h3><div class="owner-ext-list" data-plan-list></div></div>
      <div class="card p-4"><h3 class="font-bold title">الفواتير حسب الحالة</h3><div class="owner-ext-list" data-invoice-status-list></div></div>
    </section>
  `;
  const plans = body.querySelector('[data-plan-list]');
  for (const [key, value] of Object.entries(org.plans || {})) {
    const row = e('div', { class: 'owner-ext-row', 'data-level': 'ok' });
    row.innerHTML = '<div class="flex justify-between gap-2"><strong>'+esc(key)+'</strong><span class="pill">'+esc(value)+'</span></div>';
    plans.appendChild(row);
  }
  if (!plans.children.length) plans.innerHTML = '<p class="muted text-sm">لا توجد بيانات خطط.</p>';
  const statuses = body.querySelector('[data-invoice-status-list]');
  for (const [key, value] of Object.entries(inv.statuses || {})) {
    const row = e('div', { class: 'owner-ext-row', 'data-level': 'ok' });
    row.innerHTML = '<div class="flex justify-between gap-2"><strong>'+esc(key)+'</strong><span class="pill">'+esc(value)+'</span></div>';
    statuses.appendChild(row);
  }
  if (!statuses.children.length) statuses.innerHTML = '<p class="muted text-sm">لا توجد فواتير.</p>';
}

function renderHealth(snapshot, body) {
  const h = snapshot.health || {};
  const reads = h.firestoreReads || {};
  const checks = [
    ['Firebase Admin', h.firebaseAdmin === true],
    ['هوية Owner', h.ownerIdentityHealthy === true],
    ...Object.entries(reads).map(([name, ok]) => ['Firestore: '+name, ok === true]),
  ];
  const okCount = checks.filter(([, ok]) => ok).length;
  body.innerHTML = `
    <section class="owner-ext-grid">
      ${stat('الفحوص السليمة', okCount)}
      ${stat('إجمالي الفحوص', checks.length)}
      ${stat('قراءات فاشلة', h.readFailures?.length ?? 0)}
      ${stat('معمارية API', h.functionArchitecture || '—')}
    </section>
    <section class="card p-4"><h3 class="font-bold title">حالة البنية الحية</h3><div class="owner-ext-list" data-health-list></div></section>
  `;
  const list = body.querySelector('[data-health-list]');
  for (const [label, ok] of checks) {
    const row = e('div', { class: 'owner-ext-row', 'data-level': ok ? 'ok' : 'critical' });
    row.innerHTML = '<div class="flex justify-between gap-2"><strong>'+esc(label)+'</strong><span class="pill">'+(ok ? 'سليم' : 'فشل')+'</span></div>';
    list.appendChild(row);
  }
}

const meta = {
  '/audit': ['سجلات التدقيق', 'قراءة فعلية من سجلات المنصة، بدون أحداث تجريبية.', renderAudit],
  '/security': ['مركز الأمان', 'فحص الحسابات والعزل المؤسسي والحالات غير الطبيعية من البيانات الفعلية.', renderSecurity],
  '/reports': ['التقارير التنفيذية', 'ملخص حي للمؤسسات والفواتير والقوى التشغيلية.', renderReports],
  '/health': ['صحة النظام', 'فحص حي لاتصال Firebase Admin وقراءات Firestore ومصادر التدقيق.', renderHealth],
};

export async function renderOwnerOpsRoute(route, force = false) {
  const item = meta[route];
  if (!item) return;
  const root = ensureLiveShell(route, item[0], item[1]);
  if (!root) return;
  const msg = root.querySelector('[data-owner-ops-message]');
  const body = root.querySelector('[data-owner-ops-body]');
  msg.textContent = 'جاري قراءة الحالة الفعلية…';
  msg.style.color = 'var(--muted)';
  try {
    const snapshot = await getOwnerOpsSnapshot(force);
    item[2](snapshot, body);
    msg.textContent = 'تم التحديث: ' + new Date(snapshot.observedAt).toLocaleString('ar-SA');
    msg.style.color = 'var(--emerald)';
  } catch (error) {
    body.innerHTML = '<section class="card p-4"><p style="color:var(--rose)">تعذر قراءة البيانات الحية. لم يتم عرض بيانات بديلة أو تجريبية.</p></section>';
    msg.textContent = String(error && error.message || 'request_failed');
    msg.style.color = 'var(--rose)';
  }
}
