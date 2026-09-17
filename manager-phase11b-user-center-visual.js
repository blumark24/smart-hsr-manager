(() => {
  'use strict';

  const STYLE_ID = 'phase11b-user-center-premium-style';
  const ROOT_ATTR = 'data-phase11b-premium-user-center';

  const textOf = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const set = (el, styles) => {
    if (!el) return;
    Object.entries(styles).forEach(([key, value]) => { el.style[key] = value; });
  };

  const findUserCenter = () => Array.from(document.querySelectorAll('section[role="dialog"]')).find(section => {
    const label = section.getAttribute('aria-label') || '';
    const title = textOf(section.querySelector('h2'));
    return /مركز (إدارة )?المستخدمين/.test(label) || /مركز (إدارة )?المستخدمين/.test(title);
  });

  const injectStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${ROOT_ATTR}="true"]{
        --uc-bg:#050914;
        --uc-surface:rgba(13,23,40,.76);
        --uc-surface-2:rgba(17,31,52,.72);
        --uc-header:rgba(5,12,25,.96);
        --uc-border:rgba(94,156,196,.20);
        --uc-border-strong:rgba(74,201,188,.34);
        --uc-text:#eef6ff;
        --uc-muted:#8fa6be;
        --uc-teal:#4fd1c5;
        --uc-green:#21b981;
        --uc-cyan:#57c6e8;
        background:
          radial-gradient(1100px 520px at 88% -15%, rgba(43,159,163,.12), transparent 55%),
          radial-gradient(900px 420px at 10% 0%, rgba(65,111,190,.09), transparent 58%),
          var(--uc-bg)!important;
        color:var(--uc-text)!important;
      }
      [${ROOT_ATTR}="true"] .uc-premium-header{
        position:sticky;top:0;z-index:32;
        margin:-18px -18px 18px;padding:22px 24px 18px;
        display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;
        background:linear-gradient(180deg,rgba(5,10,20,.96),rgba(8,15,28,.91));
        border-bottom:1px solid var(--uc-border);
        backdrop-filter:blur(22px) saturate(125%);
        box-shadow:0 22px 56px -44px rgba(0,0,0,.95);
      }
      [${ROOT_ATTR}="true"] .uc-title-wrap{min-width:0;}
      [${ROOT_ATTR}="true"] .uc-eyebrow{font-size:10px;letter-spacing:.07em;color:var(--uc-teal);font-weight:750;margin-bottom:7px;}
      [${ROOT_ATTR}="true"] .uc-premium-title{font-size:clamp(22px,2vw,29px)!important;line-height:1.25;font-weight:800!important;margin:0!important;color:var(--uc-text)!important;}
      [${ROOT_ATTR}="true"] .uc-premium-subtitle{font-size:12px!important;line-height:1.8!important;color:var(--uc-muted)!important;margin:7px 0 0!important;max-width:760px;}
      [${ROOT_ATTR}="true"] .uc-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap;justify-content:flex-start;}
      [${ROOT_ATTR}="true"] .uc-action{height:42px;padding:0 17px;border-radius:12px;font-size:12px;font-weight:750;cursor:pointer;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;transition:.18s ease;}
      [${ROOT_ATTR}="true"] .uc-action:hover{transform:translateY(-1px);}
      [${ROOT_ATTR}="true"] .uc-action-primary{color:#effff9;background:linear-gradient(180deg,rgba(31,190,132,.94),rgba(20,137,101,.94));border:1px solid rgba(98,232,183,.45);box-shadow:0 12px 28px -18px rgba(33,185,129,.85),inset 0 1px rgba(255,255,255,.16);}
      [${ROOT_ATTR}="true"] .uc-action-secondary{color:#dbeafa;background:linear-gradient(180deg,rgba(23,38,62,.82),rgba(12,23,41,.84));border:1px solid rgba(108,164,208,.25);box-shadow:inset 0 1px rgba(255,255,255,.05);}
      [${ROOT_ATTR}="true"] .uc-kpis{display:grid!important;grid-template-columns:repeat(6,minmax(135px,1fr))!important;gap:10px!important;margin:0 0 14px!important;}
      [${ROOT_ATTR}="true"] .uc-kpi-card{min-width:0!important;padding:14px 15px!important;border-radius:15px!important;background:linear-gradient(145deg,rgba(19,34,57,.76),rgba(10,20,36,.78))!important;border:1px solid var(--uc-border)!important;box-shadow:0 16px 36px -30px rgba(0,0,0,.95),inset 0 1px rgba(255,255,255,.035)!important;backdrop-filter:blur(16px);}
      [${ROOT_ATTR}="true"] .uc-kpi-card[data-service-card="true"]{border-color:rgba(79,209,197,.22)!important;}
      [${ROOT_ATTR}="true"] .uc-kpi-value{font-size:27px!important;line-height:1!important;font-weight:820!important;color:#f3f9ff!important;font-variant-numeric:tabular-nums;margin-bottom:7px;}
      [${ROOT_ATTR}="true"] .uc-kpi-label{font-size:10.5px!important;color:#95abc2!important;line-height:1.45;}
      [${ROOT_ATTR}="true"] .uc-filter-shell{margin:0 0 14px;padding:12px 13px;border-radius:16px;background:linear-gradient(180deg,rgba(12,22,39,.78),rgba(8,17,31,.80));border:1px solid var(--uc-border);box-shadow:0 18px 45px -36px rgba(0,0,0,.95);backdrop-filter:blur(16px);display:flex;flex-direction:column;gap:10px;}
      [${ROOT_ATTR}="true"] .uc-filter-title{font-size:10px;font-weight:750;color:#7592ad;display:flex;align-items:center;gap:7px;}
      [${ROOT_ATTR}="true"] .uc-filter-title:before{content:'';width:6px;height:6px;border-radius:50%;background:var(--uc-teal);box-shadow:0 0 14px rgba(79,209,197,.42);}
      [${ROOT_ATTR}="true"] .uc-filter-row{margin:0!important;padding:0!important;gap:8px!important;}
      [${ROOT_ATTR}="true"] input[type="search"]{height:40px!important;border-radius:11px!important;background:rgba(5,13,26,.86)!important;border:1px solid rgba(103,151,192,.21)!important;font-size:12px!important;color:#eaf4ff!important;}
      [${ROOT_ATTR}="true"] button[data-f="1"]{min-height:32px;}
      [${ROOT_ATTR}="true"] .uc-filter-row button{border-radius:10px!important;font-size:10.5px!important;min-height:32px!important;}
      [${ROOT_ATTR}="true"] .uc-register{border-radius:17px!important;border:1px solid rgba(90,145,188,.20)!important;background:linear-gradient(180deg,rgba(11,21,37,.86),rgba(7,15,28,.88))!important;box-shadow:0 28px 72px -52px rgba(0,0,0,1)!important;overflow:auto!important;}
      [${ROOT_ATTR}="true"] .uc-table-head{position:sticky!important;top:0!important;z-index:8!important;min-height:48px!important;padding:0 15px!important;background:linear-gradient(180deg,rgba(5,13,27,.99),rgba(7,16,31,.98))!important;border-bottom:1px solid rgba(73,138,185,.29)!important;box-shadow:0 10px 24px -20px rgba(0,0,0,.95)!important;}
      [${ROOT_ATTR}="true"] .uc-table-head span{font-size:11px!important;font-weight:760!important;color:#a9bfd5!important;letter-spacing:.01em;}
      [${ROOT_ATTR}="true"] .uc-table-row{min-height:58px!important;padding:11px 15px!important;transition:background .16s ease,border-color .16s ease,box-shadow .16s ease!important;}
      [${ROOT_ATTR}="true"] .uc-table-row:hover{background:rgba(25,49,74,.50)!important;border-bottom-color:rgba(79,209,197,.22)!important;box-shadow:inset -2px 0 0 rgba(79,209,197,.55);}
      [${ROOT_ATTR}="true"] .uc-table-row span{font-size:11.5px!important;}
      [${ROOT_ATTR}="true"] .uc-edit-pill{height:28px;padding:0 10px;border-radius:8px;border:1px solid rgba(79,209,197,.24);background:rgba(20,88,90,.18);color:#8fe4da;font-size:10px;font-weight:720;cursor:pointer;white-space:nowrap;}
      #phase11b-import-dialog [role="dialog"]{background:linear-gradient(160deg,rgba(11,21,38,.98),rgba(6,13,25,.99))!important;border-color:rgba(79,209,197,.24)!important;border-radius:20px!important;box-shadow:0 36px 110px -36px rgba(0,0,0,.98)!important;}
      #phase11b-import-dialog table thead{background:rgba(4,11,23,.97);position:sticky;top:0;}
      #phase11b-import-dialog th{color:#a9bfd5!important;font-size:11px!important;}
      [data-phase11b-employee-dialog="true"]{background:linear-gradient(160deg,rgba(11,21,38,.98),rgba(6,13,25,.99))!important;border:1px solid rgba(79,209,197,.22)!important;border-radius:20px!important;box-shadow:0 34px 100px -35px rgba(0,0,0,.98)!important;}
      @media(max-width:1180px){[${ROOT_ATTR}="true"] .uc-kpis{grid-template-columns:repeat(3,minmax(140px,1fr))!important;}}
      @media(max-width:780px){
        [${ROOT_ATTR}="true"] .uc-premium-header{grid-template-columns:1fr;margin:-12px -12px 14px;padding:18px 14px 14px;}
        [${ROOT_ATTR}="true"] .uc-actions{justify-content:stretch;}
        [${ROOT_ATTR}="true"] .uc-action{flex:1;justify-content:center;}
        [${ROOT_ATTR}="true"] .uc-kpis{grid-template-columns:repeat(2,minmax(130px,1fr))!important;}
        [${ROOT_ATTR}="true"] .uc-register{overflow-x:auto!important;}
        [${ROOT_ATTR}="true"] .uc-table-head,[${ROOT_ATTR}="true"] .uc-table-row{min-width:920px;}
      }
      @media(max-width:440px){[${ROOT_ATTR}="true"] .uc-kpis{grid-template-columns:1fr 1fr!important;}[${ROOT_ATTR}="true"] .uc-action{font-size:11px;padding:0 11px;}}
    `;
    document.head.appendChild(style);
  };

  const buttonWithText = (section, labels) => Array.from(section.querySelectorAll('button')).find(btn => {
    const text = textOf(btn);
    return labels.some(label => text === label || text.includes(label));
  });

  const makeHeader = section => {
    if (section.querySelector('.uc-premium-header')) return;
    const originalHeader = section.querySelector('h2')?.parentElement?.parentElement;
    if (!originalHeader) return;

    const oldTitle = originalHeader.querySelector('h2');
    const oldSubtitle = oldTitle?.parentElement?.querySelector('p');
    const close = buttonWithText(originalHeader, ['×']) || originalHeader.querySelector('button[aria-label="إغلاق"]');

    const header = document.createElement('div');
    header.className = 'uc-premium-header';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'uc-title-wrap';
    titleWrap.innerHTML = '<div class="uc-eyebrow">SMART HSR · إدارة مؤسسية</div><h2 class="uc-premium-title">مركز إدارة المستخدمين</h2><p class="uc-premium-subtitle">إدارة سجلات الموظفين والحسابات والصلاحيات داخل الجهة من سجل موحّد وواضح.</p>';

    const actions = document.createElement('div');
    actions.className = 'uc-actions';
    actions.innerHTML = '<button type="button" class="uc-action uc-action-primary" data-uc-action="add"><span aria-hidden="true">＋</span> إضافة موظف</button><button type="button" class="uc-action uc-action-secondary" data-uc-action="import"><span aria-hidden="true">⇧</span> استيراد ملف</button>';
    actions.querySelector('[data-uc-action="add"]').addEventListener('click', () => {
      const original = buttonWithText(section, ['إضافة موظف']);
      if (original) original.click();
    });
    actions.querySelector('[data-uc-action="import"]').addEventListener('click', () => {
      const original = section.querySelector('[data-phase11b-import]');
      if (original) original.click();
    });

    header.append(titleWrap, actions);
    if (close) {
      set(close, { position:'absolute', left:'16px', top:'16px', zIndex:'2' });
      header.appendChild(close);
    }
    originalHeader.replaceWith(header);
    if (oldTitle) oldTitle.remove();
    if (oldSubtitle) oldSubtitle.remove();
  };

  const parseNumber = text => {
    const m = String(text || '').match(/\d+/);
    return m ? Number(m[0]) : 0;
  };

  const makeServiceCard = (label, value, key) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'uc-kpi-card';
    card.dataset.serviceCard = 'true';
    card.dataset.serviceKey = key;
    card.style.textAlign = 'right';
    card.style.cursor = 'pointer';
    card.innerHTML = `<div class="uc-kpi-value">${value}</div><div class="uc-kpi-label">${label}</div>`;
    return card;
  };

  const styleKpis = section => {
    const candidates = Array.from(section.querySelectorAll('div')).filter(el => {
      const text = textOf(el);
      return text.includes('إجمالي') && text.includes('الحساب') && el.children.length >= 3;
    });
    const row = candidates.sort((a,b) => a.textContent.length - b.textContent.length)[0];
    if (!row || row.dataset.ucKpis === 'true') return;
    row.dataset.ucKpis = 'true';
    row.classList.add('uc-kpis');

    const cards = Array.from(row.children).filter(el => el.nodeType === 1);
    let productText = '';
    cards.forEach(card => {
      const text = textOf(card);
      if (/المستخدمون حسب المنتجات|حسب المنتجات/.test(text)) {
        productText = text;
        card.style.display = 'none';
        return;
      }
      if (/المؤهلون لاستلام مركبة|أهلية المركبة/.test(text)) {
        card.style.display = 'none';
        return;
      }
      card.classList.add('uc-kpi-card');
      const bits = Array.from(card.querySelectorAll('span,div')).filter(n => !n.children.length && textOf(n));
      let valueNode = bits.find(n => /^\d+$/.test(textOf(n)));
      if (!valueNode) valueNode = bits.slice().sort((a,b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize))[0];
      if (valueNode) valueNode.classList.add('uc-kpi-value');
      const labelNode = bits.find(n => n !== valueNode);
      if (labelNode) labelNode.classList.add('uc-kpi-label');
    });

    const counts = { field:0, lands:0, mobility:0 };
    const field = productText.match(/(\d+)\s*(?:حصر|ميداني)/);
    const lands = productText.match(/(\d+)\s*(?:أراضي|ارض)/);
    const mobility = productText.match(/(\d+)\s*(?:حركة|سير)/);
    if (field) counts.field = Number(field[1]);
    if (lands) counts.lands = Number(lands[1]);
    if (mobility) counts.mobility = Number(mobility[1]);

    if (!field && !lands && !mobility) {
      const rows = Array.from(section.querySelectorAll('.uc-table-row,[data-uc-row="true"]'));
      rows.forEach(r => {
        const text = textOf(r);
        if (/الحصر|مراقب|مشرف/.test(text)) counts.field++;
        if (/الأراضي|اراضي/.test(text)) counts.lands++;
        if (/الحركة|رئيس حركة|شؤون إدارية/.test(text)) counts.mobility++;
      });
    }

    const serviceCards = [
      makeServiceCard('الحصر الميداني', counts.field, 'field'),
      makeServiceCard('الأراضي والممتلكات', counts.lands, 'lands'),
      makeServiceCard('الحركة والسير', counts.mobility, 'mobility')
    ];
    serviceCards.forEach(card => {
      card.addEventListener('click', () => {
        const key = card.dataset.serviceKey;
        const labels = key === 'field' ? ['الحصر'] : key === 'lands' ? ['الأراضي'] : ['الحركة'];
        const filter = Array.from(section.querySelectorAll('button')).find(btn => labels.some(label => textOf(btn) === label || textOf(btn).includes(label)) && !btn.classList.contains('uc-kpi-card'));
        if (filter) filter.click();
      });
      row.appendChild(card);
    });
  };

  const buildFilterShell = section => {
    if (section.querySelector('.uc-filter-shell')) return;
    const search = section.querySelector('input[type="search"]');
    if (!search) return;
    const searchWrap = search.parentElement;
    const firstRow = searchWrap?.parentElement;
    if (!firstRow) return;

    const secondRow = Array.from(section.querySelectorAll('div')).filter(el => {
      const text = textOf(el);
      return el !== firstRow && text.includes('المنتج') && (text.includes('أهلية المركبة') || text.includes('القسم'));
    }).sort((a,b) => a.textContent.length - b.textContent.length)[0];

    const shell = document.createElement('div');
    shell.className = 'uc-filter-shell';
    shell.innerHTML = '<div class="uc-filter-title">تصفية السجل</div>';
    firstRow.parentElement.insertBefore(shell, firstRow);
    firstRow.classList.add('uc-filter-row');
    shell.appendChild(firstRow);
    if (secondRow && secondRow !== firstRow && !firstRow.contains(secondRow)) {
      secondRow.classList.add('uc-filter-row');
      shell.appendChild(secondRow);
    }

    Array.from(shell.querySelectorAll('button')).forEach(btn => {
      const text = textOf(btn);
      if (text === 'إضافة موظف' || text === 'استيراد ملف' || text === 'إضافة مستخدم') {
        btn.style.display = 'none';
        btn.setAttribute('aria-hidden', 'true');
      }
    });
  };

  const styleRegister = section => {
    const heads = Array.from(section.querySelectorAll('div')).filter(el => {
      const text = textOf(el);
      return text.includes('الموظف') && text.includes('الإدارة') && text.includes('القسم') && el.children.length >= 5 && el.children.length <= 15;
    }).sort((a,b) => a.textContent.length - b.textContent.length);
    const head = heads[0];
    if (!head) return;
    const register = head.parentElement;
    if (!register) return;
    register.classList.add('uc-register');
    head.classList.add('uc-table-head');

    const body = head.nextElementSibling;
    if (!body) return;
    Array.from(body.children).forEach(row => {
      if (row.nodeType !== 1) return;
      const text = textOf(row);
      if (!text || text.includes('لا توجد')) return;
      row.classList.add('uc-table-row');
      row.dataset.ucRow = 'true';
      if (!row.querySelector('.uc-edit-pill')) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'uc-edit-pill';
        edit.textContent = 'تعديل';
        edit.setAttribute('aria-label', 'فتح سجل الموظف وتعديله');
        edit.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          row.click();
        });
        row.appendChild(edit);
      }
    });
  };

  const styleEmployeeDialogs = () => {
    Array.from(document.querySelectorAll('div[style*="position:fixed"]')).forEach(overlay => {
      const text = textOf(overlay);
      if (overlay.id === 'phase11b-import-dialog') return;
      if (!/(سجل الموظف|إنشاء حساب|حفظ الصلاحيات|سجل التكليف|إضافة موظف)/.test(text)) return;
      const panel = overlay.firstElementChild;
      if (!panel || panel.closest(`[${ROOT_ATTR}="true"]`) === panel) return;
      set(overlay, { alignItems:'center', justifyContent:'center', padding:'16px', background:'rgba(2,6,14,.78)', backdropFilter:'blur(8px)' });
      panel.dataset.phase11bEmployeeDialog = 'true';
      panel.setAttribute('role', panel.getAttribute('role') || 'dialog');
      panel.setAttribute('aria-modal', 'true');
      set(panel, { width:'min(940px,100%)', maxHeight:'calc(100vh - 32px)', overflow:'auto', padding:'22px' });
      Array.from(panel.querySelectorAll('input,select,textarea')).forEach(field => set(field, { minHeight:'40px', borderRadius:'10px', fontSize:'12px' }));
      Array.from(panel.querySelectorAll('button')).forEach(btn => {
        if (textOf(btn) === 'إضافة موظف بلا حساب') btn.textContent = 'إضافة موظف';
        if (textOf(btn) === 'إعادة تعيين كلمة المرور') btn.textContent = 'تعديل كلمة المرور';
      });
    });
  };

  const polishImport = () => {
    const wrap = document.getElementById('phase11b-import-dialog');
    if (!wrap) return;
    const panel = wrap.querySelector('[role="dialog"]');
    if (!panel) return;
    set(panel, { padding:'22px' });
    Array.from(panel.querySelectorAll('button')).forEach(btn => set(btn, { minHeight:'36px', borderRadius:'10px', padding:'0 13px', fontSize:'11px' }));
  };

  const apply = () => {
    injectStyles();
    const section = findUserCenter();
    if (!section) { styleEmployeeDialogs(); polishImport(); return; }
    section.setAttribute(ROOT_ATTR, 'true');
    set(section, { padding:'18px 22px 28px', background:'transparent' });
    makeHeader(section);
    buildFilterShell(section);
    styleRegister(section);
    styleKpis(section);
    styleEmployeeDialogs();
    polishImport();
  };

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; apply(); });
  };

  const start = () => {
    if (document.documentElement.dataset.phase11bPremiumUserCenter === 'true') return;
    document.documentElement.dataset.phase11bPremiumUserCenter = 'true';
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList:true, subtree:true });
    apply();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true }); else start();
})();