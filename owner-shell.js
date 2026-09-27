// Owner Command Center presentation shell only.
// Routing remains owned by owner-router.js. Auth, Firestore and API behavior remain untouched.

const THEME_STORAGE_KEY = 'smartx_theme';
const EXECUTIVE_SKIN_ID = 'smart-hsr-owner-executive-skin';

function installExecutiveSkin() {
  if (document.getElementById(EXECUTIVE_SKIN_ID)) return;

  const style = document.createElement('style');
  style.id = EXECUTIVE_SKIN_ID;
  style.textContent = `
    :root {
      --bg:#f4f7f6;
      --text:#10231d;
      --muted:#64756f;
      --card:rgba(255,255,255,.92);
      --stroke:#dfe9e5;
      --chip:#edf4f1;
      --primary:#063d31;
      --gold:#b99248;
      --emerald:#0b7a5b;
      --cyan:#247f86;
      --amber:#c98727;
      --rose:#b84f5f;
      --owner-accent:#0a6b53;
      --owner-accent-2:#0d8a69;
      --owner-ink:#082820;
      --owner-panel:#ffffff;
      --owner-soft:#f1f6f4;
      --owner-shadow:0 22px 60px rgba(13,47,39,.08);
      --owner-shadow-soft:0 10px 32px rgba(13,47,39,.055);
      --owner-radius:22px;
    }

    :root[data-theme="dark"] {
      --bg:#07120f;
      --text:#effaf6;
      --muted:#91aaa1;
      --card:rgba(11,31,25,.94);
      --stroke:#1d3c32;
      --chip:#102a22;
      --primary:#061f19;
      --gold:#d2b06e;
      --emerald:#42b992;
      --cyan:#5db6bb;
      --amber:#e0a647;
      --rose:#db7886;
      --owner-accent:#27a47d;
      --owner-accent-2:#57c6a1;
      --owner-ink:#e9fff7;
      --owner-panel:#0b1f19;
      --owner-soft:#102a22;
      --owner-shadow:0 24px 70px rgba(0,0,0,.28);
      --owner-shadow-soft:0 12px 34px rgba(0,0,0,.20);
    }

    html { background:var(--bg); }
    body {
      min-height:100vh;
      background:
        radial-gradient(circle at 88% 5%, rgba(16,185,129,.10), transparent 26rem),
        radial-gradient(circle at 12% 95%, rgba(36,127,134,.08), transparent 24rem),
        var(--bg) !important;
      color:var(--text);
      letter-spacing:-.012em;
    }

    body > .grid {
      max-width:1680px !important;
      margin-inline:auto !important;
      gap:18px !important;
      padding:18px !important;
      align-items:start;
    }

    .card {
      border:1px solid var(--stroke) !important;
      border-radius:var(--owner-radius) !important;
      background:var(--card) !important;
      box-shadow:var(--owner-shadow-soft) !important;
      backdrop-filter:blur(18px);
      -webkit-backdrop-filter:blur(18px);
    }

    aside.card {
      position:sticky;
      top:18px;
      min-height:calc(100vh - 36px);
      padding:18px !important;
      border-color:rgba(74,120,104,.22) !important;
      background:
        linear-gradient(180deg, rgba(255,255,255,.96), rgba(246,251,249,.93)) !important;
      box-shadow:var(--owner-shadow) !important;
    }

    [data-theme="dark"] aside.card {
      background:linear-gradient(180deg, rgba(12,35,28,.98), rgba(7,24,19,.96)) !important;
    }

    aside.card > .flex:first-child {
      padding:8px 6px 18px;
      margin-bottom:10px !important;
      border-bottom:1px solid var(--stroke);
    }

    aside.card > .flex:first-child > div:first-child {
      width:46px !important;
      height:46px !important;
      border-radius:15px !important;
      background:linear-gradient(145deg,#053d31,#0d8a69) !important;
      box-shadow:0 10px 24px rgba(10,107,83,.24);
      font-size:0 !important;
      position:relative;
    }

    aside.card > .flex:first-child > div:first-child::after {
      content:'S';
      font-size:20px;
      font-weight:900;
      color:#fff;
      position:absolute;
      inset:0;
      display:grid;
      place-items:center;
    }

    aside.card .text-xs.muted:first-of-type {
      text-transform:uppercase;
      letter-spacing:.12em;
      font-size:10px !important;
      font-weight:800;
    }

    .sidebar-group-label {
      margin-top:10px;
      padding:.75rem .8rem .35rem !important;
      font-size:10px !important;
      color:var(--muted) !important;
      letter-spacing:.13em !important;
    }

    .sidebar-link {
      min-height:46px;
      margin:3px 0;
      border-radius:14px !important;
      padding:.72rem .82rem !important;
      color:var(--text) !important;
      border:1px solid transparent !important;
      border-inline-start:1px solid transparent !important;
      transition:transform .18s ease, background .18s ease, border-color .18s ease, color .18s ease;
      font-weight:700;
    }

    .sidebar-link:hover {
      transform:translateX(-2px);
      background:var(--owner-soft) !important;
      border-color:var(--stroke) !important;
    }

    .sidebar-link-active {
      background:linear-gradient(135deg, rgba(10,107,83,.14), rgba(13,138,105,.08)) !important;
      border-color:rgba(13,138,105,.22) !important;
      color:var(--owner-accent) !important;
      box-shadow:inset -3px 0 0 var(--owner-accent);
      font-weight:900 !important;
    }

    main { gap:18px; }

    main > header.card {
      position:sticky;
      top:18px;
      z-index:50;
      min-height:88px;
      padding:16px 20px !important;
      border-color:rgba(74,120,104,.20) !important;
      box-shadow:0 12px 38px rgba(13,47,39,.075) !important;
    }

    main > header h1 {
      color:var(--text) !important;
      font-size:clamp(1.28rem,2vw,1.85rem) !important;
      letter-spacing:-.035em !important;
      line-height:1.25;
    }

    main > header h1::before {
      content:'EXECUTIVE  /  ';
      display:inline-block;
      color:var(--owner-accent);
      font-size:.62rem;
      font-weight:900;
      letter-spacing:.14em;
      vertical-align:middle;
      margin-inline-end:10px;
    }

    main > header p {
      max-width:760px;
      font-size:12px !important;
    }

    .title { color:var(--text) !important; letter-spacing:-.025em !important; }

    .module-view[data-route="/overview"] > div:first-child {
      position:relative;
      overflow:hidden;
      padding:26px 28px;
      border:1px solid rgba(18,105,82,.22);
      border-radius:28px;
      background:
        linear-gradient(120deg, rgba(4,49,39,.98), rgba(7,88,68,.94) 56%, rgba(14,125,96,.88));
      box-shadow:0 26px 70px rgba(5,57,44,.22);
      color:#f7fffc;
      isolation:isolate;
    }

    .module-view[data-route="/overview"] > div:first-child::after {
      content:'';
      position:absolute;
      width:330px;
      height:330px;
      border-radius:50%;
      inset-inline-end:-80px;
      top:-150px;
      background:radial-gradient(circle,rgba(255,255,255,.18),rgba(255,255,255,0) 68%);
      z-index:-1;
    }

    .module-view[data-route="/overview"] > div:first-child .title,
    .module-view[data-route="/overview"] > div:first-child .muted {
      color:#fff !important;
    }

    .module-view[data-route="/overview"] > div:first-child .muted { opacity:.72; }

    .status-strip { gap:8px !important; }
    .status-chip {
      min-height:38px;
      border-radius:999px !important;
      border:1px solid var(--stroke) !important;
      background:var(--owner-soft) !important;
      color:var(--text) !important;
      font-size:11px !important;
    }

    .module-view[data-route="/overview"] > div:first-child .status-chip {
      color:#effff9 !important;
      border-color:rgba(255,255,255,.18) !important;
      background:rgba(255,255,255,.08) !important;
      backdrop-filter:blur(10px);
    }

    #dashboard { gap:14px !important; }
    #dashboard .card {
      min-height:150px;
      padding:18px !important;
      position:relative;
      overflow:hidden;
      box-shadow:none !important;
      transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease;
    }

    #dashboard .card:hover {
      transform:translateY(-2px);
      border-color:rgba(13,138,105,.32) !important;
      box-shadow:var(--owner-shadow-soft) !important;
    }

    #dashboard .card::before {
      content:'';
      position:absolute;
      inset-inline-start:18px;
      top:18px;
      width:8px;
      height:8px;
      border-radius:999px;
      background:var(--owner-accent);
      box-shadow:0 0 0 5px rgba(13,138,105,.09);
    }

    #dashboard .card .text-3xl {
      font-size:2.25rem !important;
      letter-spacing:-.05em;
      margin-top:10px;
      color:var(--text) !important;
    }

    .btn {
      min-height:42px;
      border-radius:13px !important;
      padding:.58rem .92rem !important;
      font-size:12px;
      font-weight:800 !important;
      transition:transform .16s ease, box-shadow .16s ease, background .16s ease !important;
    }

    .btn:hover { transform:translateY(-1px); }
    .btn-primary {
      color:#fff !important;
      border-color:#0b755a !important;
      background:linear-gradient(135deg,#075440,#0d8a69) !important;
      box-shadow:0 8px 18px rgba(13,138,105,.17);
    }

    .btn-outline {
      background:var(--owner-panel) !important;
      border-color:var(--stroke) !important;
      color:var(--text) !important;
    }

    .pill,.badge {
      border-radius:999px !important;
      border-color:var(--stroke) !important;
      background:var(--owner-soft) !important;
      color:var(--muted) !important;
      font-weight:800;
    }

    .table {
      border-collapse:separate !important;
      border-spacing:0 7px !important;
    }

    .table th {
      border:0 !important;
      color:var(--muted);
      font-size:10px;
      text-transform:uppercase;
      letter-spacing:.08em;
      font-weight:900;
    }

    .table td {
      background:var(--owner-soft);
      border-top:1px solid var(--stroke) !important;
      border-bottom:1px solid var(--stroke) !important;
      font-size:12px;
    }

    .table tr td:first-child { border-radius:0 14px 14px 0; border-inline-start:1px solid var(--stroke) !important; }
    .table tr td:last-child { border-radius:14px 0 0 14px; border-inline-end:1px solid var(--stroke) !important; }

    input, select, textarea {
      border-radius:13px !important;
      border-color:var(--stroke) !important;
      background:var(--owner-soft) !important;
      color:var(--text) !important;
      outline:none;
    }

    input:focus, select:focus, textarea:focus {
      border-color:var(--owner-accent) !important;
      box-shadow:0 0 0 3px rgba(13,138,105,.11) !important;
    }

    .switch { background:var(--owner-soft) !important; }

    @media (max-width: 1023px) {
      aside.card { position:relative; top:auto; min-height:auto; }
      main > header.card { top:10px; }
      body > .grid { padding:12px !important; gap:12px !important; }
    }

    @media (max-width: 700px) {
      body > .grid { padding:8px !important; }
      .card { border-radius:17px !important; }
      main > header.card { position:relative; top:auto; min-height:auto; padding:14px !important; }
      main > header h1::before { display:block; margin:0 0 5px; }
      .module-view[data-route="/overview"] > div:first-child { padding:20px 18px; border-radius:20px; }
      #dashboard .card { min-height:132px; }
      .sidebar-link { min-height:44px; }
    }

    @media (prefers-reduced-motion: reduce) {
      *,*::before,*::after { scroll-behavior:auto !important; transition:none !important; animation:none !important; }
    }
  `;
  document.head.appendChild(style);
}

export function initThemeToggle({ toggleEl, labelEl, modeTextEl } = {}) {
  installExecutiveSkin();

  function applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    const isDark = mode === 'dark';
    if (labelEl) labelEl.textContent = isDark ? 'ليلي' : 'نهاري';
    if (modeTextEl) modeTextEl.textContent = isDark ? 'ليلي' : 'نهاري';
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  }

  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
  applyTheme(savedTheme);

  if (toggleEl) {
    toggleEl.addEventListener('click', () => {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }

  return Object.freeze({ applyTheme });
}
