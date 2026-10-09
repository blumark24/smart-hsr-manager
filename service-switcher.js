(() => {
  'use strict';
  // UNIFIED IDENTITY — Workspace Switcher (display & navigation only).
  // Lists the workspaces the trusted API reports as authorized for the signed
  // in identity and lets the user move between them without logging in again.
  // Authorization is never decided here: the API resolves the list, and each
  // workspace page re-verifies server-side before it renders.
  if (location.pathname.endsWith('/login.html') || location.pathname.endsWith('/workspace.html')) return;
  const PROD_HOSTS = ['smart-hsr-manager.vercel.app', 'smart-hsr-manager-blumark24-os.vercel.app'];
  const LANDS_PROD = 'https://lands-smart.vercel.app/';
  const LANDS_PREVIEW = 'https://lands-smart-git-staging-lands-trusted-audit-blumark24-os.vercel.app/';
  const SAFE_ROUTE = /^[a-z0-9-]+\.html(\?mode=mobility)?$/;

  function currentWorkspace() {
    const file = location.pathname.split('/').pop();
    const mode = new URLSearchParams(location.search).get('mode');
    if (file === 'department-head.html') return mode === 'mobility' ? 'mobility' : 'field';
    if (file === 'admin-affairs.html') return 'admin_affairs';
    return 'field';
  }
  function landsBase() {
    return (!location.hostname.endsWith('.vercel.app') || PROD_HOSTS.includes(location.hostname)) ? LANDS_PROD : LANDS_PREVIEW;
  }
  async function openLands(user) {
    const token = await user.getIdToken();
    const res = await fetch('/api/organization/context', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.code) throw new Error('lands_handoff_failed');
    const url = new URL(landsBase());
    url.searchParams.set('code', data.code);
    location.href = url.toString();
  }
  async function fetchWorkspaces(user) {
    const token = await user.getIdToken();
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ action: 'resolveWorkspaces' }),
    });
    const data = await res.json().catch(() => null);
    return res.ok && data && data.kind === 'workforce' && data.valid && Array.isArray(data.workspaces) ? data.workspaces : [];
  }

  function mount(user, workspaces) {
    // Unified Municipal Shell v1: when a page exposes an Identity Switcher
    // workspace action, integrate workspace switching there instead of
    // rendering a separate floating control. The action is shown only for
    // identities with 2+ trusted workspaces; authorization remains server-side.
    const integratedTrigger = document.querySelector('[data-smart-hsr-workspace-trigger]');
    if (integratedTrigger) {
      integratedTrigger.style.display = 'flex';
      integratedTrigger.dataset.workspaceCount = String(workspaces.length);
      integratedTrigger.setAttribute('aria-label', 'تغيير مساحة العمل');
      integratedTrigger.onclick = () => { location.href = 'workspace.html'; };
      return;
    }
    if (document.getElementById('smart-hsr-service-switcher')) return;
    const here = currentWorkspace();
    const wrap = document.createElement('div');
    wrap.id = 'smart-hsr-service-switcher';
    Object.assign(wrap.style, { position: 'fixed', left: '16px', top: '16px', zIndex: '2147483000', direction: 'rtl' });

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'مساحات العمل';
    button.setAttribute('aria-label', 'التبديل بين مساحات عمل SMART HSR');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    Object.assign(button.style, {
      border: '1px solid rgba(120,150,145,.28)', borderRadius: '13px', padding: '9px 13px',
      font: '600 12px -apple-system,BlinkMacSystemFont,"Segoe UI",Tahoma,sans-serif', cursor: 'pointer',
      color: '#eaf6f1', background: 'rgba(12,42,53,.84)', backdropFilter: 'blur(16px)', boxShadow: '0 10px 30px rgba(0,0,0,.14)',
    });

    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    Object.assign(menu.style, {
      position: 'absolute', top: 'calc(100% + 8px)', left: '0', minWidth: '210px', padding: '6px',
      border: '1px solid rgba(120,150,145,.28)', borderRadius: '14px', background: 'rgba(12,42,53,.96)',
      backdropFilter: 'blur(16px)', boxShadow: '0 18px 44px rgba(0,0,0,.28)',
    });

    for (const ws of workspaces) {
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.dataset.workspace = ws.id;
      item.textContent = ws.title + (ws.id === here ? ' ✓' : '');
      if (ws.id === here) item.setAttribute('aria-current', 'true');
      Object.assign(item.style, {
        display: 'block', width: '100%', textAlign: 'right', padding: '10px 12px', border: '0', borderRadius: '10px',
        background: ws.id === here ? 'rgba(143,224,176,.14)' : 'transparent', color: '#eaf6f1', cursor: 'pointer',
        font: '600 12.5px -apple-system,BlinkMacSystemFont,"Segoe UI",Tahoma,sans-serif',
      });
      item.onclick = async () => {
        menu.hidden = true; button.setAttribute('aria-expanded', 'false');
        if (ws.id === here) return;
        try {
          if (ws.id === 'lands') await openLands(user);
          else if (typeof ws.route === 'string' && SAFE_ROUTE.test(ws.route)) location.href = ws.route;
        } catch (_) { /* stay on the current workspace */ }
      };
      menu.appendChild(item);
    }

    button.onclick = () => {
      menu.hidden = !menu.hidden;
      button.setAttribute('aria-expanded', String(!menu.hidden));
    };
    document.addEventListener('click', e => {
      if (!wrap.contains(e.target)) { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); }
    });
    wrap.append(button, menu);
    document.body.appendChild(wrap);
  }

  async function boot() {
    const [{ initializeApp, getApps }, { getAuth, onAuthStateChanged }, { resolveFirebaseConfig }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
      import('./firebase-runtime-config.js'),
    ]);
    const cfg = await resolveFirebaseConfig();
    const app = getApps().find(a => a.name === '[DEFAULT]') || initializeApp(cfg);
    const auth = getAuth(app);
    onAuthStateChanged(auth, async user => {
      if (!user) return;
      const workspaces = await fetchWorkspaces(user).catch(() => []);
      if (workspaces.length < 2) return;
      mount(user, workspaces);
    });
  }
  boot().catch(() => {});
})();
