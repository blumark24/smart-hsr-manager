
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
        position:relative;z-index:2;background:#F3F6F4;color:#0E1A24;border-top:1px solid rgba(14,26,36,.08)
      }
      #smartSafeFooter .wrap{max-width:1320px;margin:0 auto;padding:110px 48px 42px}
      #smartSafeFooter .headline{
        display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:42px;align-items:end
      }
      #smartSafeFooter .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:44px}
      #smartSafeFooter .card{
        min-height:230px;padding:28px;border-radius:28px;background:linear-gradient(180deg,rgba(255,255,255,.94),rgba(255,255,255,.72));
        border:1px solid #fff;box-shadow:inset 0 1px 0 #fff,0 28px 65px -48px rgba(14,26,36,.42);
        display:flex;flex-direction:column;justify-content:space-between;text-decoration:none;color:#0E1A24
      }
      #smartSafeFooter .card small{font:500 10px "IBM Plex Mono",monospace;letter-spacing:.14em;color:#0C842B}
      #smartSafeFooter .card b{font:600 27px "Readex Pro","IBM Plex Sans Arabic",sans-serif}
      #smartSafeFooter .card p{font-size:14px;line-height:1.9;color:#56626C}
      #smartSafeFooter footer{margin-top:88px;padding-top:44px;border-top:1px solid rgba(14,26,36,.10)}
      #smartSafeFooter .footer-grid{display:grid;grid-template-columns:minmax(280px,1.3fr) repeat(3,minmax(140px,.6fr));gap:36px}
      #smartSafeFooter footer a{color:#56626C;text-decoration:none}
      #smartSafeFooter .legal{margin-top:32px;padding-top:20px;border-top:1px solid rgba(14,26,36,.10);display:flex;justify-content:space-between;gap:18px;font-size:12px;color:#748078}

      html[data-public-theme="dark"],html[data-public-theme="dark"] body{background:#061811!important;color-scheme:dark}
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
      html[data-public-theme="dark"] [data-screen-label="07 Company Profile"]{background:#071D15!important;color:#F3F8F5!important}
      html[data-public-theme="dark"] [data-screen-label="03 Field to Decision"]{background:#061811!important;color:#F3F8F5!important}
      html[data-public-theme="dark"] [data-screen-label="03 Field to Decision"]>div{
        background:radial-gradient(72% 84% at 36% 55%,#123428,#092219 62%,#061811)!important
      }
      html[data-public-theme="dark"] [data-screen-label="04 Product Bento"],
      html[data-public-theme="dark"] [data-screen-label="05 Product Presence"]{background:#092219!important;color:#F3F8F5!important}
      html[data-public-theme="dark"] [data-screen-label] [style*="color:#0E1A24"]{color:#F3F8F5!important}
      html[data-public-theme="dark"] [data-screen-label] [style*="color:#2E3A44"]{color:#B7CABF!important}
      html[data-public-theme="dark"] [data-screen-label] [style*="color:#56626C"]{color:#91A99C!important}
      html[data-public-theme="dark"] #smartSafeTheme{background:rgba(15,47,35,.84);border-color:rgba(165,232,198,.14);color:#8FE0B0}
      html[data-public-theme="dark"] #smartSafeMenu .panel{background:rgba(9,34,25,.97);border-color:rgba(165,232,198,.13)}
      html[data-public-theme="dark"] #smartSafeMenu button,html[data-public-theme="dark"] #smartSafeMenu a{color:#F3F8F5;border-bottom-color:rgba(165,232,198,.10)}
      html[data-public-theme="dark"] #smartSafeFooter{background:#061811;color:#F3F8F5;border-top-color:rgba(143,224,176,.10)}
      html[data-public-theme="dark"] #smartSafeFooter .card{background:linear-gradient(180deg,rgba(21,58,43,.86),rgba(9,32,24,.76));border-color:rgba(143,224,176,.15);color:#F3F8F5}
      html[data-public-theme="dark"] #smartSafeFooter .card p,html[data-public-theme="dark"] #smartSafeFooter footer a{color:#A9BEB2}
      html[data-public-theme="dark"] #smartSafeFooter footer{border-top-color:rgba(143,224,176,.12)}

      @media(max-width:900px){
        #smartSafeFooter .headline{grid-template-columns:1fr}
        #smartSafeFooter .cards{grid-template-columns:1fr}
        #smartSafeFooter .footer-grid{grid-template-columns:1fr 1fr}
        #smartSafeFooter .wrap{padding:86px 22px 32px}
      }
      @media(max-width:560px){
        #smartSafeTheme{top:14px;left:14px;width:40px;height:40px}
        #smartSafeFooter .footer-grid{grid-template-columns:1fr}
        #smartSafeFooter .legal{flex-direction:column}
      }
      @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto!important}}
    `;
    document.head.appendChild(style);
  }

  function setTheme(t){
    document.documentElement.dataset.publicTheme=t;
    const b=document.getElementById('smartSafeTheme');
    if(b){b.textContent=t==='dark'?'☀':'☾';b.title=t==='dark'?'الوضع النهاري':'الوضع الليلي'}
    try{localStorage.setItem('smart-hsr-public-theme',t)}catch(e){}
  }

  function installExternalUI(){
    installCSS();

    if(!document.getElementById('smartSafeTheme')){
      const b=document.createElement('button');
      b.id='smartSafeTheme'; b.type='button'; b.setAttribute('aria-label','تبديل الوضع النهاري والليلي');
      document.body.appendChild(b);
      let t='light'; try{if(localStorage.getItem('smart-hsr-public-theme')==='dark')t='dark'}catch(e){}
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
      tail.innerHTML='<div class="wrap" dir="rtl"><div class="headline"><div><div dir="ltr" style="font:500 11px IBM Plex Mono,monospace;letter-spacing:.16em;color:#0C842B;text-align:right;margin-bottom:14px">INSTITUTIONAL PARTNERSHIP</div><div style="font:600 clamp(42px,5vw,72px)/1.18 Readex Pro,IBM Plex Sans Arabic,sans-serif">نحو تشغيل بلدي<br><span style="color:#0C842B;font-weight:300">أكثر ذكاءً.</span></div></div><div style="font-size:17px;line-height:1.9;color:#56626C">مسارات واضحة لاستكشاف المنصة، فهم نموذجها التشغيلي، والانتقال من العرض إلى الاستخدام المؤسسي.</div></div><div class="cards"><a class="card" href="Home.html"><small>01 · MUNICIPALITIES</small><div><b>للبلديات</b><p>الدخول إلى بوابة SMART HSR ومسارات القيادة والفرق التشغيلية.</p></div><span style="color:#0C842B;font-weight:600">الدخول إلى المنصة ←</span></a><a class="card" data-tail="profile" href="#"><small>02 · STRATEGIC PARTNERS</small><div><b>للشراكات الاستراتيجية</b><p>استعراض الملف التعريفي الرسمي والرؤية والمكوّنات ونموذج المنصة.</p></div><span style="color:#0C842B;font-weight:600">عرض الملف التعريفي ←</span></a><a class="card" data-tail="twin" href="#"><small>03 · INTEGRATION</small><div><b>للتكامل والحلول</b><p>استكشاف طبقات التوأم الرقمي وربط الميدان بالتشغيل والقرار.</p></div><span style="color:#0C842B;font-weight:600">استكشف التوأم ←</span></a></div><footer><div class="footer-grid"><div><div style="font:600 24px Readex Pro,IBM Plex Sans Arabic,sans-serif">SMART HSR</div><p style="max-width:350px;font-size:14px;line-height:1.8;color:#56626C">المنصة البلدية الذكية للإدارة والتشغيل — من الميدان إلى القرار.</p></div><div><b>المنصة</b><p><a data-tail="platform" href="#">كيف تعمل</a></p><p><a data-tail="solutions" href="#">الحلول</a></p></div><div><b>المؤسسة</b><p><a data-tail="profile" href="#">الملف التعريفي</a></p><p><a href="Home.html">الدخول</a></p></div><div><b>SMART HSR</b><p style="color:#748078">Saudi GovTech</p><p style="color:#748078">Arabic · English</p></div></div><div class="legal"><span>© 2026 SMART HSR. جميع الحقوق محفوظة.</span><span dir="ltr">FIELD → DATA → OPERATIONS → DECISION</span></div></footer></div>';
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
