(() => {
  'use strict';

  const frame = document.getElementById('managerPreview');
  if (!frame) return;

  const activate = () => {
    try {
      const doc = frame.contentDocument;
      if (!doc || !doc.head) return;
      if (doc.querySelector('script[data-phase11b-premium-loader="true"]')) return;

      const script = doc.createElement('script');
      script.src = './manager-phase11b-user-center-visual.js';
      script.defer = true;
      script.dataset.phase11bPremiumLoader = 'true';
      doc.head.appendChild(script);
    } catch (_) {
      // Same-origin preview only; fail closed if the frame cannot be accessed.
    }
  };

  frame.addEventListener('load', activate);
  if (frame.contentDocument?.readyState === 'complete') activate();
})();