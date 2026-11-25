(() => {
  const form = document.getElementById('launch-game-form');
  const hiddenHost = document.getElementById('pq-launch-pack-hidden');
  const cards = document.querySelectorAll('.pq-topic-card');
  if (!form || !hiddenHost || !cards.length) return;

  const selected = new Set();
  const configEl = document.getElementById('pq-launch-config');
  if (configEl) {
    try {
      const parsed = JSON.parse(configEl.textContent || '{}');
      if (Array.isArray(parsed.selectedIds)) {
        parsed.selectedIds.forEach((id) => {
          if (typeof id === 'string' && id) selected.add(id);
        });
      }
    } catch {
      /* ignore malformed config */
    }
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function syncHiddenInputs() {
    hiddenHost.innerHTML = [...selected]
      .sort()
      .map(
        (id) => `<input type="hidden" name="topicPackIds" value="${escapeAttr(id)}" class="pq-launch-pack-hidden" data-pack-id="${escapeAttr(id)}">`,
      )
      .join('');
  }

  function syncCard(card) {
    const input = card.querySelector('.pq-topic-checkbox');
    if (!input) return;
    const packId = card.getAttribute('data-topic-pack-id');
    if (!packId) return;
    const isSelected = input.checked;
    card.classList.toggle('pq-topic-card--selected', isSelected);
    card.classList.toggle('neon-glow-pink', isSelected);
    card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    const icon = card.querySelector('.pq-topic-check-icon');
    if (icon) {
      icon.textContent = isSelected ? 'check_box' : 'check_box_outline_blank';
    }
    if (isSelected) selected.add(packId);
    else selected.delete(packId);
    syncHiddenInputs();
  }

  cards.forEach((card) => {
    const input = card.querySelector('.pq-topic-checkbox');
    if (!input) return;
    const packId = card.getAttribute('data-topic-pack-id');
    if (input.checked && packId) selected.add(packId);
    input.removeAttribute('name');
    syncCard(card);
    input.addEventListener('change', () => syncCard(card));
    card.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        input.checked = !input.checked;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });

  syncHiddenInputs();
})();