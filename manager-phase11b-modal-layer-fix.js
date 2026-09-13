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

  function identifyOverlay(el) {
    if (!(el instanceof HTMLElement)) return false;
    let cs;
    try { cs = getComputedStyle(el); } catch (_) { return false; }
    if (cs.position !== 'fixed') return false;
    const t = text(el);
    return /إضافة موظف بلا حساب|إضافة موظف|سجل موظف|حالة الحساب|تفعيل الحساب|سجل التكليف|إنشاء حساب|حفظ الصلاحيات|تعديل كلمة المرور/.test(t);
  }

  function styleOverlay(overlay) {
    if (!overlay || overlay.dataset.ucModalLayerFixed === 'true') return;
    overlay.dataset.ucModalLayerFixed = 'true';
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: MODAL_Z,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '18px',
      background: 'rgba(2,6,14,.80)',
      backdropFilter: 'blur(10px) saturate(115%)',
      WebkitBackdropFilter: 'blur(10px) saturate(115%)',
      overflow: 'auto'
    });

    const panel = overlay.firstElementChild;
    if (panel instanceof HTMLElement) {
      panel.dataset.ucModalPanel = 'true';
      panel.setAttribute('role', panel.getAttribute('role') || 'dialog');
      panel.setAttribute('aria-modal', 'true');
      Object.assign(panel.style, {
        position: 'relative',
        width: 'min(940px, calc(100vw - 36px))',
        maxWidth: '940px',
        maxHeight: 'calc(100vh - 36px)',
        overflow: 'auto',
        margin: 'auto',
        borderRadius: '22px',
        border: '1px solid rgba(79,209,197,.25)',
        background: 'linear-gradient(160deg,rgba(11,21,38,.995),rgba(6,13,25,.995))',
        boxShadow: '0 42px 120px -34px rgba(0,0,0,.98)'
      });
    }

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
    if (center) {
      center.style.zIndex = CENTER_Z;
      const centerOverlay = fixedAncestor(center);
      if (centerOverlay) centerOverlay.style.zIndex = CENTER_Z;
    }

    Array.from(document.querySelectorAll('div')).forEach(el => {
      if (identifyOverlay(el)) styleOverlay(el);
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
    const style = document.createElement('style');
    style.textContent = `
      [data-uc-modal-layer-fixed="true"]{z-index:${MODAL_Z}!important;align-items:center!important;justify-content:center!important;padding:18px!important;}
      [data-uc-modal-panel="true"]{margin:auto!important;}
      @media(max-width:780px){[data-uc-modal-layer-fixed="true"]{padding:10px!important;}[data-uc-modal-panel="true"]{width:min(100%,calc(100vw - 20px))!important;max-height:calc(100vh - 20px)!important;border-radius:17px!important;}}
    `;
    document.head.appendChild(style);
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    apply();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();