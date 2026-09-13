(() => {
  'use strict';

  const SERVICE_LABELS = [
    'إدارة الحصر الميداني',
    'إدارة الأراضي والممتلكات',
    'إدارة الحركة والسير'
  ];

  const assignStyles = (el, styles) => {
    if (!el) return;
    Object.entries(styles).forEach(([key, value]) => {
      if (el.style[key] !== value) el.style[key] = value;
    });
  };

  const fixedOverlays = () => Array.from(document.querySelectorAll('div')).filter(el => {
    const inline = el.style && el.style.position === 'fixed';
    if (inline) return true;
    try { return window.getComputedStyle(el).position === 'fixed'; } catch (_) { return false; }
  });

  const centerOverlayPanel = (overlay, width, label) => {
    if (!overlay || overlay.dataset.phase11aCentered === 'true') return;
    const panel = Array.from(overlay.children).find(child => child && child.nodeType === 1);
    if (!panel) return;

    overlay.dataset.phase11aCentered = 'true';
    assignStyles(overlay, {
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      background: 'rgba(3, 6, 13, 0.68)',
      backdropFilter: 'blur(5px)'
    });

    panel.setAttribute('role', panel.getAttribute('role') || 'dialog');
    panel.setAttribute('aria-modal', panel.getAttribute('aria-modal') || 'true');
    panel.setAttribute('aria-label', panel.getAttribute('aria-label') || label);
    assignStyles(panel, {
      width: `min(${width}px, 100%)`,
      maxHeight: 'calc(100vh - 32px)',
      borderRadius: '18px',
      border: '1px solid var(--cardBd, rgba(122,164,224,0.18))',
      boxShadow: 'var(--dwSh, 0 30px 80px -28px rgba(0,0,0,.9))',
      overflow: 'auto'
    });
  };

  const patchMobilityModalCollision = () => {
    const duplicate = document.querySelector('section[role="dialog"][aria-label="لوحة مدير إدارة الحركة والسير"]');
    if (!duplicate) return;
    const overlay = duplicate.parentElement;
    if (!overlay || overlay.dataset.phase11aSuppressed === 'mobility-duplicate-modal') return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.dataset.phase11aSuppressed = 'mobility-duplicate-modal';
  };

  const patchEvidenceDetails = () => {
    document.querySelectorAll('img[alt="صورة قبل المعالجة"], img[alt="صورة بعد المعالجة"]').forEach(img => {
      if (img.dataset.phase11aEvidence === 'true') return;
      img.dataset.phase11aEvidence = 'true';
      assignStyles(img, {
        width: '100%',
        maxHeight: '420px',
        objectFit: 'contain',
        background: 'var(--ctl, rgba(20,32,54,0.35))'
      });
    });

    fixedOverlays().forEach(overlay => {
      const text = (overlay.textContent || '').replace(/\s+/g, ' ');
      if (text.includes('صورة قبل المعالجة') || text.includes('صورة بعد المعالجة')) {
        centerOverlayPanel(overlay, 900, 'تفاصيل البلاغ والأدلة');
      }
    });
  };

  const patchIncidentDetails = () => {
    fixedOverlays().forEach(overlay => {
      const text = (overlay.textContent || '').replace(/\s+/g, ' ');
      if (!text.includes('عرض على الخريطة')) return;
      centerOverlayPanel(overlay, 720, 'تفاصيل الحادث');
    });
  };

  const applyPhase11AFixes = () => {
    patchMobilityModalCollision();
    patchEvidenceDetails();
    patchIncidentDetails();
  };

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      applyPhase11AFixes();
    });
  };

  const onServiceEntryClick = event => {
    const target = event.target && event.target.closest ? event.target.closest('[data-f],a,button,[role="button"]') : null;
    if (!target) return;
    const label = (target.textContent || '').replace(/\s+/g, ' ').trim();
    if (!SERVICE_LABELS.some(service => label.includes(service))) return;
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  };

  const start = () => {
    if (document.documentElement.dataset.phase11aManagerFoundation === 'true') return;
    document.documentElement.dataset.phase11aManagerFoundation = 'true';
    document.addEventListener('click', onServiceEntryClick, true);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true });
    applyPhase11AFixes();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
