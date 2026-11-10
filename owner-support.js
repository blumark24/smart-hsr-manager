// SMART HSR Owner Support Center — live diagnostics with bounded safe repair.
// No simulated success states. Repairs are limited to deterministic, non-destructive defaults.
import { collection, doc, getDocs, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { auth, db } from './owner-firebase-client.js';
import { fetchOrganizationMapContext } from './spatial-map.js';

const ADMIN_API = '/api/admin/users';
const SAFE_ROUTES = ['/overview','/organizations','/users','/subscriptions','/integrations'];

function issue(level, title, detail, repair = null) { return { level, title, detail, repair }; }
function clean(v) { return typeof v === 'string' ? v.trim() : ''; }

async function adminCall(payload) {
  if (!auth.currentUser) throw new Error('owner_session_required');
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(ADMIN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  let body = {};
  try { body = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(body.reason || body.error || `http_${res.status}`);
  return body;
}

async function readOrganizations() {
  const snap = await getDocs(collection(db, 'organizations'));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
}

async function readInvoices() {
  const snap = await getDocs(collection(db, 'invoices'));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
}

export async function runOwnerSupportDiagnostics() {
  const results = [];

  if (!auth.currentUser) {
    results.push(issue('critical', 'جلسة المالك', 'لا توجد جلسة Firebase موثقة؛ لا يمكن إجراء فحص موثوق.'));
    return results;
  }
  results.push(issue('ok', 'جلسة المالك', 'جلسة المالك موثقة ومتاحة للفحص.'));

  for (const route of SAFE_ROUTES) {
    const hasLink = Boolean(document.querySelector(`[data-route-link="${route}"]`));
    const hasView = Boolean(document.querySelector(`[data-route="${route}"]`));
    results.push(hasLink && hasView
      ? issue('ok', `مسار ${route}`, 'الرابط والواجهة موجودان.')
      : issue('critical', `مسار ${route}`, 'رابط أو واجهة المسار مفقودة.'));
  }

  let organizations;
  try {
    organizations = await readOrganizations();
    results.push(issue('ok', 'قاعدة المؤسسات', `تمت قراءة ${organizations.length} مؤسسة فعليًا من Firestore.`));
  } catch (e) {
    results.push(issue('critical', 'قاعدة المؤسسات', `تعذر قراءة المؤسسات: ${e.message}`));
    return results;
  }

  for (const org of organizations) {
    const name = clean(org.name) || org.id;

    if (!clean(org.name)) results.push(issue('manual', `اسم المؤسسة ${org.id}`, 'اسم المؤسسة مفقود ويحتاج إدخالًا يدويًا.'));
    if (!clean(org.status)) {
      results.push(issue('repairable', `حالة ${name}`, 'status مفقود ويمكن تطبيعه بأمان.', {
        type: 'org-defaults', orgId: org.id, patch: { status: org.plan === 'Trial' ? 'trial' : 'active' }
      }));
    }
    if (!clean(org.billingCycle)) {
      results.push(issue('repairable', `دورة ${name}`, 'billingCycle مفقود ويمكن ضبطه إلى monthly.', {
        type: 'org-defaults', orgId: org.id, patch: { billingCycle: 'monthly' }
      }));
    }
    if (!clean(org.plan)) results.push(issue('manual', `خطة ${name}`, 'الخطة مفقودة؛ لا يتم اختراع خطة تلقائيًا لأنها مرتبطة بالفوترة.'));

    try {
      const map = await fetchOrganizationMapContext(auth, { organizationId: org.id, ownerSelected: true });
      results.push(map && map.configured
        ? issue('ok', `خريطة ${name}`, 'سياق الخريطة موثق للمؤسسة.')
        : issue('manual', `خريطة ${name}`, 'الخريطة غير مكتملة؛ لا يتم اختراع حدود خدمة أو إحداثيات تلقائيًا.'));
    } catch (e) {
      results.push(issue('manual', `خريطة ${name}`, `تعذر التحقق من سياق الخريطة: ${e.message}`));
    }

    try {
      const data = await adminCall({ action: 'list', organizationId: org.id });
      const users = Array.isArray(data.users) ? data.users : [];
      const managers = users.filter(u => u.role === 'manager');
      if (managers.length === 1) results.push(issue('ok', `مدير ${name}`, 'يوجد مدير مؤسسة واحد.'));
      else if (managers.length === 0) results.push(issue('manual', `مدير ${name}`, 'لا يوجد مدير؛ يحتاج إنشاء مدير ببيانات حقيقية.'));
      else results.push(issue('manual', `مدير ${name}`, `يوجد ${managers.length} حسابات مدير وتحتاج مراجعة يدوية.`));
    } catch (e) {
      results.push(issue('manual', `حسابات ${name}`, `تعذر فحص الحسابات عبر Admin API: ${e.message}`));
    }
  }

  try {
    const invoices = await readInvoices();
    const unsupportedPaid = invoices.filter(inv => inv.status === 'paid' && !inv.paidAt && !inv.paymentReference && !inv.transactionId);
    results.push(unsupportedPaid.length
      ? issue('manual', 'الفواتير', `${unsupportedPaid.length} فاتورة تحمل paid بدون مرجع دفع موثق. لن يغيرها الإصلاح التلقائي.`)
      : issue('ok', 'الفواتير', 'لا توجد فواتير paid بلا دليل دفع ضمن الفحص الحالي.'));
  } catch (e) {
    results.push(issue('manual', 'الفواتير', `تعذر فحص الفواتير: ${e.message}`));
  }

  return results;
}

export async function applyOwnerSafeRepairs(results) {
  const byOrg = new Map();
  for (const item of results || []) {
    const repair = item && item.repair;
    if (!repair || repair.type !== 'org-defaults' || !repair.orgId || !repair.patch) continue;
    byOrg.set(repair.orgId, { ...(byOrg.get(repair.orgId) || {}), ...repair.patch });
  }

  let changedFields = 0;
  for (const [orgId, patch] of byOrg.entries()) {
    await updateDoc(doc(db, 'organizations', orgId), { ...patch, updatedAt: serverTimestamp() });
    changedFields += Object.keys(patch).length;
  }
  return { changedFields, organizationsTouched: byOrg.size };
}

export function summarizeSupportResults(results) {
  const summary = { ok: 0, repairable: 0, manual: 0, critical: 0 };
  for (const item of results || []) if (summary[item.level] !== undefined) summary[item.level] += 1;
  return summary;
}
