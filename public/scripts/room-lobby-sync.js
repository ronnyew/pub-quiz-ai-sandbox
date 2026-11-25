(function initGameLobbySync() {
  const configEl = document.getElementById('pq-room-sync-config');
  if (!configEl) return;
  let config;
  try {
    config = JSON.parse(configEl.textContent || '{}');
  } catch {
    return;
  }
  const gamePin = config.gamePin || config.roomId;
  if (!gamePin) return;

  const playerCountEl = document.getElementById('pq-player-count');
  const playerGridEl = document.getElementById('pq-player-grid');
  const pingEl = document.getElementById('pq-sync-ping');
  const pingTemplate = configEl.getAttribute('data-ping-template') || '';
  let timer = null;

  function formatPing(ms) {
    const safeMs = Math.max(1, Math.round(ms));
    if (!pingTemplate) {
      return String(safeMs);
    }
    return pingTemplate.replace('{ms}', String(safeMs));
  }

  function initialPingMs() {
    const navEntries = performance.getEntriesByType('navigation');
    const nav = navEntries && navEntries[0];
    if (nav && Number.isFinite(nav.responseEnd) && Number.isFinite(nav.requestStart)) {
      const delta = nav.responseEnd - nav.requestStart;
      if (delta > 0) {
        return Math.max(1, Math.round(delta));
      }
    }
    return 1;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderPlayers(players) {
    if (playerCountEl) {
      playerCountEl.textContent = String(players.length);
    }
    if (!playerGridEl) return;
    playerGridEl.innerHTML = players
      .map(
        (player) => `<div class="flex items-center gap-2 px-3 py-2 bg-[#0f0f1a] border border-[#302840] rounded-lg">
<span class="material-symbols-outlined text-secondary text-sm">person</span>
<span class="font-label text-xs uppercase font-bold tracking-wider text-white">${escapeHtml(player.handle)}</span>
</div>`,
      )
      .join('');
  }

  async function refresh() {
    const startedAt = performance.now();
    try {
      const response = await fetch(`/api/games/${encodeURIComponent(gamePin)}`, {
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      const game = await response.json();
      if (game.status === 'ACTIVE' || game.status === 'COMPLETED') {
        window.location.assign(`/game/${encodeURIComponent(gamePin)}/play`);
        return;
      }
      if (Array.isArray(game.players)) {
        renderPlayers(game.players);
      }
      if (pingEl) {
        const elapsed = Math.max(1, Math.round(performance.now() - startedAt));
        pingEl.textContent = formatPing(elapsed);
      }
    } catch {
      /* ignore transient fetch errors */
    }
  }

  function start() {
    if (timer) return;
    if (pingEl) {
      pingEl.textContent = formatPing(initialPingMs());
    }
    refresh();
    timer = setInterval(refresh, 4000);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') start();
    else stop();
  });
  window.addEventListener('pagehide', stop);
  window.addEventListener('beforeunload', stop);

  if (document.visibilityState === 'visible') {
    start();
  }
})();