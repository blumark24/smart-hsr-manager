(() => {
  'use strict';

  const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  function getUserCenter() {
    return Array.from(document.querySelectorAll('section[role="dialog"]')).find(el => {
      const label = el.getAttribute('aria-label') || '';
      const title = text(el.querySelector('h2'));
      return /مركز (إدارة )?المستخدمين/.test(label) || /مركز (إدارة )?المستخدمين/.test(title);
    });
  }

  function fixImportControl() {
    const center = getUserCenter();
    if (!center) return;
    const actions = center.querySelector('.uc2-actions');
    if (!actions) return;

    const nativeImport = Array.from(center.querySelectorAll('button[data-phase11b-import]')).find(btn => {
      return btn.dataset.phase11bImport === '1' && btn.dataset.uc2NativeImport !== 'true';
    }) || center.querySelector('button[data-phase11b-import="1"]');

    const proxies = Array.from(center.querySelectorAll('button[data-uc2-import-proxy]')).filter(btn => btn !== nativeImport);
    proxies.forEach(btn => btn.remove());

    if (!nativeImport) return;

    nativeImport.dataset.uc2NativeImport = 'true';
    nativeImport.dataset.uc2ImportProxy = 'native';
    nativeImport.classList.add('uc2-secondary');
    nativeImport.removeAttribute('aria-hidden');
    nativeImport.style.removeProperty('display');
    nativeImport.style.display = 'inline-flex';
    nativeImport.innerHTML = '<span aria-hidden="true">⇧</span><span>استيراد ملف</span>';
    nativeImport.setAttribute('aria-label', 'استيراد ملف موظفين');

    if (nativeImport.parentElement !== actions) actions.appendChild(nativeImport);
  }

  function start() {
    fixImportControl();
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fixImportControl();
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();