(() => {
'use strict';

if (window.__smartHsrUserCenterApprovedSkin) return;
window.__smartHsrUserCenterApprovedSkin = true;

const STYLE_ID = 'uc-approved-reference-skin';

function injectApprovedSkin() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  /* FINAL VISUAL OWNER: approved User Center reference image.
     Structural behavior remains owned by Phase 11D/11F; this layer is CSS-only
     so it cannot compete for employee/account state or backend actions. */
  .ucv2-shell-overlay{
    z-index:50!important;
    background:transparent!important;
    backdrop-filter:none!important;
    pointer-events:none!important;
  }
  .ucv2-host{
    position:fixed!important;
    top:92px!important;
    right:calc(var(--sbW,232px) + 28px)!important;
    bottom:14px!important;
    left:14px!important;
    width:auto!important;
    height:auto!important;
    z-index:52!important;
    overflow:auto!important;
    padding:0!important;
    border-radius:18px!important;
    border:1px solid rgba(86,132,196,.12)!important;
    background:#050b15!important;
    box-shadow:0 24px 72px -42px rgba(0,0,0,.95),inset 0 1px rgba(255,255,255,.018)!important;
    pointer-events:auto!important;
    overscroll-behavior:contain;
  }
  .ucv2-host>.ucv2-app{min-height:100%!important}
  .ucv2-app{
    --r-bg:#050b15;--r-surface:#0a1729;--r-surface2:#0d1d34;
    --r-border:rgba(96,145,211,.14);--r-border2:rgba(96,145,211,.24);
    --r-text:#f7fbff;--r-muted:#7e91ad;--r-blue:#4a84ff;--r-cyan:#34c7ff;
    --r-purple:#8768ff;--r-green:#3ed39a;--r-amber:#f1a33a;--r-rose:#ff6984;
    position:relative!important;isolation:isolate!important;overflow:hidden!important;
    gap:14px!important;padding:22px 24px 26px!important;border:0!important;border-radius:18px!important;color:var(--r-text)!important;
    background:radial-gradient(720px 300px at 10% -2%,rgba(74,96,255,.12),transparent 66%),radial-gradient(620px 340px at 92% 105%,rgba(102,49,255,.11),transparent 70%),radial-gradient(460px 240px at 52% 16%,rgba(26,102,210,.045),transparent 68%),linear-gradient(145deg,#07101e 0%,#081629 48%,#07101d 100%)!important;
    box-shadow:none!important;
  }
  .ucv2-app:before,.ucv2-app:after{content:""!important;position:absolute!important;pointer-events:none!important;border-radius:999px!important;filter:blur(90px)!important;z-index:-1!important}
  .ucv2-app:before{width:500px!important;height:500px!important;left:-245px!important;top:15%!important;background:#3a55ff!important;opacity:.16!important}
  .ucv2-app:after{width:430px!important;height:430px!important;right:8%!important;bottom:-240px!important;background:#7135ff!important;opacity:.13!important}

  .ucv2-header{min-height:62px!important;padding:0 2px!important;align-items:center!important}
  .ucv2-header>div:first-child{display:flex!important;align-items:center!important;gap:13px!important}
  .ucv2-header>div:first-child:before{
    content:""!important;width:46px!important;height:46px!important;flex:0 0 46px!important;border-radius:14px!important;border:1px solid rgba(90,133,255,.22)!important;
    background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%236ca0ff' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpath d='M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E") center/22px 22px no-repeat,linear-gradient(145deg,rgba(42,86,176,.34),rgba(29,47,89,.18))!important;
    box-shadow:inset 0 1px rgba(255,255,255,.04),0 10px 30px -20px rgba(67,108,255,.55)!important;
  }
  .ucv2-eyebrow{display:none!important}.ucv2-header h1{font-size:24px!important;line-height:1.3!important;font-weight:800!important;letter-spacing:-.02em!important;margin:0 0 4px!important;color:#fff!important}.ucv2-header p{margin:0!important;font-size:11px!important;line-height:1.7!important;color:#7187a5!important}
  .ucv2-header-actions{gap:9px!important;align-items:center!important}.ucv2-btn{height:38px!important;min-height:38px!important;border-radius:10px!important;padding:0 14px!important;font-size:11px!important;font-weight:650!important;color:#dbe8f8!important;border:1px solid rgba(98,145,211,.18)!important;background:rgba(12,28,50,.78)!important;box-shadow:inset 0 1px rgba(255,255,255,.025)!important}
  .ucv2-btn:hover:not(:disabled){border-color:rgba(83,137,255,.42)!important;background:rgba(17,36,63,.88)!important}.ucv2-btn.primary{color:#fff!important;background:linear-gradient(135deg,#3478ff 0%,#5067ff 100%)!important;border-color:rgba(111,151,255,.58)!important;box-shadow:0 10px 26px -16px rgba(48,98,255,.85),inset 0 1px rgba(255,255,255,.10)!important}.ucv2-ref-import{order:-1!important;background:rgba(10,24,44,.68)!important}

  .ucv2-kpis{grid-template-columns:repeat(6,minmax(0,1fr))!important;gap:11px!important}.ucv2-kpi{min-height:96px!important;padding:14px!important;border-radius:15px!important;gap:12px!important;position:relative!important;overflow:hidden!important;border:1px solid rgba(96,145,211,.13)!important;background:linear-gradient(145deg,rgba(14,31,56,.88),rgba(9,22,41,.75))!important;box-shadow:inset 0 1px rgba(255,255,255,.022),0 18px 38px -34px rgba(0,0,0,.95)!important}
  .ucv2-kpi:before{content:""!important;position:absolute!important;inset:0!important;background:radial-gradient(210px 120px at 0% 0%,currentColor 0,transparent 67%)!important;opacity:.075!important;pointer-events:none!important}.ucv2-kpi:hover{transform:translateY(-2px)!important;border-color:color-mix(in srgb,currentColor 30%,rgba(96,145,211,.14))!important}
  .ucv2-kpi-icon{width:42px!important;height:42px!important;min-width:42px!important;border-radius:13px!important;display:grid!important;place-items:center!important;font-size:0!important;color:currentColor!important;background:color-mix(in srgb,currentColor 12%,rgba(255,255,255,.015))!important;border:1px solid color-mix(in srgb,currentColor 23%,transparent)!important;box-shadow:inset 0 1px rgba(255,255,255,.035)!important}
  .ucv2-kpi-icon:before{content:"";width:20px;height:20px;background:currentColor;opacity:.95;-webkit-mask:center/contain no-repeat;mask:center/contain no-repeat}
  .ucv2-kpi:nth-child(1) .ucv2-kpi-icon:before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E")}
  .ucv2-kpi:nth-child(2) .ucv2-kpi-icon:before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'/%3E%3C/svg%3E")}
  .ucv2-kpi:nth-child(3) .ucv2-kpi-icon:before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 9v4m0 4h.01M10.3 3.4 2.5 17a2 2 0 0 0 1.73 3h15.54a2 2 0 0 0 1.73-3L13.7 3.4a2 2 0 0 0-3.4 0Z'/%3E%3C/svg%3E")}
  .ucv2-kpi:nth-child(4) .ucv2-kpi-icon:before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 19V5m0 0 8-2 8 2v14l-8 2-8-2m8-16v18'/%3E%3C/svg%3E")}
  .ucv2-kpi:nth-child(5) .ucv2-kpi-icon:before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m9 4 6 2 6-2v14l-6 2-6-2-6 2V6l6-2Zm0 0v14m6-12v14'/%3E%3C/svg%3E")}
  .ucv2-kpi:nth-child(6) .ucv2-kpi-icon:before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3 11h18M5 11l1.5-5h11L19 11m-13 0-2 3v4h2m12-7 2 3v4h-2M7 18h10M7 14h.01M17 14h.01'/%3E%3C/svg%3E")}
  .ucv2-kpi b{font-size:27px!important;line-height:1!important;color:#fff!important;font-weight:760!important;font-variant-numeric:tabular-nums!important}.ucv2-kpi small{font-size:9.5px!important;line-height:1.45!important;color:#b8c8dd!important}.ucv2-kpi:nth-child(1){color:#8d6eff!important}.ucv2-kpi:nth-child(2){color:#39caff!important}.ucv2-kpi:nth-child(3){color:#ff6c86!important}.ucv2-kpi:nth-child(4){color:#f0a23b!important}.ucv2-kpi:nth-child(5){color:#42d39a!important}.ucv2-kpi:nth-child(6){color:#5b91ff!important}

  .ucv2-toolbar{display:grid!important;grid-template-columns:minmax(240px,1.6fr) repeat(5,minmax(100px,.72fr)) auto!important;gap:8px!important;padding:12px!important;margin-bottom:-14px!important;border:1px solid rgba(96,145,211,.13)!important;border-radius:14px 14px 0 0!important;background:linear-gradient(180deg,rgba(10,24,43,.88),rgba(8,19,35,.78))!important;box-shadow:inset 0 1px rgba(255,255,255,.018)!important}
  .ucv2-toolbar input,.ucv2-toolbar select,.ucv2-grid-head select{height:36px!important;border-radius:9px!important;background:rgba(13,30,54,.78)!important;color:#dce8f7!important;border:1px solid rgba(96,145,211,.14)!important;font-size:9.5px!important}.ucv2-toolbar input{padding-inline:12px!important}.ucv2-toolbar input::placeholder{color:#687c99!important}.ucv2-toolbar input:focus,.ucv2-toolbar select:focus,.ucv2-grid-head select:focus{outline:0!important;border-color:rgba(76,131,255,.56)!important;box-shadow:0 0 0 3px rgba(76,131,255,.075)!important}
  .ucv2-quick{padding:10px 12px!important;margin:0!important;background:rgba(8,19,35,.78)!important;border-inline:1px solid rgba(96,145,211,.13)!important}.ucv2-chip-button{height:25px!important;padding:0 9px!important;border-radius:8px!important;font-size:8.5px!important;color:#7186a3!important;background:rgba(13,30,54,.48)!important;border-color:rgba(96,145,211,.10)!important}.ucv2-chip-button.active{color:#dbe7ff!important;background:rgba(55,99,188,.17)!important;border-color:rgba(76,131,255,.35)!important;box-shadow:inset 0 0 0 1px rgba(76,131,255,.035)!important}
  .ucv2-grid-head{min-height:38px!important;padding:9px 12px!important;background:rgba(8,19,35,.78)!important;border-inline:1px solid rgba(96,145,211,.13)!important;color:#7387a4!important;font-size:9px!important}.ucv2-grid-head label{gap:6px!important}.ucv2-grid-head select{height:30px!important}

  .ucv2-table-wrap{border-radius:0!important;border:1px solid rgba(96,145,211,.13)!important;background:rgba(8,19,35,.76)!important;max-height:min(57vh,620px)!important;box-shadow:inset 0 1px rgba(255,255,255,.012)!important}.ucv2-table{font-size:9.5px!important;border-collapse:separate!important;border-spacing:0!important}.ucv2-table thead th{position:sticky!important;top:0!important;z-index:2!important;padding:10px 9px!important;background:#0d1d33!important;color:#768aa7!important;border-color:rgba(96,145,211,.10)!important;font-size:8.5px!important;font-weight:650!important}.ucv2-table td{padding:10px 9px!important;border-color:rgba(96,145,211,.075)!important;color:#d5e1f1!important}.ucv2-table tbody tr{transition:background-color .14s ease!important}.ucv2-table tbody tr:hover,.ucv2-table tbody tr:focus{background:linear-gradient(90deg,rgba(52,97,177,.08),rgba(52,97,177,.02))!important;outline:none!important}.ucv2-person{min-width:158px!important;gap:9px!important}.ucv2-person b{font-size:10.5px!important;color:#f2f7ff!important;font-weight:700!important}.ucv2-person small{font-size:8px!important;color:#6e829f!important}.ucv2-avatar{width:32px!important;height:32px!important;border-radius:50%!important;background:linear-gradient(145deg,#263958,#15243b)!important;border:1px solid rgba(110,153,214,.18)!important;color:#8db8ff!important;box-shadow:inset 0 1px rgba(255,255,255,.03)!important}.ucv2-chip{height:22px!important;min-height:22px!important;border-radius:999px!important;padding-inline:8px!important;font-size:7.8px!important}.ucv2-chip.product{min-width:50px!important;background:rgba(12,27,47,.48)!important}.ucv21-service-dot{width:22px!important;height:22px!important;font-size:8px!important;background:rgba(13,28,49,.44)!important}.ucv21-more{width:30px!important;height:28px!important;border-radius:8px!important;background:rgba(14,31,55,.62)!important;border-color:rgba(96,145,211,.12)!important;color:#7186a3!important;letter-spacing:1.5px!important}.ucv21-more:hover{color:#e3efff!important;border-color:rgba(76,131,255,.36)!important;background:rgba(18,39,68,.78)!important}.ucv2-pagination{padding:10px 12px!important;border:1px solid rgba(96,145,211,.13)!important;border-top:0!important;border-radius:0 0 14px 14px!important;background:rgba(8,19,35,.78)!important;color:#7185a1!important;font-size:9px!important}

  .iuc{background:rgba(2,7,16,.64)!important;backdrop-filter:blur(7px)!important}
  #iuc-profile>div.ucv21-single-page,.ucv21-single-page{width:min(620px,calc(100vw - 42px))!important;max-width:620px!important;max-height:calc(100vh - 34px)!important;padding:0!important;overflow:auto!important;border-radius:20px!important;background:radial-gradient(340px 190px at 72% -8%,rgba(52,92,255,.09),transparent 68%),linear-gradient(155deg,rgba(11,27,49,.995),rgba(7,18,34,.995))!important;border:1px solid rgba(96,145,211,.20)!important;box-shadow:0 42px 120px rgba(0,0,0,.64),0 0 44px rgba(47,96,255,.07),inset 0 1px rgba(255,255,255,.025)!important}
  .ucv21-single-page .ih{position:sticky!important;top:0!important;z-index:9!important;padding:17px 20px!important;border-radius:20px 20px 0 0!important;background:linear-gradient(180deg,rgba(10,25,46,.995),rgba(9,23,43,.96))!important;border-bottom:1px solid rgba(96,145,211,.12)!important;backdrop-filter:blur(14px)!important}.ucv21-single-page .ih b{font-size:16px!important;font-weight:780!important;color:#fff!important}.ucv21-single-page .ih p{font-size:9.5px!important;color:#7085a2!important;margin-top:3px!important}.ucv21-single-page .ih .ix{width:30px!important;height:30px!important;border-radius:9px!important;background:rgba(13,30,54,.72)!important;border:1px solid rgba(96,145,211,.13)!important;color:#7d91ad!important}
  .ucv21-single-page .hier,.ucv21-single-page .tabs,.ucv21-single-page .ucv2-employee360{display:none!important}.ucv21-single-page .pane{display:block!important;padding:0 18px!important;margin:0!important}.ucv21-single-page .pane[hidden]{display:block!important}.ucv21-single-page .pane[data-id="o"],.ucv21-single-page .pane[data-id="h"]{display:none!important}.ucv21-single-page .pane>.act{display:none!important}.ucv21-single-page .pane[data-id="a"]>.sec>.act{display:flex!important;gap:7px!important;margin-top:9px!important;flex-wrap:wrap!important}.ucv21-single-page .pane[data-id="a"] .pwbtn{display:none!important}
  .ucv21-section-head{display:flex!important;align-items:center!important;gap:8px!important;margin:13px 0 8px!important;color:#f1f6ff!important;font-size:11px!important;font-weight:760!important}.ucv21-section-head:before{content:""!important;width:6px!important;height:6px!important;border-radius:999px!important;background:#4a84ff!important;box-shadow:0 0 14px rgba(74,132,255,.58)!important}.ucv21-section-head small{margin-inline-start:auto!important;color:#697f9c!important;font-size:8px!important;font-weight:500!important}
  .ucv21-single-page .sec{padding:13px!important;margin:0 0 10px!important;border-radius:13px!important;background:linear-gradient(145deg,rgba(13,31,56,.72),rgba(9,23,43,.62))!important;border:1px solid rgba(101,151,219,.11)!important;box-shadow:inset 0 1px rgba(255,255,255,.014)!important}.ucv21-single-page .grid{gap:9px 10px!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}.ucv21-single-page .f label,.ucv21-single-page label{font-size:8.5px!important;color:#9eafc5!important;margin-bottom:5px!important}.ucv21-single-page .in,.ucv21-single-page .sel,.ucv21-single-page input,.ucv21-single-page select{min-height:36px!important;height:36px!important;border-radius:9px!important;background:rgba(12,28,51,.82)!important;color:#e8f0fb!important;border:1px solid rgba(96,145,211,.15)!important;font-size:9.5px!important}.ucv21-single-page .in:focus,.ucv21-single-page .sel:focus,.ucv21-single-page input:focus,.ucv21-single-page select:focus{border-color:rgba(76,131,255,.58)!important;box-shadow:0 0 0 3px rgba(76,131,255,.075)!important;outline:0!important}
  .ucv21-single-page .rolebox{margin:0!important}.ucv21-single-page .prod{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}.ucv21-single-page .pc{min-width:0!important;padding:10px!important;border-radius:11px!important;background:rgba(9,23,43,.70)!important;border:1px solid rgba(98,148,211,.12)!important;box-shadow:none!important}.ucv21-single-page .pc.on{border-color:rgba(76,131,255,.36)!important;background:linear-gradient(145deg,rgba(40,75,145,.18),rgba(12,27,49,.72))!important;box-shadow:0 0 0 1px rgba(76,131,255,.035),0 16px 32px -30px rgba(49,102,255,.76)!important}.ucv21-single-page .pc .dest,.ucv21-single-page .pc .note{font-size:7.5px!important;color:#7386a1!important}.ucv21-password-inline{padding:0 18px 2px!important}.ucv21-password-inline .sec{margin-bottom:10px!important}.ucv21-password-note{font-size:8px!important;line-height:1.7!important;color:#6e829f!important;margin-top:7px!important}.ucv21-history-wrap{padding:0 18px 10px!important}.ucv21-history-toggle{height:32px!important;border-radius:8px!important;font-size:9px!important;color:#8297b3!important;background:rgba(12,28,51,.68)!important;border-color:rgba(96,145,211,.12)!important}
  .ucv21-profile-footer{position:sticky!important;bottom:0!important;z-index:10!important;display:flex!important;align-items:center!important;gap:8px!important;padding:12px 18px 15px!important;background:linear-gradient(180deg,rgba(7,18,34,.70),rgba(7,18,34,.99) 36%)!important;border-top:1px solid rgba(96,145,211,.11)!important;backdrop-filter:blur(12px)!important}.ucv21-profile-footer .ucv21-save{margin-inline-start:auto!important;min-width:142px!important;height:36px!important}.ucv21-profile-footer .ucv21-cancel{min-width:86px!important;height:36px!important}.ucv21-profile-msg{font-size:8.5px!important;color:#7d91ad!important}.ucv21-profile-msg.ok{color:#68d4a5!important}.ucv21-profile-msg.er{color:#ff7d94!important}

  .ucv2-add-dialog{width:min(720px,calc(100vw - 42px))!important;max-width:720px!important;border-radius:20px!important;background:linear-gradient(155deg,rgba(11,27,49,.995),rgba(7,18,34,.995))!important;border:1px solid rgba(96,145,211,.18)!important;box-shadow:0 42px 120px rgba(0,0,0,.62),0 0 40px rgba(47,96,255,.06)!important}

  @media(max-width:1450px){.ucv2-kpis{grid-template-columns:repeat(3,minmax(0,1fr))!important}.ucv2-table th:nth-child(8),.ucv2-table td:nth-child(8),.ucv2-table th:nth-child(9),.ucv2-table td:nth-child(9){display:none!important}.ucv2-toolbar{grid-template-columns:minmax(220px,1.5fr) repeat(3,minmax(110px,.8fr))!important}}
  @media(max-width:1100px){.ucv2-host{right:calc(var(--sbW,72px) + 22px)!important;top:86px!important;left:10px!important;bottom:10px!important}.ucv2-app{padding:18px!important}.ucv2-table th:nth-child(4),.ucv2-table td:nth-child(4){display:none!important}}
  @media(max-width:820px){.ucv2-shell-overlay{z-index:80!important}.ucv2-host{top:76px!important;right:10px!important;left:10px!important;bottom:10px!important;border-radius:16px!important}.ucv2-app{padding:14px!important;border-radius:16px!important}.ucv2-header{align-items:flex-start!important;flex-direction:column!important}.ucv2-header-actions{width:100%!important}.ucv2-header-actions .ucv2-btn{flex:1!important}.ucv2-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important}.ucv2-toolbar{grid-template-columns:1fr 1fr!important;margin-bottom:-14px!important}.ucv2-search{grid-column:1/-1!important}.ucv2-table-wrap{display:none!important}.ucv2-mobile-list{display:grid!important}}
  @media(max-width:640px){.ucv2-kpis{grid-template-columns:1fr 1fr!important}.ucv2-kpi{min-height:88px!important}.ucv21-single-page{width:calc(100vw - 18px)!important;max-height:calc(100vh - 18px)!important;border-radius:16px!important}.ucv21-single-page .grid,.ucv21-single-page .prod{grid-template-columns:1fr!important}.ucv21-single-page .pane,.ucv21-password-inline,.ucv21-history-wrap{padding-inline:12px!important}.ucv21-profile-footer{padding-inline:12px!important;flex-wrap:wrap!important}.ucv21-profile-msg{order:3;flex-basis:100%}}
  @media(prefers-reduced-motion:reduce){.ucv2-app,.ucv2-app *,.iuc,.iuc *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
  /* The base dashboard hides its sidebar entirely (aside{display:none}) for
     its whole "tab" breakpoint, 760-1179px — wider than this panel's own
     760-1100px sidebar-gap rules above knew about. Below 1180px the panel
     must always sit flush right; the narrower rules above still refine top/
     left/bottom/columns for their own ranges and are unaffected. */
  @media(max-width:1179px){.ucv2-host{right:10px!important}}
  /* Below 760px the base dashboard's own header wraps onto two lines
     (--hdrWrap:wrap), growing well past the ~76px this panel otherwise
     reserves at top, which clipped the header behind the fixed panel. */
  @media(max-width:759px){.ucv2-host{top:180px!important}}

  /* ============================================================
     DAY MODE — approved SMART HSR government light presentation.
     Every rule above is Night-only and stays completely untouched so the
     approved Night look carries zero regression risk. This block is
     additive: [data-theme="light"] (set by manager-dashboard-format.js's
     route guard from manager.html's own --pgBg signal) gives every selector
     higher specificity than the unscoped dark rules above, regardless of
     source order. Colors are the same tokens manager.html's own approved
     DAY palette already uses (--l1/--l1Bd/--sbBg/--thTx/--logoGreenH/
     --rowH families) — white/light surfaces plus SMART HSR government
     green, not a new palette.
     ============================================================ */
  [data-theme="light"] .ucv2-host{background:#eef1ee!important;border-color:rgba(18,133,90,.2)!important;box-shadow:0 24px 72px -42px rgba(16,60,42,.28)!important}
  [data-theme="light"] .ucv2-app{
    --r-bg:#eef1ee;--r-surface:#ffffff;--r-surface2:#f3f8f5;
    --r-border:rgba(18,133,90,.18);--r-border2:rgba(18,133,90,.3);
    --r-text:#083f2c;--r-muted:#4c6357;--r-blue:#1f5fd6;--r-cyan:#0f7a8c;
    --r-purple:#6d3fc7;--r-green:#128a3e;--r-amber:#9a5b12;--r-rose:#b0304a;
    color:var(--r-text)!important;
    background:radial-gradient(720px 300px at 10% -2%,rgba(18,133,90,.06),transparent 66%),radial-gradient(620px 340px at 92% 105%,rgba(109,63,199,.05),transparent 70%),linear-gradient(145deg,#f6faf8 0%,#eef1ee 48%,#f6faf8 100%)!important;
  }
  [data-theme="light"] .ucv2-app:before{background:#149c2b!important;opacity:.07!important}
  [data-theme="light"] .ucv2-app:after{background:#6d3fc7!important;opacity:.05!important}
  [data-theme="light"] .ucv2-header>div:first-child:before{background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23128a3e' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpath d='M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E") center/22px 22px no-repeat,linear-gradient(145deg,rgba(18,133,90,.14),rgba(18,133,90,.06))!important;border-color:rgba(18,133,90,.22)!important;box-shadow:inset 0 1px rgba(255,255,255,.6),0 10px 30px -20px rgba(18,133,90,.3)!important}
  [data-theme="light"] .ucv2-header h1{color:#083f2c!important}[data-theme="light"] .ucv2-header p{color:#4c6357!important}
  [data-theme="light"] .ucv2-btn{color:#0b3324!important;border-color:rgba(18,133,90,.24)!important;background:#ffffff!important;box-shadow:inset 0 1px rgba(255,255,255,.6)!important}
  [data-theme="light"] .ucv2-btn:hover:not(:disabled){border-color:rgba(18,133,90,.5)!important;background:#f3f8f5!important}
  [data-theme="light"] .ucv2-btn.primary{color:#fff!important;background:linear-gradient(135deg,#149c2b 0%,#0f7a37 100%)!important;border-color:rgba(18,133,90,.6)!important;box-shadow:0 10px 26px -16px rgba(18,133,90,.5),inset 0 1px rgba(255,255,255,.14)!important}
  [data-theme="light"] .ucv2-ref-import{background:#f3f8f5!important}
  [data-theme="light"] .ucv2-kpi{border-color:rgba(18,133,90,.15)!important;background:linear-gradient(155deg,rgba(234,247,240,.9),rgba(253,255,254,.95))!important;box-shadow:inset 0 1px rgba(255,255,255,.7),0 14px 30px -28px rgba(16,60,42,.3)!important}
  [data-theme="light"] .ucv2-kpi:hover{border-color:color-mix(in srgb,currentColor 40%,rgba(18,133,90,.15))!important}
  [data-theme="light"] .ucv2-kpi-icon{background:color-mix(in srgb,currentColor 14%,#ffffff)!important;border-color:color-mix(in srgb,currentColor 30%,transparent)!important;box-shadow:inset 0 1px rgba(255,255,255,.6)!important}
  [data-theme="light"] .ucv2-kpi b{color:#0b2e1d!important}[data-theme="light"] .ucv2-kpi small{color:#4c6357!important}
  [data-theme="light"] .ucv2-kpi:nth-child(1){color:#6d3fc7!important}[data-theme="light"] .ucv2-kpi:nth-child(2){color:#0f7a8c!important}[data-theme="light"] .ucv2-kpi:nth-child(3){color:#b0304a!important}[data-theme="light"] .ucv2-kpi:nth-child(4){color:#9a5b12!important}[data-theme="light"] .ucv2-kpi:nth-child(5){color:#128a3e!important}[data-theme="light"] .ucv2-kpi:nth-child(6){color:#1f5fd6!important}
  [data-theme="light"] .ucv2-toolbar{border-color:rgba(18,133,90,.15)!important;background:linear-gradient(180deg,#ffffff,#f3f8f5)!important;box-shadow:inset 0 1px rgba(255,255,255,.6)!important}
  [data-theme="light"] .ucv2-toolbar input,[data-theme="light"] .ucv2-toolbar select,[data-theme="light"] .ucv2-grid-head select{background:#ffffff!important;color:#0b3324!important;border-color:rgba(18,133,90,.2)!important}
  [data-theme="light"] .ucv2-toolbar input::placeholder{color:#7c9088!important}
  [data-theme="light"] .ucv2-toolbar input:focus,[data-theme="light"] .ucv2-toolbar select:focus,[data-theme="light"] .ucv2-grid-head select:focus{border-color:rgba(18,133,90,.55)!important;box-shadow:0 0 0 3px rgba(18,133,90,.12)!important}
  [data-theme="light"] .ucv2-quick{background:#f3f8f5!important;border-inline-color:rgba(18,133,90,.15)!important}
  [data-theme="light"] .ucv2-chip-button{color:#4c6357!important;background:#ffffff!important;border-color:rgba(18,133,90,.15)!important}
  [data-theme="light"] .ucv2-chip-button.active{color:#0b3324!important;background:rgba(18,133,90,.12)!important;border-color:rgba(18,133,90,.4)!important}
  [data-theme="light"] .ucv2-grid-head{background:#f3f8f5!important;border-inline-color:rgba(18,133,90,.15)!important;color:#4c6357!important}
  [data-theme="light"] .ucv2-table-wrap{border-color:rgba(18,133,90,.15)!important;background:#ffffff!important;box-shadow:inset 0 1px rgba(255,255,255,.6)!important}
  [data-theme="light"] .ucv2-table thead th{background:#f3f8f5!important;color:#4c6357!important;border-color:rgba(18,133,90,.13)!important}
  [data-theme="light"] .ucv2-table td{border-color:rgba(18,133,90,.09)!important;color:#123326!important}
  [data-theme="light"] .ucv2-table tbody tr:hover,[data-theme="light"] .ucv2-table tbody tr:focus{background:rgba(18,133,90,.06)!important}
  [data-theme="light"] .ucv2-person b{color:#0b2e1d!important}[data-theme="light"] .ucv2-person small{color:#5c7268!important}
  [data-theme="light"] .ucv2-avatar{background:linear-gradient(145deg,#dcefe3,#c7e3d2)!important;border-color:rgba(18,133,90,.24)!important;color:#0f7a37!important;box-shadow:inset 0 1px rgba(255,255,255,.7)!important}
  [data-theme="light"] .ucv2-chip.product{background:#f3f8f5!important}
  [data-theme="light"] .ucv21-service-dot{background:#f3f8f5!important}
  [data-theme="light"] .ucv21-more{background:#ffffff!important;border-color:rgba(18,133,90,.15)!important;color:#4c6357!important}
  [data-theme="light"] .ucv21-more:hover{color:#0b3324!important;border-color:rgba(18,133,90,.4)!important;background:#f3f8f5!important}
  [data-theme="light"] .ucv2-pagination{border-color:rgba(18,133,90,.15)!important;background:#f3f8f5!important;color:#4c6357!important}
  [data-theme="light"] .iuc{background:rgba(16,40,30,.42)!important}
  [data-theme="light"] #iuc-profile>div.ucv21-single-page,[data-theme="light"] .ucv21-single-page{background:radial-gradient(340px 190px at 72% -8%,rgba(18,133,90,.05),transparent 68%),linear-gradient(155deg,#ffffff,#f6faf8)!important;border-color:rgba(18,133,90,.2)!important;box-shadow:0 42px 120px rgba(16,60,42,.22),0 0 44px rgba(18,133,90,.06)!important}
  [data-theme="light"] .ucv21-single-page .ih{background:linear-gradient(180deg,#ffffff,#f6faf8)!important;border-bottom-color:rgba(18,133,90,.15)!important}
  [data-theme="light"] .ucv21-single-page .ih b{color:#083f2c!important}[data-theme="light"] .ucv21-single-page .ih p{color:#4c6357!important}
  [data-theme="light"] .ucv21-single-page .ih .ix{background:#f3f8f5!important;border-color:rgba(18,133,90,.15)!important;color:#4c6357!important}
  [data-theme="light"] .ucv21-section-head{color:#083f2c!important}[data-theme="light"] .ucv21-section-head:before{background:#149c2b!important;box-shadow:0 0 14px rgba(20,156,43,.4)!important}[data-theme="light"] .ucv21-section-head small{color:#5c7268!important}
  [data-theme="light"] .ucv21-single-page .sec{background:linear-gradient(155deg,#ffffff,#f3f8f5)!important;border-color:rgba(18,133,90,.14)!important;box-shadow:inset 0 1px rgba(255,255,255,.6)!important}
  [data-theme="light"] .ucv21-single-page .f label,[data-theme="light"] .ucv21-single-page label{color:#4c6357!important}
  [data-theme="light"] .ucv21-single-page .in,[data-theme="light"] .ucv21-single-page .sel,[data-theme="light"] .ucv21-single-page input,[data-theme="light"] .ucv21-single-page select{background:#ffffff!important;color:#0b3324!important;border-color:rgba(18,133,90,.2)!important}
  [data-theme="light"] .ucv21-single-page .in:focus,[data-theme="light"] .ucv21-single-page .sel:focus,[data-theme="light"] .ucv21-single-page input:focus,[data-theme="light"] .ucv21-single-page select:focus{border-color:rgba(18,133,90,.55)!important;box-shadow:0 0 0 3px rgba(18,133,90,.12)!important}
  [data-theme="light"] .ucv21-single-page .pc{background:#f6faf8!important;border-color:rgba(18,133,90,.14)!important}
  [data-theme="light"] .ucv21-single-page .pc.on{border-color:rgba(18,133,90,.45)!important;background:linear-gradient(145deg,rgba(18,133,90,.1),#ffffff)!important;box-shadow:0 0 0 1px rgba(18,133,90,.08)!important}
  [data-theme="light"] .ucv21-single-page .pc .dest,[data-theme="light"] .ucv21-single-page .pc .note{color:#5c7268!important}
  [data-theme="light"] .ucv21-password-note{color:#4c6357!important}
  [data-theme="light"] .ucv21-history-toggle{color:#0f7a37!important;background:#f3f8f5!important;border-color:rgba(18,133,90,.16)!important}
  [data-theme="light"] .ucv21-profile-footer{background:linear-gradient(180deg,rgba(255,255,255,.5),#ffffff 36%)!important;border-top-color:rgba(18,133,90,.14)!important}
  [data-theme="light"] .ucv21-profile-msg{color:#4c6357!important}[data-theme="light"] .ucv21-profile-msg.ok{color:#128a3e!important}[data-theme="light"] .ucv21-profile-msg.er{color:#b0304a!important}
  [data-theme="light"] .ucv2-add-dialog{background:linear-gradient(155deg,#ffffff,#f6faf8)!important;border-color:rgba(18,133,90,.18)!important;box-shadow:0 42px 120px rgba(16,60,42,.2),0 0 40px rgba(18,133,90,.05)!important}
  /* manager-phase11f-reference-ui.js hardcodes these same selectors with
     literal dark colors, unconditionally, and loads before this file — its
     rules would otherwise win in Day mode too since nothing else overrides
     them. Same compound-selector approach: higher specificity wins
     regardless of load order, phase11f's Night declarations untouched. */
  [data-theme="light"] .ucv2-chip.product.field{color:#9a5b12!important;border-color:rgba(154,91,18,.24)!important}
  [data-theme="light"] .ucv2-chip.product.lands{color:#128a3e!important;border-color:rgba(18,138,62,.24)!important}
  [data-theme="light"] .ucv2-chip.product.mobility{color:#1f5fd6!important;border-color:rgba(31,95,214,.24)!important}
  [data-theme="light"] .ucv2-chip.ok{color:#128a3e!important;background:rgba(18,138,62,.08)!important;border-color:rgba(18,138,62,.22)!important}
  [data-theme="light"] .ucv2-chip.warn{color:#9a5b12!important;background:rgba(154,91,18,.08)!important;border-color:rgba(154,91,18,.24)!important}
  [data-theme="light"] .ucv2-chip.danger{color:#b0304a!important;background:rgba(176,48,74,.08)!important;border-color:rgba(176,48,74,.22)!important}
  [data-theme="light"] .ucv2-role{color:#4c6357!important}
  [data-theme="light"] .ucv2-muted{color:#5c7268!important}
  [data-theme="light"] .ucv2-legacy-note{color:#9a5b12!important}
  [data-theme="light"] .ucv2-dialog{background:linear-gradient(155deg,#ffffff,#f6faf8)!important;color:#083f2c!important;border-color:rgba(18,133,90,.2)!important;box-shadow:0 34px 110px rgba(16,60,42,.18),inset 0 1px rgba(255,255,255,.6)!important}
  [data-theme="light"] .ucv2-current-value{border-color:rgba(18,133,90,.14)!important;background:#f3f8f5!important}
  [data-theme="light"] .ucv2-password-toggle{color:#0f7a37!important}
  /* manager-phase11c-user-center-core.js injects its own dark-only style
     block (#iuc-c-style) for the raw dialog chrome (.iuc backdrop/panel,
     hierarchy cards, product cards, sections, inputs, buttons, tabs, the
     import preview table) that Add Employee and the password/legacy
     dialogs still use directly — phase11f's single-page rebuild only
     replaces this markup inside the profile/edit dialog, not Add Employee
     or the others. Loads first in the chain; same override approach. */
  [data-theme="light"] .iuc{background:rgba(16,40,30,.42)!important;backdrop-filter:blur(7px)!important}
  [data-theme="light"] .iuc>div{background:linear-gradient(155deg,#ffffff,#f6faf8)!important;color:#083f2c!important}
  [data-theme="light"] .iuc .ih{background:linear-gradient(180deg,#ffffff,#f6faf8)!important;border-bottom-color:rgba(18,133,90,.15)!important}
  [data-theme="light"] .iuc .ih b{color:#083f2c!important}
  [data-theme="light"] .ih p{color:#4c6357!important}
  [data-theme="light"] .ix{background:#f3f8f5!important;color:#4c6357!important}
  [data-theme="light"] .hc,[data-theme="light"] .pc,[data-theme="light"] .sec{border-color:rgba(18,133,90,.16)!important;background:#f6faf8!important}
  [data-theme="light"] .hc span{color:#5c7268!important}
  [data-theme="light"] .st span{color:#083f2c!important}
  [data-theme="light"] .st small{color:#5c7268!important}
  [data-theme="light"] .f label{color:#4c6357!important}
  [data-theme="light"] .in,[data-theme="light"] .sel{background:#ffffff!important;color:#0b3324!important;border-color:rgba(18,133,90,.2)!important}
  [data-theme="light"] .pc.on{border-color:rgba(18,133,90,.42)!important}
  [data-theme="light"] .pt span{color:#5c7268!important}
  [data-theme="light"] .dest{border-color:rgba(18,133,90,.28)!important;color:#0f7a37!important;background:#f0f8f3!important}
  [data-theme="light"] .note{border-color:rgba(154,91,18,.24)!important;color:#8a5610!important;background:rgba(154,91,18,.08)!important}
  [data-theme="light"] .btn{border-color:rgba(18,133,90,.22)!important;background:#ffffff!important;color:#0b3324!important}
  [data-theme="light"] .btn.pr{background:linear-gradient(#149c2b,#0f7a37)!important;border-color:#0f7a37!important;color:#fff!important}
  [data-theme="light"] .btn.bad{background:#fbe9ec!important;border-color:rgba(176,48,74,.4)!important;color:#8a2038!important}
  [data-theme="light"] .msg{color:#5c7268!important}
  [data-theme="light"] .msg.ok{color:#128a3e!important}[data-theme="light"] .msg.er{color:#b0304a!important}[data-theme="light"] .msg.wa{color:#8a5610!important}
  [data-theme="light"] .tab{border-color:rgba(18,133,90,.18)!important;background:#f6faf8!important;color:#4c6357!important}
  [data-theme="light"] .tab.on{border-color:rgba(18,133,90,.4)!important;color:#0b3324!important;background:#eaf5ee!important}
  [data-theme="light"] .tw{border-color:rgba(18,133,90,.18)!important}
  [data-theme="light"] .tb th,[data-theme="light"] .tb td{border-bottom-color:rgba(18,133,90,.12)!important}
  [data-theme="light"] .tb th{background:#f3f8f5!important;color:#4c6357!important}
  [data-theme="light"] .drop{border-color:rgba(18,133,90,.4)!important}
  [data-theme="light"] .drop span{color:#5c7268!important}
  [data-theme="light"] .badrow td{color:#8a2038!important}

  /* Phase 12B delivery hardening: preserve the approved composition while
     making the registry readable and operable for municipal daily use. */
  .ucv2-table{font-size:11.5px!important}.ucv2-table thead th{font-size:10.5px!important}.ucv2-person b{font-size:12px!important}.ucv2-person small,.ucv2-muted,.ucv2-role{font-size:10px!important}.ucv2-chip{font-size:9.5px!important;min-height:26px!important}.ucv2-toolbar input,.ucv2-toolbar select,.ucv2-grid-head select{font-size:12px!important}.ucv2-chip-button{font-size:10.5px!important;min-height:34px!important}.ucv21-more{min-width:38px!important;min-height:38px!important}
  .ucv2-app :is(button,input,select,textarea,[tabindex]):focus-visible,.iuc :is(button,input,select,textarea,[tabindex]):focus-visible{outline:3px solid #58a6ff!important;outline-offset:2px!important;box-shadow:0 0 0 5px rgba(88,166,255,.16)!important}
  [data-theme="light"] .ucv2-app :is(button,input,select,textarea,[tabindex]):focus-visible,[data-theme="light"] .iuc :is(button,input,select,textarea,[tabindex]):focus-visible{outline-color:#0f7a37!important;box-shadow:0 0 0 5px rgba(15,122,55,.14)!important}
  .iuc[data-busy="true"]{cursor:progress}.iuc[data-busy="true"] .ix,.iuc[data-busy="true"] .cancel,.iuc[data-busy="true"] .cc,.iuc[data-busy="true"] .cc-email,.iuc[data-busy="true"] .ucv21-cancel{opacity:.48!important;cursor:not-allowed!important}
  .ucv2-action-error{padding:11px 13px;border:1px solid rgba(255,108,134,.34);border-radius:10px;background:rgba(116,24,43,.22);color:#ffb0bd;font-size:12px;line-height:1.6}[data-theme="light"] .ucv2-action-error{border-color:rgba(176,48,74,.28);background:#fbeef1;color:#8a2038}
  .ucv2-email{max-width:230px;overflow-wrap:anywhere;white-space:normal}.ucv2-mobile-card .ucv2-person{min-width:0!important}.ucv2-mobile-card .ucv2-person>div{min-width:0}.ucv2-mobile-card .ucv2-person small{overflow-wrap:anywhere;white-space:normal}
  @media(max-width:1024px){.ucv2-btn,.btn,.ix,.tab,.ucv21-more,.ucv21-history-toggle,.ucv2-chip-button{min-height:44px!important}.ucv2-toolbar input,.ucv2-toolbar select,.ucv2-grid-head select,.iuc .in,.iuc .sel{min-height:44px!important}.ucv2-app:before,.ucv2-app:after{filter:blur(42px)!important}.iuc,.ucv21-profile-footer{backdrop-filter:blur(5px)!important}}
  @media(max-width:820px){.ucv2-toolbar input,.ucv2-toolbar select,.ucv2-grid-head select,.iuc .in,.iuc .sel,.ucv21-single-page input,.ucv21-single-page select{font-size:16px!important}.ucv2-toolbar{margin-bottom:0!important}.ucv2-quick{padding-block:12px!important}.ucv2-kpi small{font-size:11px!important}.ucv2-app:before,.ucv2-app:after{display:none!important}.iuc{padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left))!important;backdrop-filter:none!important}.iuc>div,.iuc.sm>div,.ucv21-single-page{max-height:calc(100dvh - 16px)!important}.ucv21-single-page .ih{backdrop-filter:none!important}.ucv21-profile-footer{backdrop-filter:none!important}}
  @media(max-width:480px){.ucv2-host{right:6px!important;left:6px!important;bottom:6px!important}.ucv2-app{padding:11px!important;gap:12px!important}.ucv2-header h1{font-size:21px!important}.ucv2-header-actions{display:grid!important;grid-template-columns:1fr!important}.ucv2-kpis{gap:8px!important}.ucv2-kpi{min-height:82px!important;padding:11px!important}.ucv2-toolbar{grid-template-columns:1fr!important}.ucv2-search{grid-column:1!important}.ucv2-toolbar .ucv2-btn{grid-column:1!important}.ucv2-grid-head{align-items:flex-start!important;flex-direction:column!important}.ucv2-grid-head label,.ucv2-grid-head select{width:100%!important}.ucv21-profile-footer .ucv21-save,.ucv21-profile-footer .ucv21-cancel{width:100%!important;margin:0!important}.hier,.sum{grid-template-columns:1fr!important}}
  `;
  document.head.appendChild(style);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectApprovedSkin, { once:true });
else injectApprovedSkin();
})();
