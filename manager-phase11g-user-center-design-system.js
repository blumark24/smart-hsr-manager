(() => {
  'use strict';

  const STYLE_ID = 'smart-hsr-phase11g-user-center-design';
  const THEME_ATTR = 'data-smart-hsr-theme';

  function themeRoot() {
    return document.querySelector('div[dir="rtl"][lang="ar"]');
  }

  function luminance(hex) {
    const value = String(hex || '').trim();
    const match = value.match(/^#([0-9a-f]{6})$/i);
    if (!match) return null;
    const n = parseInt(match[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function syncTheme() {
    const root = themeRoot();
    if (!root) return;
    const tx = getComputedStyle(root).getPropertyValue('--tx').trim();
    const l = luminance(tx);
    const mode = l != null ? (l < 0.45 ? 'day' : 'night') : 'night';
    document.documentElement.setAttribute(THEME_ATTR, mode);
  }

  function improveSemantics() {
    const section = document.querySelector('[data-uc-v2="true"]');
    if (section) {
      const search = section.querySelector('input[type="search"]');
      if (search && !search.getAttribute('aria-label')) {
        search.setAttribute('aria-label', 'بحث في سجل الموظفين');
      }
    }

    document.querySelectorAll('.iuc .ix').forEach((button) => {
      if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', 'إغلاق النافذة');
      if (!button.getAttribute('type')) button.setAttribute('type', 'button');
    });
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [data-uc-v2="true"]{
        --u-bg:var(--pgBg,#050914);
        --u-panel:var(--card,#0b1525);
        --u-panel2:var(--sunk,#0d1b2d);
        --u-head:var(--field,#07111f);
        --u-bd:var(--cardBd,rgba(91,154,194,.21));
        --u-bd2:var(--accBd,rgba(75,205,190,.34));
        --u-tx:var(--tx,#eef6ff);
        --u-muted:var(--tx3,#8da5bd);
        --u-teal:var(--acc,#4fd1c5);
        --u-green:var(--acc,#20b981);
        background:var(--pgBg,#050914)!important;
        color:var(--tx,#eef6ff)!important;
      }
      [data-uc-v2="true"] .uc2-header{
        background:color-mix(in srgb,var(--field,#07111f) 94%,transparent)!important;
        border-bottom-color:var(--div,rgba(91,154,194,.21))!important;
        box-shadow:0 18px 46px -42px rgba(0,0,0,.7)!important;
      }
      [data-uc-v2="true"] .uc2-header h2,
      [data-uc-v2="true"] .uc2-register-title strong,
      [data-uc-v2="true"] .uc2-kpi strong{color:var(--tx,#eef6ff)!important}
      [data-uc-v2="true"] .uc2-header p,
      [data-uc-v2="true"] .uc2-register-title span,
      [data-uc-v2="true"] .uc2-kpi span,
      [data-uc-v2="true"] .uc2-filter-label{color:var(--tx3,#8da5bd)!important}
      [data-uc-v2="true"] .uc2-eyebrow{color:var(--acc,#4fd1c5)!important}
      [data-uc-v2="true"] .uc2-secondary{
        color:var(--tx2,#dcecff)!important;
        background:var(--ctl,rgba(23,39,64,.88))!important;
        border-color:var(--ctlBd,rgba(111,164,208,.27))!important;
        box-shadow:none!important;
      }
      [data-uc-v2="true"] .uc2-kpi,
      [data-uc-v2="true"] .uc2-filter,
      [data-uc-v2="true"] .uc2-register{
        background:var(--card,#0b1525)!important;
        border-color:var(--cardBd,rgba(91,149,190,.22))!important;
        box-shadow:var(--cardSh,0 18px 42px -34px rgba(0,0,0,.7))!important;
      }
      [data-uc-v2="true"] .uc2-head{
        background:var(--sunk,#07111f)!important;
        border-bottom-color:var(--div,rgba(75,146,192,.31))!important;
        box-shadow:none!important;
      }
      [data-uc-v2="true"] .uc2-head span{color:var(--tx2,#a9bfd4)!important}
      [data-uc-v2="true"] .uc2-row:hover{
        background:var(--ctlH,rgba(23,47,72,.52))!important;
        box-shadow:inset -2px 0 0 var(--acc,#4fd1c5)!important;
      }
      [data-uc-v2="true"] input[type="search"]{
        background:var(--field,#07111f)!important;
        border-color:var(--ctlBd,rgba(102,151,190,.23))!important;
        color:var(--tx,#eaf4ff)!important;
      }
      [data-uc-v2="true"] input[type="search"]::placeholder{color:var(--tx3,#7d8ea6)!important}
      [data-uc-v2="true"] :is(button,input,select,textarea,a):focus-visible,
      .iuc :is(button,input,select,textarea,a):focus-visible{
        outline:2px solid var(--acc,#0e7a4f)!important;
        outline-offset:2px!important;
      }
      [data-uc2-dialog="true"]{
        color:var(--tx,#eef6ff)!important;
        background:var(--field,#0b1525)!important;
        border-color:var(--cardBd,rgba(79,209,197,.23))!important;
        box-shadow:var(--cardSh,0 30px 80px -30px rgba(0,0,0,.7))!important;
      }
      [data-uc2-dialog="true"] input,
      [data-uc2-dialog="true"] select,
      [data-uc2-dialog="true"] textarea{font-size:14px!important}

      :root[${THEME_ATTR}="day"] .iuc{
        --uc-bg:#eef1ee;
        --uc-surface:#ffffff;
        --uc-raised:#f4f7f4;
        --uc-border:rgba(17,54,40,.12);
        --uc-text:#0d1f19;
        --uc-muted:#607168;
        --uc-accent:#0e7a4f;
        --uc-accent-2:#12855a;
        --uc-danger:#b63343;
        --uc-success:#0f7b57;
        --uc-shadow:0 24px 70px rgba(16,42,32,.16);
      }
      :root[${THEME_ATTR}="night"] .iuc{
        --uc-bg:#07111f;
        --uc-surface:#0b1727;
        --uc-raised:#101f31;
        --uc-border:#183049;
        --uc-text:#f3f8fb;
        --uc-muted:#90a6b9;
        --uc-accent:#20c9b0;
        --uc-accent-2:#4fd1c5;
        --uc-danger:#ff7180;
        --uc-success:#45d39c;
        --uc-shadow:0 30px 90px rgba(0,0,0,.52);
      }
      .iuc .ix{min-width:40px;min-height:40px}
      .iuc .btn{min-height:40px}

      @media(max-width:780px){
        [data-uc-v2="true"] input[type="search"],
        [data-uc2-dialog="true"] input,
        [data-uc2-dialog="true"] select,
        [data-uc2-dialog="true"] textarea,
        .iuc input,.iuc select,.iuc textarea{font-size:16px!important}
        .iuc{padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))!important}
      }
      @media(prefers-reduced-motion:reduce){
        [data-uc-v2="true"] *, .iuc *{scroll-behavior:auto!important;animation:none!important;transition:none!important}
      }
    `;
    document.head.appendChild(style);
  }

  function boot() {
    installStyle();
    syncTheme();
    improveSemantics();

    const root = themeRoot();
    if (root) new MutationObserver(syncTheme).observe(root, { attributes:true, attributeFilter:['style'] });
    new MutationObserver(() => {
      syncTheme();
      improveSemantics();
    }).observe(document.body, { subtree:true, childList:true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();
