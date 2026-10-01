// SMART HSR public landing — behaviour layer for the approved Cloud Design
// Website R3 bundle (index.html). The R3 bundle owns layout, responsiveness,
// the Digital Twin, motion and the mobile composition; this file only adds
// what a design export cannot carry:
//   1. the institutional footer (replaces the exported navy "11 Footer"),
//   2. real navigation for the exported nav / menu items,
//   3. every institutional-login CTA resolving to the hardened gateway,
//   4. the official company-profile PDF (preview / download).
(function () {
  'use strict';

  const PROFILE_PREVIEW = 'https://drive.google.com/file/d/1yietCualc15XxZVzlxJzI7NhHVcTAwMh/preview';
  const PROFILE_DOWNLOAD = 'https://drive.google.com/uc?export=download&id=1yietCualc15XxZVzlxJzI7NhHVcTAwMh';
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const section = label => document.querySelector('[data-screen-label="' + label + '"]');
  const go = el => el && el.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const NAV_TARGETS = {
    'المنصة': '02 Statement',
    'الحلول': '04 Product Bento',
    'التوأم الرقمي': '06 Digital Twin Signature',
    'عن SMART HSR': '07 Institutional Value',
    'الملف التعريفي': '09 Company Profile'
  };
  const TAIL_TARGETS = {
    platform: '02 Statement',
    solutions: '04 Product Bento',
    twin: '06 Digital Twin Signature',
    profile: '09 Company Profile'
  };

  function installCSS() {
    if (document.getElementById('smart-safe-css')) return;
    const style = document.createElement('style');
    style.id = 'smart-safe-css';
    style.textContent = `
      html{scroll-behavior:smooth}
      [data-screen-label="11 Footer"]{display:none!important}
      #smartSafeFooter{
        --sf-bg:#F2F6F3;--sf-card:#FFFFFF;--sf-text:#0E1A24;--sf-muted:#58675F;--sf-line:rgba(14,64,43,.10);--sf-accent:#0C842B;
        position:relative;z-index:2;background:var(--sf-bg);color:var(--sf-text);border-top:1px solid var(--sf-line);
        font-family:"IBM Plex Sans Arabic",sans-serif
      }
      #smartSafeFooter .wrap{max-width:1320px;margin:0 auto;padding:64px 48px 34px}
      #smartSafeFooter footer{margin:0;padding:0}
      #smartSafeFooter .footer-grid{display:grid;grid-template-columns:minmax(280px,1.3fr) repeat(3,minmax(140px,.6fr));gap:36px}
      #smartSafeFooter footer a{color:var(--sf-muted);text-decoration:none}
      #smartSafeFooter footer a:hover{color:var(--sf-accent)}
      #smartSafeFooter .developer{margin-top:26px;padding:15px 18px;border:1px solid var(--sf-line);border-radius:16px;display:flex;align-items:center;justify-content:space-between;gap:18px;background:color-mix(in srgb,var(--sf-card) 72%,transparent);font-size:12px;color:var(--sf-muted)}
      #smartSafeFooter .developer strong{font:600 13px Inter,system-ui,sans-serif;letter-spacing:.08em;color:var(--sf-text)}
      #smartSafeFooter .legal{margin-top:24px;padding-top:18px;border-top:1px solid var(--sf-line);display:flex;justify-content:space-between;gap:18px;font-size:11.5px;color:#748078}
      @media(max-width:1180px){#smartSafeFooter .wrap{padding:56px 34px 30px}}
      @media(max-width:900px){
        #smartSafeFooter .footer-grid{grid-template-columns:1fr 1fr}
        #smartSafeFooter .wrap{padding:48px 22px 28px}
      }
      @media(max-width:680px){
        #smartSafeFooter .wrap{padding:40px 16px calc(24px + env(safe-area-inset-bottom))}
        #smartSafeFooter .footer-grid{grid-template-columns:1fr}
        #smartSafeFooter .developer{align-items:flex-start;flex-direction:column}
        #smartSafeFooter .legal{flex-direction:column;gap:10px}
      }
      @media(max-width:390px){#smartSafeFooter .wrap{padding-inline:13px}}
    `;
    document.head.appendChild(style);
  }

  function footerMarkup() {
    return '<div class="wrap" dir="rtl"><footer><div class="footer-grid"><div><div style="font:600 24px Readex Pro,IBM Plex Sans Arabic,sans-serif">SMART HSR</div><p style="max-width:370px;font-size:14px;line-height:1.85;color:var(--sf-muted)">منصة بلدية ذكية لإدارة الحصر والتشغيل والبيانات المكانية وربطها بالقرار.</p></div>'
      + '<div><b>المنصة</b><p><a data-tail="platform" href="#">كيف تعمل</a></p><p><a data-tail="solutions" href="#">الحلول</a></p></div>'
      + '<div><b>المؤسسة</b><p><a data-tail="profile" href="#">الملف التعريفي</a></p><p><a href="Home.html">الدخول المؤسسي</a></p></div>'
      + '<div><b>SMART HSR</b><p style="color:var(--sf-muted)">Saudi GovTech</p><p style="color:var(--sf-muted)">Arabic · English</p></div></div>'
      + '<div class="developer"><span>التطوير والتشغيل التقني</span><strong>BLUMARK24</strong></div>'
      + '<div class="legal"><span>© 2026 SMART HSR. جميع الحقوق محفوظة.</span><span dir="ltr">FIELD → DATA → OPERATIONS → DECISION</span></div></footer></div>';
  }

  function installFooter() {
    if (document.getElementById('smartSafeFooter')) return true;
    const cta = section('10 Partnership CTA');
    const tail = document.createElement('section');
    tail.id = 'smartSafeFooter';
    tail.innerHTML = footerMarkup();
    // The exported document root is height-locked, so the footer must live in
    // the same flow as the exported sections (after the partnership CTA).
    if (cta && cta.parentNode) cta.parentNode.insertBefore(tail, cta.nextSibling);
    else document.body.appendChild(tail);
    return true;
  }

  // The nav bar and the native menu sheet are the only fixed-position chrome
  // in the exported page; navigation text is only honoured there.
  function inFixedChrome(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (getComputedStyle(n).position === 'fixed') return true;
    }
    return false;
  }

  function routeClick(e) {
    // Footer links are handled here (document level) rather than on the footer
    // node: the exported runtime may re-create nodes inside its root, which
    // would drop element-level listeners.
    const tailLink = e.target.closest && e.target.closest('#smartSafeFooter [data-tail]');
    if (tailLink) { e.preventDefault(); go(section(TAIL_TARGETS[tailLink.dataset.tail])); return; }
    const hit = e.target.closest('a,button,span,div'); if (!hit) return;
    const text = norm(hit.textContent);
    if (!text || text.length > 32) return;

    if (text === 'الدخول' || text.includes('الدخول إلى SMART HSR') || text.includes('الدخول إلى المنصة')) {
      e.preventDefault(); e.stopPropagation(); location.href = 'Home.html'; return;
    }
    if (text.includes('عرض الملف التعريفي')) {
      e.preventDefault(); e.stopPropagation(); window.open(PROFILE_PREVIEW, '_blank', 'noopener'); return;
    }
    if (text.includes('تنزيل الملف التعريفي')) {
      e.preventDefault(); e.stopPropagation(); window.open(PROFILE_DOWNLOAD, '_blank', 'noopener'); return;
    }
    if (Object.prototype.hasOwnProperty.call(NAV_TARGETS, text) && inFixedChrome(hit)) {
      go(section(NAV_TARGETS[text]));
    }
  }

  document.addEventListener('click', routeClick, true);

  function whenMounted(fn, tries) {
    if (section('10 Partnership CTA')) { fn(); return; }
    if (tries <= 0) { fn(); return; }
    setTimeout(() => whenMounted(fn, tries - 1), 100);
  }
  function boot() { whenMounted(() => { installCSS(); installFooter(); }, 150); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
