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

      /* Institutional footer — Cloud Design deep-emerald surface (Website R3 CTA/footer language). */
      #smartSafeFooter{
        --sf-mist:rgba(255,255,255,.78);--sf-soft:rgba(255,255,255,.68);--sf-mint:#8FE0B0;--sf-line:rgba(255,255,255,.10);
        position:relative;z-index:2;isolation:isolate;overflow:hidden;color:#fff;
        margin-top:calc(-1 * clamp(36px,4.4vw,64px));
        border-radius:clamp(28px,3.4vw,48px) clamp(28px,3.4vw,48px) 0 0;
        background:radial-gradient(110% 120% at 85% 0%,#0B4D35 0%,#073324 48%,#04221A 100%);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 -44px 90px -56px rgba(4,34,26,.7);
        font-family:"IBM Plex Sans Arabic",sans-serif
      }
      #smartSafeFooter:before{content:"";position:absolute;z-index:1;top:0;left:12%;right:12%;height:1px;background:linear-gradient(90deg,transparent,rgba(143,224,176,.75) 50%,transparent);pointer-events:none}
      #smartSafeFooter .sf-noise{position:absolute;inset:0;z-index:0;background-image:url(cloud-noise.png);opacity:.2;mix-blend-mode:screen;pointer-events:none}
      #smartSafeFooter .sf-grid{position:absolute;z-index:0;left:-12%;right:-12%;bottom:-20%;height:64%;pointer-events:none;
        background-image:linear-gradient(rgba(143,224,176,.11) 1px,transparent 1px),linear-gradient(90deg,rgba(143,224,176,.11) 1px,transparent 1px);
        background-size:56px 44px;transform:perspective(520px) rotateX(62deg);transform-origin:50% 100%;
        -webkit-mask-image:linear-gradient(180deg,transparent,#000 70%);mask-image:linear-gradient(180deg,transparent,#000 70%)}
      #smartSafeFooter .sf-wrap{position:relative;z-index:2;max-width:1320px;margin:0 auto;padding:clamp(56px,7vw,96px) clamp(20px,4vw,48px) 0;display:flex;flex-direction:column;gap:clamp(36px,5vw,60px);box-sizing:border-box}
      #smartSafeFooter .sf-main{display:grid;grid-template-columns:minmax(0,1.35fr) repeat(3,minmax(0,.7fr));gap:clamp(28px,4vw,56px) clamp(24px,3vw,48px);align-items:start}
      #smartSafeFooter .sf-brand{display:flex;flex-direction:column;gap:20px;max-width:420px}
      #smartSafeFooter .sf-logo{align-self:flex-start;display:inline-flex;padding:10px 16px;border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.97),rgba(243,246,244,.9));border:1px solid #fff;box-shadow:inset 0 1px 0 #fff,0 22px 44px -24px rgba(0,0,0,.65)}
      #smartSafeFooter .sf-logo img{height:52px;width:auto;display:block;mix-blend-mode:multiply}
      #smartSafeFooter .sf-brand p{margin:0;max-width:380px;font-size:16px;line-height:1.85;color:var(--sf-mist);text-wrap:pretty}
      #smartSafeFooter .sf-col{display:flex;flex-direction:column;gap:14px;min-width:0}
      #smartSafeFooter .sf-kicker{font:500 11px "IBM Plex Mono",monospace;letter-spacing:.16em;color:var(--sf-mint);direction:ltr;text-align:right;unicode-bidi:isolate}
      #smartSafeFooter .sf-col h3{margin:0;font:600 15px "Readex Pro","IBM Plex Sans Arabic",sans-serif;color:#fff}
      #smartSafeFooter .sf-col ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:12px}
      #smartSafeFooter .sf-col a{display:inline-flex;align-items:center;min-height:28px;font-size:14px;color:rgba(255,255,255,.75);text-decoration:none;transition:color .2s}
      #smartSafeFooter .sf-col a:hover{color:#fff}
      #smartSafeFooter a:focus-visible{outline:2px solid var(--sf-mint);outline-offset:4px;border-radius:6px}
      #smartSafeFooter .sf-chip{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 12px;border-radius:10px;background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.14);box-shadow:inset 0 1px 0 rgba(255,255,255,.14);font-size:13px;color:#fff;white-space:nowrap}
      #smartSafeFooter .sf-chip:before{content:"";width:6px;height:6px;border-radius:50%;background:#6CD696}
      #smartSafeFooter .sf-mark{margin:0;font:600 clamp(30px,8.4vw,150px)/1.18 "Readex Pro","IBM Plex Sans Arabic",sans-serif;letter-spacing:-.03em;color:transparent;-webkit-text-stroke:1px rgba(255,255,255,.16);text-align:center;text-wrap:balance;user-select:none;overflow-wrap:anywhere}
      #smartSafeFooter .sf-dev{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px;border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.14);box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 30px 60px -30px rgba(0,0,0,.5);-webkit-backdrop-filter:blur(16px) saturate(140%);backdrop-filter:blur(16px) saturate(140%);font-size:13px;color:rgba(255,255,255,.78)}
      #smartSafeFooter .sf-dev strong{font:600 14px Inter,"IBM Plex Sans",system-ui,sans-serif;letter-spacing:.14em;color:#fff}
      #smartSafeFooter .sf-legal{display:flex;flex-wrap:wrap;gap:12px 28px;justify-content:space-between;align-items:center;padding:24px 0 max(32px,env(safe-area-inset-bottom));border-top:1px solid var(--sf-line);font-size:13px;color:var(--sf-soft)}
      @media(max-width:1180px){#smartSafeFooter .sf-main{gap:28px 28px}}
      @media(max-width:900px){
        #smartSafeFooter .sf-main{grid-template-columns:1fr 1fr}
        #smartSafeFooter .sf-brand{grid-column:1/-1;max-width:none}
      }
      @media(max-width:680px){
        #smartSafeFooter .sf-wrap{padding:40px 18px 0;gap:26px}
        #smartSafeFooter .sf-main{grid-template-columns:1fr;gap:0}
        #smartSafeFooter .sf-brand{gap:14px;padding-bottom:20px}
        #smartSafeFooter .sf-col{padding:14px 0;gap:4px;border-top:1px solid var(--sf-line)}
        #smartSafeFooter .sf-col ul{gap:0}
        #smartSafeFooter .sf-col a{min-height:44px}
        #smartSafeFooter .sf-kicker{margin-bottom:0}
        #smartSafeFooter .sf-dev{flex-direction:column;align-items:flex-start;gap:4px;padding:12px 18px;border-radius:18px}
        #smartSafeFooter .sf-legal{flex-direction:column;align-items:flex-start;gap:10px;margin-top:12px;padding-bottom:max(52px,calc(env(safe-area-inset-bottom) + 36px))}
      }
      @media(max-width:390px){#smartSafeFooter .sf-wrap{padding-inline:16px}}
      @media(prefers-reduced-motion:reduce){#smartSafeFooter *{transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function footerMarkup() {
    return '<div class="sf-noise" aria-hidden="true"></div><div class="sf-grid" aria-hidden="true"></div>'
      + '<div class="sf-wrap" dir="rtl"><footer>'
      + '<div class="sf-main">'
      + '<div class="sf-brand"><span class="sf-logo"><img src="smart-hsr-logo-r2.png" width="360" height="146" alt="SMART HSR"></span><p>منصة بلدية ذكية لإدارة الحصر والتشغيل والبيانات المكانية وربطها بالقرار.</p></div>'
      + '<div class="sf-col"><span class="sf-kicker">PLATFORM</span><h3>المنصة</h3><ul><li><a data-tail="platform" href="#">كيف تعمل</a></li><li><a data-tail="solutions" href="#">الحلول</a></li></ul></div>'
      + '<div class="sf-col"><span class="sf-kicker">ORGANIZATION</span><h3>المؤسسة</h3><ul><li><a data-tail="profile" href="#">الملف التعريفي</a></li><li><a href="Home.html">الدخول المؤسسي</a></li></ul></div>'
      + '<div class="sf-col"><span class="sf-kicker">IDENTITY</span><h3>SMART HSR</h3><span class="sf-chip">Saudi GovTech</span></div>'
      + '</div>'
      + '<p class="sf-mark" aria-hidden="true">من الميدان إلى القرار</p>'
      + '<div class="sf-dev"><span>التطوير والتشغيل التقني</span><strong>BLUMARK24</strong></div>'
      + '<div class="sf-legal"><span>© 2026 SMART HSR. جميع الحقوق محفوظة.</span></div>'
      + '</footer></div>';
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
