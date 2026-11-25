(() => {
  const btn = document.getElementById('pq-copy-invite');
  const textEl = document.getElementById('pq-invite-url');
  if (!btn || !textEl) return;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(textEl.textContent.trim());
      btn.textContent = btn.dataset.copiedLabel || 'COPIED!';
    } catch {
      /* clipboard blocked */
    }
  });
})();