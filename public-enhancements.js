
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

      #smartResponsiveLanding{display:none}
      @media(max-width:1024px){
        html,body{width:100%;max-width:100%;overflow-x:hidden!important}
        body> *:not(#smartResponsiveLanding):not(#smartSafeMenu):not(script):not(style){display:none!important}
        #smartSafeTheme,#smartSafeFooter{display:none!important}
        #smartResponsiveLanding{
          display:block!important;position:relative;z-index:10010;min-height:100dvh;width:100%;
          background:#f4f7f5;color:#10251c;font-family:"IBM Plex Sans Arabic","Tajawal",system-ui,sans-serif;
        }
        #smartResponsiveLanding *{box-sizing:border-box}
        #smartResponsiveLanding .sr-wrap{width:min(100%,920px);margin:0 auto;padding:0 24px}
        #smartResponsiveLanding .sr-nav{
          position:sticky;top:0;z-index:12;padding:max(12px,env(safe-area-inset-top)) 0 10px;
          background:linear-gradient(180deg,rgba(244,247,245,.96),rgba(244,247,245,.86) 74%,rgba(244,247,245,0));
          backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)
        }
        #smartResponsiveLanding .sr-nav-card{
          min-height:68px;padding:10px 12px;border-radius:22px;border:1px solid rgba(17,76,50,.11);
          background:rgba(255,255,255,.88);box-shadow:0 16px 40px -30px rgba(7,42,29,.38);
          display:flex;align-items:center;gap:12px
        }
        #smartResponsiveLanding .sr-logo{width:122px;height:44px;object-fit:contain;display:block}
        #smartResponsiveLanding .sr-nav-spacer{flex:1}
        #smartResponsiveLanding .sr-nav-btn{
          min-width:46px;height:46px;padding:0 14px;border:1px solid rgba(17,76,50,.11);border-radius:14px;
          background:#f7faf8;color:#143126;font:700 13px inherit;cursor:pointer
        }
        #smartResponsiveLanding .sr-nav-btn.menu{min-width:96px}
        #smartResponsiveLanding .sr-hero{padding:48px 0 34px}
        #smartResponsiveLanding .sr-kicker{
          margin-bottom:14px;color:#128443;font:600 11px/1.4 "IBM Plex Mono",monospace;letter-spacing:.16em
        }
        #smartResponsiveLanding h1{
          margin:0;font:650 clamp(46px,8.5vw,76px)/1.04 "Readex Pro","IBM Plex Sans Arabic",sans-serif;letter-spacing:-.055em
        }
        #smartResponsiveLanding h1 span{color:#0b8d3a;font-weight:360}
        #smartResponsiveLanding .sr-lead{
          max-width:680px;margin:20px 0 0;color:#52675e;font-size:17px;line-height:1.95
        }
        #smartResponsiveLanding .sr-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:26px}
        #smartResponsiveLanding .sr-primary,#smartResponsiveLanding .sr-secondary{
          min-height:52px;padding:0 20px;border-radius:15px;display:inline-flex;align-items:center;justify-content:center;
          text-decoration:none;font-weight:700;font-size:14px
        }
        #smartResponsiveLanding .sr-primary{background:#0b653d;color:#fff;border:1px solid #0b653d;box-shadow:0 16px 34px -25px #0b653d}
        #smartResponsiveLanding .sr-secondary{background:#fff;color:#17362a;border:1px solid rgba(17,76,50,.12)}
        #smartResponsiveLanding .sr-hero-visual{
          position:relative;height:330px;margin-top:32px;border-radius:28px;overflow:hidden;
          background:radial-gradient(75% 110% at 72% 18%,rgba(38,172,91,.22),transparent 56%),linear-gradient(145deg,#082c20,#0b402d 60%,#0b2c22);
          border:1px solid rgba(108,219,151,.20);box-shadow:0 30px 70px -50px rgba(6,35,25,.78)
        }
        #smartResponsiveLanding .sr-hero-visual svg{position:absolute;inset:auto 0 0;width:100%;height:78%;opacity:.92}
        #smartResponsiveLanding .sr-visual-label{position:absolute;top:22px;right:22px;color:#dff4e7;font-size:13px;line-height:1.75}
        #smartResponsiveLanding .sr-visual-label b{display:block;font:600 12px "IBM Plex Mono",monospace;letter-spacing:.14em;color:#71dda0}
        #smartResponsiveLanding .sr-section{padding:64px 0}
        #smartResponsiveLanding .sr-section-head{display:flex;align-items:flex-end;gap:18px;justify-content:space-between;margin-bottom:24px}
        #smartResponsiveLanding .sr-section-head h2{margin:0;font:650 clamp(32px,5.5vw,48px)/1.15 "Readex Pro","IBM Plex Sans Arabic",sans-serif}
        #smartResponsiveLanding .sr-section-head p{max-width:430px;margin:0;color:#607169;font-size:14px;line-height:1.8}
        #smartResponsiveLanding .sr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
        #smartResponsiveLanding .sr-card{
          min-height:250px;padding:23px;border-radius:24px;background:#fff;border:1px solid rgba(17,76,50,.10);
          box-shadow:0 24px 56px -46px rgba(9,53,36,.35);display:flex;flex-direction:column;overflow:hidden
        }
        #smartResponsiveLanding .sr-card.dark{background:linear-gradient(145deg,#0a3224,#0b442f);color:#eff9f3;border-color:rgba(115,222,157,.14)}
        #smartResponsiveLanding .sr-card .num{font:600 10px "IBM Plex Mono",monospace;letter-spacing:.14em;color:#0c9141}
        #smartResponsiveLanding .sr-card.dark .num{color:#77e2a5}
        #smartResponsiveLanding .sr-card h3{margin:18px 0 8px;font:650 26px/1.25 "Readex Pro","IBM Plex Sans Arabic",sans-serif}
        #smartResponsiveLanding .sr-card p{margin:0;color:#687971;font-size:13px;line-height:1.8}
        #smartResponsiveLanding .sr-card.dark p{color:#b9cec1}
        #smartResponsiveLanding .sr-mini{margin-top:auto;padding-top:24px;display:flex;align-items:flex-end;gap:6px;min-height:68px}
        #smartResponsiveLanding .sr-mini i{display:block;flex:1;border-radius:8px 8px 3px 3px;background:#dce8e1}
        #smartResponsiveLanding .sr-card.dark .sr-mini i{background:rgba(108,220,151,.18);border:1px solid rgba(108,220,151,.22)}
        #smartResponsiveLanding .sr-twin{
          padding:30px;border-radius:30px;background:linear-gradient(150deg,#05281d,#083a29);color:#f4fbf7;overflow:hidden;border:1px solid rgba(114,223,159,.16)
        }
        #smartResponsiveLanding .sr-twin-copy{max-width:620px}
        #smartResponsiveLanding .sr-twin h2{margin:0;font:650 clamp(34px,6vw,54px)/1.13 "Readex Pro","IBM Plex Sans Arabic",sans-serif}
        #smartResponsiveLanding .sr-twin p{color:#b8ccc1;font-size:15px;line-height:1.9}
        #smartResponsiveLanding .sr-twin-map{height:270px;margin-top:26px;border-radius:22px;background:rgba(5,24,17,.55);border:1px solid rgba(112,219,155,.13);overflow:hidden}
        #smartResponsiveLanding .sr-twin-map svg{width:100%;height:100%}
        #smartResponsiveLanding .sr-profile{
          display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:28px;border-radius:28px;background:#eef3ef;border:1px solid rgba(17,76,50,.10)
        }
        #smartResponsiveLanding .sr-profile h2{margin:0 0 10px;font:650 34px/1.2 "Readex Pro","IBM Plex Sans Arabic",sans-serif}
        #smartResponsiveLanding .sr-profile p{margin:0;color:#5c6e65;line-height:1.85}
        #smartResponsiveLanding .sr-profile-actions{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
        #smartResponsiveLanding .sr-footer{margin-top:64px;padding:34px 0 max(34px,env(safe-area-inset-bottom));border-top:1px solid rgba(17,76,50,.10)}
        #smartResponsiveLanding .sr-footer-row{display:flex;align-items:center;gap:14px;justify-content:space-between}
        #smartResponsiveLanding .sr-footer b{font:650 20px "Readex Pro","IBM Plex Sans Arabic",sans-serif}
        #smartResponsiveLanding .sr-footer span{color:#718178;font-size:12px}
        html[data-public-theme="dark"] #smartResponsiveLanding{background:#061914;color:#f2f8f4}
        html[data-public-theme="dark"] #smartResponsiveLanding .sr-nav{background:linear-gradient(180deg,rgba(6,25,20,.96),rgba(6,25,20,.87) 74%,rgba(6,25,20,0))}
        html[data-public-theme="dark"] #smartResponsiveLanding .sr-nav-card{background:rgba(11,43,32,.88);border-color:rgba(120,220,158,.13);box-shadow:0 16px 42px -30px rgba(0,0,0,.8)}
        html[data-public-theme="dark"] #smartResponsiveLanding .sr-nav-btn{background:#0c3225;color:#eef8f2;border-color:rgba(120,220,158,.13)}
        html[data-public-theme="dark"] #smartResponsiveLanding .sr-lead,
        html[data-public-theme="dark"] #smartResponsiveLanding .sr-section-head p{color:#a8bbb1}
        html[data-public-theme="dark"] #smartResponsiveLanding .sr-secondary{background:#0b2d22;color:#edf8f2;border-color:rgba(120,220,158,.13)}
        html[data-public-theme="dark"] #smartResponsiveLanding .sr-card{background:#0a281e;color:#f2f8f4;border-color:rgba(120,220,158,.11);box-shadow:0 24px 56px -44px rgba(0,0,0,.78)}
        html[data-public-theme="dark"] #smartResponsiveLanding .sr-card p{color:#9fb5a9}
        html[data-public-theme="dark"] #smartResponsiveLanding .sr-profile{background:#0a261d;border-color:rgba(120,220,158,.11)}
        html[data-public-theme="dark"] #smartResponsiveLanding .sr-profile p,
        html[data-public-theme="dark"] #smartResponsiveLanding .sr-footer span{color:#9db2a7}
        html[data-public-theme="dark"] #smartResponsiveLanding .sr-footer{border-top-color:rgba(120,220,158,.11)}
      }
      @media(max-width:680px){
        #smartResponsiveLanding .sr-wrap{padding:0 16px}
        #smartResponsiveLanding .sr-nav-card{min-height:62px;border-radius:18px;padding:8px 10px}
        #smartResponsiveLanding .sr-logo{width:104px;height:38px}
        #smartResponsiveLanding .sr-nav-btn{height:44px;min-width:44px;padding:0 11px}
        #smartResponsiveLanding .sr-nav-btn.menu{min-width:78px}
        #smartResponsiveLanding .sr-hero{padding:38px 0 26px}
        #smartResponsiveLanding h1{font-size:clamp(42px,13vw,58px)}
        #smartResponsiveLanding .sr-lead{font-size:15px;line-height:1.9}
        #smartResponsiveLanding .sr-actions{display:grid;grid-template-columns:1fr 1fr}
        #smartResponsiveLanding .sr-primary,#smartResponsiveLanding .sr-secondary{padding:0 13px;font-size:13px}
        #smartResponsiveLanding .sr-hero-visual{height:260px;border-radius:23px}
        #smartResponsiveLanding .sr-section{padding:50px 0}
        #smartResponsiveLanding .sr-section-head{display:block}
        #smartResponsiveLanding .sr-section-head p{margin-top:10px}
        #smartResponsiveLanding .sr-grid{grid-template-columns:1fr;gap:11px}
        #smartResponsiveLanding .sr-card{min-height:205px;padding:20px;border-radius:21px}
        #smartResponsiveLanding .sr-card h3{font-size:24px}
        #smartResponsiveLanding .sr-twin{padding:22px;border-radius:24px}
        #smartResponsiveLanding .sr-twin-map{height:220px}
        #smartResponsiveLanding .sr-profile{grid-template-columns:1fr;padding:22px;border-radius:23px}
        #smartResponsiveLanding .sr-profile-actions{justify-content:stretch}
        #smartResponsiveLanding .sr-profile-actions a{flex:1}
        #smartResponsiveLanding .sr-footer-row{align-items:flex-start;flex-direction:column}
      }
      @media(max-width:390px){
        #smartResponsiveLanding .sr-wrap{padding-inline:13px}
        #smartResponsiveLanding .sr-logo{width:94px}
        #smartResponsiveLanding .sr-nav-btn.menu{min-width:70px;font-size:12px}
        #smartResponsiveLanding .sr-actions{grid-template-columns:1fr}
        #smartResponsiveLanding .sr-hero-visual{height:235px}
      }

      @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto!important}}
    `;
    document.head.appendChild(style);
  }

  function setTheme(t){
    document.documentElement.dataset.publicTheme=t;
    document.documentElement.style.colorScheme=t;
    const buttons=[document.getElementById('smartSafeTheme'),document.getElementById('smartMobileTheme')].filter(Boolean);
    buttons.forEach(b=>{
      b.textContent=t==='dark'?'☀':'☾';
      b.title=t==='dark'?'تفعيل الوضع النهاري':'تفعيل الوضع الليلي';
      b.setAttribute('aria-pressed',String(t==='dark'));
    });
    let meta=document.querySelector('meta[name="theme-color"]');
    if(!meta){meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta)}
    meta.content=t==='dark'?'#061914':'#F2F6F3';
    try{localStorage.setItem('smart-hsr-public-theme',t)}catch(e){}
  }


  function responsiveTarget(name){
    if(matchMedia('(max-width:1024px)').matches){
      const map={platform:'#sr-platform',solutions:'#sr-solutions',twin:'#sr-twin',profile:'#sr-profile'};
      return map[name]?document.querySelector(map[name]):null;
    }
    const map={platform:section('02 Statement'),solutions:section('04 Product Bento'),twin:section('06 Digital Twin Signature'),profile:section('07 Company Profile')};
    return map[name]||null;
  }

  function installResponsiveLanding(){
    if(document.getElementById('smartResponsiveLanding')) return;
    const root=document.createElement('main');
    root.id='smartResponsiveLanding';
    root.dir='rtl';
    root.innerHTML=`
      <div class="sr-nav">
        <div class="sr-wrap">
          <div class="sr-nav-card">
            <img class="sr-logo" src="Smart_HSR_Dashboard_Logo.svg" alt="SMART HSR">
            <div class="sr-nav-spacer"></div>
            <button class="sr-nav-btn menu" type="button" id="smartMobileMenu">القائمة</button>
            <button class="sr-nav-btn" type="button" id="smartMobileTheme" aria-label="تبديل المظهر">☾</button>
          </div>
        </div>
      </div>
      <div class="sr-wrap">
        <section class="sr-hero" id="sr-platform">
          <div class="sr-kicker" dir="ltr">SMART MUNICIPAL OPERATING PLATFORM</div>
          <h1>من الميدان<br><span>إلى القرار.</span></h1>
          <p class="sr-lead">منظومة بلدية ذكية تربط الحصر والبيانات المكانية والتشغيل والمستخدمين في مسار مؤسسي واحد، مع عزل كل جهة وصلاحياتها.</p>
          <div class="sr-actions">
            <a class="sr-primary" href="Home.html">الدخول إلى SMART HSR</a>
            <a class="sr-secondary" href="#sr-solutions">استكشف المنصة</a>
          </div>
          <div class="sr-hero-visual">
            <div class="sr-visual-label"><b>FIELD → DATA → OPERATIONS → DECISION</b>شبكة تشغيل مكانية تربط الميدان بالقرار.</div>
            <svg viewBox="0 0 900 360" aria-hidden="true">
              <defs><linearGradient id="srg" x1="0" x2="1"><stop offset="0" stop-color="#73e3a2"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs>
              <g stroke="rgba(134,225,170,.16)" stroke-width="1" fill="none">
                <path d="M0 310L180 195L350 280L515 145L690 230L900 92"/>
                <path d="M0 250L170 120L350 205L505 72L720 150L900 35"/>
                <path d="M105 360L210 65M280 360L355 50M470 360L520 20M680 360L710 10"/>
              </g>
              <g stroke="url(#srg)" stroke-width="3" fill="none" opacity=".75"><path d="M36 286L190 178L343 247L508 126L684 211L862 104"/></g>
              <g fill="#74e6a4"><circle cx="190" cy="178" r="6"/><circle cx="508" cy="126" r="6"/><circle cx="684" cy="211" r="6"/></g>
              <g fill="#e7fff0"><circle cx="343" cy="247" r="5"/><circle cx="862" cy="104" r="5"/></g>
            </svg>
          </div>
        </section>

        <section class="sr-section" id="sr-solutions">
          <div class="sr-section-head"><div><div class="sr-kicker">OPERATIONAL LAYERS</div><h2>الخدمات الأساسية</h2></div><p>واجهات تشغيلية واضحة، من المراقب الميداني حتى مركز القيادة، ضمن نفس الهوية المؤسسية.</p></div>
          <div class="sr-grid">
            <article class="sr-card"><span class="num">01 · FIELD SURVEY</span><h3>الحصر الميداني الذكي</h3><p>ملاحظات موثقة بالموقع والصورة، تمر من الرصد إلى المعالجة والتحقق.</p><div class="sr-mini"><i style="height:28px"></i><i style="height:48px"></i><i style="height:36px"></i><i style="height:58px"></i></div></article>
            <article class="sr-card dark"><span class="num">02 · SMART LANDS</span><h3>الأراضي والممتلكات</h3><p>سجل مكاني منظم للمنح والقرارات والمستندات ونسب الاكتمال.</p><div class="sr-mini"><i style="height:36px"></i><i style="height:58px"></i><i style="height:42px"></i><i style="height:64px"></i></div></article>
            <article class="sr-card"><span class="num">03 · MOBILITY</span><h3>الحركة الذكية</h3><p>المركبات والمهام والتغطية التشغيلية والحوادث في مسار واحد.</p><div class="sr-mini"><i style="height:45px"></i><i style="height:30px"></i><i style="height:62px"></i><i style="height:52px"></i></div></article>
            <article class="sr-card dark"><span class="num">04 · COMMAND CENTER</span><h3>مركز القيادة</h3><p>رؤية تنفيذية موحدة للمؤشرات والمستخدمين والتشغيل والقرارات.</p><div class="sr-mini"><i style="height:52px"></i><i style="height:39px"></i><i style="height:67px"></i><i style="height:46px"></i></div></article>
            <article class="sr-card"><span class="num">05 · USERS</span><h3>المستخدمون والتشغيل</h3><p>دخول واحد وتوجيه تلقائي حسب الجهة والدور والصلاحيات المعتمدة.</p><div class="sr-mini"><i style="height:34px"></i><i style="height:54px"></i><i style="height:45px"></i><i style="height:62px"></i></div></article>
            <article class="sr-card dark"><span class="num">06 · MULTI-TENANT</span><h3>جهات متعددة، عزل كامل</h3><p>كل بلدية أو مؤسسة تعمل ضمن نطاقها وبياناتها وصلاحياتها دون تداخل.</p><div class="sr-mini"><i style="height:58px"></i><i style="height:42px"></i><i style="height:65px"></i><i style="height:36px"></i></div></article>
          </div>
        </section>

        <section class="sr-section" id="sr-twin">
          <div class="sr-twin">
            <div class="sr-twin-copy"><div class="sr-kicker">SMART HSR DIGITAL TWIN</div><h2>نموذج واحد.<br>طبقات تشغيلية مترابطة.</h2><p>النقاط والعناصر والمواقع والبلاغات تظهر في سياق مكاني قابل للتحليل، مع بقاء الخريطة هي المرجع البصري للتشغيل.</p></div>
            <div class="sr-twin-map">
              <svg viewBox="0 0 900 330" aria-hidden="true">
                <g stroke="rgba(116,224,159,.14)" fill="none"><path d="M0 265L140 178L286 242L425 118L575 205L736 96L900 170"/><path d="M20 180L160 92L305 155L450 58L600 136L760 42L900 104"/><path d="M95 330L180 46M260 330L330 30M445 330L480 10M655 330L680 0M815 330L835 25"/></g>
                <g stroke="#71dda0" stroke-width="2.5" fill="none" opacity=".72"><path d="M38 245L158 164L294 222L436 108L584 194L742 89L868 154"/></g>
                <g fill="#83edaf"><circle cx="158" cy="164" r="7"/><circle cx="436" cy="108" r="7"/><circle cx="584" cy="194" r="7"/><circle cx="742" cy="89" r="7"/></g>
                <g fill="#fff"><circle cx="294" cy="222" r="5"/><circle cx="868" cy="154" r="5"/></g>
              </svg>
            </div>
          </div>
        </section>

        <section class="sr-section" id="sr-profile">
          <div class="sr-profile">
            <div><div class="sr-kicker">COMPANY & PLATFORM PROFILE</div><h2>الملف التعريفي</h2><p>الرؤية، المكونات، نموذج التشغيل، والخدمات في وثيقة واحدة مناسبة للاجتماعات الحكومية والشراكات المؤسسية.</p></div>
            <div class="sr-profile-actions">
              <a class="sr-primary" href="${PROFILE_PREVIEW}" target="_blank" rel="noopener">عرض الملف</a>
              <a class="sr-secondary" href="${PROFILE_DOWNLOAD}" target="_blank" rel="noopener">تنزيل PDF</a>
            </div>
          </div>
        </section>

        <footer class="sr-footer">
          <div class="sr-footer-row"><div><b>SMART HSR</b><br><span>المنصة البلدية الذكية للإدارة والتشغيل</span></div><div><span>التطوير والتشغيل التقني</span><br><b style="font-size:15px;letter-spacing:.08em">BLUMARK24</b></div></div>
        </footer>
      </div>
    `;
    document.body.appendChild(root);
    document.getElementById('smartMobileMenu')?.addEventListener('click',()=>document.getElementById('smartSafeMenu')?.classList.add('open'));
    document.getElementById('smartMobileTheme')?.addEventListener('click',()=>setTheme(document.documentElement.dataset.publicTheme==='dark'?'light':'dark'));
  }

  function installExternalUI(){
    installCSS();
    installResponsiveLanding();

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
        menu.classList.remove('open'); go(responsiveTarget(b.dataset.go));
      });
    }

    if(!document.getElementById('smartSafeFooter')){
      const tail=document.createElement('section');
      tail.id='smartSafeFooter';
      tail.innerHTML='<div class="wrap" dir="rtl"><div class="headline"><div><div dir="ltr" style="font:500 11px IBM Plex Mono,monospace;letter-spacing:.16em;color:var(--sf-accent);text-align:right;margin-bottom:14px">INSTITUTIONAL PLATFORM</div><div style="font:600 clamp(40px,5vw,68px)/1.18 Readex Pro,IBM Plex Sans Arabic,sans-serif">من الميدان<br><span style="color:var(--sf-accent);font-weight:300">إلى القرار.</span></div></div><div style="font-size:16px;line-height:1.95;color:var(--sf-muted)">SMART HSR توحّد الحصر والتشغيل والبيانات المكانية في مسار مؤسسي واضح يخدم القيادة والفرق الميدانية ضمن جهة واحدة.</div></div><div class="cards"><a class="card" href="Home.html"><small>01 · MUNICIPAL ACCESS</small><div><b>الدخول المؤسسي</b><p>بوابة واحدة لمساري القيادات البلدية والمستخدمين، مع توجيه تلقائي حسب الجهة والدور والصلاحية.</p></div><span style="color:var(--sf-accent);font-weight:600">الدخول إلى SMART HSR ←</span></a><a class="card" data-tail="profile" href="#"><small>02 · PLATFORM PROFILE</small><div><b>الملف التعريفي</b><p>استعراض الرؤية والمكوّنات ونموذج التشغيل والخدمات الرئيسية للمنصة.</p></div><span style="color:var(--sf-accent);font-weight:600">عرض الملف التعريفي ←</span></a><a class="card" data-tail="twin" href="#"><small>03 · DIGITAL TWIN</small><div><b>التوأم الرقمي</b><p>استكشاف الربط بين العناصر الميدانية والخرائط والتشغيل وصناعة القرار.</p></div><span style="color:var(--sf-accent);font-weight:600">استكشف التوأم ←</span></a></div><footer><div class="footer-grid"><div><div style="font:600 24px Readex Pro,IBM Plex Sans Arabic,sans-serif">SMART HSR</div><p style="max-width:370px;font-size:14px;line-height:1.85;color:var(--sf-muted)">منصة بلدية ذكية لإدارة الحصر والتشغيل والبيانات المكانية وربطها بالقرار.</p></div><div><b>المنصة</b><p><a data-tail="platform" href="#">كيف تعمل</a></p><p><a data-tail="solutions" href="#">الحلول</a></p></div><div><b>المؤسسة</b><p><a data-tail="profile" href="#">الملف التعريفي</a></p><p><a href="Home.html">الدخول المؤسسي</a></p></div><div><b>SMART HSR</b><p style="color:var(--sf-muted)">Saudi GovTech</p><p style="color:var(--sf-muted)">Arabic · English</p></div></div><div class="developer"><span>التطوير والتشغيل التقني</span><strong>BLUMARK24</strong></div><div class="legal"><span>© 2026 SMART HSR. جميع الحقوق محفوظة.</span><span dir="ltr">FIELD → DATA → OPERATIONS → DECISION</span></div></footer></div>';
      document.body.appendChild(tail);
      tail.addEventListener('click',e=>{
        const a=e.target.closest('[data-tail]'); if(!a)return; e.preventDefault();
        go(responsiveTarget(a.dataset.tail));
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
