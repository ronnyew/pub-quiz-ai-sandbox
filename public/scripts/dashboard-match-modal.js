(() => {
  const modal = document.getElementById('match-modal');
  if (!modal) return;
  const backdrop = document.getElementById('modal-backdrop');
  const closeBtn = document.getElementById('modal-close-btn');
  const rows = document.querySelectorAll('.match-row');

  const fields = {
    code: document.getElementById('modal-game-code'),
    date: document.getElementById('modal-date'),
    score: document.getElementById('modal-score'),
    accuracy: document.getElementById('modal-accuracy'),
    speed: document.getElementById('modal-speed'),
    rank: document.getElementById('modal-rank'),
    rounds: document.getElementById('modal-rounds'),
    categories: document.getElementById('modal-categories'),
    badge: document.getElementById('modal-badge-container'),
  };

  function closeModal() {
    modal.classList.add('hidden');
  }

  function openModal(row) {
    if (fields.code) fields.code.textContent = row.getAttribute('data-code') || '#000000';
    if (fields.date) fields.date.textContent = row.getAttribute('data-date') || '—';
    if (fields.score) fields.score.textContent = row.getAttribute('data-score') || '—';
    if (fields.accuracy) fields.accuracy.textContent = row.getAttribute('data-accuracy') || '—';
    if (fields.speed) fields.speed.textContent = row.getAttribute('data-speed') || '—';
    if (fields.rank) fields.rank.textContent = row.getAttribute('data-rank') || '—';
    if (fields.rounds) fields.rounds.textContent = row.getAttribute('data-rounds') || '—';
    if (fields.categories) {
      fields.categories.textContent = row.getAttribute('data-categories') || '—';
    }
    if (fields.badge) {
      fields.badge.replaceChildren();
      const outcome = row.getAttribute('data-outcome') || '';
      const type = row.getAttribute('data-outcome-type') || '';
      if (type === '1st' && outcome) {
        const badge = document.createElement('span');
        badge.className =
          'pq-match-outcome-badge inline-flex items-center gap-1.5 px-3 py-1 bg-primary/20 text-primary border border-primary/60 rounded-md font-label text-xs font-bold uppercase shadow-[0_0_12px_rgba(255,45,120,0.3)]';
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined text-sm';
        icon.style.fontVariationSettings = '"FILL" 1';
        icon.textContent = 'workspace_premium';
        badge.appendChild(icon);
        badge.appendChild(document.createTextNode(` ${outcome}`));
        fields.badge.appendChild(badge);
      }
    }
    modal.classList.remove('hidden');
  }

  rows.forEach((row) => {
    row.addEventListener('click', () => openModal(row));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openModal(row);
      }
    });
    row.setAttribute('tabindex', '0');
  });

  closeBtn?.addEventListener('click', closeModal);
  backdrop?.addEventListener('click', closeModal);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });
})();