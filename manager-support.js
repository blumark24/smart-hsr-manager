// SMART HSR — institutional support chat for Municipality Manager.
// Uses the already-verified Manager session from manager-dashboard-adapter.js.
// No direct Firestore access and no fabricated AI responses.

const API = '/api/admin/users';

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

async function call(action, extra = {}) {
  const adapter = window.SmartHSRManagerAdapter;
  const token = adapter && await adapter.getIdToken?.();
  if (!token) throw new Error('no_session');
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, ...extra }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.reason || body.error || 'request_failed');
  return body;
}

function ensureStyles() {
  if (document.getElementById('smartHsrManagerSupportStyles')) return;
  const style = document.createElement('style');
  style.id = 'smartHsrManagerSupportStyles';
  style.textContent = `
    #smartHsrSupportFab{position:fixed;inset-inline-end:18px;bottom:20px;z-index:2140;border:0;border-radius:999px;padding:12px 16px;background:linear-gradient(135deg,#0b3557,#0aa36c);color:#fff;font:700 13px/1 Cairo,system-ui;box-shadow:0 14px 38px rgba(0,0,0,.25);cursor:pointer}
    #smartHsrSupportPanel{position:fixed;inset-inline-end:18px;bottom:76px;z-index:2141;width:min(390px,calc(100vw - 24px));max-height:min(620px,calc(100vh - 110px));display:none;flex-direction:column;border:1px solid rgba(148,163,184,.25);border-radius:20px;overflow:hidden;background:#071a2e;color:#f8fafc;box-shadow:0 24px 70px rgba(0,0,0,.42);font-family:Cairo,system-ui}
    #smartHsrSupportPanel[data-open="true"]{display:flex}
    .shsr-sp-head{padding:14px 15px;background:linear-gradient(135deg,#0b2947,#0a5a4b);display:flex;align-items:center;justify-content:space-between;gap:10px}
    .shsr-sp-head small{display:block;color:#cbd5e1;margin-top:3px}
    .shsr-sp-close{border:0;background:rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:7px 10px;cursor:pointer}
    .shsr-sp-body{padding:10px;display:flex;flex-direction:column;gap:8px;min-height:260px;overflow:auto}
    .shsr-sp-msg{max-width:84%;padding:9px 11px;border-radius:14px;background:#102b46;border:1px solid rgba(148,163,184,.2);font-size:13px}
    .shsr-sp-msg[data-role="manager"]{align-self:flex-end;background:#0b4f55}
    .shsr-sp-msg[data-role="owner"]{align-self:flex-start;background:#12365a}
    .shsr-sp-msg[data-role="system"]{align-self:center;max-width:94%;background:#102235;color:#cbd5e1}
    .shsr-sp-msg small{display:block;color:#94a3b8;margin-top:4px}
    .shsr-sp-form{padding:10px;border-top:1px solid rgba(148,163,184,.16);display:grid;grid-template-columns:1fr auto;gap:8px}
    .shsr-sp-form textarea{min-height:66px;max-height:150px;resize:vertical;border:1px solid rgba(148,163,184,.28);border-radius:12px;background:#071522;color:#fff;padding:9px;font:13px Cairo,system-ui}
    .shsr-sp-form button{border:0;border-radius:12px;padding:0 14px;background:#10b981;color:#fff;font-weight:800;cursor:pointer}
    .shsr-sp-status{padding:0 10px 9px;color:#94a3b8;font-size:11px;min-height:18px}
    @media(max-width:560px){#smartHsrSupportFab{inset-inline-end:12px;bottom:12px}#smartHsrSupportPanel{inset-inline-end:12px;bottom:66px}}
  `;
  document.head.appendChild(style);
}

let initialized = false;
let opened = false;

function renderMessages(messages) {
  const root = document.getElementById('smartHsrSupportMessages');
  if (!root) return;
  root.replaceChildren();
  if (!Array.isArray(messages) || !messages.length) {
    root.innerHTML = '<div class="shsr-sp-msg" data-role="system">ابدأ المحادثة بكتابة المشكلة أو الملاحظة.</div>';
    return;
  }
  for (const item of messages) {
    const node = document.createElement('div');
    node.className = 'shsr-sp-msg';
    node.dataset.role = item.senderRole || 'system';
    node.innerHTML = '<div>'+esc(item.text || '')+'</div><small>'+(item.createdAt ? esc(new Date(item.createdAt).toLocaleString('ar-SA')) : '')+'</small>';
    root.appendChild(node);
  }
  root.scrollTop = root.scrollHeight;
}

async function refreshThread() {
  const status = document.getElementById('smartHsrSupportStatus');
  if (status) status.textContent = 'جاري تحديث قناة الدعم…';
  try {
    await call('supportThreadOpen');
    const data = await call('supportThreadGet');
    renderMessages(data.messages || []);
    if (status) status.textContent = data.thread?.status === 'resolved' ? 'الحالة: محلولة' : data.thread?.status === 'pending' ? 'الحالة: بانتظار متابعة' : 'الحالة: مفتوحة';
  } catch (error) {
    if (status) status.textContent = 'تعذر فتح قناة الدعم: ' + String(error.message || error);
  }
}

function ensureUi() {
  if (initialized) return;
  ensureStyles();
  const fab = document.createElement('button');
  fab.id = 'smartHsrSupportFab';
  fab.type = 'button';
  fab.textContent = 'الدعم الفني';

  const panel = document.createElement('section');
  panel.id = 'smartHsrSupportPanel';
  panel.setAttribute('aria-label', 'الدعم الفني SMART HSR');
  panel.innerHTML = `
    <div class="shsr-sp-head">
      <div><strong>الدعم الفني — SMART HSR</strong><small>قناة المؤسسة مع فريق المنصة</small></div>
      <button id="smartHsrSupportClose" class="shsr-sp-close" type="button">إغلاق</button>
    </div>
    <div id="smartHsrSupportMessages" class="shsr-sp-body"><div class="shsr-sp-msg" data-role="system">جاري تجهيز قناة الدعم…</div></div>
    <form id="smartHsrSupportForm" class="shsr-sp-form">
      <textarea name="text" maxlength="4000" placeholder="اكتب المشكلة أو الملاحظة…" required></textarea>
      <button type="submit">إرسال</button>
    </form>
    <div id="smartHsrSupportStatus" class="shsr-sp-status"></div>
  `;

  document.body.append(fab, panel);
  initialized = true;

  const toggle = async (value) => {
    opened = value;
    panel.dataset.open = String(opened);
    if (opened) await refreshThread();
  };

  fab.addEventListener('click', () => toggle(!opened));
  panel.querySelector('#smartHsrSupportClose').addEventListener('click', () => toggle(false));
  panel.querySelector('#smartHsrSupportForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const textarea = form.elements.text;
    const button = form.querySelector('button[type="submit"]');
    const text = String(textarea.value || '').trim();
    if (!text) return;
    button.disabled = true;
    const status = document.getElementById('smartHsrSupportStatus');
    if (status) status.textContent = 'جاري الإرسال…';
    try {
      await call('supportThreadSend', { text });
      textarea.value = '';
      await refreshThread();
    } catch (error) {
      if (status) status.textContent = 'تعذر إرسال الرسالة: ' + String(error.message || error);
    } finally {
      button.disabled = false;
    }
  });
}

function boot() {
  if (window.SmartHSRManagerAdapter) ensureUi();
  else window.addEventListener('smart-hsr-manager-adapter-ready', ensureUi, { once: true });
}

boot();
