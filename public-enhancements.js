
(function(){
  'use strict';
  const PROFILE_PREVIEW='https://drive.google.com/file/d/1yietCualc15XxZVzlxJzI7NhHVcTAwMh/preview';
  const PROFILE_DOWNLOAD='https://drive.google.com/uc?export=download&id=1yietCualc15XxZVzlxJzI7NhHVcTAwMh';
  const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
  const exact=(text,sel='span,div,a,button')=>[...document.querySelectorAll(sel)].find(el=>norm(el.textContent)===text)||null;
  const contains=(text,sel='span,div,a,button')=>[...document.querySelectorAll(sel)].find(el=>norm(el.textContent).includes(text))||null;
  const section=label=>document.querySelector('[data-screen-label="'+label+'"]');
  const go=el=>el&&el.scrollIntoView({behavior:'smooth',block:'start'});
  function activate(el,fn){
    if(!el||el.dataset.smartReady)return;
    el.dataset.smartReady='1'; el.style.cursor='pointer';
    if(!/^(A|BUTTON)$/.test(el.tagName)){el.tabIndex=0;el.setAttribute('role','button')}
    el.addEventListener('click',e=>{e.preventDefault();fn(e)});
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn(e)}});
  }
  function css(){
    if(document.getElementById('smart-public-css'))return;
    const s=document.createElement('style');s.id='smart-public-css';
    s.textContent=`
      html{scroll-behavior:smooth}
      #smartThemeToggle{width:42px;height:42px;display:grid;place-items:center;flex:none;border:1px solid rgba(14,26,36,.10);border-radius:12px;background:rgba(255,255,255,.74);color:#073324;font:600 17px/1 system-ui;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 8px 24px -18px rgba(14,26,36,.3);transition:.22s}
      #smartThemeToggle:hover{transform:translateY(-1px)}
      #smartMobileMenu{position:fixed;inset:0;z-index:9998;display:none;background:rgba(4,24,17,.5);backdrop-filter:blur(18px);padding:18px}
      #smartMobileMenu.open{display:flex}
      #smartMobileMenu .panel{margin:70px auto auto;width:min(520px,100%);border-radius:28px;padding:18px;background:rgba(248,252,249,.95);border:1px solid rgba(255,255,255,.9);box-shadow:0 35px 90px -35px rgba(0,0,0,.55)}
      #smartMobileMenu button,#smartMobileMenu a{width:100%;min-height:52px;padding:0 16px;border:0;border-bottom:1px solid rgba(14,26,36,.08);background:transparent;color:#0E1A24;font:600 15px "IBM Plex Sans Arabic",sans-serif;text-decoration:none;display:flex;align-items:center;justify-content:space-between;cursor:pointer;box-sizing:border-box}
      #smartMobileMenu .login{margin-top:12px;border:0!important;border-radius:14px!important;background:linear-gradient(180deg,#0E5A3B,#073324)!important;color:#fff!important;justify-content:center!important}
      #smartInstitutionalTail{background:#F3F6F4;color:#0E1A24}
      #smartInstitutionalTail .wrap{max-width:1320px;margin:auto;padding:120px 48px 54px}
      #smartInstitutionalTail .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:46px}
      #smartInstitutionalTail .card{min-height:230px;padding:28px;border-radius:28px;background:linear-gradient(180deg,rgba(255,255,255,.94),rgba(255,255,255,.70));border:1px solid #fff;box-shadow:inset 0 1px 0 #fff,0 28px 65px -48px rgba(14,26,36,.42);display:flex;flex-direction:column;justify-content:space-between;text-decoration:none;color:#0E1A24}
      #smartInstitutionalTail .card small{font:500 10px "IBM Plex Mono",monospace;letter-spacing:.14em;color:#0C842B}
      #smartInstitutionalTail .card b{font:600 27px "Readex Pro","IBM Plex Sans Arabic",sans-serif}
      #smartInstitutionalTail .card p{font-size:14px;line-height:1.9;color:#56626C}
      #smartInstitutionalTail footer{margin-top:90px;padding-top:46px;border-top:1px solid rgba(14,26,36,.10)}
      #smartInstitutionalTail .footer-grid{display:grid;grid-template-columns:minmax(280px,1.3fr) repeat(3,minmax(140px,.6fr));gap:36px}
      #smartInstitutionalTail footer a{color:#56626C;text-decoration:none}
      #smartInstitutionalTail .legal{margin-top:34px;padding-top:22px;border-top:1px solid rgba(14,26,36,.10);display:flex;justify-content:space-between;gap:18px;font-size:12px;color:#748078}
      html[data-public-theme="dark"],html[data-public-theme="dark"] body{background:#061811!important;color-scheme:dark}
      html[data-public-theme="dark"] [data-screen-label="01 Hero"]{background:radial-gradient(72% 88% at 34% 62%,#123428 0%,#092219 56%,#061811 100%)!important;color:#F3F8F5!important}
      html[data-public-theme="dark"] [data-screen-label="01 Hero"]>div[style*="width:52%"]{background:linear-gradient(270deg,rgba(6,24,17,.96),rgba(9,34,25,.84) 55%,rgba(6,24,17,0))!important}
      html[data-public-theme="dark"] [data-screen-label="01 Hero"]>div[style*="height:160px"]{background:linear-gradient(180deg,rgba(6,24,17,0),#061811)!important}
      html[data-public-theme="dark"] [data-screen-label="01 Hero"] [data-card]{background:linear-gradient(180deg,rgba(19,57,42,.84),rgba(8,31,23,.66))!important;border-color:rgba(143,224,176,.18)!important;color:#F3F8F5!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 28px 58px -30px rgba(0,0,0,.72)!important}
      html[data-public-theme="dark"] [data-screen-label="02 Statement"],html[data-public-theme="dark"] [data-screen-label="07 Company Profile"]{background:#071D15!important;color:#F3F8F5!important}
      html[data-public-theme="dark"] [data-screen-label="03 Field to Decision"]{background:#061811!important;color:#F3F8F5!important}
      html[data-public-theme="dark"] [data-screen-label="03 Field to Decision"]>div{background:radial-gradient(72% 84% at 36% 55%,#123428,#092219 62%,#061811)!important}
      html[data-public-theme="dark"] [data-screen-label="04 Product Bento"],html[data-public-theme="dark"] [data-screen-label="05 Product Presence"]{background:#092219!important;color:#F3F8F5!important}
      html[data-public-theme="dark"] [data-screen-label="01 Hero"] canvas,html[data-public-theme="dark"] [data-screen-label="03 Field to Decision"] canvas,html[data-public-theme="dark"] [data-screen-label="04 Product Bento"] canvas{filter:brightness(.64) saturate(1.12) contrast(1.05)}
      html[data-public-theme="dark"] [data-screen-label] [style*="color:#0E1A24"]{color:#F3F8F5!important}
      html[data-public-theme="dark"] [data-screen-label] [style*="color:#2E3A44"]{color:#B7CABF!important}
      html[data-public-theme="dark"] [data-screen-label] [style*="color:#56626C"]{color:#91A99C!important}
      html[data-public-theme="dark"] #smartThemeToggle{background:rgba(15,47,35,.82);border-color:rgba(165,232,198,.14);color:#8FE0B0}
      html[data-public-theme="dark"] #smartMobileMenu .panel{background:rgba(9,34,25,.96);border-color:rgba(165,232,198,.13)}
      html[data-public-theme="dark"] #smartMobileMenu button,html[data-public-theme="dark"] #smartMobileMenu a{color:#F3F8F5;border-bottom-color:rgba(165,232,198,.10)}
      html[data-public-theme="dark"] #smartInstitutionalTail{background:#061811;color:#F3F8F5}
      html[data-public-theme="dark"] #smartInstitutionalTail .card{background:linear-gradient(180deg,rgba(21,58,43,.86),rgba(9,32,24,.76));border-color:rgba(143,224,176,.15);color:#F3F8F5}
      html[data-public-theme="dark"] #smartInstitutionalTail .card p,html[data-public-theme="dark"] #smartInstitutionalTail footer a{color:#A9BEB2}
      @media(max-width:900px){#smartInstitutionalTail .cards{grid-template-columns:1fr}#smartInstitutionalTail .footer-grid{grid-template-columns:1fr 1fr}#smartInstitutionalTail .wrap{padding:90px 22px 34px}}
      @media(max-width:560px){#smartInstitutionalTail .footer-grid{grid-template-columns:1fr}#smartInstitutionalTail .legal{flex-direction:column}}
      @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto!important}}
    `;
    document.head.appendChild(s);
  }
  function install(){
    if(!section('01 Hero'))return false;
    css();
    const platform=section('02 Statement'),solutions=section('04 Product Bento'),twin=section('06 Digital Twin Signature'),profile=section('07 Company Profile');

    activate(exact('الدخول','span,a,button,div'),()=>location.href='Home.html');
    const heroBtn=contains('الدخول إلى SMART HSR','div,a,span');
    if(heroBtn) activate(heroBtn,()=>location.href='Home.html');
    activate(exact('المنصة','span,a'),()=>go(platform));
    activate(exact('الحلول','span,a'),()=>go(solutions));
    activate(exact('التوأم الرقمي','span,a'),()=>go(twin));
    activate(exact('الملف التعريفي','span,a'),()=>go(profile));

    const view=exact('عرض الملف التعريفي','div,span,a,button');
    if(view&&!view.dataset.smartProfile){view.dataset.smartProfile='1';view.style.cursor='pointer';view.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();window.open(PROFILE_PREVIEW,'_blank','noopener')},true)}
    const down=exact('تنزيل الملف التعريفي','div,span,a,button');
    if(down&&!down.dataset.smartProfile){down.dataset.smartProfile='1';down.style.cursor='pointer';down.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();window.open(PROFILE_DOWNLOAD,'_blank','noopener')},true)}

    const lang=[...document.querySelectorAll('span,div')].find(el=>norm(el.textContent).replace(/\s/g,'').includes('العربية|EN'));
    if(lang&&!document.getElementById('smartThemeToggle')&&lang.parentElement){
      const b=document.createElement('button');b.id='smartThemeToggle';b.type='button';b.setAttribute('aria-label','تبديل الوضع النهاري والليلي');lang.parentElement.insertBefore(b,lang);
      const apply=t=>{document.documentElement.dataset.publicTheme=t;b.textContent=t==='dark'?'☀':'☾';try{localStorage.setItem('smart-hsr-public-theme',t)}catch(e){}};
      let t='light';try{if(localStorage.getItem('smart-hsr-public-theme')==='dark')t='dark'}catch(e){}
      apply(t);b.addEventListener('click',()=>apply(document.documentElement.dataset.publicTheme==='dark'?'light':'dark'));
    }

    if(!document.getElementById('smartMobileMenu')){
      const m=document.createElement('div');m.id='smartMobileMenu';m.innerHTML='<div class="panel" dir="rtl"><button data-go="platform">المنصة <span>←</span></button><button data-go="solutions">الحلول <span>←</span></button><button data-go="twin">التوأم الرقمي <span>←</span></button><button data-go="profile">الملف التعريفي <span>←</span></button><a class="login" href="Home.html">الدخول إلى SMART HSR</a></div>';document.body.appendChild(m);
      m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');const b=e.target.closest('[data-go]');if(!b)return;const map={platform,solutions,twin,profile};m.classList.remove('open');go(map[b.dataset.go])});
    }
    activate(exact('القائمة','span,div,button'),()=>document.getElementById('smartMobileMenu')?.classList.add('open'));

    if(!document.getElementById('smartInstitutionalTail')){
      const round=contains('ROUND 02 · LIVING SPATIAL GOVTECH','span,div');
      let old=round;
      while(old?.parentElement&&norm(old.parentElement.textContent).includes('PARTNERSHIP CTA + FOOTER')) old=old.parentElement;
      const tail=document.createElement('section');tail.id='smartInstitutionalTail';
      tail.innerHTML='<div class="wrap" dir="rtl"><div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:38px;align-items:end"><div><div dir="ltr" style="font:500 11px IBM Plex Mono,monospace;letter-spacing:.16em;color:#0C842B;text-align:right;margin-bottom:14px">INSTITUTIONAL PARTNERSHIP</div><div style="font:600 clamp(42px,5vw,72px)/1.18 Readex Pro,IBM Plex Sans Arabic,sans-serif">نحو تشغيل بلدي<br><span style="color:#0C842B;font-weight:300">أكثر ذكاءً.</span></div></div><div style="font-size:17px;line-height:1.9;color:#56626C">مسارات واضحة لاستكشاف المنصة، فهم نموذجها التشغيلي، والانتقال من العرض إلى الاستخدام المؤسسي.</div></div><div class="cards"><a class="card" href="Home.html"><small>01 · MUNICIPALITIES</small><div><b>للبلديات</b><p>الدخول إلى بوابة SMART HSR ومسارات القيادة والفرق التشغيلية.</p></div><span style="color:#0C842B;font-weight:600">الدخول إلى المنصة ←</span></a><a class="card" data-tail="profile" href="#"><small>02 · STRATEGIC PARTNERS</small><div><b>للشراكات الاستراتيجية</b><p>استعراض الملف التعريفي الرسمي والرؤية والمكوّنات ونموذج المنصة.</p></div><span style="color:#0C842B;font-weight:600">عرض الملف التعريفي ←</span></a><a class="card" data-tail="twin" href="#"><small>03 · INTEGRATION</small><div><b>للتكامل والحلول</b><p>استكشاف طبقات التوأم الرقمي وربط الميدان بالتشغيل والقرار.</p></div><span style="color:#0C842B;font-weight:600">استكشف التوأم ←</span></a></div><footer><div class="footer-grid"><div><div style="font:600 24px Readex Pro,IBM Plex Sans Arabic,sans-serif">SMART HSR</div><p style="max-width:350px;font-size:14px;line-height:1.8;color:#56626C">المنصة البلدية الذكية للإدارة والتشغيل — من الميدان إلى القرار.</p></div><div><b>المنصة</b><p><a data-tail="platform" href="#">كيف تعمل</a></p><p><a data-tail="solutions" href="#">الحلول</a></p></div><div><b>المؤسسة</b><p><a data-tail="profile" href="#">الملف التعريفي</a></p><p><a href="Home.html">الدخول</a></p></div><div><b>SMART HSR</b><p style="color:#748078">Saudi GovTech</p><p style="color:#748078">Arabic · English</p></div></div><div class="legal"><span>© 2026 SMART HSR. جميع الحقوق محفوظة.</span><span dir="ltr">FIELD → DATA → OPERATIONS → DECISION</span></div></footer></div>';
      if(old?.parentNode)old.parentNode.replaceChild(tail,old);else document.body.appendChild(tail);
      tail.addEventListener('click',e=>{const a=e.target.closest('[data-tail]');if(!a)return;e.preventDefault();const map={platform,solutions,twin,profile};go(map[a.dataset.tail])});
    }
    return true;
  }
  let tries=0;
  const timer=setInterval(()=>{tries++;if(install()||tries>80)clearInterval(timer)},150);
})();
