(() => {
  'use strict';

  const ROOT = 'data-uc-v2';
  const STYLE_ID = 'uc-v2-style';
  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const fixed = () => Array.from(document.querySelectorAll('div')).filter(el => {
    try { return getComputedStyle(el).position === 'fixed'; } catch (_) { return false; }
  });

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      [${ROOT}="true"]{--u-bg:#050914;--u-panel:rgba(11,21,37,.82);--u-panel2:rgba(15,29,48,.80);--u-head:#06101f;--u-bd:rgba(91,154,194,.21);--u-bd2:rgba(75,205,190,.34);--u-tx:#eef6ff;--u-muted:#8da5bd;--u-teal:#4fd1c5;--u-green:#20b981;background:radial-gradient(950px 430px at 88% -10%,rgba(35,154,154,.12),transparent 58%),radial-gradient(800px 360px at 12% 0%,rgba(71,113,192,.08),transparent 58%),var(--u-bg)!important;color:var(--u-tx)!important;padding:0 24px 28px!important}
      [${ROOT}="true"] .uc2-header{position:sticky!important;top:0;z-index:40;margin:0 -24px 18px!important;padding:24px!important;display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:22px!important;align-items:center!important;background:linear-gradient(180deg,rgba(5,10,20,.98),rgba(7,14,27,.93))!important;border-bottom:1px solid var(--u-bd)!important;backdrop-filter:blur(22px) saturate(125%);box-shadow:0 22px 60px -48px rgba(0,0,0,.95)!important}
      [${ROOT}="true"] .uc2-title-wrap{min-width:0;flex:1}
      [${ROOT}="true"] .uc2-eyebrow{font-size:10px;font-weight:800;letter-spacing:.06em;color:var(--u-teal);margin-bottom:7px}
      [${ROOT}="true"] .uc2-header h2{font-size:29px!important;line-height:1.2!important;font-weight:850!important;margin:0!important;color:#f4f9ff!important}
      [${ROOT}="true"] .uc2-header p{font-size:12px!important;line-height:1.8!important;margin:7px 0 0!important;color:var(--u-muted)!important}
      [${ROOT}="true"] .uc2-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap;justify-content:flex-start}
      [${ROOT}="true"] .uc2-primary,[${ROOT}="true"] .uc2-secondary{height:42px!important;padding:0 17px!important;border-radius:12px!important;font-size:12px!important;font-weight:800!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;cursor:pointer!important;white-space:nowrap!important;transition:transform .16s ease,filter .16s ease!important}
      [${ROOT}="true"] .uc2-primary{color:#effff9!important;background:linear-gradient(180deg,rgba(33,190,133,.98),rgba(18,139,101,.96))!important;border:1px solid rgba(98,232,183,.45)!important;box-shadow:0 16px 34px -22px rgba(32,185,129,.92),inset 0 1px rgba(255,255,255,.16)!important}
      [${ROOT}="true"] .uc2-secondary{color:#dcecff!important;background:linear-gradient(180deg,rgba(23,39,64,.88),rgba(12,23,42,.9))!important;border:1px solid rgba(111,164,208,.27)!important;box-shadow:inset 0 1px rgba(255,255,255,.05)!important}
      [${ROOT}="true"] .uc2-primary:hover,[${ROOT}="true"] .uc2-secondary:hover{transform:translateY(-1px);filter:brightness(1.07)}
      [${ROOT}="true"] .uc2-kpis{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:10px;margin:0 0 16px}
      [${ROOT}="true"] .uc2-kpi{min-width:0;padding:15px 16px;border-radius:16px;background:linear-gradient(145deg,rgba(18,34,56,.80),rgba(9,19,35,.84));border:1px solid var(--u-bd);box-shadow:0 18px 42px -34px rgba(0,0,0,.95),inset 0 1px rgba(255,255,255,.035);backdrop-filter:blur(16px)}
      [${ROOT}="true"] .uc2-kpi.service{border-color:rgba(79,209,197,.23)}
      [${ROOT}="true"] .uc2-kpi strong{display:block;font-size:28px;line-height:1;font-weight:850;font-variant-numeric:tabular-nums;color:#f4f9ff;margin-bottom:8px}
      [${ROOT}="true"] .uc2-kpi span{display:block;font-size:10.5px;line-height:1.45;color:#95abc1}
      [${ROOT}="true"] .uc2-filter{margin:0 0 16px;padding:14px;border-radius:17px;background:linear-gradient(180deg,rgba(12,22,39,.82),rgba(8,17,31,.84));border:1px solid var(--u-bd);box-shadow:0 18px 44px -38px rgba(0,0,0,.95);backdrop-filter:blur(16px);display:flex;flex-direction:column;gap:11px}
      [${ROOT}="true"] .uc2-filter-label{display:flex;align-items:center;gap:7px;font-size:10.5px;font-weight:800;color:#7793ae}
      [${ROOT}="true"] .uc2-filter-label:before{content:'';width:6px;height:6px;border-radius:50%;background:var(--u-teal);box-shadow:0 0 14px rgba(79,209,197,.45)}
      [${ROOT}="true"] .uc2-filter-row{margin:0!important;padding:0!important;gap:8px!important}
      [${ROOT}="true"] input[type="search"]{height:41px!important;border-radius:11px!important;background:rgba(4,12,24,.88)!important;border:1px solid rgba(102,151,190,.23)!important;color:#eaf4ff!important;font-size:12px!important}
      [${ROOT}="true"] .uc2-filter button{min-height:32px!important;border-radius:9px!important;font-size:10.5px!important}
      [${ROOT}="true"] .uc2-register-title{display:flex;align-items:end;justify-content:space-between;gap:12px;margin:2px 2px 9px}
      [${ROOT}="true"] .uc2-register-title strong{font-size:14px;color:#eaf4ff}
      [${ROOT}="true"] .uc2-register-title span{font-size:10px;color:#718aa3}
      [${ROOT}="true"] .uc2-register{border-radius:18px!important;border:1px solid rgba(91,149,190,.22)!important;background:linear-gradient(180deg,rgba(10,20,36,.90),rgba(6,14,27,.91))!important;box-shadow:0 28px 72px -52px rgba(0,0,0,1)!important;overflow:auto!important}
      [${ROOT}="true"] .uc2-head{position:sticky!important;top:0!important;z-index:8!important;min-height:49px!important;padding:0 15px!important;background:linear-gradient(180deg,rgba(4,11,23,.995),rgba(6,15,29,.985))!important;border-bottom:1px solid rgba(75,146,192,.31)!important;box-shadow:0 12px 26px -22px rgba(0,0,0,.98)!important}
      [${ROOT}="true"] .uc2-head span{font-size:11px!important;font-weight:800!important;color:#a9bfd4!important}
      [${ROOT}="true"] .uc2-row{min-height:59px!important;padding:11px 15px!important;position:relative!important;transition:background .15s ease,box-shadow .15s ease!important}
      [${ROOT}="true"] .uc2-row:hover{background:rgba(23,47,72,.52)!important;box-shadow:inset -2px 0 0 rgba(79,209,197,.58)!important}
      [${ROOT}="true"] .uc2-row span{font-size:11.5px!important}
      [${ROOT}="true"] .uc2-edit{flex:none;min-width:49px;height:28px;padding:0 9px;border-radius:8px;border:1px solid rgba(79,209,197,.26);background:rgba(18,91,91,.20);color:#8fe4da;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;pointer-events:none}
      [${ROOT}="true"] [data-phase11b-import]:not([data-uc2-import-proxy]){display:none!important}
      [data-uc2-dialog="true"]{width:min(940px,100%)!important;max-height:calc(100vh - 32px)!important;overflow:auto!important;padding:23px!important;border-radius:21px!important;border:1px solid rgba(79,209,197,.23)!important;background:linear-gradient(160deg,rgba(11,21,38,.99),rgba(6,13,25,.995))!important;box-shadow:0 36px 110px -38px rgba(0,0,0,.98)!important}
      [data-uc2-dialog="true"] input,[data-uc2-dialog="true"] select,[data-uc2-dialog="true"] textarea{min-height:40px!important;border-radius:10px!important;font-size:12px!important}
      @media(max-width:1180px){[${ROOT}="true"] .uc2-kpis{grid-template-columns:repeat(3,minmax(140px,1fr))}}
      @media(max-width:780px){[${ROOT}="true"]{padding:0 12px 20px!important}[${ROOT}="true"] .uc2-header{grid-template-columns:1fr!important;margin:0 -12px 14px!important;padding:18px 14px!important}[${ROOT}="true"] .uc2-header h2{font-size:24px!important}[${ROOT}="true"] .uc2-actions{width:100%}[${ROOT}="true"] .uc2-primary,[${ROOT}="true"] .uc2-secondary{flex:1}[${ROOT}="true"] .uc2-kpis{grid-template-columns:repeat(2,minmax(125px,1fr))}[${ROOT}="true"] .uc2-register{overflow-x:auto!important}[${ROOT}="true"] .uc2-head,[${ROOT}="true"] .uc2-row{min-width:930px}}
    `;
    document.head.appendChild(s);
  }

  function userCenter() {
    return Array.from(document.querySelectorAll('section[role="dialog"]')).find(el => /مركز (إدارة )?المستخدمين/.test(el.getAttribute('aria-label') || '') || /مركز (إدارة )?المستخدمين/.test(text(el.querySelector('h2'))));
  }

  function leafNumber(card) {
    const leaves = Array.from(card.querySelectorAll('*')).filter(n => !n.children.length && /^\d+$/.test(text(n)));
    return leaves.length ? Number(text(leaves[0])) : 0;
  }

  function parseProductCount(t, patterns) {
    for (const p of patterns) {
      let m = t.match(new RegExp('(\\d+)\\s*' + p));
      if (m) return Number(m[1]);
      m = t.match(new RegExp(p + '\\s*[:·-]?\\s*(\\d+)'));
      if (m) return Number(m[1]);
    }
    return 0;
  }

  function buildHeader(section) {
    const h2 = section.querySelector('h2');
    if (!h2) return;
    const header = h2.parentElement?.parentElement;
    if (!header) return;
    header.classList.add('uc2-header');
    const titleWrap = h2.parentElement;
    titleWrap.classList.add('uc2-title-wrap');
    h2.textContent = 'مركز إدارة المستخدمين';
    const p = titleWrap.querySelector('p');
    if (p) p.textContent = 'إدارة سجلات الموظفين والحسابات والصلاحيات داخل الجهة من سجل موحّد وواضح.';
    if (!titleWrap.querySelector('.uc2-eyebrow')) {
      const eyebrow = document.createElement('div');
      eyebrow.className = 'uc2-eyebrow';
      eyebrow.textContent = 'SMART HSR · إدارة مؤسسية';
      titleWrap.insertBefore(eyebrow, h2);
    }

    let actions = header.querySelector('.uc2-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'uc2-actions';
      header.appendChild(actions);
    }

    if (!actions.querySelector('.uc2-primary')) {
      const nativeAdd = Array.from(section.querySelectorAll('button')).find(btn => {
        const t = text(btn);
        return (t === 'إضافة موظف' || t === 'إضافة موظف بلا حساب') && !btn.dataset.uc2Primary;
      });
      if (nativeAdd) {
        nativeAdd.dataset.uc2Primary = 'true';
        nativeAdd.className = `${nativeAdd.className || ''} uc2-primary`;
        nativeAdd.innerHTML = '<span aria-hidden="true">＋</span><span>إضافة موظف</span>';
        actions.appendChild(nativeAdd);
      }
    }

    if (!actions.querySelector('[data-uc2-import-proxy]')) {
      const proxy = document.createElement('button');
      proxy.type = 'button';
      proxy.className = 'uc2-secondary';
      proxy.dataset.uc2ImportProxy = 'true';
      proxy.dataset.phase11bImport = 'proxy';
      proxy.innerHTML = '<span aria-hidden="true">⇧</span><span>استيراد ملف</span>';
      proxy.addEventListener('click', () => {
        const original = Array.from(section.querySelectorAll('button[data-phase11b-import]')).find(b => !b.dataset.uc2ImportProxy);
        if (original) original.click();
      });
      actions.appendChild(proxy);
    }
  }

  function buildKpis(section) {
    if (section.querySelector('.uc2-kpis')) return;
    const candidates = Array.from(section.querySelectorAll('div')).filter(el => {
      const t = text(el);
      return t.includes('إجمالي الموظفين') && t.includes('الحسابات') && el.children.length >= 3;
    }).sort((a,b) => a.textContent.length - b.textContent.length);
    const source = candidates[0];
    if (!source) return;
    const children = Array.from(source.children);
    let total = 0, active = 0, inactive = 0, productText = '';
    children.forEach(card => {
      const t = text(card);
      if (t.includes('إجمالي الموظفين')) total = leafNumber(card);
      else if (t.includes('الحسابات المفعلة') || t.includes('الحسابات النشطة')) active = leafNumber(card);
      else if (t.includes('غير المفعلة') || t.includes('بدون حساب')) inactive = leafNumber(card);
      else if (t.includes('حسب المنتجات') || t.includes('المستخدمون حسب المنتجات')) productText += ' ' + t;
    });
    const field = parseProductCount(productText, ['حصر','الحصر']);
    const lands = parseProductCount(productText, ['أراضي','الاراضي','الأراضي']);
    const mobility = parseProductCount(productText, ['حركة','الحركة']);
    const data = [
      ['إجمالي الموظفين', total, ''],['الحسابات النشطة', active, ''],['بدون حساب / موقوف', inactive, ''],
      ['الحصر الميداني', field, 'service'],['الأراضي والممتلكات', lands, 'service'],['حركة السير', mobility, 'service']
    ];
    const grid = document.createElement('div');
    grid.className = 'uc2-kpis';
    data.forEach(([label,value,kind]) => {
      const card = document.createElement('div');
      card.className = `uc2-kpi ${kind}`;
      card.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
      grid.appendChild(card);
    });
    source.parentElement.insertBefore(grid, source);
    source.style.display = 'none';
    source.dataset.uc2KpiSource = 'true';
  }

  function buildFilters(section) {
    if (section.querySelector('.uc2-filter')) return;
    const search = section.querySelector('input[type="search"]');
    if (!search) return;
    const row1 = search.parentElement?.parentElement;
    if (!row1) return;
    const row2 = Array.from(section.querySelectorAll('div')).filter(el => {
      const t = text(el);
      return el !== row1 && t.includes('المنتج') && (t.includes('أهلية المركبة') || t.includes('الحصر'));
    }).sort((a,b) => a.textContent.length - b.textContent.length)[0];
    const shell = document.createElement('div');
    shell.className = 'uc2-filter';
    shell.innerHTML = '<div class="uc2-filter-label">تصفية سجل الموظفين</div>';
    row1.parentElement.insertBefore(shell, row1);
    row1.classList.add('uc2-filter-row');
    shell.appendChild(row1);
    if (row2 && !row1.contains(row2)) {
      row2.classList.add('uc2-filter-row');
      shell.appendChild(row2);
    }
    Array.from(shell.querySelectorAll('button')).forEach(btn => {
      if (btn.dataset.uc2Primary || btn.dataset.phase11bImport) btn.style.display = 'none';
    });
  }

  function styleRegister(section) {
    const heads = Array.from(section.querySelectorAll('div')).filter(el => {
      const t = text(el);
      return t.includes('الموظف') && t.includes('الإدارة') && t.includes('القسم') && el.children.length >= 5 && el.children.length <= 15;
    }).sort((a,b) => a.textContent.length - b.textContent.length);
    const head = heads[0];
    if (!head) return;
    const register = head.parentElement;
    if (!register) return;
    register.classList.add('uc2-register');
    head.classList.add('uc2-head');
    if (!register.previousElementSibling?.classList?.contains('uc2-register-title')) {
      const bar = document.createElement('div');
      bar.className = 'uc2-register-title';
      bar.innerHTML = '<strong>سجل الموظفين</strong><span>اضغط على أي موظف لفتح ملفه وتعديله</span>';
      register.parentElement.insertBefore(bar, register);
    }
    const body = head.nextElementSibling;
    if (!body) return;
    Array.from(body.children).forEach(row => {
      if (row.nodeType !== 1 || !text(row) || text(row).includes('لا توجد')) return;
      row.classList.add('uc2-row');
      if (!row.querySelector('.uc2-edit')) {
        const edit = document.createElement('span');
        edit.className = 'uc2-edit';
        edit.textContent = 'تعديل';
        edit.setAttribute('aria-hidden','true');
        row.appendChild(edit);
      }
    });
  }

  function polishDialogs() {
    fixed().forEach(overlay => {
      const t = text(overlay);
      if (!/(إضافة موظف بلا حساب|سجل موظف|سجل التكليف|حفظ الصلاحيات|إنشاء حساب)/.test(t)) return;
      const panel = overlay.firstElementChild;
      if (!panel) return;
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.padding = '16px';
      overlay.style.background = 'rgba(2,6,14,.78)';
      overlay.style.backdropFilter = 'blur(8px)';
      panel.dataset.uc2Dialog = 'true';
      panel.setAttribute('role', panel.getAttribute('role') || 'dialog');
      panel.setAttribute('aria-modal','true');
      Array.from(panel.querySelectorAll('div,span')).filter(n => !n.children.length).forEach(n => {
        if (text(n) === 'إضافة موظف بلا حساب') n.textContent = 'إضافة موظف';
        if (text(n).startsWith('سجل في مركز المستخدمين فقط')) n.textContent = 'الاسم فقط مطلوب الآن، ويمكن استكمال بقية بيانات الموظف لاحقًا.';
      });
    });
  }

  function hideOldImportBars(section) {
    Array.from(section.querySelectorAll('button[data-phase11b-import]')).forEach(btn => {
      if (!btn.dataset.uc2ImportProxy) btn.style.display = 'none';
    });
  }

  function apply() {
    injectStyle();
    const section = userCenter();
    if (!section) { polishDialogs(); return; }
    section.setAttribute(ROOT,'true');
    buildHeader(section);
    buildKpis(section);
    buildFilters(section);
    styleRegister(section);
    hideOldImportBars(section);
    polishDialogs();
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; apply(); });
  };

  function start() {
    const observer = new MutationObserver(schedule);
    observer.observe(document.body,{subtree:true,childList:true});
    apply();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true}); else start();
})();