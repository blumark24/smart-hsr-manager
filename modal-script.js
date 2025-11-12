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
