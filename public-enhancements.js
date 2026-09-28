
(function(){
  'use strict';

  const PROFILE_PREVIEW='https://drive.google.com/file/d/1yietCualc15XxZVzlxJzI7NhHVcTAwMh/preview';
  const PROFILE_DOWNLOAD='https://drive.google.com/uc?export=download&id=1yietCualc15XxZVzlxJzI7NhHVcTAwMh';
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
  const section=label=>document.querySelector('[data-screen-label="'+label+'"]');
  const go=el=>el&&el.scrollIntoView({behavior:'smooth',block:'start'});

  function installCSS(){
    if(document.getElementById('smart-safe-css')) return;
    const style=document.createElement('style');
    style.id='smart-safe-css';
    style.textContent=`
      html{scroll-behavior:smooth}
      #smartSafeTheme{
        position:fixed;top:18px;left:22px;z-index:10020;width:44px;height:44px;border-radius:13px;
        border:1px solid rgba(14,26,36,.10);background:rgba(255,255,255,.82);color:#073324;
        display:grid;place-items:center;font:600 18px/1 system-ui;cursor:pointer;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 12px 30px -20px rgba(14,26,36,.45);
        backdrop-filter:blur(16px) saturate(150%);-webkit-backdrop-filter:blur(16px) saturate(150%);
      }
      #smartSafeMenu{
        position:fixed;inset:0;z-index:10030;display:none;padding:18px;background:rgba(4,24,17,.52);
        backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
      }
      #smartSafeMenu.open{display:flex}
      #smartSafeMenu .panel{
        margin:68px auto auto;width:min(520px,100%);padding:18px;border-radius:28px;
        background:rgba(248,252,249,.96);border:1px solid rgba(255,255,255,.92);
        box-shadow:0 40px 100px -35px rgba(0,0,0,.58)
      }
      #smartSafeMenu button,#smartSafeMenu a{
        width:100%;min-height:54px;padding:0 16px;box-sizing:border-box;border:0;
        border-bottom:1px solid rgba(14,26,36,.08);background:transparent;color:#0E1A24;
        font:600 15px "IBM Plex Sans Arabic",sans-serif;text-decoration:none;display:flex;
        align-items:center;justify-content:space-between;cursor:pointer
      }
      #smartSafeMenu .login{
        margin-top:12px;border:0!important;border-radius:14px!important;
        background:linear-gradient(180deg,#0E5A3B,#073324)!important;color:#fff!important;justify-content:center!important
      }
      #smartSafeFooter{
        --sf-bg:#F2F6F3;--sf-card:#FFFFFF;--sf-card2:#F8FBF9;--sf-text:#0E1A24;--sf-muted:#58675F;--sf-line:rgba(14,64,43,.10);--sf-accent:#0C842B;
        position:relative;z-index:2;background:var(--sf-bg);color:var(--sf-text);border-top:1px solid var(--sf-line)
      }
      #smartSafeFooter .wrap{max-width:1320px;margin:0 auto;padding:88px 48px 34px}
      #smartSafeFooter .headline{
        display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:42px;align-items:end
      }
      #smartSafeFooter .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:38px}
      #smartSafeFooter .card{
        min-height:214px;padding:26px;border-radius:24px;background:linear-gradient(180deg,var(--sf-card),var(--sf-card2));
        border:1px solid rgba(255,255,255,.88);box-shadow:inset 0 1px 0 rgba(255,255,255,.92),0 24px 58px -46px rgba(14,52,36,.35);
        display:flex;flex-direction:column;justify-content:space-between;text-decoration:none;color:var(--sf-text);
        transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease
      }
      #smartSafeFooter .card:hover{transform:translateY(-3px);border-color:rgba(12,132,43,.20);box-shadow:0 30px 68px -48px rgba(14,52,36,.42)}
      #smartSafeFooter .card small{font:500 10px "IBM Plex Mono",monospace;letter-spacing:.14em;color:var(--sf-accent)}
      #smartSafeFooter .card b{font:600 25px "Readex Pro","IBM Plex Sans Arabic",sans-serif}
      #smartSafeFooter .card p{font-size:13.5px;line-height:1.9;color:var(--sf-muted)}
      #smartSafeFooter footer{margin-top:70px;padding-top:34px;border-top:1px solid var(--sf-line)}
      #smartSafeFooter .footer-grid{display:grid;grid-template-columns:minmax(280px,1.3fr) repeat(3,minmax(140px,.6fr));gap:36px}
      #smartSafeFooter footer a{color:var(--sf-muted);text-decoration:none}
      #smartSafeFooter footer a:hover{color:var(--sf-accent)}
      #smartSafeFooter .developer{margin-top:26px;padding:15px 18px;border:1px solid var(--sf-line);border-radius:16px;display:flex;align-items:center;justify-content:space-between;gap:18px;background:color-mix(in srgb,var(--sf-card) 72%,transparent);font-size:12px;color:var(--sf-muted)}
      #smartSafeFooter .developer b{color:var(--sf-text);font-weight:600}
      #smartSafeFooter .developer strong{font:600 13px Inter,system-ui,sans-serif;letter-spacing:.08em;color:var(--sf-text)}
      #smartSafeFooter .legal{margin-top:24px;padding-top:18px;border-top:1px solid var(--sf-line);display:flex;justify-content:space-between;gap:18px;font-size:11.5px;color:#748078}

      html[data-public-theme="dark"]{--public-night:#061914;--public-night2:#0A241B;--public-night3:#0E2E22;--public-night-line:rgba(143,224,176,.13);color-scheme:dark}
      html[data-public-theme="dark"],html[data-public-theme="dark"] body{background:linear-gradient(180deg,#061914,#071D16)!important;color-scheme:dark}
      html[data-public-theme="dark"] [data-screen-label="01 Hero"]{
        background:radial-gradient(72% 88% at 34% 62%,#123428 0%,#092219 56%,#061811 100%)!important;color:#F3F8F5!important
      }
      html[data-public-theme="dark"] [data-screen-label="01 Hero"]>div[style*="width:52%"]{
        background:linear-gradient(270deg,rgba(6,24,17,.96),rgba(9,34,25,.84) 55%,rgba(6,24,17,0))!important
      }
      html[data-public-theme="dark"] [data-screen-label="01 Hero"]>div[style*="height:160px"]{
        background:linear-gradient(180deg,rgba(6,24,17,0),#061811)!important
      }
      html[data-public-theme="dark"] [data-screen-label="01 Hero"] [data-card]{
        background:linear-gradient(180deg,rgba(19,57,42,.84),rgba(8,31,23,.66))!important;
        border-color:rgba(143,224,176,.18)!important;color:#F3F8F5!important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 28px 58px -30px rgba(0,0,0,.72)!important
      }
      html[data-public-theme="dark"] [data-screen-label="02 Statement"],
      html[data-public-theme="dark"] [data-screen-label="07 Company Profile"]{background:#081F17!important;color:#F3F8F5!important}
      html[data-public-theme="dark"] [data-screen-label="03 Field to Decision"]{background:#061811!important;color:#F3F8F5!important}
      html[data-public-theme="dark"] [data-screen-label="03 Field to Decision"]>div{
        background:radial-gradient(72% 84% at 36% 55%,#123428,#092219 62%,#061811)!important
      }
      html[data-public-theme="dark"] [data-screen-label="04 Product Bento"],
      html[data-public-theme="dark"] [data-screen-label="05 Product Presence"]{background:#0A241B!important;color:#F3F8F5!important}
      html[data-public-theme="dark"] [data-screen-label="06 Digital Twin Signature"]{background:#071D16!important;color:#F3F8F5!important}
      html[data-public-theme="dark"] .maplibregl-map,
      html[data-public-theme="dark"] .leaflet-container,
      html[data-public-theme="dark"] canvas{filter:none!important;mix-blend-mode:normal!important}
      html[data-public-theme="dark"] [data-screen-label] [style*="color:#0E1A24"]{color:#F3F8F5!important}
      html[data-public-theme="dark"] [data-screen-label] [style*="color:#2E3A44"]{color:#B7CABF!important}
      html[data-public-theme="dark"] [data-screen-label] [style*="color:#56626C"]{color:#91A99C!important}
      html[data-public-theme="dark"] #smartSafeTheme{background:rgba(15,47,35,.84);border-color:rgba(165,232,198,.14);color:#8FE0B0}
      html[data-public-theme="dark"] #smartSafeMenu .panel{background:rgba(9,34,25,.97);border-color:rgba(165,232,198,.13)}
      html[data-public-theme="dark"] #smartSafeMenu button,html[data-public-theme="dark"] #smartSafeMenu a{color:#F3F8F5;border-bottom-color:rgba(165,232,198,.10)}
      html[data-public-theme="dark"] #smartSafeFooter{
        --sf-bg:#061914;--sf-card:#0D2B20;--sf-card2:#091F18;--sf-text:#F3F8F5;--sf-muted:#A8BDB2;--sf-line:rgba(143,224,176,.12);--sf-accent:#76D79C;
        background:linear-gradient(180deg,#071D16,#061914);color:var(--sf-text);border-top-color:var(--sf-line)
      }
      html[data-public-theme="dark"] #smartSafeFooter .card{background:linear-gradient(180deg,rgba(18,57,42,.88),rgba(8,31,23,.82));border-color:rgba(143,224,176,.13);color:var(--sf-text);box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 28px 64px -48px rgba(0,0,0,.82)}
      html[data-public-theme="dark"] #smartSafeFooter .card:hover{border-color:rgba(118,215,156,.28);box-shadow:0 30px 70px -45px rgba(0,0,0,.88)}
      html[data-public-theme="dark"] #smartSafeFooter .card p,
      html[data-public-theme="dark"] #smartSafeFooter footer a{color:var(--sf-muted)}
      html[data-public-theme="dark"] #smartSafeFooter .developer{background:rgba(10,37,27,.72);border-color:var(--sf-line)}
      html[data-public-theme="dark"] #smartSafeFooter footer{border-top-color:var(--sf-line)}

      @media(max-width:900px){
        #smartSafeFooter .headline{grid-template-columns:1fr}
        #smartSafeFooter .cards{grid-template-columns:1fr}
        #smartSafeFooter .footer-grid{grid-template-columns:1fr 1fr}
        #smartSafeFooter .wrap{padding:72px 22px 28px}
      }
      @media(max-width:560px){
        #smartSafeTheme{top:14px;left:14px;width:40px;height:40px}
        #smartSafeFooter .footer-grid{grid-template-columns:1fr}
        #smartSafeFooter .developer{align-items:flex-start;flex-direction:column}
        #smartSafeFooter .legal{flex-direction:column}
      }
      @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto!important}}
    `;
    document.head.appendChild(style);
  }

  function setTheme(t){
    document.documentElement.dataset.publicTheme=t;
    document.documentElement.style.colorScheme=t;
    const b=document.getElementById('smartSafeTheme');
    if(b){
      b.textContent=t==='dark'?'☀':'☾';
      b.title=t==='dark'?'تفعيل الوضع النهاري':'تفعيل الوضع الليلي';
      b.setAttribute('aria-pressed',String(t==='dark'));
    }
    let meta=document.querySelector('meta[name="theme-color"]');
    if(!meta){meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta)}
    meta.content=t==='dark'?'#061914':'#F2F6F3';
    try{localStorage.setItem('smart-hsr-public-theme',t)}catch(e){}
  }

  function installExternalUI(){
    installCSS();

    if(!document.getElementById('smartSafeTheme')){
      const b=document.createElement('button');
      b.id='smartSafeTheme'; b.type='button'; b.setAttribute('aria-label','تبديل الوضع النهاري والليلي');
      document.body.appendChild(b);
      let t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
      try{const saved=localStorage.getItem('smart-hsr-public-theme');if(saved==='dark'||saved==='light')t=saved}catch(e){}
      setTheme(t);
      b.addEventListener('click',()=>setTheme(document.documentElement.dataset.publicTheme==='dark'?'light':'dark'));
    }

    if(!document.getElementById('smartSafeMenu')){
      const menu=document.createElement('div');
      menu.id='smartSafeMenu';
      menu.innerHTML='<div class="panel" dir="rtl"><button data-go="platform">المنصة <span>←</span></button><button data-go="solutions">الحلول <span>←</span></button><button data-go="twin">التوأم الرقمي <span>←</span></button><button data-go="profile">الملف التعريفي <span>←</span></button><a class="login" href="Home.html">الدخول إلى SMART HSR</a></div>';
      document.body.appendChild(menu);
      menu.addEventListener('click',e=>{
        if(e.target===menu){menu.classList.remove('open');return}
        const b=e.target.closest('[data-go]'); if(!b)return;
        const map={platform:section('02 Statement'),solutions:section('04 Product Bento'),twin:section('06 Digital Twin Signature'),profile:section('07 Company Profile')};
        menu.classList.remove('open'); go(map[b.dataset.go]);
      });
    }

    if(!document.getElementById('smartSafeFooter')){
      const tail=document.createElement('section');
      tail.id='smartSafeFooter';
      tail.innerHTML='<div class="wrap" dir="rtl"><div class="headline"><div><div dir="ltr" style="font:500 11px IBM Plex Mono,monospace;letter-spacing:.16em;color:var(--sf-accent);text-align:right;margin-bottom:14px">INSTITUTIONAL PLATFORM</div><div style="font:600 clamp(40px,5vw,68px)/1.18 Readex Pro,IBM Plex Sans Arabic,sans-serif">من الميدان<br><span style="color:var(--sf-accent);font-weight:300">إلى القرار.</span></div></div><div style="font-size:16px;line-height:1.95;color:var(--sf-muted)">SMART HSR توحّد الحصر والتشغيل والبيانات المكانية في مسار مؤسسي واضح يخدم القيادة والفرق الميدانية ضمن جهة واحدة.</div></div><div class="cards"><a class="card" href="Home.html"><small>01 · MUNICIPAL ACCESS</small><div><b>الدخول المؤسسي</b><p>بوابة واحدة لمساري القيادات البلدية والمستخدمين، مع توجيه تلقائي حسب الجهة والدور والصلاحية.</p></div><span style="color:var(--sf-accent);font-weight:600">الدخول إلى SMART HSR ←</span></a><a class="card" data-tail="profile" href="#"><small>02 · PLATFORM PROFILE</small><div><b>الملف التعريفي</b><p>استعراض الرؤية والمكوّنات ونموذج التشغيل والخدمات الرئيسية للمنصة.</p></div><span style="color:var(--sf-accent);font-weight:600">عرض الملف التعريفي ←</span></a><a class="card" data-tail="twin" href="#"><small>03 · DIGITAL TWIN</small><div><b>التوأم الرقمي</b><p>استكشاف الربط بين العناصر الميدانية والخرائط والتشغيل وصناعة القرار.</p></div><span style="color:var(--sf-accent);font-weight:600">استكشف التوأم ←</span></a></div><footer><div class="footer-grid"><div><div style="font:600 24px Readex Pro,IBM Plex Sans Arabic,sans-serif">SMART HSR</div><p style="max-width:370px;font-size:14px;line-height:1.85;color:var(--sf-muted)">منصة بلدية ذكية لإدارة الحصر والتشغيل والبيانات المكانية وربطها بالقرار.</p></div><div><b>المنصة</b><p><a data-tail="platform" href="#">كيف تعمل</a></p><p><a data-tail="solutions" href="#">الحلول</a></p></div><div><b>المؤسسة</b><p><a data-tail="profile" href="#">الملف التعريفي</a></p><p><a href="Home.html">الدخول المؤسسي</a></p></div><div><b>SMART HSR</b><p style="color:var(--sf-muted)">Saudi GovTech</p><p style="color:var(--sf-muted)">Arabic · English</p></div></div><div class="developer"><span>التطوير والتشغيل التقني</span><strong>BLUMARK24</strong></div><div class="legal"><span>© 2026 SMART HSR. جميع الحقوق محفوظة.</span><span dir="ltr">FIELD → DATA → OPERATIONS → DECISION</span></div></footer></div>';
      document.body.appendChild(tail);
      tail.addEventListener('click',e=>{
        const a=e.target.closest('[data-tail]'); if(!a)return; e.preventDefault();
        const map={platform:section('02 Statement'),solutions:section('04 Product Bento'),twin:section('06 Digital Twin Signature'),profile:section('07 Company Profile')};
        go(map[a.dataset.tail]);
      });
    }
  }

  function routeClick(e){
    const hit=e.target.closest('a,button,span,div'); if(!hit)return;
    const text=norm(hit.textContent);

    if(text==='الدخول'||text.includes('الدخول إلى SMART HSR')){
      e.preventDefault(); e.stopPropagation(); location.href='Home.html'; return;
    }
    if(text==='القائمة'){
      e.preventDefault(); e.stopPropagation(); document.getElementById('smartSafeMenu')?.classList.add('open'); return;
    }
    if(text==='المنصة'){e.preventDefault();go(section('02 Statement'));return}
    if(text==='الحلول'){e.preventDefault();go(section('04 Product Bento'));return}
    if(text==='التوأم الرقمي'){e.preventDefault();go(section('06 Digital Twin Signature'));return}
    if(text==='الملف التعريفي'){e.preventDefault();go(section('07 Company Profile'));return}
    if(text==='عرض الملف التعريفي'){e.preventDefault();e.stopPropagation();window.open(PROFILE_PREVIEW,'_blank','noopener');return}
    if(text==='تنزيل الملف التعريفي'){e.preventDefault();e.stopPropagation();window.open(PROFILE_DOWNLOAD,'_blank','noopener');return}
  }

  document.addEventListener('click',routeClick,true);
  document.addEventListener('DOMContentLoaded',installExternalUI,{once:true});
  if(document.readyState!=='loading') installExternalUI();
})();
