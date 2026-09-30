
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
      #smartSafeMenu .menu-head{height:42px;display:flex;align-items:center;justify-content:space-between;padding:0 8px 8px}
      #smartSafeMenu .menu-head b{font:600 13px "Readex Pro","IBM Plex Sans Arabic",sans-serif;color:#17352A}
      #smartSafeMenu .menu-close{width:38px!important;min-height:38px!important;height:38px!important;padding:0!important;border:0!important;border-radius:11px!important;background:#EDF3EF!important;justify-content:center!important;font:600 18px/1 system-ui!important}
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

      @media(max-width:1180px){
        #smartSafeFooter .wrap{padding:80px 34px 30px}
        #smartSafeFooter .headline{grid-template-columns:minmax(0,1.1fr) minmax(280px,.9fr);gap:30px}
        #smartSafeFooter .cards{gap:13px}
        #smartSafeFooter .card{min-height:205px;padding:23px}
      }
      @media(max-width:900px){
        #smartSafeFooter .headline{grid-template-columns:1fr}
        #smartSafeFooter .cards{grid-template-columns:1fr}
        #smartSafeFooter .footer-grid{grid-template-columns:1fr 1fr}
        #smartSafeFooter .wrap{padding:68px 22px 28px}
        #smartSafeFooter .card{min-height:0}
        #smartSafeMenu{padding:max(16px,env(safe-area-inset-top)) 16px 16px}
        #smartSafeMenu .panel{width:min(560px,100%);margin:58px auto auto}
      }
      @media(max-width:680px){
        #smartSafeTheme{top:max(12px,env(safe-area-inset-top));left:max(12px,env(safe-area-inset-left));width:44px;height:44px;border-radius:13px}
        #smartSafeMenu{padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))}
        #smartSafeMenu .panel{margin:56px auto auto;border-radius:22px;padding:12px}
        #smartSafeMenu button,#smartSafeMenu a{min-height:52px;font-size:14px}
        #smartSafeFooter .wrap{padding:56px 16px 24px}
        #smartSafeFooter .headline{gap:22px}
        #smartSafeFooter .cards{margin-top:28px;gap:11px}
        #smartSafeFooter .card{padding:20px;border-radius:20px}
        #smartSafeFooter .card b{font-size:22px}
        #smartSafeFooter .card p{font-size:13px}
        #smartSafeFooter footer{margin-top:50px;padding-top:28px}
        #smartSafeFooter .footer-grid{grid-template-columns:1fr}
        #smartSafeFooter .developer{align-items:flex-start;flex-direction:column}
        #smartSafeFooter .legal{flex-direction:column;gap:10px}
      }
      @media(max-width:390px){
        #smartSafeFooter .wrap{padding-inline:13px}
        #smartSafeFooter .card{padding:18px}
        #smartSafeFooter .card b{font-size:21px}
      }

      /* SMART HSR responsive layer.
         It keeps the approved Claude DOM/content/maps and only reflows geometry. */
      .claude-nav,.claude-hero,.claude-statement,.claude-journey,.claude-bento,
      .claude-presence,.claude-twin,.claude-profile{box-sizing:border-box}
      @media(max-width:1024px){
        html,body{width:100%;max-width:100%;overflow-x:hidden!important}
        #smartSafeTheme{top:84px!important;left:12px!important;width:42px!important;height:42px!important}

        .claude-nav{padding:0 12px!important}
        .claude-nav>.claude-nav-card{max-width:100%!important;height:66px!important;padding:0 14px!important;gap:12px!important;border-radius:18px!important}
        .claude-nav .claude-nav-logo{height:40px!important;max-width:132px!important;object-fit:contain!important}
        .claude-nav .claude-nav-actions{gap:8px!important}
        .claude-nav .claude-lang{font-size:12px!important}
        .claude-nav .claude-login{height:42px!important;padding:0 13px!important;font-size:12px!important}

        .claude-hero{height:860px!important;min-height:860px!important;max-height:none!important}
        .claude-hero .hero-wash{width:72%!important}
        .claude-hero .hero-logo-card{left:5%!important;top:13%!important;width:220px!important}
        .claude-hero .hero-field-card{left:4%!important;top:57%!important;width:190px!important}
        .claude-hero .hero-lands-card{left:19%!important;top:77%!important;width:190px!important}
        .claude-hero .hero-copy{right:28px!important;width:min(470px,54%)!important;gap:18px!important}
        .claude-hero .hero-title{font-size:clamp(52px,7vw,72px)!important}
        .claude-hero .hero-rail{right:28px!important;left:28px!important}

        .claude-statement{padding:120px 0 96px!important}
        .claude-statement .section-inner{max-width:100%!important;padding:0 28px!important;gap:38px!important}
        .claude-statement .statement-title{font-size:clamp(54px,9vw,86px)!important}
        .claude-statement .statement-bottom{grid-template-columns:1fr!important;gap:22px!important}

        .claude-journey .journey-sticky{min-height:760px!important}
        .claude-journey .journey-kicker{top:100px!important;right:28px!important;font-size:10px!important}
        .claude-journey .journey-copy{right:28px!important;width:min(420px,48%)!important}
        .claude-journey .journey-num{font-size:96px!important}
        .claude-journey .journey-title{font-size:50px!important}
        .claude-journey .journey-progress{right:28px!important;left:28px!important;bottom:34px!important}

        .claude-bento{padding:110px 0 96px!important}
        .claude-bento .section-inner{max-width:100%!important;padding:0 28px!important;gap:36px!important}
        .claude-bento .bento-head{grid-template-columns:1fr!important;gap:20px!important}
        .claude-bento .bento-grid{grid-template-columns:1fr 1fr!important;grid-auto-rows:auto!important;gap:14px!important}
        .claude-bento .bento-card{grid-column:auto!important;grid-row:auto!important;min-height:380px!important}
        .claude-bento .bento-card.bento-twin-card{min-height:500px!important}
        .claude-bento .bento-users-router{transform:scale(.82)!important;transform-origin:center center!important}

        .claude-presence{padding:38px 0 105px!important}
        .claude-presence .section-inner{max-width:100%!important;padding:0 28px!important;gap:36px!important}
        .claude-presence .presence-head{grid-template-columns:1fr!important;gap:20px!important}
        .claude-presence .presence-stage{height:590px!important}
        .claude-presence .presence-desktop{width:88%!important;height:430px!important}
        .claude-presence .presence-tablet{width:38%!important;height:315px!important}
        .claude-presence .presence-mobile{right:5%!important;width:160px!important;height:330px!important}

        .claude-twin{min-height:850px!important}
        .claude-twin .twin-copy{right:28px!important;max-width:470px!important}
        .claude-twin .twin-layers{right:28px!important;width:310px!important}
        .claude-twin .twin-detail{left:28px!important;width:330px!important}

        .claude-profile{padding:118px 0!important}
        .claude-profile .section-inner{max-width:100%!important;padding:0 28px!important;grid-template-columns:1fr 1fr!important;gap:34px!important}
        .claude-profile .profile-book-stage{height:600px!important}
        .claude-profile .profile-book{width:340px!important;height:482px!important}
        .claude-round-strip{overflow:hidden!important}
      }

      @media(max-width:680px){
        #smartSafeTheme{top:78px!important;left:auto!important;right:10px!important;width:40px!important;height:40px!important}

        .claude-nav{padding:0 8px!important}
        .claude-nav>.claude-nav-card{height:62px!important;padding:0 9px!important;gap:7px!important;border-radius:16px!important}
        .claude-nav .claude-nav-logo{height:36px!important;max-width:112px!important}
        .claude-nav .claude-nav-actions{gap:5px!important}
        .claude-nav .claude-lang{font-size:11px!important}
        .claude-nav .claude-login{display:none!important}

        /* HERO — same Claude visual language, re-composed for the phone width. */
        .claude-hero{height:920px!important;min-height:920px!important}
        .claude-hero .hero-wash{
          width:100%!important;
          background:linear-gradient(180deg,rgba(243,246,244,.92) 0%,rgba(243,246,244,.68) 45%,rgba(243,246,244,.10) 82%,rgba(243,246,244,0) 100%)!important
        }
        .claude-hero .hero-logo-card{left:18px!important;top:96px!important;width:168px!important;padding:11px 13px!important;border-radius:17px!important}
        .claude-hero .hero-copy{
          right:18px!important;left:18px!important;top:245px!important;width:auto!important;transform:none!important;gap:13px!important
        }
        .claude-hero .hero-title{font-size:48px!important;line-height:1.08!important}
        .claude-hero .hero-lead{font-size:15px!important;line-height:1.72!important;max-width:340px!important}
        .claude-hero .hero-actions{flex-wrap:wrap!important;gap:8px!important}
        .claude-hero .hero-actions>div{height:50px!important;padding:0 16px!important;font-size:14px!important}
        .claude-hero .hero-field-card{
          left:16px!important;top:auto!important;bottom:118px!important;width:calc(50% - 22px)!important;padding:12px 13px!important;border-radius:17px!important
        }
        .claude-hero .hero-lands-card{
          left:auto!important;right:16px!important;top:auto!important;bottom:118px!important;width:calc(50% - 22px)!important;padding:12px 13px!important;border-radius:17px!important
        }
        .claude-hero .hero-rail{right:16px!important;left:16px!important;bottom:18px!important}
        .claude-hero .hero-rail .hero-rail-en{display:none!important}

        .claude-statement{padding:84px 0 72px!important}
        .claude-statement .section-inner{padding:0 18px!important;gap:28px!important}
        .claude-statement .statement-title{font-size:45px!important;line-height:1.13!important}
        .claude-statement .statement-bottom{padding-top:22px!important}
        .claude-statement .statement-flow{flex-wrap:wrap!important;gap:9px 12px!important;justify-content:flex-start!important;font-size:12px!important}

        .claude-journey{height:390vh!important}
        .claude-journey .journey-sticky{height:100dvh!important;min-height:690px!important}
        .claude-journey .journey-kicker{top:86px!important;right:18px!important;left:18px!important;font-size:8px!important;white-space:normal!important}
        .claude-journey .journey-copy{
          right:18px!important;left:18px!important;top:24%!important;width:auto!important;transform:none!important;gap:7px!important
        }
        .claude-journey .journey-num{font-size:70px!important}
        .claude-journey .journey-title{font-size:38px!important}
        .claude-journey .journey-desc{font-size:14px!important;line-height:1.7!important;min-height:0!important;max-width:320px!important}
        .claude-journey .journey-progress{right:16px!important;left:16px!important;bottom:22px!important}
        .claude-journey .journey-progress>div:last-child>div{align-items:center!important;text-align:center!important;gap:6px!important;min-width:0!important}
        .claude-journey .journey-progress .stage-ar{font-size:10px!important;white-space:nowrap!important;line-height:1.2!important}
        .claude-journey .journey-progress .stage-en{display:none!important}

        .claude-bento{padding:78px 0 72px!important}
        .claude-bento .section-inner{padding:0 16px!important;gap:26px!important}
        .claude-bento .bento-grid{grid-template-columns:1fr!important;gap:12px!important}
        .claude-bento .bento-card{min-height:340px!important;border-radius:22px!important}
        .claude-bento .bento-card.bento-twin-card{min-height:440px!important}
        .claude-bento .bento-card.bento-users-card{min-height:500px!important}
        .claude-bento .bento-users-router{
          transform:scale(.56)!important;transform-origin:center center!important;
          width:170%!important;left:-35%!important;right:auto!important
        }

        .claude-presence{padding:28px 0 78px!important}
        .claude-presence .section-inner{padding:0 16px!important;gap:28px!important}
        .claude-presence .presence-stage{height:430px!important}
        .claude-presence .presence-desktop{width:100%!important;height:270px!important;border-radius:17px!important}
        .claude-presence .presence-tablet{width:46%!important;height:235px!important;padding:8px!important;border-radius:22px!important}
        .claude-presence .presence-mobile{right:4%!important;bottom:0!important;width:112px!important;height:236px!important;padding:6px!important;border-radius:28px!important}

        .claude-twin{height:920px!important;min-height:920px!important}
        .claude-twin .twin-copy{top:86px!important;right:18px!important;left:18px!important;max-width:none!important;gap:10px!important}
        .claude-twin .twin-title{font-size:42px!important}
        .claude-twin .twin-detail{left:16px!important;right:16px!important;bottom:280px!important;width:auto!important;padding:17px!important}
        .claude-twin .twin-layers{right:16px!important;left:16px!important;bottom:24px!important;width:auto!important;gap:7px!important}
        .claude-twin .twin-layers>div{height:54px!important;padding:0 14px!important}

        .claude-profile{padding:78px 0!important}
        .claude-profile .section-inner{padding:0 16px!important;grid-template-columns:1fr!important;gap:26px!important}
        .claude-profile .profile-actions{flex-wrap:wrap!important}
        .claude-profile .profile-actions>div{height:auto!important;min-height:52px!important;padding:10px 17px!important}
        .claude-profile .profile-book-stage{height:500px!important;border-radius:26px!important}
        .claude-profile .profile-book{width:286px!important;height:405px!important;transform:rotateY(-10deg) rotateX(4deg)!important}
        .claude-profile .profile-book-logo{padding:30px 28px 0!important}
        .claude-profile .profile-book-copy{padding:0 28px!important}
        .claude-profile .profile-book img{width:170px!important}
        .claude-profile .profile-copy{gap:18px!important}
        .claude-profile .profile-book-stage{height:460px!important}
        .claude-round-strip{display:none!important}

        .claude-bento .bento-card.bento-users-card{min-height:560px!important}
        .claude-bento .bento-users-router{
          top:170px!important;right:16px!important;bottom:22px!important;left:16px!important;
          width:auto!important;transform:none!important;display:grid!important;
          grid-template-columns:1fr 1fr!important;gap:10px 12px!important;align-content:start!important;
          padding-top:72px!important;box-sizing:border-box!important
        }
        .claude-bento .bento-users-router>svg{display:none!important}
        .claude-bento .user-role-right,.claude-bento .user-role-left{
          position:relative!important;inset:auto!important;width:auto!important;height:auto!important;
          display:grid!important;grid-template-columns:1fr!important;gap:7px!important;justify-content:stretch!important
        }
        .claude-bento .user-role-right{grid-column:2!important;grid-row:2!important}
        .claude-bento .user-role-left{grid-column:1!important;grid-row:2!important}
        .claude-bento .user-role-right>span,.claude-bento .user-role-left>span{
          width:100%!important;height:34px!important;padding:0 9px!important;box-sizing:border-box!important;
          font-size:11px!important;justify-content:center!important;text-align:center!important
        }
        .claude-bento .user-router-center{
          top:0!important;right:50%!important;left:auto!important;bottom:auto!important;
          transform:translate(50%,0)!important;width:min(250px,82%)!important;padding:11px 12px!important
        }

        #smartSafeMenu{align-items:flex-start!important;justify-content:center!important;padding:12px!important}
        #smartSafeMenu .panel{margin:max(82px,env(safe-area-inset-top)) auto 0!important;width:min(430px,100%)!important;padding:12px!important;border-radius:22px!important}
      }

      @media(max-width:1024px){[data-screen-label]{scroll-margin-top:108px}}

      /* FINAL RESPONSIVE SIZE PASS
         Preserve Claude composition/style; only normalize sizing, spacing and overflow. */
      @media(max-width:700px){
        :root{--m-gutter:16px;--m-nav:64px}
        html,body{overflow-x:hidden!important}

        .claude-nav{
          top:10px!important;left:0!important;right:0!important;
          padding:0 var(--m-gutter)!important;z-index:60!important
        }
        .claude-nav>.claude-nav-card{
          width:100%!important;max-width:none!important;height:var(--m-nav)!important;
          padding:0 12px!important;gap:8px!important;border-radius:18px!important;
          box-shadow:0 16px 36px -26px rgba(18,53,39,.28)!important
        }
        .claude-nav .claude-nav-logo{height:38px!important;max-width:118px!important}
        .claude-nav .claude-nav-actions{gap:6px!important}
        .claude-nav .claude-lang{font-size:11.5px!important;white-space:nowrap!important}
        #smartSafeTheme{
          top:84px!important;right:16px!important;left:auto!important;
          width:42px!important;height:42px!important;border-radius:13px!important;z-index:61!important
        }

        .claude-hero{
          height:980px!important;min-height:980px!important;overflow:hidden!important
        }
        .claude-hero .hero-logo-card{
          top:108px!important;left:18px!important;width:170px!important;
          padding:12px 14px!important;border-radius:18px!important
        }
        .claude-hero .hero-copy{
          top:292px!important;right:18px!important;left:18px!important;width:auto!important;
          gap:14px!important;transform:none!important
        }
        .claude-hero .hero-title{font-size:46px!important;line-height:1.08!important;letter-spacing:-.045em!important}
        .claude-hero .hero-lead{max-width:100%!important;font-size:15px!important;line-height:1.78!important}
        .claude-hero .hero-actions{
          width:100%!important;display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important
        }
        .claude-hero .hero-actions>div{
          min-width:0!important;width:100%!important;height:52px!important;padding:0 12px!important;
          justify-content:center!important;font-size:13.5px!important;white-space:nowrap!important
        }
        .claude-hero .hero-field-card{
          left:16px!important;right:auto!important;bottom:92px!important;top:auto!important;
          width:calc(50% - 22px)!important;min-height:116px!important
        }
        .claude-hero .hero-lands-card{
          right:16px!important;left:auto!important;bottom:92px!important;top:auto!important;
          width:calc(50% - 22px)!important;min-height:116px!important
        }
        .claude-hero .hero-field-card *,
        .claude-hero .hero-lands-card *{max-width:100%!important}
        .claude-hero .hero-rail{bottom:18px!important;right:16px!important;left:16px!important}

        .claude-statement{
          padding:92px 0 80px!important;overflow:hidden!important
        }
        .claude-statement .section-inner{padding:0 var(--m-gutter)!important;gap:28px!important}
        .claude-statement .statement-title{font-size:42px!important;line-height:1.15!important;letter-spacing:-.035em!important}
        .claude-statement .statement-bottom{gap:18px!important}
        .claude-statement .statement-flow{gap:8px 10px!important;font-size:11.5px!important}

        .claude-journey{overflow:hidden!important}
        .claude-journey .journey-sticky{min-height:720px!important}
        .claude-journey .journey-kicker{top:94px!important;right:18px!important;left:18px!important}
        .claude-journey .journey-copy{
          top:24%!important;right:18px!important;left:18px!important;width:auto!important;max-width:none!important
        }
        .claude-journey .journey-num{font-size:68px!important}
        .claude-journey .journey-title{font-size:38px!important;line-height:1.08!important}
        .claude-journey .journey-desc{font-size:14px!important;line-height:1.72!important}
        .claude-journey .journey-progress{right:16px!important;left:16px!important;bottom:26px!important}
        .claude-journey .journey-progress .stage-ar{font-size:9.5px!important}

        .claude-bento{
          padding:82px 0 78px!important;overflow:hidden!important
        }
        .claude-bento .section-inner{padding:0 var(--m-gutter)!important;gap:28px!important}
        .claude-bento .bento-head{gap:16px!important}
        .claude-bento .bento-grid{grid-template-columns:1fr!important;gap:14px!important}
        .claude-bento .bento-card{
          width:100%!important;min-height:330px!important;border-radius:22px!important;overflow:hidden!important
        }
        .claude-bento .bento-card.bento-twin-card{min-height:440px!important}
        .claude-bento .bento-card.bento-users-card{min-height:550px!important}
        .claude-bento .bento-users-router{
          top:184px!important;right:16px!important;left:16px!important;bottom:24px!important;
          width:auto!important;transform:none!important
        }
        .claude-bento .user-router-center{
          width:min(250px,82%)!important;padding:10px 12px!important
        }
        .claude-bento .user-role-right>span,
        .claude-bento .user-role-left>span{
          min-height:36px!important;height:36px!important;font-size:11px!important;border-radius:10px!important
        }

        .claude-presence{
          padding:34px 0 82px!important;overflow:hidden!important
        }
        .claude-presence .section-inner{padding:0 var(--m-gutter)!important;gap:28px!important}
        .claude-presence .presence-stage{height:420px!important}
        .claude-presence .presence-desktop{height:260px!important}
        .claude-presence .presence-tablet{height:222px!important}
        .claude-presence .presence-mobile{height:224px!important}

        .claude-twin{
          height:900px!important;min-height:900px!important;overflow:hidden!important
        }
        .claude-twin .twin-copy{
          top:100px!important;right:18px!important;left:18px!important;max-width:none!important
        }
        .claude-twin .twin-title{font-size:40px!important;line-height:1.12!important}
        .claude-twin .twin-detail{
          right:16px!important;left:16px!important;bottom:276px!important;width:auto!important
        }
        .claude-twin .twin-layers{
          right:16px!important;left:16px!important;bottom:22px!important;width:auto!important
        }

        .claude-profile{
          padding:84px 0 72px!important;overflow:hidden!important
        }
        .claude-profile .section-inner{
          padding:0 var(--m-gutter)!important;grid-template-columns:1fr!important;gap:28px!important
        }
        .claude-profile .profile-copy{width:100%!important;gap:18px!important}
        .claude-profile .profile-actions{
          display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important
        }
        .claude-profile .profile-actions>div{
          width:100%!important;min-width:0!important;min-height:50px!important;
          justify-content:center!important;padding:10px 12px!important
        }
        .claude-profile .profile-book-stage{
          width:100%!important;height:470px!important;border-radius:24px!important;overflow:hidden!important
        }
        .claude-profile .profile-book{
          width:276px!important;height:392px!important;max-width:82%!important
        }
        .claude-round-strip{display:none!important}

        #smartSafeFooter{overflow:hidden!important}
        #smartSafeFooter .wrap{padding:52px var(--m-gutter) 26px!important}
        #smartSafeFooter .headline{display:grid!important;grid-template-columns:1fr!important;gap:18px!important}
        #smartSafeFooter .cards{grid-template-columns:1fr!important;gap:12px!important}
        #smartSafeFooter .card{min-height:0!important;padding:20px!important;border-radius:20px!important}
        #smartSafeFooter .footer-grid{
          display:grid!important;grid-template-columns:1fr 1fr!important;gap:20px 18px!important
        }
        #smartSafeFooter .footer-grid>div{min-width:0!important}
        #smartSafeFooter .developer{margin-top:22px!important;padding:14px 16px!important}
        #smartSafeFooter .legal{font-size:11px!important}

        #smartSafeMenu{padding:12px!important;align-items:flex-start!important}
        #smartSafeMenu .panel{
          width:calc(100% - 8px)!important;max-width:430px!important;
          margin:86px auto 0!important;padding:12px!important;border-radius:22px!important
        }
      }

      @media(max-width:390px){
        :root{--m-gutter:13px}
        .claude-nav .claude-nav-logo{max-width:102px!important}
        .claude-nav .claude-lang{font-size:10.5px!important}
        .claude-hero .hero-title{font-size:42px!important}
        .claude-hero .hero-actions{grid-template-columns:1fr!important}
        .claude-hero{height:1010px!important;min-height:1010px!important}
        .claude-hero .hero-field-card,
        .claude-hero .hero-lands-card{bottom:84px!important}
        .claude-statement .statement-title{font-size:38px!important}
        .claude-profile .profile-actions{grid-template-columns:1fr!important}
        #smartSafeFooter .footer-grid{grid-template-columns:1fr!important}
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


  function tagClaudeLayout(){
    const hero=section('01 Hero');
    const statement=section('02 Statement');
    const journey=section('03 Field to Decision');
    const bento=section('04 Product Bento');
    const presence=section('05 Product Presence');
    const twin=section('06 Digital Twin Signature');
    const profile=section('07 Company Profile');
    if(!hero||!statement||!journey||!bento||!presence||!twin||!profile) return false;

    const root=hero.parentElement;
    const nav=[...root.children].find(el=>el!==hero && getComputedStyle(el).position==='fixed');
    if(nav){
      nav.classList.add('claude-nav');
      nav.firstElementChild?.classList.add('claude-nav-card');
      nav.querySelector('img')?.classList.add('claude-nav-logo');
      const actionRow=[...nav.querySelectorAll('div')].find(el=>norm(el.textContent).includes('العربية')&&norm(el.textContent).includes('EN')&&norm(el.textContent).includes('الدخول'));
      actionRow?.classList.add('claude-nav-actions');
      const lang=[...nav.querySelectorAll('span')].find(el=>norm(el.textContent).includes('العربية')&&norm(el.textContent).includes('EN'));
      lang?.classList.add('claude-lang');
      const login=[...nav.querySelectorAll('span')].find(el=>norm(el.textContent)==='الدخول');
      login?.classList.add('claude-login');
    }

    hero.classList.add('claude-hero');
    hero.querySelector('[data-card="command"][data-depth="22"]')?.classList.add('hero-logo-card');
    hero.querySelector('[data-card="field"]')?.classList.add('hero-field-card');
    hero.querySelector('[data-card="lands"]')?.classList.add('hero-lands-card');
    const heroChildren=[...hero.children];
    heroChildren.find(el=>String(el.getAttribute('style')||'').includes('width:52%'))?.classList.add('hero-wash');
    const heroCopy=heroChildren.find(el=>norm(el.textContent).includes('SMART MUNICIPAL OPERATING PLATFORM')&&norm(el.textContent).includes('من الميدان'));
    if(heroCopy){
      heroCopy.classList.add('hero-copy');
      [...heroCopy.children].find(el=>norm(el.textContent).includes('من الميدان')&&norm(el.textContent).includes('إلى القرار'))?.classList.add('hero-title');
      [...heroCopy.children].find(el=>norm(el.textContent).includes('منظومة بلدية ذكية'))?.classList.add('hero-lead');
      [...heroCopy.children].find(el=>norm(el.textContent).includes('الدخول إلى SMART HSR')&&norm(el.textContent).includes('استكشف المنصة'))?.classList.add('hero-actions');
    }
    const heroRail=heroChildren.find(el=>norm(el.textContent).includes('مرّر لتتبّع الرحلة'));
    if(heroRail){
      heroRail.classList.add('hero-rail');
      [...heroRail.children].find(el=>el.getAttribute('dir')==='ltr')?.classList.add('hero-rail-en');
    }

    statement.classList.add('claude-statement');
    const statementInner=statement.firstElementChild;
    statementInner?.classList.add('section-inner');
    if(statementInner){
      const kids=[...statementInner.children];
      kids[1]?.classList.add('statement-title');
      kids[2]?.classList.add('statement-bottom');
      kids[2]?.children?.[1]?.classList.add('statement-flow');
    }

    journey.classList.add('claude-journey');
    const sticky=journey.firstElementChild;
    sticky?.classList.add('journey-sticky');
    if(sticky){
      const kids=[...sticky.children];
      kids.find(el=>norm(el.textContent).includes('FIELD → DATA → ANALYSIS'))?.classList.add('journey-kicker');
      const copy=kids.find(el=>norm(el.textContent).includes('FIELD')&&/[٠-٩0-9]{2}|0[1-5]/.test(norm(el.textContent))&&el.querySelectorAll('div').length>=3);
      if(copy){
        copy.classList.add('journey-copy');
        const ck=[...copy.children];
        ck[0]?.classList.add('journey-num');
        ck[2]?.classList.add('journey-title');
        ck[3]?.classList.add('journey-desc');
      }
      const progress=kids.find(el=>el.querySelectorAll?.('[dir="ltr"]').length>=4 && el.querySelectorAll?.('span').length>=10);
      if(progress){
        progress.classList.add('journey-progress');
        [...progress.querySelectorAll('span')].forEach(s=>{
          const st=String(s.getAttribute('style')||'');
          if(st.includes("font:600 18px")) s.classList.add('stage-ar');
          if(s.getAttribute('dir')==='ltr') s.classList.add('stage-en');
        });
      }
    }

    bento.classList.add('claude-bento');
    const bentoInner=bento.firstElementChild;
    bentoInner?.classList.add('section-inner');
    if(bentoInner){
      const kids=[...bentoInner.children];
      kids[0]?.classList.add('bento-head');
      const grid=kids[1];
      grid?.classList.add('bento-grid');
      if(grid){
        [...grid.children].forEach((card,i)=>{
          card.classList.add('bento-card');
          if(i===0) card.classList.add('bento-twin-card');
          if(norm(card.textContent).includes('USERS & OPERATIONS')){
            card.classList.add('bento-users-card');
            const router=[...card.querySelectorAll('div')].find(el=>norm(el.textContent).includes('ROLE ROUTER')&&norm(el.textContent).includes('رؤساء الأقسام'));
            if(router){
              router.classList.add('bento-users-router');
              const direct=[...router.children].filter(el=>el.tagName!=='SVG');
              direct.find(el=>norm(el.textContent).includes('رؤساء الأقسام')&&norm(el.textContent).includes('المقاولون'))?.classList.add('user-role-right');
              direct.find(el=>norm(el.textContent).includes('مساحة القسم')&&norm(el.textContent).includes('أوامر العمل'))?.classList.add('user-role-left');
              direct.find(el=>norm(el.textContent).includes('ROLE ROUTER')&&norm(el.textContent).includes('التوجيه حسب الدور والصلاحيات'))?.classList.add('user-router-center');
            }
          }
        });
      }
    }

    presence.classList.add('claude-presence');
    const presenceInner=presence.firstElementChild;
    presenceInner?.classList.add('section-inner');
    if(presenceInner){
      const kids=[...presenceInner.children];
      kids[0]?.classList.add('presence-head');
      const stage=kids[1];
      stage?.classList.add('presence-stage');
      if(stage){
        const sk=[...stage.children];
        sk[0]?.classList.add('presence-desktop');
        sk[1]?.classList.add('presence-tablet');
        sk[2]?.classList.add('presence-mobile');
      }
    }

    twin.classList.add('claude-twin');
    const twinKids=[...twin.children];
    const twinCopy=twinKids.find(el=>norm(el.textContent).includes('SMART HSR DIGITAL TWIN')&&norm(el.textContent).includes('نموذج واحد'));
    twinCopy?.classList.add('twin-copy');
    if(twinCopy) [...twinCopy.children].find(el=>norm(el.textContent).includes('نموذج واحد')&&norm(el.textContent).includes('أربع طبقات'))?.classList.add('twin-title');
    twinKids.find(el=>norm(el.textContent).includes('L1')&&norm(el.textContent).includes('L2')&&norm(el.textContent).includes('L3')&&norm(el.textContent).includes('L4'))?.classList.add('twin-layers');
    twinKids.find(el=>norm(el.textContent).includes('FIELD LAYER')||norm(el.textContent).includes('GIS LAYER')||norm(el.textContent).includes('OPERATIONS LAYER')||norm(el.textContent).includes('DECISION LAYER'))?.classList.add('twin-detail');

    profile.classList.add('claude-profile');
    const profileInner=profile.firstElementChild;
    profileInner?.classList.add('section-inner');
    if(profileInner){
      const kids=[...profileInner.children];
      const copy=kids[0], bookStage=kids[1];
      copy?.classList.add('profile-copy');
      [...copy?.children||[]].find(el=>norm(el.textContent).includes('عرض الملف التعريفي')&&norm(el.textContent).includes('تنزيل الملف التعريفي'))?.classList.add('profile-actions');
      bookStage?.classList.add('profile-book-stage');
      const book=[...bookStage?.children||[]].find(el=>norm(el.textContent).includes('COMPANY & PLATFORM PROFILE'));
      if(book){
        book.classList.add('profile-book');
        const face=[...book.children].find(el=>norm(el.textContent).includes('COMPANY & PLATFORM PROFILE'));
        if(face){
          face.querySelector('img')?.parentElement?.classList.add('profile-book-logo');
          [...face.children].find(el=>norm(el.textContent).includes('COMPANY & PLATFORM PROFILE')&&norm(el.textContent).includes('الملف التعريفي'))?.classList.add('profile-book-copy');
        }
      }
    }
    let legacyStrip=profile.nextElementSibling;
    for(let i=0;i<4&&legacyStrip;i++,legacyStrip=legacyStrip.nextElementSibling){
      const txt=norm(legacyStrip.textContent);
      if(txt.includes('ROUND 02')&&txt.includes('PARTNERSHIP CTA')){
        legacyStrip.classList.add('claude-round-strip');
        break;
      }
    }
    return true;
  }

  function installClaudeResponsiveTags(){
    if(tagClaudeLayout()) return;
    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      if(tagClaudeLayout()||attempts>40) clearInterval(timer);
    },100);
  }

  function installExternalUI(){
    installCSS();
    installClaudeResponsiveTags();

    if(!document.getElementById('smartSafeTheme')){
      const b=document.createElement('button');
      b.id='smartSafeTheme'; b.type='button'; b.setAttribute('aria-label','تبديل الوضع النهاري والليلي');
      document.body.appendChild(b);
      const designKey='smart-hsr-public-cloud-version';
      const designVersion='r2-r3-v1';
      let t='light';
      try{
        const current=localStorage.getItem(designKey);
        const saved=localStorage.getItem('smart-hsr-public-theme');
        if(current===designVersion&&(saved==='dark'||saved==='light')) t=saved;
        else{
          localStorage.setItem('smart-hsr-public-theme','light');
          localStorage.setItem(designKey,designVersion);
        }
      }catch(e){}
      setTheme(t);
      b.addEventListener('click',()=>setTheme(document.documentElement.dataset.publicTheme==='dark'?'light':'dark'));
    }

    if(!document.getElementById('smartSafeMenu')){
      const menu=document.createElement('div');
      menu.id='smartSafeMenu';
      menu.innerHTML='<div class="panel" dir="rtl"><div class="menu-head"><b>التنقل داخل SMART HSR</b><button class="menu-close" type="button" aria-label="إغلاق">×</button></div><button data-go="platform">المنصة <span>←</span></button><button data-go="solutions">الحلول <span>←</span></button><button data-go="twin">التوأم الرقمي <span>←</span></button><button data-go="profile">الملف التعريفي <span>←</span></button><a class="login" href="Home.html">الدخول إلى SMART HSR</a></div>';
      document.body.appendChild(menu);
      menu.addEventListener('click',e=>{
        if(e.target===menu||e.target.closest('.menu-close')){menu.classList.remove('open');return}
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
