(() => {
  'use strict';

  const MODAL_Z = '2147483000';
  const CENTER_Z = '9000';
  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  function getUserCenter() {
    return Array.from(document.querySelectorAll('section[role="dialog"]')).find(el => {
      const label = el.getAttribute('aria-label') || '';
      const title = text(el.querySelector('h2'));
      return /مركز (إدارة )?المستخدمين/.test(label) || /مركز (إدارة )?المستخدمين/.test(title);
    });
  }

  function fixedAncestor(el) {
    let node = el?.parentElement || null;
    while (node && node !== document.body) {
      try {
        if (getComputedStyle(node).position === 'fixed') return node;
      } catch (_) {}
      node = node.parentElement;
    }
    return null;
  }

  function isUserCenterChildOverlay(el, center) {
    if (!(el instanceof HTMLElement) || !center) return false;
    let cs;
    try { cs = getComputedStyle(el); } catch (_) { return false; }
    if (cs.position !== 'fixed') return false;

    const centerOverlay = fixedAncestor(center);
    if (el === centerOverlay || el.contains(center)) return false;

    const inline = el.getAttribute('style') || '';
    const panel = el.firstElementChild;
    const panelStyle = panel?.getAttribute?.('style') || '';
    const t = text(el);

    const knownText = /إضافة موظف بلا حساب|إضافة موظف|سجل موظف|حالة الحساب|تفعيل الحساب|سجل التكليف|إنشاء حساب|حفظ الصلاحيات|تعديل كلمة المرور|تعطيل المستخدم|تفعيل المستخدم|البريد الإلكتروني/.test(t);
    const drawerShape = /z-index\s*:\s*80/i.test(inline) && /width\s*:\s*min\(420px/i.test(panelStyle);
    return knownText || drawerShape;
  }

  function panelMode(overlay) {
    const t = text(overlay);
    if (/إضافة موظف بلا حساب|إضافة موظف/.test(t)) return 'add';
    if (/سجل التكليف|التكليفات|تفعيل الحساب/.test(t)) return 'employee';
    return 'user';
  }

  function compactAddEmployeeForm(panel) {
    const containers = Array.from(panel.children).filter(el => el instanceof HTMLElement);
    const form = containers.find(el => el.querySelectorAll('input').length >= 4);
    if (!form || form.dataset.ucCompactForm === 'true') return;
    form.dataset.ucCompactForm = 'true';
    Object.assign(form.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
      gap: '12px 14px',
      alignItems: 'start'
    });
    Array.from(form.children).forEach(child => {
      if (!(child instanceof HTMLElement)) return;
      const label = text(child);
      if (/^الاسم/.test(label) || /هذا السجل/.test(label)) child.style.gridColumn = '1 / -1';
    });
  }

  function styleOverlay(overlay) {
    if (!overlay) return;
    const mode = panelMode(overlay);
    overlay.dataset.ucModalLayerFixed = 'true';
    overlay.dataset.ucModalMode = mode;
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: MODAL_Z,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'rgba(2,6,14,.76)',
      backdropFilter: 'blur(9px) saturate(112%)',
      WebkitBackdropFilter: 'blur(9px) saturate(112%)',
      overflow: 'auto'
    });

    const panel = overlay.firstElementChild;
    if (!(panel instanceof HTMLElement)) return;

    const width = mode === 'add' ? '640px' : mode === 'employee' ? '820px' : '740px';
    panel.dataset.ucModalPanel = 'true';
    panel.dataset.ucModalPanelMode = mode;
    panel.setAttribute('role', panel.getAttribute('role') || 'dialog');
    panel.setAttribute('aria-modal', 'true');
    Object.assign(panel.style, {
      position: 'relative',
      width: `min(${width}, calc(100vw - 40px))`,
      maxWidth: width,
      maxHeight: 'min(82vh, 760px)',
      overflow: 'auto',
      margin: 'auto',
      padding: mode === 'add' ? '22px' : '24px',
      borderRadius: '18px',
      border: '1px solid rgba(79,209,197,.24)',
      background: 'linear-gradient(160deg,rgba(11,21,38,.995),rgba(6,13,25,.995))',
      boxShadow: '0 34px 90px -30px rgba(0,0,0,.96)'
    });

    if (mode === 'add') compactAddEmployeeForm(panel);

    let parent = overlay.parentElement;
    while (parent && parent !== document.body) {
      try {
        const pcs = getComputedStyle(parent);
        if (pcs.position !== 'static' || pcs.transform !== 'none' || pcs.filter !== 'none' || pcs.isolation === 'isolate') {
          parent.style.zIndex = MODAL_Z;
          parent.style.overflow = 'visible';
        }
      } catch (_) {}
      parent = parent.parentElement;
    }
  }

  function apply() {
    const center = getUserCenter();
    if (!center) return;

    center.style.zIndex = CENTER_Z;
    const centerOverlay = fixedAncestor(center);
    if (centerOverlay) centerOverlay.style.zIndex = CENTER_Z;

    Array.from(document.querySelectorAll('div')).forEach(el => {
      if (isUserCenterChildOverlay(el, center)) styleOverlay(el);
    });
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  }

  function start() {
    if (!document.getElementById('uc-modal-layer-style')) {
      const style = document.createElement('style');
      style.id = 'uc-modal-layer-style';
      style.textContent = `
        [data-uc-modal-layer-fixed="true"]{z-index:${MODAL_Z}!important;align-items:center!important;justify-content:center!important;}
        [data-uc-modal-panel="true"]{margin:auto!important;}
        [data-uc-modal-panel="true"] input,[data-uc-modal-panel="true"] select,[data-uc-modal-panel="true"] textarea{min-height:38px!important;border-radius:10px!important;font-size:12px!important;}
        [data-uc-modal-panel="true"] button{min-height:34px;}
        @media(max-width:780px){
          [data-uc-modal-layer-fixed="true"]{padding:10px!important;}
          [data-uc-modal-panel="true"]{width:min(100%,calc(100vw - 20px))!important;max-width:none!important;max-height:calc(100vh - 20px)!important;border-radius:16px!important;padding:17px!important;}
          [data-uc-compact-form="true"]{grid-template-columns:1fr!important;}
          [data-uc-compact-form="true"]>*{grid-column:1!important;}
        }
      `;
      document.head.appendChild(style);
    }
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    apply();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();