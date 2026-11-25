(function initGameplaySync() {
  const configEl = document.getElementById('pq-gameplay-config');
  if (!configEl) return;
  let config;
  try {
    config = JSON.parse(configEl.textContent || '{}');
  } catch {
    return;
  }
  const gamePin = config.gamePin;
  if (!gamePin) return;

  const timerDisplay = document.getElementById('pq-timer-display');
  const timerRing = document.getElementById('pq-timer-ring');
  const answerGrid = document.getElementById('pq-answer-grid');
  const readyCount = document.getElementById('pq-ready-count');
  const questionText = document.getElementById('pq-question-text');
  const questionBadge = document.getElementById('pq-question-badge');
  const awaitingDot = document.getElementById('pq-awaiting-dot');
  const errorBanner = document.getElementById('pq-gameplay-error');
  const selectedLabel = configEl.getAttribute('data-selected-label') || 'SELECTED';
  const advanceDelayMs = Number(configEl.getAttribute('data-advance-delay-ms')) || 500;
  const questionBadgeTemplate = configEl.getAttribute('data-question-badge-template') || 'QUESTION {current} / {total}';
  const readyCountTemplate = configEl.getAttribute('data-ready-count-template') || '{ready} / {total} READY';
  const isHost = Boolean(config.isHost);
  let errorCopy = { generic: '', already_answered: '', network: '' };
  try {
    errorCopy = JSON.parse(configEl.getAttribute('data-gameplay-errors') || '{}');
  } catch {
    /* keep defaults */
  }
  const circumference = 2 * Math.PI * 34;
  const TIMER_CYAN = '#00ffcc';
  const TIMER_PURPLE = '#9d4edd';
  const TIMER_PINK = '#ff2d78';
  let closesAt = Number(config.closesAt);
  let currentQuestionId = config.questionId || null;
  let animationFrame = null;
  let refreshTimer = null;
  let advanceAfterAllTimer = null;
  let advanceInFlight = false;
  let lastPayload = null;

  function formatTemplate(template, vars) {
    return String(template || '').replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showGameplayError(message) {
    if (!errorBanner || !message) return;
    errorBanner.textContent = message;
    errorBanner.classList.remove('hidden');
  }

  function hideGameplayError() {
    if (!errorBanner) return;
    errorBanner.textContent = '';
    errorBanner.classList.add('hidden');
  }

  function formatTimer(secondsLeft) {
    const safe = Math.max(0, Math.round(secondsLeft));
    const padded = safe < 10 ? `0${safe}` : String(safe);
    return `00:${padded}`;
  }

  function applyTimerTone(secondsLeft) {
    let tone = TIMER_CYAN;
    if (secondsLeft <= 5) {
      tone = TIMER_PINK;
    } else if (secondsLeft <= 10) {
      tone = TIMER_PURPLE;
    }
    if (timerRing) {
      timerRing.setAttribute('stroke', tone);
      timerRing.style.filter = `drop-shadow(0 0 12px ${tone})`;
    }
  }

  function renderOption(option, selectedId) {
    const isSelected = selectedId === option.id;
    const isLocked = Boolean(selectedId) && !isSelected;
    const baseClasses = isSelected
      ? 'pq-gameplay-option pq-gameplay-option--locked relative text-left p-5 sm:p-6 bg-[#1a0010] text-white rounded-xl border-2 border-[#ff2d78] neon-glow-pink flex flex-col justify-between transition-all duration-200 cursor-pointer'
      : 'pq-gameplay-option relative text-left p-5 sm:p-6 bg-[#141422] text-[#e8e0f0] rounded-xl border border-[#302840] hover:border-[#00ffcc] hover:shadow-[0_0_15px_rgba(0,255,204,0.25)] flex flex-col justify-between transition-all duration-200 cursor-pointer';
    const badge = isSelected
      ? `<div class="flex items-center gap-1 bg-[#ff2d78] text-[#1a0010] px-3 py-1 rounded font-label text-[11px] font-extrabold uppercase tracking-wider shadow-[0_0_10px_rgba(255,45,120,0.5)]">
<span class="material-symbols-outlined text-sm font-bold">check_circle</span>
${escapeHtml(selectedLabel)}</div>`
      : '';
    const letterClasses = isSelected
      ? 'w-10 h-10 rounded-lg bg-[#ff2d78] text-[#1a0010] font-headline font-extrabold text-lg flex items-center justify-center shadow-[0_0_12px_#ff2d78]'
      : 'w-10 h-10 rounded-lg bg-[#1e1e30] text-[#00ffcc] border border-[#302840] font-headline font-bold text-lg flex items-center justify-center';
    const pressedAttr = isSelected ? 'disabled aria-pressed="true"' : isLocked ? 'disabled aria-pressed="false"' : 'aria-pressed="false"';
    return `<button type="button" class="${baseClasses}" data-answer-id="${escapeHtml(option.id)}" ${pressedAttr}>
<div class="flex items-center justify-between w-full mb-3">
<div class="${letterClasses}">${escapeHtml(option.id)}</div>
${badge}
</div>
<span class="font-headline font-bold text-xl sm:text-2xl block tracking-tight text-white">${escapeHtml(option.text)}</span>
</button>`;
  }

  function syncAnswerGrid(payload) {
    if (!answerGrid || !Array.isArray(payload.options)) return;
    const selectedId = payload.playerAnswer?.selectedAnswerId || null;
    answerGrid.innerHTML = payload.options.map((option) => renderOption(option, selectedId)).join('');
  }

  function syncQuestionChrome(payload) {
    if (questionText && payload.questionText) {
      questionText.textContent = payload.questionText;
    }
    if (questionBadge && Number.isInteger(payload.questionIndex)) {
      const badgeText = formatTemplate(questionBadgeTemplate, {
        current: String(payload.questionIndex + 1).padStart(2, '0'),
        total: String(payload.questionCount || 0).padStart(2, '0'),
      });
      questionBadge.innerHTML = `<span class="material-symbols-outlined text-xs leading-none" style="font-variation-settings: &quot;FILL&quot; 1;">hotel_class</span> ${escapeHtml(badgeText)}`;
    }
  }

  function syncReadyCount(payload) {
    if (!readyCount || !payload) return;
    const ready = payload.playersReady || 0;
    const total = payload.playersTotal || 0;
    readyCount.textContent = formatTemplate(readyCountTemplate, {
      ready: String(ready),
      total: String(total),
    });
    if (awaitingDot) {
      if (payload.allPlayersAnswered) {
        awaitingDot.className = 'w-2.5 h-2.5 rounded-full bg-[#00ffcc] shadow-[0_0_8px_#00ffcc]';
      } else {
        awaitingDot.className = 'w-2.5 h-2.5 rounded-full bg-[#ff2d78] shadow-[0_0_8px_#ff2d78] animate-ping';
      }
    }
  }

  function clearAdvanceTimer() {
    if (advanceAfterAllTimer) {
      clearTimeout(advanceAfterAllTimer);
      advanceAfterAllTimer = null;
    }
  }

  async function callAdvance() {
    if (!isHost || advanceInFlight) return;
    advanceInFlight = true;
    clearAdvanceTimer();
    try {
      const response = await fetch(`/api/games/${encodeURIComponent(gamePin)}/advance`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        advanceInFlight = false;
        return;
      }
      const result = await response.json();
      if (result.completed || result.reason === 'not_active') {
        window.location.reload();
        return;
      }
      if (result.advanced) {
        currentQuestionId = null;
        hideGameplayError();
        await refreshState();
      }
    } catch {
      /* ignore */
    } finally {
      advanceInFlight = false;
    }
  }

  function maybeScheduleAdvance(payload) {
    if (!isHost || !payload || payload.status !== 'ACTIVE') return;
    const now = Date.now();
    const timerExpired = now > Number(payload.closesAt);
    if (timerExpired) {
      clearAdvanceTimer();
      callAdvance();
      return;
    }
    if (payload.allPlayersAnswered && !advanceAfterAllTimer) {
      advanceAfterAllTimer = setTimeout(() => {
        advanceAfterAllTimer = null;
        callAdvance();
      }, advanceDelayMs);
    }
  }

  function paintTimer(now) {
    if (!Number.isFinite(closesAt)) return;
    const secondsLeft = Math.max(0, (closesAt - now) / 1000);
    if (timerDisplay) {
      timerDisplay.textContent = formatTimer(secondsLeft);
    }
    if (timerRing) {
      const progress = Math.max(0, Math.min(1, secondsLeft / 30));
      timerRing.style.strokeDashoffset = String(circumference * (1 - progress));
    }
    applyTimerTone(secondsLeft);
    if (lastPayload && now > closesAt) {
      maybeScheduleAdvance(lastPayload);
    }
  }

  function loop() {
    paintTimer(Date.now());
    animationFrame = window.requestAnimationFrame(loop);
  }

  function stopRefresh() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function scheduleRefresh() {
    stopRefresh();
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      refreshState();
    }, 1500);
  }

  function applyPayload(payload) {
    if (!payload) return;
    if (payload.status === 'COMPLETED') {
      const pin = configEl.getAttribute('data-game-pin');
      if (pin) {
        window.location.href = `/rooms/${encodeURIComponent(pin)}/results`;
      } else {
        window.location.reload();
      }
      return;
    }
    lastPayload = payload;
    if (Number.isFinite(payload.closesAt)) {
      closesAt = payload.closesAt;
    }
    const questionChanged = payload.questionId && payload.questionId !== currentQuestionId;
    if (questionChanged) {
      currentQuestionId = payload.questionId;
      clearAdvanceTimer();
      hideGameplayError();
    }
    syncQuestionChrome(payload);
    syncAnswerGrid(payload);
    syncReadyCount(payload);
    maybeScheduleAdvance(payload);
  }

  async function refreshState() {
    try {
      const response = await fetch(`/api/games/${encodeURIComponent(gamePin)}/question`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const payload = await response.json();
      applyPayload(payload);
    } catch {
      /* ignore transient network errors */
    } finally {
      if (document.visibilityState === 'visible') {
        scheduleRefresh();
      }
    }
  }

  async function submitAnswer(answerId) {
    if (lastPayload?.playerAnswer?.selectedAnswerId) {
      showGameplayError(errorCopy.already_answered || errorCopy.generic);
      return;
    }
    try {
      const response = await fetch(`/api/games/${encodeURIComponent(gamePin)}/answers`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ selectedAnswerId: answerId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = body.reason === 'already_answered'
          ? (errorCopy.already_answered || errorCopy.generic)
          : (errorCopy.generic || '');
        showGameplayError(message);
        await refreshState();
        return;
      }
      hideGameplayError();
      await refreshState();
    } catch {
      showGameplayError(errorCopy.network || errorCopy.generic);
    }
  }

  if (answerGrid) {
    answerGrid.addEventListener('click', (event) => {
      const button = event.target.closest('[data-answer-id]');
      if (!button || button.disabled) return;
      const answerId = button.getAttribute('data-answer-id');
      if (!answerId) return;
      submitAnswer(answerId);
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshState();
      loop();
    } else {
      stopRefresh();
      clearAdvanceTimer();
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    }
  });
  window.addEventListener('pagehide', () => {
    stopRefresh();
    clearAdvanceTimer();
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
  });

  if (document.visibilityState === 'visible') {
    currentQuestionId = config.questionId || null;
    loop();
    scheduleRefresh();
  }
})();