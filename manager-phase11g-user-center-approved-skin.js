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
  /* PHASE13D.1 — .ucv2-shell-overlay is no longer applied to anything
     (manager-dashboard-format.js's route guard used to add it to
     root.parentElement when that was the shared manager-view-overlay
     modal backdrop; root's parent is now <main> itself, shared by every
     Manager view, and must never be classed/styled as an overlay). No
     rule needed here any more — see manager-dashboard-format.js's own
     PHASE13D.1 comments for the full story.

     .ucv2-host is no longer position:fixed. User Center now mounts as a
     normal sibling Manager view inside <main> (manager.html's viewIsUsers
     block), exactly like Field Survey/Lands/Mobility — so it has no
     independent viewport, no fixed coordinates, and no scroll of its own:
     the page itself is the one scroll root, identical to every other
     Manager view. This is what actually removes the previous "page
     inside a page" bug (the dashboard is unmounted via view state, not
     hidden behind a backdrop) — the institutional panel look (border,
     radius, shadow, background) is preserved unchanged. */
  .ucv2-host{
    position:static!important;
    width:auto!important;
    height:auto!important;
    z-index:auto!important;
    overflow:visible!important;
    padding:0!important;
    border-radius:18px!important;
    border:1px solid rgba(86,132,196,.12)!important;
    background:#050b15!important;
    box-shadow:0 24px 72px -42px rgba(0,0,0,.95),inset 0 1px rgba(255,255,255,.018)!important;
    pointer-events:auto!important;
  }
  .ucv2-host>.ucv2-app{min-height:100%!important}
  .ucv2-app{
    --r-bg:#050b15;--r-surface:#0a1729;--r-surface2:#0d1d34;
    --r-border:rgba(96,145,211,.14);--r-border2:rgba(96,145,211,.24);
    --r-text:#f7fbff;--r-muted:#7e91ad;--r-blue:#4a84ff;--r-cyan:#34c7ff;
    --r-purple:#8768ff;--r-green:#3ed39a;--r-amber:#f1a33a;--r-rose:#ff6984;
    position:relative!important;isolation:isolate!important;overflow:hidden!important;
    gap:14px!important;padding:22px 24px 26px!important;border:0!important;border-radius:18px!important;color:var(--r-text)!important;
    background:linear-gradient(145deg,#07101e 0%,#081629 48%,#07101d 100%)!important;
    box-shadow:none!important;
  }
  /* Institutional-restraint pass: flat surface, no decorative radial blooms
     (this rule wins over manager-phase11d/11f's own :before/:after blooms on
     the identical selector, since it loads last — this is the single source
     of truth for whether they render at all). */
  .ucv2-app:before,.ucv2-app:after{display:none!important}

  .ucv2-header{min-height:62px!important;padding:0 2px!important;align-items:center!important}
  .ucv2-header>div:first-child{display:flex!important;align-items:center!important;gap:13px!important}
  .ucv2-header>div:first-child:before{
    content:""!important;width:46px!important;height:46px!important;flex:0 0 46px!important;border-radius:14px!important;border:1px solid rgba(90,133,255,.22)!important;
    background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%236ca0ff' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpath d='M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E") center/22px 22px no-repeat,linear-gradient(145deg,rgba(42,86,176,.34),rgba(29,47,89,.18))!important;
    box-shadow:inset 0 1px rgba(255,255,255,.04)!important;
  }
  .ucv2-eyebrow{display:none!important}.ucv2-header h1{font-size:22px!important;line-height:1.3!important;font-weight:700!important;letter-spacing:-.01em!important;margin:0 0 4px!important;color:#fff!important}.ucv2-header p{margin:0!important;font-size:11px!important;line-height:1.7!important;color:#7187a5!important}
  .ucv2-header-actions{gap:9px!important;align-items:center!important}.ucv2-btn{height:38px!important;min-height:38px!important;border-radius:8px!important;padding:0 14px!important;font-size:11px!important;font-weight:650!important;color:#dbe8f8!important;border:1px solid rgba(98,145,211,.18)!important;background:rgba(12,28,50,.78)!important;box-shadow:none!important}
  .ucv2-btn:hover:not(:disabled){border-color:rgba(83,137,255,.42)!important;background:rgba(17,36,63,.88)!important}.ucv2-btn.primary{color:#04150e!important;background:#3ed39a!important;border-color:#3ed39a!important;box-shadow:none!important;font-weight:700!important}.ucv2-btn.primary:hover:not(:disabled){background:#33bd8a!important;border-color:#33bd8a!important}.ucv2-ref-import{order:-1!important;background:rgba(10,24,44,.68)!important}

  /* Institutional restraint: hairline border for separation, no shadow stack,
     no per-card decorative radial glow, no hover lift — state signals via
     border/background tone only (Apple "one color, one job" + Linear
     "geometry over atmosphere"). */
  .ucv2-kpis{grid-template-columns:repeat(6,minmax(0,1fr))!important;gap:10px!important}.ucv2-kpi{min-height:92px!important;padding:13px 14px!important;border-radius:12px!important;gap:12px!important;position:relative!important;overflow:hidden!important;border:1px solid rgba(96,145,211,.14)!important;background:rgba(12,26,47,.6)!important;box-shadow:none!important}
  .ucv2-kpi:hover{border-color:color-mix(in srgb,currentColor 34%,rgba(96,145,211,.14))!important;background:rgba(15,32,56,.68)!important}
  .ucv2-kpi-icon{width:42px!important;height:42px!important;min-width:42px!important;border-radius:13px!important;display:grid!important;place-items:center!important;font-size:0!important;color:currentColor!important;background:color-mix(in srgb,currentColor 12%,rgba(255,255,255,.015))!important;border:1px solid color-mix(in srgb,currentColor 23%,transparent)!important;box-shadow:inset 0 1px rgba(255,255,255,.035)!important}
  .ucv2-kpi-icon:before{content:"";width:20px;height:20px;background:currentColor;opacity:.95;-webkit-mask:center/contain no-repeat;mask:center/contain no-repeat}
  .ucv2-kpi:nth-child(1) .ucv2-kpi-icon:before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E")}
  .ucv2-kpi:nth-child(2) .ucv2-kpi-icon:before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'/%3E%3C/svg%3E")}
  .ucv2-kpi:nth-child(3) .ucv2-kpi-icon:before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 9v4m0 4h.01M10.3 3.4 2.5 17a2 2 0 0 0 1.73 3h15.54a2 2 0 0 0 1.73-3L13.7 3.4a2 2 0 0 0-3.4 0Z'/%3E%3C/svg%3E")}
  .ucv2-kpi:nth-child(4) .ucv2-kpi-icon:before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 19V5m0 0 8-2 8 2v14l-8 2-8-2m8-16v18'/%3E%3C/svg%3E")}
  .ucv2-kpi:nth-child(5) .ucv2-kpi-icon:before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m9 4 6 2 6-2v14l-6 2-6-2-6 2V6l6-2Zm0 0v14m6-12v14'/%3E%3C/svg%3E")}
  .ucv2-kpi:nth-child(6) .ucv2-kpi-icon:before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3 11h18M5 11l1.5-5h11L19 11m-13 0-2 3v4h2m12-7 2 3v4h-2M7 18h10M7 14h.01M17 14h.01'/%3E%3C/svg%3E")}
  .ucv2-kpi b{font-size:27px!important;line-height:1!important;color:#fff!important;font-weight:760!important;font-variant-numeric:tabular-nums!important}.ucv2-kpi small{font-size:10.5px!important;line-height:1.45!important;color:#b8c8dd!important}.ucv2-kpi:nth-child(1){color:#8d6eff!important}.ucv2-kpi:nth-child(2){color:#39caff!important}.ucv2-kpi:nth-child(3){color:#ff6c86!important}.ucv2-kpi:nth-child(4){color:#f0a23b!important}.ucv2-kpi:nth-child(5){color:#42d39a!important}.ucv2-kpi:nth-child(6){color:#5b91ff!important}

  .ucv2-toolbar{display:grid!important;grid-template-columns:minmax(240px,1.6fr) repeat(5,minmax(100px,.72fr)) auto!important;gap:8px!important;padding:12px!important;margin-bottom:-14px!important;border:1px solid rgba(96,145,211,.13)!important;border-radius:12px 12px 0 0!important;background:rgba(9,21,38,.82)!important;box-shadow:none!important}
  .ucv2-toolbar input,.ucv2-toolbar select,.ucv2-grid-head select{height:36px!important;border-radius:9px!important;background:rgba(13,30,54,.78)!important;color:#dce8f7!important;border:1px solid rgba(96,145,211,.14)!important;font-size:9.5px!important}.ucv2-toolbar input{padding-inline:12px!important}.ucv2-toolbar input::placeholder{color:#687c99!important}.ucv2-toolbar input:focus,.ucv2-toolbar select:focus,.ucv2-grid-head select:focus{outline:0!important;border-color:#3ed39a!important;box-shadow:0 0 0 3px rgba(62,211,154,.14)!important}
  .ucv2-quick{padding:10px 12px!important;margin:0!important;background:rgba(8,19,35,.78)!important;border-inline:1px solid rgba(96,145,211,.13)!important}.ucv2-chip-button{height:25px!important;padding:0 9px!important;border-radius:999px!important;font-size:8.5px!important;color:#7186a3!important;background:rgba(13,30,54,.48)!important;border-color:rgba(96,145,211,.10)!important}.ucv2-chip-button.active{color:#04150e!important;background:#3ed39a!important;border-color:#3ed39a!important;box-shadow:none!important;font-weight:700!important}
  .ucv2-grid-head{min-height:38px!important;padding:9px 12px!important;background:rgba(8,19,35,.78)!important;border-inline:1px solid rgba(96,145,211,.13)!important;color:#7387a4!important;font-size:10.5px!important}.ucv2-grid-head label{gap:6px!important}.ucv2-grid-head select{height:30px!important}

  .ucv2-table-wrap{border-radius:0!important;border:1px solid rgba(96,145,211,.13)!important;background:rgba(8,19,35,.76)!important;box-shadow:none!important;max-height:none!important;overflow:visible!important}.ucv2-table{font-size:9.5px!important;border-collapse:separate!important;border-spacing:0!important}.ucv2-table thead th{position:sticky!important;top:0!important;z-index:2!important;padding:9px 9px!important;background:#0d1d33!important;color:#768aa7!important;border-color:rgba(96,145,211,.10)!important;font-size:8.5px!important;font-weight:650!important}.ucv2-table td{padding:9px 9px!important;border-color:rgba(96,145,211,.075)!important;color:#d5e1f1!important}.ucv2-table tbody tr{transition:background-color .14s ease!important}.ucv2-table tbody tr:hover,.ucv2-table tbody tr:focus{background:rgba(52,97,177,.07)!important;outline:none!important}.ucv2-person{min-width:158px!important;gap:9px!important}.ucv2-person b{font-size:10.5px!important;color:#f2f7ff!important;font-weight:700!important}.ucv2-person small{font-size:8px!important;color:#6e829f!important}.ucv2-avatar{width:30px!important;height:30px!important;border-radius:50%!important;background:rgba(38,57,88,.9)!important;border:1px solid rgba(110,153,214,.18)!important;color:#8db8ff!important;box-shadow:none!important}.ucv2-chip{height:22px!important;min-height:22px!important;border-radius:999px!important;padding-inline:8px!important;font-size:7.8px!important}.ucv2-chip.product{min-width:50px!important;background:rgba(12,27,47,.48)!important}.ucv21-service-dot{width:22px!important;height:22px!important;font-size:10px!important;background:rgba(13,28,49,.44)!important}.ucv21-more{width:30px!important;height:28px!important;border-radius:8px!important;background:rgba(14,31,55,.62)!important;border-color:rgba(96,145,211,.12)!important;color:#7186a3!important;letter-spacing:1.5px!important}.ucv21-more:hover{color:#e3efff!important;border-color:rgba(62,211,154,.42)!important;background:rgba(18,39,68,.78)!important}.ucv2-pagination{padding:10px 12px!important;border:1px solid rgba(96,145,211,.13)!important;border-top:0!important;border-radius:0 0 12px 12px!important;background:rgba(8,19,35,.78)!important;color:#7185a1!important;font-size:10.5px!important}

  /* Empty/error state differentiation — no-records vs no-results (with a
     working reset-filters action), and permission-denied (neutral/amber,
     no retry — retrying cannot fix it) vs a genuine transient failure (red,
     retry offered). Classes are set in manager-phase11d-user-center-enhancements.js
     from data the API already returns (record count / error.status/.reason) —
     no new network behavior. */
  .ucv2-state{border:1px dashed rgba(96,145,211,.16)!important;border-radius:12px!important;background:rgba(9,20,37,.5)!important}
  .ucv2-state-no-results .ucv2-btn{margin-top:4px!important}
  .ucv2-state-denied{border-color:rgba(241,163,58,.28)!important;background:rgba(120,86,20,.10)!important}.ucv2-state-denied b{color:#f1a33a!important}
  .ucv2-state-transient{border-color:rgba(255,105,132,.28)!important;background:rgba(120,20,40,.10)!important}.ucv2-state-transient b{color:#ff6984!important}
  .iuc{background:rgba(2,7,16,.64)!important;backdrop-filter:blur(7px)!important}
  #iuc-profile>div.ucv21-single-page,.ucv21-single-page{width:min(760px,calc(100vw - 42px))!important;max-width:760px!important;max-height:min(85vh,calc(100vh - 34px))!important;padding:0!important;overflow:auto!important;border-radius:16px!important;background:linear-gradient(155deg,rgba(11,27,49,.995),rgba(7,18,34,.995))!important;border:1px solid rgba(96,145,211,.20)!important;box-shadow:0 32px 90px rgba(0,0,0,.55)!important}
  .ucv21-single-page .ih{position:sticky!important;top:0!important;z-index:9!important;padding:17px 20px!important;border-radius:20px 20px 0 0!important;background:linear-gradient(180deg,rgba(10,25,46,.995),rgba(9,23,43,.96))!important;border-bottom:1px solid rgba(96,145,211,.12)!important;backdrop-filter:blur(14px)!important}.ucv21-single-page .ih b{font-size:16px!important;font-weight:780!important;color:#fff!important}.ucv21-single-page .ih p{font-size:10.5px!important;color:#7085a2!important;margin-top:3px!important}.ucv21-single-page .ih .ix{width:30px!important;height:30px!important;border-radius:9px!important;background:rgba(13,30,54,.72)!important;border:1px solid rgba(96,145,211,.13)!important;color:#7d91ad!important}
  .ucv21-single-page .hier,.ucv21-single-page .tabs,.ucv21-single-page .ucv2-employee360{display:none!important}.ucv21-single-page .pane{display:block!important;padding:0 18px!important;margin:0!important}.ucv21-single-page .pane[hidden]{display:block!important}.ucv21-single-page .pane[data-id="o"],.ucv21-single-page .pane[data-id="h"]{display:none!important}.ucv21-single-page .pane>.act{display:none!important}.ucv21-single-page .pane[data-id="a"]>.sec>.act{display:flex!important;gap:7px!important;margin-top:9px!important;flex-wrap:wrap!important}.ucv21-single-page .pane[data-id="a"] .pwbtn{display:none!important}
  .ucv21-section-head{display:flex!important;align-items:center!important;gap:8px!important;margin:16px 0 8px!important;color:#f1f6ff!important;font-size:13px!important;font-weight:700!important}.ucv21-section-head:before{content:""!important;width:6px!important;height:6px!important;border-radius:999px!important;background:#3ed39a!important;box-shadow:none!important}.ucv21-section-head small{margin-inline-start:auto!important;color:#697f9c!important;font-size:10.5px!important;font-weight:500!important}
  .ucv21-single-page .sec{padding:14px!important;margin:0 0 12px!important;border-radius:12px!important;background:rgba(11,25,45,.55)!important;border:1px solid rgba(101,151,219,.13)!important;box-shadow:none!important}.ucv21-single-page .grid{gap:10px 12px!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}.ucv21-single-page .f label,.ucv21-single-page label{font-size:10.5px!important;color:#9eafc5!important;margin-bottom:5px!important}.ucv21-single-page .in,.ucv21-single-page .sel,.ucv21-single-page input,.ucv21-single-page select{min-height:38px!important;height:38px!important;border-radius:8px!important;background:rgba(12,28,51,.82)!important;color:#e8f0fb!important;border:1px solid rgba(96,145,211,.15)!important;font-size:12px!important}.ucv21-single-page .in:focus,.ucv21-single-page .sel:focus,.ucv21-single-page input:focus,.ucv21-single-page select:focus{border-color:#3ed39a!important;box-shadow:0 0 0 3px rgba(62,211,154,.16)!important;outline:0!important}
  .ucv21-single-page .rolebox{margin:0!important}.ucv21-single-page .prod{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}.ucv21-single-page .pc{min-width:0!important;padding:10px!important;border-radius:10px!important;background:rgba(9,23,43,.70)!important;border:1px solid rgba(98,148,211,.12)!important;box-shadow:none!important}.ucv21-single-page .pc.on{border-color:rgba(62,211,154,.4)!important;background:rgba(62,211,154,.06)!important;box-shadow:none!important}.ucv21-single-page .pc .dest,.ucv21-single-page .pc .note{font-size:10px!important;color:#7386a1!important}.ucv21-password-inline{padding:0 18px 2px!important}.ucv21-password-inline .sec{margin-bottom:12px!important}.ucv21-password-note{font-size:10.5px!important;line-height:1.7!important;color:#6e829f!important;margin-top:7px!important}.ucv21-history-wrap{padding:0 18px 12px!important}.ucv21-history-toggle{height:32px!important;border-radius:8px!important;font-size:10px!important;color:#8297b3!important;background:rgba(12,28,51,.68)!important;border-color:rgba(96,145,211,.12)!important}
  .ucv21-profile-footer{position:sticky!important;bottom:0!important;z-index:10!important;display:flex!important;align-items:center!important;gap:8px!important;padding:12px 18px 15px!important;background:linear-gradient(180deg,rgba(7,18,34,.70),rgba(7,18,34,.99) 36%)!important;border-top:1px solid rgba(96,145,211,.11)!important;backdrop-filter:blur(12px)!important}.ucv21-profile-footer .ucv21-save{margin-inline-start:auto!important;min-width:142px!important;height:36px!important}.ucv21-profile-footer .ucv21-cancel{min-width:86px!important;height:36px!important}.ucv21-profile-msg{font-size:10.5px!important;color:#7d91ad!important}.ucv21-profile-msg.ok{color:#68d4a5!important}.ucv21-profile-msg.er{color:#ff7d94!important}

  .ucv2-add-dialog{width:min(760px,calc(100vw - 42px))!important;max-width:760px!important;max-height:min(85vh,calc(100vh - 34px))!important;border-radius:16px!important;background:linear-gradient(155deg,rgba(11,27,49,.995),rgba(7,18,34,.995))!important;border:1px solid rgba(96,145,211,.18)!important;box-shadow:0 32px 90px rgba(0,0,0,.55)!important}

  @media(max-width:1450px){.ucv2-kpis{grid-template-columns:repeat(3,minmax(0,1fr))!important}.ucv2-table th:nth-child(8),.ucv2-table td:nth-child(8),.ucv2-table th:nth-child(9),.ucv2-table td:nth-child(9){display:none!important}.ucv2-toolbar{grid-template-columns:minmax(220px,1.5fr) repeat(3,minmax(110px,.8fr))!important}}
  @media(max-width:1100px){.ucv2-app{padding:18px!important}.ucv2-table th:nth-child(4),.ucv2-table td:nth-child(4){display:none!important}}
  @media(max-width:820px){.ucv2-host{border-radius:16px!important}.ucv2-app{padding:14px!important;border-radius:16px!important}.ucv2-header{align-items:flex-start!important;flex-direction:column!important}.ucv2-header-actions{width:100%!important}.ucv2-header-actions .ucv2-btn{flex:1!important}.ucv2-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important}.ucv2-toolbar{grid-template-columns:1fr 1fr!important;margin-bottom:-14px!important}.ucv2-search{grid-column:1/-1!important}.ucv2-table-wrap{display:none!important}.ucv2-mobile-list{display:grid!important}}
  @media(max-width:640px){.ucv2-kpis{grid-template-columns:1fr 1fr!important}.ucv2-kpi{min-height:88px!important}.ucv21-single-page{width:calc(100vw - 18px)!important;max-height:calc(100vh - 18px)!important;border-radius:16px!important}.ucv21-single-page .grid,.ucv21-single-page .prod{grid-template-columns:1fr!important}.ucv21-single-page .pane,.ucv21-password-inline,.ucv21-history-wrap{padding-inline:12px!important}.ucv21-profile-footer{padding-inline:12px!important;flex-wrap:wrap!important}.ucv21-profile-msg{order:3;flex-basis:100%}}
  @media(prefers-reduced-motion:reduce){.ucv2-app,.ucv2-app *,.iuc,.iuc *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
  /* PHASE13D.1: the two fixed-position sidebar/header gap-tuning rules
     formerly here no longer apply now that .ucv2-host is position:static,
     not fixed — removed rather than left as dead code. */

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
    background:linear-gradient(145deg,#f6faf8 0%,#eef1ee 48%,#f6faf8 100%)!important;
  }
  [data-theme="light"] .ucv2-header>div:first-child:before{background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23128a3e' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpath d='M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E") center/22px 22px no-repeat,linear-gradient(145deg,rgba(18,133,90,.14),rgba(18,133,90,.06))!important;border-color:rgba(18,133,90,.22)!important;box-shadow:inset 0 1px rgba(255,255,255,.6)!important}
  [data-theme="light"] .ucv2-header h1{color:#083f2c!important}[data-theme="light"] .ucv2-header p{color:#4c6357!important}
  [data-theme="light"] .ucv2-btn{color:#0b3324!important;border-color:rgba(18,133,90,.24)!important;background:#ffffff!important;box-shadow:none!important}
  [data-theme="light"] .ucv2-btn:hover:not(:disabled){border-color:rgba(18,133,90,.5)!important;background:#f3f8f5!important}
  [data-theme="light"] .ucv2-btn.primary{color:#fff!important;background:#149c2b!important;border-color:#149c2b!important;box-shadow:none!important;font-weight:700!important}
  [data-theme="light"] .ucv2-btn.primary:hover:not(:disabled){background:#0f7a37!important;border-color:#0f7a37!important}
  [data-theme="light"] .ucv2-ref-import{background:#f3f8f5!important}
  [data-theme="light"] .ucv2-kpi{border-color:rgba(18,133,90,.16)!important;background:#ffffff!important;box-shadow:none!important}
  [data-theme="light"] .ucv2-kpi:hover{border-color:color-mix(in srgb,currentColor 40%,rgba(18,133,90,.15))!important;background:#f6faf8!important}
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
  [data-theme="light"] .ucv2-state{border-color:rgba(18,133,90,.18)!important;background:#f6faf8!important}
  [data-theme="light"] .ucv2-state-denied{border-color:rgba(154,91,18,.3)!important;background:#fbf3e7!important}[data-theme="light"] .ucv2-state-denied b{color:#9a5b12!important}
  [data-theme="light"] .ucv2-state-transient{border-color:rgba(176,48,74,.28)!important;background:#fbeef1!important}[data-theme="light"] .ucv2-state-transient b{color:#b0304a!important}
  [data-theme="light"] .iuc{background:rgba(16,40,30,.42)!important}
  [data-theme="light"] #iuc-profile>div.ucv21-single-page,[data-theme="light"] .ucv21-single-page{background:linear-gradient(155deg,#ffffff,#f6faf8)!important;border-color:rgba(18,133,90,.2)!important;box-shadow:0 24px 64px rgba(16,60,42,.16)!important}
  [data-theme="light"] .ucv21-single-page .ih{background:linear-gradient(180deg,#ffffff,#f6faf8)!important;border-bottom-color:rgba(18,133,90,.15)!important}
  [data-theme="light"] .ucv21-single-page .ih b{color:#083f2c!important}[data-theme="light"] .ucv21-single-page .ih p{color:#4c6357!important}
  [data-theme="light"] .ucv21-single-page .ih .ix{background:#f3f8f5!important;border-color:rgba(18,133,90,.15)!important;color:#4c6357!important}
  [data-theme="light"] .ucv21-section-head{color:#083f2c!important}[data-theme="light"] .ucv21-section-head:before{background:#149c2b!important;box-shadow:none!important}[data-theme="light"] .ucv21-section-head small{color:#5c7268!important}
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
  .ucv2-table{font-size:11.5px!important}.ucv2-table thead th{font-size:10.5px!important}.ucv2-person b{font-size:12px!important}.ucv2-person small,.ucv2-muted,.ucv2-role{font-size:10px!important}.ucv2-chip{font-size:10px!important;min-height:26px!important}.ucv2-toolbar input,.ucv2-toolbar select,.ucv2-grid-head select{font-size:12px!important}.ucv2-chip-button{font-size:10.5px!important;min-height:34px!important}.ucv21-more{min-width:38px!important;min-height:38px!important}
  /* Phase12c-user-center-refero-v1 — institutional typography floor: these
     selectors are defined in the pre-Phase12C base theme
     (manager-phase11d-user-center-enhancements.js installTheme) at sizes
     below the approved >=10px minimum. Overridden here (the final visual
     owner) rather than editing that legacy base file, per the "smallest
     safe change, don't rewrite unrelated legacy CSS" constraint. */
  .ucv2-current-value span{font-size:10.5px!important}.ucv2-password-toggle{font-size:10px!important}.ucv2-event-head time,.ucv2-event small{font-size:10px!important}.ucv2-event p{font-size:10px!important}.ucv2-mobile-meta{font-size:10.5px!important}
  .ucv2-app :is(button,input,select,textarea,[tabindex]):focus-visible,.iuc :is(button,input,select,textarea,[tabindex]):focus-visible{outline:3px solid #3ed39a!important;outline-offset:2px!important;box-shadow:0 0 0 5px rgba(62,211,154,.16)!important}
  [data-theme="light"] .ucv2-app :is(button,input,select,textarea,[tabindex]):focus-visible,[data-theme="light"] .iuc :is(button,input,select,textarea,[tabindex]):focus-visible{outline-color:#0f7a37!important;box-shadow:0 0 0 5px rgba(15,122,55,.14)!important}
  .iuc[data-busy="true"]{cursor:progress}.iuc[data-busy="true"] .ix,.iuc[data-busy="true"] .cancel,.iuc[data-busy="true"] .cc,.iuc[data-busy="true"] .cc-email,.iuc[data-busy="true"] .ucv21-cancel{opacity:.48!important;cursor:not-allowed!important}
  .ucv2-action-error{padding:11px 13px;border:1px solid rgba(255,108,134,.34);border-radius:10px;background:rgba(116,24,43,.22);color:#ffb0bd;font-size:12px;line-height:1.6}[data-theme="light"] .ucv2-action-error{border-color:rgba(176,48,74,.28);background:#fbeef1;color:#8a2038}
  .ucv2-email{max-width:230px;overflow-wrap:anywhere;white-space:normal}.ucv2-mobile-card .ucv2-person{min-width:0!important}.ucv2-mobile-card .ucv2-person>div{min-width:0}.ucv2-mobile-card .ucv2-person small{overflow-wrap:anywhere;white-space:normal}
  @media(max-width:1024px){.ucv2-btn,.btn,.ix,.tab,.ucv21-more,.ucv21-history-toggle,.ucv2-chip-button{min-height:44px!important}.ucv2-toolbar input,.ucv2-toolbar select,.ucv2-grid-head select,.iuc .in,.iuc .sel{min-height:44px!important}.ucv2-app:before,.ucv2-app:after{filter:blur(42px)!important}.iuc,.ucv21-profile-footer{backdrop-filter:blur(5px)!important}}
  @media(max-width:820px){.ucv2-toolbar input,.ucv2-toolbar select,.ucv2-grid-head select,.iuc .in,.iuc .sel,.ucv21-single-page input,.ucv21-single-page select{font-size:16px!important}.ucv2-toolbar{margin-bottom:0!important}.ucv2-quick{padding-block:12px!important}.ucv2-kpi small{font-size:11px!important}.ucv2-app:before,.ucv2-app:after{display:none!important}.iuc{padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left))!important;backdrop-filter:none!important}.iuc>div,.iuc.sm>div,.ucv21-single-page{max-height:calc(100dvh - 16px)!important}.ucv21-single-page .ih{backdrop-filter:none!important}.ucv21-profile-footer{backdrop-filter:none!important}}
  @media(max-width:480px){.ucv2-app{padding:11px!important;gap:12px!important}.ucv2-header h1{font-size:21px!important}.ucv2-header-actions{display:grid!important;grid-template-columns:1fr!important}.ucv2-kpis{gap:8px!important}.ucv2-kpi{min-height:82px!important;padding:11px!important}.ucv2-toolbar{grid-template-columns:1fr!important}.ucv2-search{grid-column:1!important}.ucv2-toolbar .ucv2-btn{grid-column:1!important}.ucv2-grid-head{align-items:flex-start!important;flex-direction:column!important}.ucv2-grid-head label,.ucv2-grid-head select{width:100%!important}.ucv21-profile-footer .ucv21-save,.ucv21-profile-footer .ucv21-cancel{width:100%!important;margin:0!important}.hier,.sum{grid-template-columns:1fr!important}}

  /* ============================================================
     PHASE13D.3 STEP 2 — MANAGER UI POLISH.
     Windows/dialogs, Day-mode hierarchy, Night-mode refinement,
     spacing/typography discipline. Additive only: every rule below either
     (a) defines a small, documented, reusable token layer other windows can
     read from later instead of one-off values, or (b) fixes a real,
     live-verified defect (a 20-40px sticky-header overflow that produced a
     horizontal scrollbar inside the compact profile dialog — .ih's flex
     children did not shrink below their content width). Nothing here
     changes dialog widths (already min(760px,...), already within the
     approved 620-840px range), backend contracts, or routing.
     ============================================================ */

  /* --- Design tokens (Night = default, Day = [data-theme="light"] below).
     These alias the EXACT colors this file already uses elsewhere (--r-*,
     the approved DAY palette) rather than inventing a second palette — a
     documented, centralized name for values already in production. */
  .ucv2-app,.iuc{
    --surface-page:var(--r-bg,#050b15);
    --surface-card:var(--r-surface,#0a1729);
    --surface-elevated:var(--r-surface2,#0d1d34);
    --surface-glass:rgba(12,26,47,.58);
    --surface-dialog:linear-gradient(155deg,rgba(11,27,49,.995),rgba(7,18,34,.995));
    --border-subtle:var(--r-border,rgba(96,145,211,.14));
    --border-strong:var(--r-border2,rgba(96,145,211,.28));
    --shadow-card:0 1px 0 rgba(255,255,255,.02) inset;
    --shadow-dialog:0 32px 90px rgba(0,0,0,.55);
    --radius-card:12px;--radius-dialog:16px;--radius-control:8px;
    --space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:20px;--space-6:24px;
    --motion-fast:160ms ease;--motion-normal:220ms ease;
    /* Window System V1 — pixel-close glass pass (approved reference
       screenshots). Deep navy translucent glass: a thin cool green/cyan
       luminous edge (--glow-edge), a very restrained outer ambient glow
       (--glow-outer), and a body surface that is MORE opaque than the
       header/footer glass (--surface-dialog-body) so long-form content
       stays readable while the chrome around it reads as glass.
       FINAL FIDELITY PASS: window frame + body both went more
       translucent (with a light body-only blur added) and gained a
       depth gradient (--surface-frame) so the dialog reads as frosted
       glass at every layer, not a solid card with a glass header. */
    --glow-edge:rgba(110,230,190,.42);
    --glow-outer:rgba(62,211,154,.14);
    --surface-dialog-body:rgba(9,20,37,.78);
    --surface-frame:linear-gradient(165deg,rgba(16,34,58,.66),rgba(7,16,30,.72) 55%,rgba(6,13,25,.78));
    --border-hairline:rgba(96,145,211,.09);
  }
  [data-theme="light"] .ucv2-app,[data-theme="light"] .iuc{
    --surface-page:#eef1ee;--surface-card:#ffffff;--surface-elevated:#f3f8f5;
    --surface-glass:rgba(255,255,255,.66);
    --surface-dialog:linear-gradient(155deg,#ffffff,#f6faf8);
    --border-subtle:rgba(18,133,90,.16);--border-strong:rgba(18,133,90,.32);
    --shadow-card:inset 0 1px rgba(255,255,255,.6);
    --shadow-dialog:0 24px 64px rgba(16,60,42,.16);
    --glow-edge:rgba(52,168,116,.40);
    --glow-outer:rgba(18,133,90,.09);
    --surface-dialog-body:rgba(255,255,255,.80);
    --surface-frame:linear-gradient(165deg,rgba(255,255,255,.72),rgba(246,250,248,.78) 55%,rgba(240,247,243,.82));
    --border-hairline:rgba(18,133,90,.09);
  }

  /* --- Compact window/dialog structure: header/body/footer discipline,
     tighter max-height, and the fix for the live-verified overflow bug
     (flex children of a sticky header need min-width:0 to shrink instead
     of forcing the header — and therefore the whole dialog's scrollWidth —
     wider than its own box). */
  #iuc-profile>div.ucv21-single-page,.ucv21-single-page{max-height:min(78vh,calc(100vh - 34px))!important;overflow-x:hidden!important}
  .ucv21-single-page .ih{width:100%!important;box-sizing:border-box!important;gap:var(--space-3)!important}
  .ucv21-single-page .ih>main{min-width:0!important;flex:1 1 auto!important}
  .ucv21-single-page .ih b,.ucv21-single-page .ih p{overflow-wrap:anywhere!important}
  .ucv21-single-page .ih .ix{flex:0 0 auto!important}
  .ucv2-add-dialog,.iuc>div{overflow-x:hidden!important}

  /* --- Section rhythm: firmer divider between grouped sections, tighter
     internal spacing (16-24px band per spec) so related fields read as one
     group instead of loosely-scattered rows. FINAL FIDELITY PASS: tightened
     further (smaller section padding/margins, lighter section border) so a
     five-section single page reads as a compact window, not a long form. */
  .ucv21-single-page .sec+.sec,.ucv21-single-page .ucv21-section-head+.sec{margin-top:var(--space-1)!important}
  .ucv21-section-head{padding-bottom:6px!important;margin:12px 0 6px!important;border-bottom:1px solid var(--border-hairline)!important}
  .ucv21-single-page .pane{padding:0 var(--space-5)!important}
  .ucv21-single-page .sec{padding:var(--space-3) var(--space-4)!important;margin-bottom:var(--space-2)!important;border-color:var(--border-hairline)!important}
  .ucv21-single-page .grid{gap:var(--space-2) var(--space-3)!important}
  .ucv21-single-page .f label{margin-bottom:3px!important}

  /* --- Motion discipline: every existing transition in this file already
     sits in the 140-220ms band; this just gives it a documented name and
     applies it to the two interactive surfaces (row hover, dialog
     open) that didn't reference a token before. No new animation added. */
  .ucv2-table tbody tr{transition:background-color var(--motion-fast)!important}
  .iuc>div{transition:none!important}

  @media(prefers-reduced-motion:reduce){.ucv2-table tbody tr{transition:none!important}}

  /* ============================================================
     PHASE13D.3 STEP 2B — VISUAL QUALITY PASS (Day Mode + sidebar depth).
     Explicit product feedback: Day Mode still read as flat and the
     Manager Home cards/KPIs needed stronger separation and hierarchy — the
     Step 2 pass only reached the User Center dialog layer, not the Home
     dashboard's own cards.

     manager.html's Home cards have NO class hooks at all — every color is
     an inline var(--name, fallback) read from custom properties the root
     theme wrapper sets. Rather than editing manager.html (out of scope,
     higher risk) or overriding those variables globally (would touch
     Field Survey/Lands/Mobility/sidebar/header too — an unbounded blast
     radius), this redefines the SAME variable names scoped to
     main:has(section[aria-label="المؤشرات التنفيذية"]) — that aria-label
     is unique to the Home KPI row, so :has() matches ONLY the Home
     layout's own main element, and the new values cascade normally (no
     !important needed or used) to every descendant reading var(--tx,...)
     etc., without touching Field Survey/Lands/Mobility/sidebar/header/User
     Center, which don't share this container.

     Values reuse the EXACT already-approved User Center Day palette
     (#083f2c text, #4c6357 secondary, rgba(18,133,90,...) green-tinted
     borders/dividers) instead of inventing new colors — the "shared
     tokens" principle applied to Home, not a second design system. Status
     colors (--ok/--info/--warn/--bad) are deliberately left untouched so
     KPI icon semantics and priority severity color-coding are unaffected.
     Priority-list ITEM backgrounds ({{ p.bg }}/{{ p.bd }}) are computed
     inline per-severity by manager.html's own JS, not read from these
     variables, and are intentionally left alone here — that is
     signal-coding, not part of this restraint pass. */
  [data-theme="light"] main:has(section[aria-label="المؤشرات التنفيذية"]){
    --tx:#083f2c;--tx2:#0b3324;--tx3:#4c6357;
    --l1:#ffffff;--l1Bd:rgba(18,133,90,.14);
    --l2:#ffffff;--l2Bd:rgba(18,133,90,.14);--l2Sh:0 1px 2px rgba(15,23,42,.04),0 10px 28px -16px rgba(15,23,42,.12);
    --card:#ffffff;--cardBd:rgba(18,133,90,.14);--cardSh:0 1px 2px rgba(15,23,42,.04),0 10px 28px -16px rgba(15,23,42,.12);
    --div:rgba(18,133,90,.13);--track:rgba(18,133,90,.13);
    --ctl:#f6faf8;--ctlBd:rgba(18,133,90,.16);--chipBg:#f3f8f5;
  }

  /* --- Sidebar selected-state depth (Day and Night both benefit from a
     soft glow under the active item instead of a flat color block — this
     is purely additive box-shadow on the existing, unchanged aria-current
     element; no navigation/routing logic touched). aria-current="page" is
     the same semantic marker the app already sets, so this never drifts
     out of sync with whichever route is actually active. */
  aside a[aria-current="page"]{box-shadow:0 6px 18px -9px rgba(74,132,255,.4)!important}
  [data-theme="light"] aside a[aria-current="page"]{box-shadow:0 6px 18px -9px rgba(18,133,90,.38)!important}

  /* ============================================================
     WINDOW SYSTEM V1 — SMART HSR reference window.
     Scope: Add Employee ONLY (every selector below is .ucv2-add-dialog
     itself or a descendant of it), so Profile/Password/every other .iuc
     dialog is completely unaffected. This is the first dialog built to
     the reference window contract (compact 780-840px frame, fixed
     header, single scrolling body region, sticky footer, real
     multi-step flow) future SMART HSR windows are meant to follow — it
     reuses the exact Step 2 token layer above (--surface-*/--border-*/
     --shadow-*/--radius-*/--space-*/--motion-*) rather than inventing a
     second palette or spacing scale. */

  /* --- Frame: the shared .iuc>div padding/overflow:auto rule (core.js)
     is overridden here for THIS dialog only — .wiz-body becomes the
     single scroll owner instead of the whole dialog scrolling as one
     blob; header and footer stay fixed. */
  .ucv2-add-dialog{
    width:min(960px,calc(100vw - 32px))!important;max-width:960px!important;max-height:82vh!important;
    padding:0!important;border-radius:24px!important;border:1px solid var(--glow-edge)!important;
    display:flex!important;flex-direction:column!important;overflow:hidden!important;position:relative!important;
    background:var(--surface-frame)!important;
    box-shadow:var(--shadow-dialog),inset 0 1px rgba(255,255,255,.07),0 0 46px -18px var(--glow-outer)!important;
  }
  [data-theme="light"] .ucv2-add-dialog{box-shadow:var(--shadow-dialog),inset 0 1px rgba(255,255,255,.85),0 0 46px -18px var(--glow-outer)!important}
  .ucv2-add-dialog>.ih{
    flex:0 0 auto!important;margin:0!important;padding:var(--space-4) var(--space-5)!important;
    border-bottom:1px solid var(--border-hairline)!important;
    background:var(--surface-glass)!important;backdrop-filter:blur(28px) saturate(160%)!important;
  }
  .ucv2-add-dialog .wiz{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;min-height:0!important}
  .ucv2-add-dialog .wiz-body{
    flex:1 1 auto!important;overflow-y:auto!important;overflow-x:hidden!important;padding:var(--space-5)!important;min-height:0!important;
    background:var(--surface-dialog-body)!important;backdrop-filter:blur(6px)!important;
  }
  .ucv2-add-dialog .wiz-footer{
    flex:0 0 auto!important;display:flex!important;flex-direction:column!important;gap:var(--space-2)!important;
    padding:var(--space-3) var(--space-5)!important;border-top:1px solid var(--border-hairline)!important;
    background:var(--surface-glass)!important;backdrop-filter:blur(28px) saturate(160%)!important;
  }
  .ucv2-add-dialog .wiz-footer-actions{display:flex!important;align-items:center!important;gap:var(--space-2)!important}
  .ucv2-add-dialog .wiz-footer-spacer{flex:1 1 auto!important}
  .ucv2-add-dialog .wiz-footer .msg{min-height:0!important;margin:0!important}
  .ucv2-add-dialog .wiz-footer .msg:empty{display:none!important}

  /* --- Step indicator: compact, non-interactive progress row (steps
     advance only via Next/Previous — no breadcrumb-style click-to-jump,
     per the header's "do not overload with breadcrumbs" constraint).
     Circles connected by a thin line, matching the approved reference's
     stepper — the line is a real element (.wiz-step-line, inserted
     between dots by U.add) rather than a pseudo-element, so RTL flex
     ordering places it correctly with no positioning math. */
  .ucv2-add-dialog .wiz-steps{display:flex!important;align-items:center!important;gap:0!important;padding:var(--space-3) var(--space-5)!important;border-bottom:1px solid var(--border-hairline)!important;overflow-x:auto!important}
  .ucv2-add-dialog .wiz-step-line{flex:1 1 auto!important;min-width:20px!important;height:1px!important;background:var(--border-strong)!important;margin:0 var(--space-2)!important}
  .ucv2-add-dialog .wiz-step-dot{display:flex!important;align-items:center!important;gap:8px!important;font-size:12px!important;color:var(--r-muted)!important;white-space:nowrap!important;opacity:.62!important;flex:0 0 auto!important}
  .ucv2-add-dialog .wiz-step-dot b{display:grid!important;place-items:center!important;width:28px!important;height:28px!important;min-width:28px!important;border-radius:50%!important;font-size:12px!important;font-weight:700!important;border:1px solid var(--border-strong)!important;background:var(--surface-elevated)!important;color:var(--r-muted)!important}
  .ucv2-add-dialog .wiz-step-dot.on{opacity:1!important;color:var(--r-text)!important;font-weight:700!important}
  .ucv2-add-dialog .wiz-step-dot.on b{background:#3ed39a!important;border-color:#3ed39a!important;color:#04150e!important;box-shadow:0 0 0 4px rgba(62,211,154,.16)!important}
  [data-theme="light"] .ucv2-add-dialog .wiz-step-dot.on b{background:#149c2b!important;border-color:#149c2b!important;color:#fff!important;box-shadow:0 0 0 4px rgba(18,133,90,.14)!important}

  /* --- Header icon badge: the reference's leading circular/rounded
     icon (a person-plus glyph, reusing the exact sidebar user-icon SVG
     path already in this file) next to the title. Purely decorative
     (aria-hidden), inserted by decorateAddDialog — no header text or
     the close button moved. */
  .ucv2-add-dialog .ucv2-dialog-icon-badge{
    width:52px!important;height:52px!important;min-width:52px!important;border-radius:16px!important;
    background:linear-gradient(145deg,rgba(62,211,154,.24),rgba(62,211,154,.08))!important;
    border:1px solid rgba(62,211,154,.35)!important;box-shadow:inset 0 1px rgba(255,255,255,.06),0 0 24px -8px rgba(62,211,154,.35)!important;
    display:grid!important;place-items:center!important;margin-inline-start:var(--space-3)!important;
  }
  .ucv2-add-dialog .ucv2-dialog-icon-badge:before{
    content:""!important;width:26px!important;height:26px!important;background:#3ed39a!important;
    -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cline x1='19' y1='8' x2='19' y2='14'/%3E%3Cline x1='16' y1='11' x2='22' y2='11'/%3E%3C/svg%3E") center/contain no-repeat!important;
    mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cline x1='19' y1='8' x2='19' y2='14'/%3E%3Cline x1='16' y1='11' x2='22' y2='11'/%3E%3C/svg%3E") center/contain no-repeat!important;
  }
  [data-theme="light"] .ucv2-add-dialog .ucv2-dialog-icon-badge:before{background:#149c2b!important}

  /* --- Typography: the reference window's own scale (title 18-20px,
     section 14-15px, labels/meta 12-13px), scoped so it never touches
     the Profile dialog's existing .st/.f label sizes. */
  .ucv2-add-dialog .ih b{font-size:19px!important}
  .ucv2-add-dialog .st span{font-size:14px!important;font-weight:700!important}
  .ucv2-add-dialog .st small{font-size:11px!important}
  .ucv2-add-dialog .st.has-icon{justify-content:flex-start!important;align-items:center!important;gap:var(--space-3)!important}
  .ucv2-add-dialog .st-text{display:flex!important;flex-direction:column!important;gap:2px!important}
  .ucv2-add-dialog .ucv2-section-icon{
    width:40px!important;height:40px!important;min-width:40px!important;border-radius:12px!important;
    background:linear-gradient(145deg,rgba(62,211,154,.22),rgba(62,211,154,.06))!important;
    border:1px solid rgba(62,211,154,.32)!important;display:grid!important;place-items:center!important;
  }
  .ucv2-add-dialog .ucv2-section-icon:before{
    content:""!important;width:19px!important;height:19px!important;background:#3ed39a!important;
    -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z'/%3E%3Cpolyline points='14 2 14 8 20 8'/%3E%3C/svg%3E") center/contain no-repeat!important;
    mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z'/%3E%3Cpolyline points='14 2 14 8 20 8'/%3E%3C/svg%3E") center/contain no-repeat!important;
  }
  [data-theme="light"] .ucv2-add-dialog .ucv2-section-icon:before{background:#149c2b!important}
  .ucv2-add-dialog .f label{font-size:12px!important}
  .ucv2-add-dialog .wiz-check{display:flex!important;align-items:center!important;gap:8px!important;font-size:12px!important;font-weight:600!important;color:var(--r-text)!important;cursor:pointer!important}
  .ucv2-add-dialog .wiz-check input{width:16px!important;height:16px!important}
  .ucv2-add-dialog .wiz-note{font-size:11.5px!important;color:var(--r-muted)!important;margin-top:var(--space-2)!important;padding:0 2px!important}

  /* --- Controls: the reference window's control height (44-48px, up
     from the shared 38px) and radius (11px), plus a darker inner glass
     surface and a clearer focus ring than the shared .in/.sel rule. */
  .ucv2-add-dialog .in,.ucv2-add-dialog .sel{
    height:46px!important;border-radius:11px!important;
    background:var(--surface-elevated)!important;border-color:var(--border-subtle)!important;
  }
  .ucv2-add-dialog .in:focus,.ucv2-add-dialog .sel:focus{border-color:#3ed39a!important;box-shadow:0 0 0 4px rgba(62,211,154,.14)!important;outline:0!important}
  [data-theme="light"] .ucv2-add-dialog .in:focus,[data-theme="light"] .ucv2-add-dialog .sel:focus{border-color:#149c2b!important;box-shadow:0 0 0 4px rgba(18,133,90,.12)!important}
  .ucv2-add-dialog .btn{border-radius:11px!important;height:44px!important;transition:background-color var(--motion-fast),border-color var(--motion-fast)!important}
  .ucv2-add-dialog .wiz-footer .btn.pr{min-width:150px!important}

  /* --- Field icons: a small muted line icon aligned inside each field,
     matching the reference (person/mail/id/phone). CSS-only via :has(),
     so U.input()'s shared markup/contract is completely untouched — no
     other dialog using the same field ids exists, since these are the
     add-name/add-ref/add-email/add-phone/add-admin/add-dept/add-title
     ids unique to Add Employee. */
  .ucv2-add-dialog .f{position:relative!important}
  .ucv2-add-dialog .f:has(> #add-name),.ucv2-add-dialog .f:has(> #add-email),.ucv2-add-dialog .f:has(> #add-ref),.ucv2-add-dialog .f:has(> #add-phone),.ucv2-add-dialog .f:has(> #add-admin),.ucv2-add-dialog .f:has(> #add-dept),.ucv2-add-dialog .f:has(> #add-title){
    --field-icon:none;
  }
  .ucv2-add-dialog .f:has(> #add-name)::after,.ucv2-add-dialog .f:has(> #add-email)::after,.ucv2-add-dialog .f:has(> #add-ref)::after,.ucv2-add-dialog .f:has(> #add-phone)::after,.ucv2-add-dialog .f:has(> #add-admin)::after,.ucv2-add-dialog .f:has(> #add-dept)::after,.ucv2-add-dialog .f:has(> #add-title)::after{
    content:"";position:absolute!important;inset-inline-end:14px!important;bottom:13px!important;width:20px!important;height:20px!important;
    background:var(--r-muted)!important;opacity:.9!important;pointer-events:none!important;
    -webkit-mask:var(--field-icon) center/contain no-repeat!important;mask:var(--field-icon) center/contain no-repeat!important;
  }
  .ucv2-add-dialog .f:has(> #add-name) .in,.ucv2-add-dialog .f:has(> #add-email) .in,.ucv2-add-dialog .f:has(> #add-ref) .in,.ucv2-add-dialog .f:has(> #add-phone) .in,.ucv2-add-dialog .f:has(> #add-admin) .in,.ucv2-add-dialog .f:has(> #add-dept) .in,.ucv2-add-dialog .f:has(> #add-title) .in{padding-inline-end:42px!important}
  .ucv2-add-dialog .f:has(> #add-name){--field-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='12' cy='7' r='4'/%3E%3C/svg%3E")}
  .ucv2-add-dialog .f:has(> #add-email){--field-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='4' width='20' height='16' rx='2'/%3E%3Cpath d='m22 7-10 7L2 7'/%3E%3C/svg%3E")}
  .ucv2-add-dialog .f:has(> #add-ref){--field-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='1' y='4' width='22' height='16' rx='2'/%3E%3Cline x1='1' y1='10' x2='23' y2='10'/%3E%3C/svg%3E")}
  .ucv2-add-dialog .f:has(> #add-phone){--field-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'/%3E%3C/svg%3E")}
  .ucv2-add-dialog .f:has(> #add-admin){--field-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'/%3E%3Cpath d='M9 22V12h6v10'/%3E%3C/svg%3E")}
  .ucv2-add-dialog .f:has(> #add-dept){--field-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z'/%3E%3C/svg%3E")}
  .ucv2-add-dialog .f:has(> #add-title){--field-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='7' width='20' height='14' rx='2'/%3E%3Cpath d='M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'/%3E%3C/svg%3E")}

  /* --- Sections: reuse the card tokens directly (instead of the base
     .sec hardcoded values) so Add Employee's surfaces read as the SAME
     elevated-card language as the rest of the approved skin. */
  .ucv2-add-dialog .sec{
    border-radius:var(--radius-card)!important;border:1px solid var(--border-hairline)!important;
    background:var(--surface-card)!important;box-shadow:var(--shadow-card)!important;
    padding:var(--space-3) var(--space-4)!important;margin-bottom:var(--space-3)!important;
  }
  .ucv2-add-dialog .sec:last-child{margin-bottom:0!important}

  /* --- Role selector: compact segmented control, a visual-only proxy
     over the existing #inst-role <select> — role logic/values are
     unchanged (see manager-phase11c-user-center-dialogs.js's U.add). */
  .ucv2-add-dialog .wiz-role-seg{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:6px!important;margin-top:2px!important}
  .ucv2-add-dialog .wiz-role-opt{
    height:38px!important;border-radius:var(--radius-control)!important;border:1px solid var(--border-subtle)!important;
    background:var(--surface-elevated)!important;color:var(--r-muted)!important;font-size:11px!important;font-weight:650!important;
    cursor:pointer!important;transition:background-color var(--motion-fast),border-color var(--motion-fast),color var(--motion-fast)!important;
  }
  .ucv2-add-dialog .wiz-role-opt:hover:not(:disabled){border-color:var(--border-strong)!important}
  .ucv2-add-dialog .wiz-role-opt.on{color:#04150e!important;background:#3ed39a!important;border-color:#3ed39a!important}
  [data-theme="light"] .ucv2-add-dialog .wiz-role-opt.on{color:#fff!important;background:#149c2b!important;border-color:#149c2b!important}
  .ucv2-add-dialog .wiz-role-opt:disabled{opacity:.4!important;cursor:not-allowed!important}
  .ucv2-add-dialog .wiz-role-desc{margin-top:var(--space-2)!important;padding:var(--space-2) var(--space-3)!important;border-radius:var(--radius-control)!important;border:1px dashed var(--border-subtle)!important;font-size:11px!important;line-height:1.6!important;color:var(--r-muted)!important;background:var(--surface-elevated)!important}

  /* --- Service tiles: same .pc markup/behavior (selection state stays
     the existing .pc.on rule) — compact restyle + a small color-coded
     marker per product, restrained rather than an oversized card. */
  .ucv2-add-dialog .prod{gap:var(--space-2)!important}
  .ucv2-add-dialog .pc{border-radius:var(--radius-control)!important;background:transparent!important;border:1px solid var(--border-hairline)!important;padding:var(--space-3)!important;transition:border-color var(--motion-fast),background-color var(--motion-fast),opacity var(--motion-fast)!important}
  .ucv2-add-dialog .pc:not(.on){opacity:.72!important}
  .ucv2-add-dialog .pc.on{opacity:1!important;border-width:1.5px!important;border-color:#3ed39a!important;background:color-mix(in srgb,#3ed39a 12%,transparent)!important;box-shadow:0 0 0 3px rgba(62,211,154,.10)!important}
  [data-theme="light"] .ucv2-add-dialog .pc.on{border-color:#149c2b!important;background:color-mix(in srgb,#149c2b 9%,#ffffff)!important;box-shadow:0 0 0 3px rgba(18,133,90,.08)!important}
  .ucv2-add-dialog .pc .dest,.ucv2-add-dialog .pc .note{border-color:var(--border-hairline)!important}
  .ucv2-add-dialog .pc .pt b:before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;margin-inline-end:6px;vertical-align:middle}
  .ucv2-add-dialog .pc[data-p="field"] .pt b:before{background:#f1a33a}
  .ucv2-add-dialog .pc[data-p="lands"] .pt b:before{background:#3ed39a}
  .ucv2-add-dialog .pc[data-p="mobility"] .pt b:before{background:#4a84ff}
  [data-theme="light"] .ucv2-add-dialog .pc[data-p="field"] .pt b:before{background:#9a5b12}
  [data-theme="light"] .ucv2-add-dialog .pc[data-p="lands"] .pt b:before{background:#128a3e}
  [data-theme="light"] .ucv2-add-dialog .pc[data-p="mobility"] .pt b:before{background:#1f5fd6}

  /* --- Review (step 4): compact key/value rows, not a form redux. FINAL
     FIDELITY PASS: 3 columns (was 2) and tighter row padding so the full
     review fits with less scroll -- "compress review summary... no
     page-like long scroll feeling". */
  .ucv2-add-dialog .wiz-review-body{display:grid!important;gap:var(--space-2) var(--space-3)!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;margin-top:var(--space-2)!important}
  .ucv2-add-dialog .wiz-review-row{display:flex!important;flex-direction:column!important;gap:1px!important;padding:6px var(--space-2)!important;border-radius:var(--radius-control)!important;background:var(--surface-elevated)!important;border:1px solid var(--border-hairline)!important}
  .ucv2-add-dialog .wiz-review-row span{font-size:10.5px!important;color:var(--r-muted)!important}
  .ucv2-add-dialog .wiz-review-row b{font-size:12px!important;color:var(--r-text)!important;font-weight:650!important;overflow-wrap:anywhere!important}

  /* --- Mobile: near-full-height sheet, single column (existing .grid
     1fr rule already applies at <=760px; safe side margins come from the
     shared .iuc padding rule already in this file). FINAL FIDELITY PASS:
     the stepper no longer needs horizontal scroll at 390px -- inactive
     steps collapse to circle+number only (their label text is a bare
     text node with no wrapper element, so font-size:0 on the dot then
     reset on <b> hides just the label, not the number) and the active
     step's label stays fully visible and gets emphasized. Four 28px
     circles + 3 short fixed-width connectors comfortably fit 390-32px
     of content width without scrolling, so the row reads as "built for
     mobile" rather than a squeezed desktop control. */
  @media(max-width:640px){
    .ucv2-add-dialog{max-height:calc(100dvh - 16px)!important;border-radius:16px!important}
    .ucv2-add-dialog .wiz-review-body{grid-template-columns:1fr!important}
    .ucv2-add-dialog .wiz-role-seg{grid-template-columns:repeat(2,1fr)!important}
    .ucv2-add-dialog .wiz-steps,.ucv21-progress{padding:var(--space-2) 16px!important;overflow-x:visible!important;justify-content:center!important}
    .ucv2-add-dialog .wiz-step-line,.ucv21-progress-line{flex:0 1 18px!important;min-width:10px!important;margin:0 6px!important}
    .ucv2-add-dialog .wiz-step-dot:not(.on),.ucv21-progress-dot:not(.on){font-size:0!important;gap:0!important}
    .ucv2-add-dialog .wiz-step-dot:not(.on) b,.ucv21-progress-dot:not(.on) b{font-size:11px!important;width:24px!important;height:24px!important;min-width:24px!important}
    .ucv2-add-dialog .wiz-step-dot.on,.ucv21-progress-dot.on{font-size:12.5px!important;font-weight:700!important}
    .ucv2-add-dialog .wiz-step-dot.on b,.ucv21-progress-dot.on b{width:26px!important;height:26px!important;min-width:26px!important}
  }
  @media(prefers-reduced-motion:reduce){
    .ucv2-add-dialog .btn,.ucv2-add-dialog .wiz-role-opt{transition:none!important}
  }

  /* ============================================================
     WINDOW SYSTEM V1 — EDIT USER (pixel-close pass, second approved
     reference). Scope: .ucv21-single-page only (manager-phase11f-
     reference-ui.js's buildSinglePageProfile output), so the tabbed
     Profile view other code paths might still reach is unaffected, and
     Add Employee above is untouched. Same window contract as Add
     Employee (glass tokens, 960px frame, 24px radius, glow edge) so
     both windows read as the same product family, per the brief. The
     five existing content sections (البيانات الأساسية/بيانات الدخول/
     الدور الإداري/الخدمات والصلاحيات/السجل والتكليفات) are NOT reduced
     to four — buildSinglePageProfile below only ADDS a decorative,
     non-interactive progress row above them (matching the reference's
     stepper look); it does not paginate or hide any existing section. */
  #iuc-profile>div.ucv21-single-page,.ucv21-single-page{
    width:min(960px,calc(100vw - 32px))!important;max-width:960px!important;
    height:min(720px,calc(100dvh - 36px))!important;max-height:min(720px,calc(100dvh - 36px))!important;
    border-radius:24px!important;border:1px solid var(--glow-edge)!important;
    box-shadow:var(--shadow-dialog),inset 0 1px rgba(255,255,255,.07),0 0 46px -18px var(--glow-outer)!important;
    background:var(--surface-dialog-body)!important;backdrop-filter:blur(6px)!important;
    overflow:hidden!important;display:flex!important;flex-direction:column!important;
  }
  [data-theme="light"] #iuc-profile>div.ucv21-single-page,[data-theme="light"] .ucv21-single-page{box-shadow:var(--shadow-dialog),inset 0 1px rgba(255,255,255,.85),0 0 46px -18px var(--glow-outer)!important}
  .ucv21-single-page .ih{
    padding:var(--space-4) var(--space-5)!important;
    background:var(--surface-glass)!important;backdrop-filter:blur(28px) saturate(160%)!important;
    display:flex!important;align-items:flex-start!important;border-bottom-color:var(--border-hairline)!important;
    position:relative!important;top:auto!important;flex:0 0 auto!important;
  }
  .ucv21-single-page .ih b{font-size:19px!important}

  /* --- Header icon badge (person-check glyph), same treatment as Add
     Employee's, inserted as the FIRST header child by buildSinglePageProfile
     so it renders furthest-right in the RTL header row. */
  .ucv21-single-page .ucv2-dialog-icon-badge{
    width:52px!important;height:52px!important;min-width:52px!important;border-radius:16px!important;
    background:linear-gradient(145deg,rgba(62,211,154,.24),rgba(62,211,154,.08))!important;
    border:1px solid rgba(62,211,154,.35)!important;box-shadow:inset 0 1px rgba(255,255,255,.06),0 0 24px -8px rgba(62,211,154,.35)!important;
    display:grid!important;place-items:center!important;margin-inline-start:var(--space-3)!important;order:-1!important;
  }
  .ucv21-single-page .ucv2-dialog-icon-badge:before{
    content:""!important;width:26px!important;height:26px!important;background:#3ed39a!important;
    -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpolyline points='17 11 19 13 23 9'/%3E%3C/svg%3E") center/contain no-repeat!important;
    mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpolyline points='17 11 19 13 23 9'/%3E%3C/svg%3E") center/contain no-repeat!important;
  }
  [data-theme="light"] .ucv21-single-page .ucv2-dialog-icon-badge:before{background:#149c2b!important}

  /* --- Decorative progress row (see buildSinglePageProfile's insertion of
     .ucv21-progress) — same circle+connecting-line language as Add
     Employee's stepper, but non-interactive and never hides content;
     the five real sections below it are unchanged. */
  .ucv21-progress{display:flex!important;align-items:center!important;gap:0!important;padding:var(--space-3) var(--space-5)!important;border-bottom:1px solid var(--border-hairline)!important;overflow-x:auto!important;flex:0 0 auto!important}
  .ucv21-progress-line{flex:1 1 auto!important;min-width:20px!important;height:1px!important;background:var(--border-strong)!important;margin:0 var(--space-2)!important}
  .ucv21-progress-dot{display:flex!important;align-items:center!important;gap:8px!important;font-size:12px!important;color:var(--r-muted)!important;white-space:nowrap!important;opacity:.62!important;flex:0 0 auto!important;border:0!important;background:transparent!important;padding:0!important;font:inherit!important;cursor:pointer!important}
  .ucv21-progress-dot:hover{opacity:.88!important}
  .ucv21-progress-dot:focus-visible{outline:2px solid rgba(62,211,154,.55)!important;outline-offset:5px!important;border-radius:10px!important}
  .ucv21-step-hidden{display:none!important}
  .ucv21-progress-dot b{display:grid!important;place-items:center!important;width:28px!important;height:28px!important;min-width:28px!important;border-radius:50%!important;font-size:12px!important;font-weight:700!important;border:1px solid var(--border-strong)!important;background:var(--surface-elevated)!important;color:var(--r-muted)!important}
  .ucv21-progress-dot.on{opacity:1!important;color:var(--r-text)!important;font-weight:700!important}
  .ucv21-progress-dot.on b{background:#3ed39a!important;border-color:#3ed39a!important;color:#04150e!important;box-shadow:0 0 0 4px rgba(62,211,154,.16)!important}
  [data-theme="light"] .ucv21-progress-dot.on b{background:#149c2b!important;border-color:#149c2b!important;color:#fff!important;box-shadow:0 0 0 4px rgba(18,133,90,.14)!important}

  .ucv21-profile-stage{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;overflow-x:hidden!important;padding:14px var(--space-5) 18px!important;scrollbar-gutter:stable!important}
  .ucv21-step-panel{display:block!important}
  .ucv21-step-panel.ucv21-step-hidden{display:none!important}
  .ucv21-step-panel>.pane,.ucv21-step-panel>.ucv21-password-inline,.ucv21-step-panel>.ucv21-history-wrap{padding:0!important}
  .ucv21-step-panel .ucv21-section-head:first-child{margin-top:0!important}
  .ucv21-role-native{display:none!important}
  .ucv21-role-seg{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important;margin:4px 0 8px!important}
  .ucv21-role-opt{height:42px!important;border-radius:11px!important;border:1px solid var(--border-subtle)!important;background:var(--surface-elevated)!important;color:var(--r-muted)!important;font-size:12px!important;font-weight:700!important;cursor:pointer!important}
  .ucv21-role-opt.on{border-color:#3ed39a!important;background:rgba(62,211,154,.10)!important;color:var(--r-text)!important;box-shadow:0 0 0 3px rgba(62,211,154,.10)!important}
  .ucv21-role-helper{font-size:10.5px!important;line-height:1.65!important;color:var(--r-muted)!important;margin-bottom:10px!important}
  [data-theme="light"] .ucv21-role-opt.on{border-color:#149c2b!important;background:rgba(18,133,90,.08)!important;box-shadow:0 0 0 3px rgba(18,133,90,.08)!important}
  .ucv21-single-page .pane{background:var(--surface-dialog-body)!important}
  .ucv21-single-page .sec{
    border-radius:var(--radius-card)!important;background:var(--surface-card)!important;
    border:1px solid var(--border-hairline)!important;box-shadow:var(--shadow-card)!important;
  }
  .ucv21-single-page .st span{font-size:14px!important;font-weight:700!important}
  .ucv21-single-page .st small,.ucv21-single-page .f label{font-size:12px!important}
  .ucv21-single-page .in,.ucv21-single-page .sel{
    height:46px!important;min-height:46px!important;border-radius:11px!important;
    background:var(--surface-elevated)!important;border-color:var(--border-subtle)!important;
  }
  .ucv21-single-page .in:focus,.ucv21-single-page .sel:focus{border-color:#3ed39a!important;box-shadow:0 0 0 4px rgba(62,211,154,.14)!important}
  [data-theme="light"] .ucv21-single-page .in:focus,[data-theme="light"] .ucv21-single-page .sel:focus{border-color:#149c2b!important;box-shadow:0 0 0 4px rgba(18,133,90,.12)!important}
  .ucv21-profile-footer{background:var(--surface-glass)!important;backdrop-filter:blur(24px) saturate(140%)!important;position:relative!important;bottom:auto!important;flex:0 0 auto!important}
  .ucv21-profile-footer .btn{border-radius:11px!important;height:44px!important}
  .ucv21-profile-footer .ucv21-save{min-width:150px!important}
  .ucv21-profile-nav{display:flex!important;gap:8px!important;margin-inline-end:auto!important}
  .ucv21-profile-nav .btn{min-width:82px!important}

  /* --- Field icons (same technique/icon set as Add Employee), scoped to
     the edit-* field ids unique to this dialog. */
  .ucv21-single-page .f{position:relative!important}
  .ucv21-single-page .f:has(> #edit-name),.ucv21-single-page .f:has(> #edit-email),.ucv21-single-page .f:has(> #edit-ref),.ucv21-single-page .f:has(> #edit-phone),.ucv21-single-page .f:has(> #edit-admin),.ucv21-single-page .f:has(> #edit-dept),.ucv21-single-page .f:has(> #edit-title){--field-icon:none}
  .ucv21-single-page .f:has(> #edit-name)::after,.ucv21-single-page .f:has(> #edit-email)::after,.ucv21-single-page .f:has(> #edit-ref)::after,.ucv21-single-page .f:has(> #edit-phone)::after,.ucv21-single-page .f:has(> #edit-admin)::after,.ucv21-single-page .f:has(> #edit-dept)::after,.ucv21-single-page .f:has(> #edit-title)::after{
    content:"";position:absolute!important;inset-inline-end:14px!important;bottom:13px!important;width:20px!important;height:20px!important;
    background:var(--r-muted)!important;opacity:.9!important;pointer-events:none!important;
    -webkit-mask:var(--field-icon) center/contain no-repeat!important;mask:var(--field-icon) center/contain no-repeat!important;
  }
  .ucv21-single-page .f:has(> #edit-name) .in,.ucv21-single-page .f:has(> #edit-email) .in,.ucv21-single-page .f:has(> #edit-ref) .in,.ucv21-single-page .f:has(> #edit-phone) .in,.ucv21-single-page .f:has(> #edit-admin) .in,.ucv21-single-page .f:has(> #edit-dept) .in,.ucv21-single-page .f:has(> #edit-title) .in{padding-inline-end:42px!important}
  .ucv21-single-page .f:has(> #edit-name){--field-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='12' cy='7' r='4'/%3E%3C/svg%3E")}
  .ucv21-single-page .f:has(> #edit-email){--field-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='4' width='20' height='16' rx='2'/%3E%3Cpath d='m22 7-10 7L2 7'/%3E%3C/svg%3E")}
  .ucv21-single-page .f:has(> #edit-ref){--field-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='1' y='4' width='22' height='16' rx='2'/%3E%3Cline x1='1' y1='10' x2='23' y2='10'/%3E%3C/svg%3E")}
  .ucv21-single-page .f:has(> #edit-phone){--field-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'/%3E%3C/svg%3E")}
  .ucv21-single-page .f:has(> #edit-admin){--field-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'/%3E%3Cpath d='M9 22V12h6v10'/%3E%3C/svg%3E")}
  .ucv21-single-page .f:has(> #edit-dept){--field-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z'/%3E%3C/svg%3E")}
  .ucv21-single-page .f:has(> #edit-title){--field-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='7' width='20' height='14' rx='2'/%3E%3Cpath d='M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'/%3E%3C/svg%3E")}

  @media(max-width:640px){
    #iuc-profile>div.ucv21-single-page,.ucv21-single-page{border-radius:16px!important;width:calc(100vw - 16px)!important;height:calc(100dvh - 16px)!important;max-height:calc(100dvh - 16px)!important}
    .ucv21-profile-stage{padding:12px!important}
    .ucv21-role-seg{grid-template-columns:1fr!important}
    .ucv21-profile-nav{order:1;width:100%!important;margin:0!important}
    .ucv21-profile-nav .btn{flex:1!important}
    .ucv21-profile-footer .ucv21-cancel,.ucv21-profile-footer .ucv21-save{flex:1!important;min-width:0!important}
    .ucv2-add-dialog .ucv2-dialog-icon-badge,.ucv21-single-page .ucv2-dialog-icon-badge{width:40px!important;height:40px!important;min-width:40px!important;border-radius:12px!important}
    .ucv2-add-dialog .ucv2-dialog-icon-badge:before,.ucv21-single-page .ucv2-dialog-icon-badge:before{width:20px!important;height:20px!important}
  }
  @media(prefers-reduced-motion:reduce){
    .ucv21-single-page .btn{transition:none!important}
  }
  `;
  document.head.appendChild(style);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectApprovedSkin, { once:true });
else injectApprovedSkin();
})();
