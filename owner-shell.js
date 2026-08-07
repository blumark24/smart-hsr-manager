// Persistent Owner Command Center chrome behavior that is not routing and
// not auth: the light/dark theme toggle. Sidebar active-link state is
// owned by owner-router.js. The logout button keeps its existing
// Firebase/session logic inline in owner.html — this module does not
// touch auth, Firestore, or any API call.

const THEME_STORAGE_KEY = 'smartx_theme';

export function initThemeToggle({ toggleEl, labelEl, modeTextEl } = {}) {
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
