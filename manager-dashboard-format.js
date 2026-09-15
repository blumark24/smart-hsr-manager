(() => {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const toLatinDigits = value => String(value ?? '').replace(/[٠-٩]/g, digit => String(arabicDigits.indexOf(digit)));
  const asNumber = value => Number(toLatinDigits(value));

  const format = Object.freeze({
    latin: toLatinDigits,
    integer(value) {
      const number = asNumber(value);
      return Number.isFinite(number)
        ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number)
        : '—';
    },
    decimal(value, maximumFractionDigits = 1) {
      const number = asNumber(value);
      return Number.isFinite(number)
        ? new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(number)
        : '—';
    },
    percent(value) {
      const number = asNumber(value);
      return Number.isFinite(number) ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number)}%` : '—';
    },
    date(value) {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat('ar-SA-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
        : 'غير متاح';
    },
    time(value = Date.now()) {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(date)
        : '—';
    },
    dateTime(value) {
      const date = value instanceof Date ? value : new Date(value);
      return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
        : 'غير متاح';
    }
  });

  window.SmartHSRFormat = format;

  // The real manager route is the single presentation owner for the approved
  // User Center. Load the exact approved Phase 11 chain here, in order, so
  // manager.html and its preview use the same implementation and cannot race.
  const REV = 'phase11g-user-center-approved-skin';
  const files = [
    ['./manager-phase11a-foundation.js', 'phase11aManagerRoutingFoundation'],
    ['./manager-phase11c-user-center-core.js', 'ucInstitutionCoreLoader'],
    ['./manager-phase11c-user-center-dialogs.js', 'ucInstitutionDialogsLoader'],
    ['./manager-phase11c-user-center-import.js', 'ucInstitutionImportLoader'],
    ['./manager-phase11c-legacy-account-bridge.js', 'ucLegacyAccountBridgeLoader'],
    ['./manager-phase11d-user-center-enhancements.js', 'ucPhase11dEnhancementsLoader'],
    ['./manager-phase11f-reference-ui.js', 'ucPhase11fReferenceUiLoader'],
    ['./manager-phase11e-user-center-interactions.js', 'ucPhase11eInteractionsLoader'],
    ['./manager-phase11f-executive-polish.js', 'managerPhase11fExecutivePolishLoader'],
    ['./manager-phase11g-user-center-approved-skin.js', 'ucPhase11gApprovedSkinLoader']
  ];

  let index = 0;
  const loadNext = () => {
    if (index >= files.length) {
      document.documentElement.dataset.smartHsrUserCenterReady = 'true';
      window.dispatchEvent(new CustomEvent('smart-hsr:user-center-ready'));
      return;
    }
    const [src, key] = files[index++];
    const attr = `data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
    const existing = document.querySelector(`script[${attr}="true"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') loadNext();
      else {
        existing.addEventListener('load', loadNext, { once: true });
        existing.addEventListener('error', loadNext, { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = `${src}?rev=${REV}`;
    script.async = false;
    script.setAttribute(attr, 'true');
    script.onload = () => {
      script.dataset.loaded = 'true';
      loadNext();
    };
    script.onerror = () => {
      console.error('SMART HSR manager failed to load', src);
      loadNext();
    };
    document.head.appendChild(script);
  };

  loadNext();
})();
