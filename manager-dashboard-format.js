(() => {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const toLatinDigits = value => String(value ?? '').replace(/[٠-٩]/g, digit => String(arabicDigits.indexOf(digit)));
  const asNumber = value => Number(toLatinDigits(value));

  const format = Object.freeze({
    latin: toLatinDigits,
    integer(value) {
      const number = asNumber(value);
      return Number.isFinite(number)
        ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number)
        : '—';
    },
    decimal(value, maximumFractionDigits = 1) {
      const number = asNumber(value);
      return Number.isFinite(number)
        ? new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(number)
        : '—';
    },
    percent(value) {
      const number = asNumber(value);
      return Number.isFinite(number) ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number)}%` : '—';
    },
    date(value) {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat('ar-SA-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
        : 'غير متاح';
    },
    time(value = Date.now()) {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(date)
        : '—';
    },
    dateTime(value) {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
        : 'غير متاح';
    }
  });

  window.SmartHSRFormat = format;

  // Approved User Center route ownership guard.
  // The legacy manager presentation remains in the DOM only as the operational
  // route shell (close/navigation contracts). It must never become the visible
  // presentation while the approved User Center waits for backend data.
  // MutationObserver callbacks run before paint, so claiming the route here
  // removes the legacy flash at its lifecycle source instead of masking it
  // later with a delayed visual patch.
  const installUserCenterRouteGuard = () => {
    if (window.__smartHsrUserCenterRouteGuard) return;
    window.__smartHsrUserCenterRouteGuard = true;

    const STYLE_ID = 'smart-hsr-user-center-route-guard';
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        .ucv2-route-guard-host{position:fixed!important;top:92px!important;right:calc(var(--sbW,232px) + 28px)!important;bottom:14px!important;left:14px!important;width:auto!important;max-width:none!important;height:auto!important;min-height:0!important;margin:0!important;padding:0!important;box-sizing:border-box!important;transform:none!important;z-index:51!important;overflow:auto!important;border-radius:18px!important;background:#050b15!important;border:1px solid rgba(86,132,196,.12)!important;box-shadow:0 24px 72px -42px rgba(0,0,0,.95)!important}
        /* manager.html's own #manager-observations-reference-ui block sets an
           unscoped ".manager-view-panel{width:min(1120px,100%)!important}"
           for the البلاغات modal. Every User Center host also carries the
           shared .manager-view-panel class, so that rule collides with ours
           at equal specificity and wins on source order. With width fixed
           and right also fixed under dir="rtl", the CSS2.1 over-constrained
           rule discards our "left" and recomputes it from width, landing far
           short of the true left edge and exposing the dashboard behind it.
           A compound-class selector (higher specificity, order-independent)
           restores width:auto for just these two host classes without
           touching the observations panel's own sizing. */
        .manager-view-panel.ucv2-route-guard-host,.manager-view-panel.ucv2-host{width:auto!important;max-width:none!important}
        .ucv2-route-guard-host>.ucv2-app{min-height:100%;box-sizing:border-box;direction:rtl;color:#f7fbff;background:radial-gradient(720px 300px at 10% -2%,rgba(74,96,255,.12),transparent 66%),linear-gradient(145deg,#07101e,#081629 48%,#07101d);padding:22px 24px}
        .ucv2-route-loading{min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;text-align:center;color:#7e91ad}
        .ucv2-route-loading b{font-size:15px;color:#f7fbff}.ucv2-route-loading span{font-size:11px}
        .ucv2-route-loading:before{content:"";width:26px;height:26px;border-radius:50%;border:2px solid rgba(96,145,211,.18);border-top-color:#4a84ff;animation:ucv2-route-spin .8s linear infinite}
        @keyframes ucv2-route-spin{to{transform:rotate(360deg)}}
        @media(max-width:1179px){.ucv2-route-guard-host{right:14px!important}}
        @media(max-width:759px){.ucv2-route-guard-host{top:104px!important;right:10px!important;left:10px!important;bottom:10px!important;border-radius:14px!important}.ucv2-route-guard-host>.ucv2-app{padding:14px}}
        @media(prefers-reduced-motion:reduce){.ucv2-route-loading:before{animation:none}}
        /* Day-mode equivalent of the loading placeholder above, so a manager
           in Day mode never sees a flash of the Night-only dark loader
           before the real (also theme-aware) panel takes over. Colors are
           drawn from manager.html's own approved DAY palette (--l1/--l1Bd/
           --thTx/--logoGreenH), not invented. */
        [data-theme="light"] .ucv2-route-guard-host{background:#eef1ee!important;border-color:rgba(18,133,90,.2)!important;box-shadow:0 24px 72px -42px rgba(16,60,42,.28)!important}
        [data-theme="light"] .ucv2-route-guard-host>.ucv2-app{color:#083f2c;background:radial-gradient(720px 300px at 10% -2%,rgba(18,133,90,.07),transparent 66%),linear-gradient(155deg,rgba(234,247,240,.9),rgba(253,255,254,.95) 52%,rgba(238,249,243,.9))}
        [data-theme="light"] .ucv2-route-loading{color:#4c6357}
        [data-theme="light"] .ucv2-route-loading b{color:#083f2c}
        [data-theme="light"] .ucv2-route-loading:before{border-color:rgba(18,133,90,.22);border-top-color:#149c2b}
      `;
      document.head.appendChild(style);
    }

    const clean = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

    // manager.html drives its own Day/Night switch by computing a large
    // object of CSS custom properties per render and writing them as the
    // inline style of its single root wrapper (<div dir="rtl" lang="ar"
    // style="{{ themeVars }}">) — there is no .dark/[data-theme] class on
    // <html> or <body> to hook into. Its NIGHT palette never defines
    // --pgBg at all (Night relies on that property's CSS fallback), while
    // DAY always sets it explicitly, so presence of --pgBg is a reliable,
    // read-only signal for which mode is active. We mirror it onto
    // documentElement's data-theme, the exact selector the User Center
    // enhancements layer's installTheme() already defines a dark palette
    // for — this activates that existing light/dark variable system
    // instead of adding a second one.
    const themeRoot = () => document.querySelector('div[dir="rtl"][lang="ar"]') || document.documentElement;
    const isDayMode = () => getComputedStyle(themeRoot()).getPropertyValue('--pgBg').trim() !== '';
    const syncTheme = () => {
      document.documentElement.setAttribute('data-theme', isDayMode() ? 'light' : 'dark');
    };
    syncTheme();

    let preOpenScrollY = null;
    let closedRoot = null;

    const findRoot = () => {
      const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,[role="heading"]'));
      const heading = headings.find(el => /مركز إدارة المستخدمين|إدارة المستخدمين|المستخدمون والصلاحيات/.test(clean(el.textContent)));
      if (!heading) return null;
      let node = heading;
      for (let depth = 0; depth < 8 && node?.parentElement; depth += 1) {
        node = node.parentElement;
        const text = clean(node.textContent);
        if ((node.querySelector('table') || /إضافة موظف/.test(text)) && text.length < 80000) return node;
      }
      return heading.parentElement;
    };

    const claim = () => {
      const root = findRoot();
      if (!root) return false;
      if (root.dataset.smartHsrApprovedOwner === 'true') return true;

      root.dataset.smartHsrApprovedOwner = 'true';
      root.classList.add('ucv2-route-guard-host');
      root.parentElement?.classList.add('ucv2-shell-overlay');
      // The host is fixed-position, reserving top:92px on the assumption the
      // real header sits there. That only holds if the page itself is
      // scrolled to top; the manager route is a long single-page layout, and
      // this dialog can be opened from a link far down that page, leaving
      // the header scrolled out of view and exposing whatever content was
      // at the top of the viewport through the gap instead.
      preOpenScrollY = window.scrollY;
      closedRoot = root;
      window.scrollTo(0, 0);
      syncTheme();

      Array.from(root.children).forEach(child => {
        if (child.classList?.contains('ucv2-app')) return;
        child.dataset.ucv2Original = 'true';
        child.style.display = 'none';
      });

      let app = root.querySelector('.ucv2-app');
      if (!app) {
        app = document.createElement('section');
        app.className = 'ucv2-app';
        app.dataset.routeGuardLoading = 'true';
        app.setAttribute('aria-busy', 'true');
        app.innerHTML = '<div class="ucv2-route-loading"><b>مركز إدارة المستخدمين</b><span>جاري تحميل بيانات الجهة بأمان…</span></div>';
        root.appendChild(app);
      }
      return true;
    };

    const startObserver = () => {
      claim();
      const observer = new MutationObserver(() => {
        syncTheme();
        // The panel is removed wholesale from the DOM on close (it lives
        // inside the same sc-if block as the rest of the legacy view), so
        // there is no dedicated "closed" event to hook — detect it here by
        // noticing the node we claimed is no longer attached, and restore
        // the scroll position it had before we forced it to the top on open.
        if (closedRoot && !document.body.contains(closedRoot)) {
          const restoreY = preOpenScrollY;
          closedRoot = null;
          preOpenScrollY = null;
          if (restoreY != null) window.scrollTo(0, restoreY);
        }
        claim();
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
      document.addEventListener('click', event => {
        const trigger = event.target?.closest?.('a,button,[role="button"]');
        if (/مركز إدارة المستخدمين|مركز المستخدمين|الصلاحيات والسجل/.test(clean(trigger?.textContent))) queueMicrotask(claim);
      }, true);
    };

    if (document.body) startObserver();
    else document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  };

  installUserCenterRouteGuard();

  // The real manager route is the single presentation owner for the approved
  // User Center. Load the exact approved Phase 11 chain here, in order, so
  // manager.html and its preview use the same implementation and cannot race.
  const REV = 'phase11g-user-center-approved-skin';
  const files = [
    ['./manager-phase11a-foundation.js', 'phase11aManagerRoutingFoundation'],
    ['./manager-phase11c-user-center-core.js', 'ucInstitutionCoreLoader'],
    ['./manager-phase11c-user-center-dialogs.js', 'ucInstitutionDialogsLoader'],
    ['./manager-phase11c-user-center-import.js', 'ucInstitutionImportLoader'],
    ['./manager-phase11c-legacy-account-bridge.js', 'ucLegacyAccountBridgeLoader'],
    ['./manager-phase11d-user-center-enhancements.js', 'ucPhase11dEnhancementsLoader'],
    ['./manager-phase11f-reference-ui.js', 'ucPhase11fReferenceUiLoader'],
    ['./manager-phase11e-user-center-interactions.js', 'ucPhase11eInteractionsLoader'],
    ['./manager-phase11f-executive-polish.js', 'managerPhase11fExecutivePolishLoader'],
    ['./manager-phase11g-user-center-approved-skin.js', 'ucPhase11gApprovedSkinLoader']
  ];

  let index = 0;
  const loadNext = () => {
    if (index >= files.length) {
      document.documentElement.dataset.smartHsrUserCenterReady = 'true';
      window.dispatchEvent(new CustomEvent('smart-hsr:user-center-ready'));
      return;
    }
    const [src, key] = files[index++];
    const attr = `data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
    const existing = document.querySelector(`script[${attr}="true"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') loadNext();
      else {
        existing.addEventListener('load', loadNext, { once: true });
        existing.addEventListener('error', loadNext, { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = `${src}?rev=${REV}`;
    script.async = false;
    script.setAttribute(attr, 'true');
    script.onload = () => {
      script.dataset.loaded = 'true';
      loadNext();
    };
    script.onerror = () => {
      console.error('SMART HSR manager failed to load', src);
      loadNext();
    };
    document.head.appendChild(script);
  };

  loadNext();
})();
