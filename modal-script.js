// إغلاق النوافذ عند الضغط على الخلفية أو زر × فقط
document.addEventListener('click', (e) => {
  const modals = document.querySelectorAll('#smartInputModal, #closeoutModal');
  modals.forEach(modal => {
    if (modal.style.display === 'flex') {
      const closeBtn = modal.querySelector('.close-btn');
      if (e.target === modal || e.target === closeBtn) {
        modal.style.display = 'none';
      }
    }
  });
});

// ستارة معلومات المراقب: تستخدم عناصر الهيدر الأصلية نفسها ولا تكرر الأزرار أو المعرّفات.
document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('hsrHeader');
  const top = header?.querySelector('.hsr-top');
  const menuToggle = document.getElementById('menuToggle');
  const actions = header?.querySelector('.actions');
  if (!header || !top || !menuToggle || !actions) return;

  menuToggle.type = 'button';
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-controls', 'inspectorHeaderCurtain');
  menuToggle.setAttribute('aria-label', 'فتح تفاصيل حساب المراقب والإجراءات');

  const curtain = document.createElement('div');
  curtain.id = 'inspectorHeaderCurtain';
  curtain.setAttribute('aria-hidden', 'true');

  const inner = document.createElement('div');
  inner.id = 'inspectorHeaderCurtainInner';

  const content = document.createElement('div');
  content.id = 'inspectorHeaderCurtainContent';

  const summary = document.createElement('div');
  summary.id = 'inspectorHeaderSummary';
  summary.setAttribute('aria-label', 'معلومات جلسة المراقب');

  const connectionChip = document.createElement('span');
  connectionChip.className = 'inspector-header-chip';
  connectionChip.innerHTML = '<i data-lucide="wifi" class="w-4 h-4" aria-hidden="true"></i><span>الاتصال: <strong id="inspectorConnectionText">جارٍ التحقق…</strong></span>';

  const gpsChip = document.createElement('span');
  gpsChip.className = 'inspector-header-chip';
  gpsChip.innerHTML = '<i data-lucide="navigation" class="w-4 h-4" aria-hidden="true"></i><span>الموقع: <strong id="inspectorGpsText">جاهز عند فتح البلاغ</strong></span>';

  const scopeChip = document.createElement('span');
  scopeChip.className = 'inspector-header-chip';
  scopeChip.innerHTML = '<i data-lucide="shield-check" class="w-4 h-4" aria-hidden="true"></i><span>النطاق: <strong>ملاحظاتي فقط</strong></span>';

  summary.append(connectionChip, gpsChip, scopeChip);
  content.append(summary, actions);
  inner.append(content);
  curtain.append(inner);
  header.append(curtain);

  const syncStatus = () => {
    const connectionText = document.getElementById('inspectorConnectionText');
    const gpsSummary = document.getElementById('inspectorGpsText');
    const gpsText = document.getElementById('gpsText');

    if (connectionText) {
      connectionText.textContent = navigator.onLine ? 'متصل' : 'غير متصل';
    }
    if (gpsSummary && gpsText) {
      const value = (gpsText.textContent || '').trim();
      gpsSummary.textContent = value || 'الموقع غير متاح';
    }
  };

  const setOpen = (open) => {
    curtain.classList.toggle('open', open);
    actions.classList.toggle('active', open);
    curtain.setAttribute('aria-hidden', open ? 'false' : 'true');
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuToggle.setAttribute('aria-label', open ? 'إغلاق تفاصيل حساب المراقب والإجراءات' : 'فتح تفاصيل حساب المراقب والإجراءات');
    syncStatus();
  };

  // يلغي المستمع القديم عملياً عبر مزامنة الحالة بعد انتهاء النقرة.
  menuToggle.addEventListener('click', () => {
    requestAnimationFrame(() => setOpen(menuToggle.getAttribute('aria-expanded') !== 'true'));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && curtain.classList.contains('open')) {
      setOpen(false);
      menuToggle.focus();
    }
  });

  document.addEventListener('click', (event) => {
    if (!curtain.classList.contains('open')) return;
    if (!header.contains(event.target)) setOpen(false);
  });

  window.addEventListener('online', syncStatus);
  window.addEventListener('offline', syncStatus);

  const gpsObserver = new MutationObserver(syncStatus);
  const gpsText = document.getElementById('gpsText');
  if (gpsText) gpsObserver.observe(gpsText, { childList: true, characterData: true, subtree: true });

  const detailsHeading = Array.from(document.querySelectorAll('#observations-log h4')).find(element =>
    element.textContent.includes('عرض التفاصيل والتحليل')
  );
  if (detailsHeading) detailsHeading.textContent = 'التفاصيل والتحليل الذكي';

  syncStatus();
  try { window.lucide?.createIcons(); } catch (_) {}
});
