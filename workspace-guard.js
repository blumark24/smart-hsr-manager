(() => {
  'use strict';
  // UNIFIED IDENTITY — per-page workspace guard (display & navigation only).
  // A workspace is never granted by its URL. Every workspace page asks the
  // trusted API (action resolveWorkspaces, which re-reads the live
  // users/{uid} record with the Admin SDK) whether this identity may open
  // THIS workspace. When the account is valid but not authorized for this
  // workspace, the user is sent to workspace.html with the session intact;
  // the session is only ended for an invalid account (handled by each page's
  // own guard). The same API check runs inside every operational action, so
  // this guard never widens access — it only prevents a misleading screen.
  if (location.pathname.endsWith('/login.html') || location.pathname.endsWith('/workspace.html')) return;

  function workspaceForPage() {
    const file = location.pathname.split('/').pop();
    const mode = new URLSearchParams(location.search).get('mode');
    if (file === 'department-head.html') return mode === 'mobility' ? 'mobility' : 'field';
    if (file === 'admin-affairs.html') return 'admin_affairs';
    if (['dashboard.html', 'mobile-map.html', 'manager.html'].includes(file)) return 'field';
    return null;
  }

  async function resolve(user, workspace) {
    const token = await user.getIdToken();
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(workspace ? { action: 'resolveWorkspaces', workspace } : { action: 'resolveWorkspaces' }),
    });
    const data = await res.json().catch(() => null);
    return res.ok && data ? data : null;
  }

  // For a page's own deny branch: if the identity itself is valid, keep the
  // session and send the user to the workspace chooser instead of signing out.
  async function redirectValidSession(user) {
    try {
      if (!user) return false;
      const data = await resolve(user);
      if (data && data.kind === 'workforce' && data.valid === true) {
        location.replace('workspace.html');
        return true;
      }
    } catch (_) { /* fall through to the page's existing behaviour */ }
    return false;
  }

  window.SmartHSRWorkspaceGuard = Object.freeze({ redirectValidSession, workspaceForPage });

  async function boot() {
    const workspace = workspaceForPage();
    if (!workspace) return;
    const [{ initializeApp, getApps }, { getAuth, onAuthStateChanged }, { resolveFirebaseConfig }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
      import('./firebase-runtime-config.js'),
    ]);
    const cfg = await resolveFirebaseConfig();
    const app = getApps().find(a => a.name === '[DEFAULT]') || initializeApp(cfg);
    onAuthStateChanged(getAuth(app), async user => {
      if (!user) return;
      let data = null;
      try { data = await resolve(user, workspace); } catch (_) { return; }
      // Redirect only on an explicit, authoritative "valid but not allowed".
      if (data && data.kind === 'workforce' && data.valid === true && data.allowed === false) {
        location.replace('workspace.html');
      }
    });
  }
  boot().catch(() => {});
})();
