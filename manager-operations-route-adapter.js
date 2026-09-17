(() => {
  const tab = location.hash.slice(1);
  if (!['observations', 'users', 'reports', 'twin'].includes(tab)) return;

  let attempts = 0;
  const activate = () => {
    const button = document.querySelector(`.command-nav [data-tab="${tab}"]`);
    if (button) {
      button.click();
      return;
    }
    if (++attempts < 30) setTimeout(activate, 100);
  };
  window.addEventListener('load', activate, { once: true });
})();
