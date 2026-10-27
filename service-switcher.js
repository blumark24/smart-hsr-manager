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
      // Keep the approved institutional identity menu. Expand its own
      // authorized services in place: no second floating switcher/header.
      const here = currentWorkspace();
      const servicesId = 'smart-hsr-header-services';
      let services = document.getElementById(servicesId);
      if (services) services.remove();
      services = document.createElement('div');
      services.id = servicesId;
      services.hidden = true;
      services.setAttribute('role', 'group');
      services.setAttribute('aria-label', 'الخدمات المفعّلة لهذا الحساب');
      Object.assign(services.style, {
        padding: '5px 8px 8px',
        borderTop: '1px solid var(--hdrDiv,rgba(122,164,224,.14))',
      });

      const status = document.createElement('div');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      Object.assign(status.style, { padding: '4px 8px', fontSize: '11px' });
      status.hidden = true;

      const setOpen = open => {
        services.hidden = !open;
        integratedTrigger.setAttribute('aria-expanded', String(open));
        if (open && !services.isConnected) integratedTrigger.after(services);
      };

      for (const ws of workspaces) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'hsr-id-action';
        item.setAttribute('role', 'menuitem');
        item.dataset.workspace = ws.id;
        item.style.width = '100%';
        if (ws.id === here) item.setAttribute('aria-current', 'page');

        const title = document.createElement('span');
        title.textContent = ws.title;
        const hint = document.createElement('small');
        hint.textContent = ws.id === here ? 'مساحة العمل الحالية' : 'فتح الخدمة';
        item.append(title, hint);
        item.onclick = async event => {
          event.stopPropagation();
          if (ws.id === here) { setOpen(false); return; }
          status.hidden = true;
          item.disabled = true;
          try {
            // Destinations are server-resolved. Protected pages and Lands'
            // one-time SSO independently verify entitlement on arrival.
            if (ws.id === 'lands') await openLands(user);
            else if (typeof ws.route === 'string' && SAFE_ROUTE.test(ws.route)) location.href = ws.route;
            else throw new Error('unsafe_workspace_route');
          } catch (_) {
            status.textContent = 'تعذر فتح الخدمة بأمان. حاول مرة أخرى.';
            status.hidden = false;
            item.disabled = false;
          }
        };
        services.appendChild(item);
      }
      services.appendChild(status);
      const mainLabel = integratedTrigger.querySelector('span');
      const secondaryLabel = integratedTrigger.querySelector('small');
      if (mainLabel) mainLabel.textContent = 'خدماتي';
      if (secondaryLabel) secondaryLabel.textContent = 'التنقل بين الخدمات';
      integratedTrigger.style.display = 'flex';
      integratedTrigger.dataset.workspaceCount = String(workspaces.length);
      integratedTrigger.setAttribute('aria-label', 'خدماتي — تغيير الخدمة');
      integratedTrigger.setAttribute('aria-haspopup', 'true');
      integratedTrigger.setAttribute('aria-expanded', 'false');
      integratedTrigger.onclick = event => {
        event.stopPropagation();
        // A React re-render may have detached the menu; treat that as closed.
        setOpen(!services.isConnected || services.hidden);
      };
      integratedTrigger.after(services);
      const dismissOnEscape = event => {
        if (event.key === 'Escape') setOpen(false);
      };
      const dismissOnOutside = event => {
        if (!services.contains(event.target) && !integratedTrigger.contains(event.target)) setOpen(false);
      };
      document.addEventListener('keydown', dismissOnEscape);
      document.addEventListener('click', dismissOnOutside);
      return () => {
        document.removeEventListener('keydown', dismissOnEscape);
        document.removeEventListener('click', dismissOnOutside);
        services.remove();
        integratedTrigger.onclick = null;
        integratedTrigger.removeAttribute('aria-expanded');
        integratedTrigger.removeAttribute('aria-haspopup');
        delete integratedTrigger.dataset.workspaceCount;
        if (mainLabel) mainLabel.textContent = 'مساحة العمل';
        if (secondaryLabel) secondaryLabel.textContent = 'تغيير الخدمة';
      };
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
    const dismissFloatingOutside = e => {
      if (!wrap.contains(e.target)) { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); }
    };
    const dismissFloatingEscape = e => {
      if (e.key === 'Escape') { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); }
    };
    document.addEventListener('click', dismissFloatingOutside);
    document.addEventListener('keydown', dismissFloatingEscape);
    wrap.append(button, menu);
    document.body.appendChild(wrap);
    return () => {
      document.removeEventListener('click', dismissFloatingOutside);
      document.removeEventListener('keydown', dismissFloatingEscape);
      wrap.remove();
    };
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
    let sessionGeneration = 0;
    let unmountSwitcher = null;
    onAuthStateChanged(auth, async user => {
      const generation = ++sessionGeneration;
      if (unmountSwitcher) { unmountSwitcher(); unmountSwitcher = null; }
      if (!user) return;
      const workspaces = await fetchWorkspaces(user).catch(() => []);
      // Never mount a menu resolved for a previous account/session.
      if (generation !== sessionGeneration || auth.currentUser?.uid !== user.uid) return;
      if (workspaces.length < 2) return;
      unmountSwitcher = mount(user, workspaces) || null;
    });
  }
  boot().catch(() => {});
})();
