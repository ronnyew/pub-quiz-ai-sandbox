(() => {
  const modal = document.getElementById('match-modal');
  if (!modal) return;
  const modalHud = modal.querySelector('.pq-match-modal');
  const backdrop = document.getElementById('modal-backdrop');
  const closeBtn = document.getElementById('modal-close-btn');
  const rows = document.querySelectorAll('.match-row');
  const questionsList = document.getElementById('modal-questions-list');
  const logPager = document.getElementById('modal-log-pager');
  const logRange = document.getElementById('modal-log-range');
  const breakdownPagerEl = document.getElementById('modal-breakdown-pager');
  const leaderboardList = document.getElementById('modal-leaderboard-list');
  const leaderboardCount = document.getElementById('modal-leaderboard-count');
  const leaderboardRange = document.getElementById('modal-leaderboard-range');
  const leaderboardPagerEl = document.getElementById('modal-leaderboard-pager');
  const viewerUserId = modal.getAttribute('data-viewer-user-id') || '';
  const rankTemplate = modal.getAttribute('data-rank-template') || '#{rank} of {total}';
  const playersLoggedTemplate = modalHud?.getAttribute('data-players-logged-template') || '{count} PLAYERS LOGGED';
  const roundsPagerTemplate = modalHud?.getAttribute('data-rounds-pager-template') || 'SHOWING {start}–{end} OF {total} ROUNDS';
  const leaderboardPagerTemplate = modalHud?.getAttribute('data-leaderboard-pager-template')
    || 'SHOWING {start}–{end} OF {total} PLAYERS';
  const youLabel = modalHud?.getAttribute('data-you-label') || 'YOU';
  const leaderboardLineTemplate = modalHud?.getAttribute('data-leaderboard-line-template')
    || '{correct}/{total} correct • {speed}s avg';
  const yourAnswerLabel = modalHud?.getAttribute('data-your-answer-label') || 'Your Answer';
  const verifiedPrefix = modalHud?.getAttribute('data-verified-label') || 'Verified Answer:';
  const scorePtsSuffix = modalHud?.getAttribute('data-score-pts-suffix') || 'PTS';
  const questionsRoundsTemplate = modalHud?.getAttribute('data-questions-rounds-template') || '{count} ROUNDS';

  const LEADERBOARD_PAGE_SIZE = 10;

  function leaderboardRankTierClass(entry, isYou) {
    if (isYou) return 'pq-leaderboard-rank';
    if (entry.rank === 1) return 'pq-leaderboard-rank pq-leaderboard-rank--top';
    if (entry.rank === 2) return 'pq-leaderboard-rank pq-leaderboard-rank--second';
    return 'pq-leaderboard-rank pq-leaderboard-rank--default';
  }

  function leaderboardPtsTierClass(entry, isYou) {
    if (isYou) return 'pq-leaderboard-pts';
    if (entry.rank === 1) return 'pq-leaderboard-pts pq-leaderboard-pts--top';
    if (entry.rank === 2) return 'pq-leaderboard-pts pq-leaderboard-pts--second';
    return 'pq-leaderboard-pts pq-leaderboard-pts--default';
  }

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

  let activePin = null;
  let breakdownPage = 1;
  let leaderboardPage = 1;
  let leaderboardData = [];

  function formatTemplate(template, vars) {
    return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
  }

  function closeModal() {
    modal.classList.add('hidden');
    activePin = null;
    breakdownPage = 1;
    leaderboardPage = 1;
    leaderboardData = [];
  }

  function pointsClass(awarded) {
    if (awarded > 0) return 'text-[#00ffcc]';
    if (awarded < 0) return 'text-[#ff4444]';
    return 'text-[#a098b0]';
  }

  function renderQuestionRows(entries) {
    if (!questionsList) return;
    questionsList.replaceChildren();
    for (const entry of entries) {
      const card = document.createElement('div');
      card.className =
        'p-4 rounded-lg bg-[#1e1e30]/60 border border-[#302840] hover:border-secondary/40 transition-colors';
      const index = entry.questionIndex + 1;
      const speed = entry.speedSeconds != null ? `${entry.speedSeconds}s` : '—';
      const yourAnswer = entry.selectedAnswerText || '—';
      const isCorrect = Boolean(entry.isCorrect);
      const answerTone = isCorrect ? 'text-[#00ffcc]' : 'text-[#ff4444]';
      const row = document.createElement('div');
      row.className = 'flex items-start justify-between gap-4';
      const left = document.createElement('div');
      const question = document.createElement('p');
      question.className = 'font-body text-sm font-semibold text-white leading-relaxed';
      const qLabel = document.createElement('span');
      qLabel.className = 'text-[#00ffcc] font-headline font-bold mr-1.5';
      qLabel.textContent = `Q${index}.`;
      question.appendChild(qLabel);
      question.appendChild(document.createTextNode(entry.questionText));
      left.appendChild(question);
      const answerWrap = document.createElement('div');
      answerWrap.className = 'mt-2 flex items-center gap-1 text-xs font-semibold';
      const icon = document.createElement('span');
      icon.className = `material-symbols-outlined text-sm ${answerTone}`;
      icon.textContent = isCorrect ? 'check_circle' : 'cancel';
      const label = document.createElement('span');
      label.className = answerTone;
      label.textContent = `${yourAnswerLabel}:`;
      const value = document.createElement('span');
      value.className = 'text-white font-medium ml-1';
      value.textContent = yourAnswer;
      answerWrap.appendChild(icon);
      answerWrap.appendChild(label);
      answerWrap.appendChild(value);
      left.appendChild(answerWrap);
      if (!isCorrect && entry.verifiedAnswerText) {
        const verifiedLine = document.createElement('div');
        verifiedLine.className = 'mt-1 text-xs text-[#a098b0]';
        verifiedLine.appendChild(document.createTextNode(`${verifiedPrefix} `));
        const verifiedValue = document.createElement('span');
        verifiedValue.className = 'text-white font-medium';
        verifiedValue.textContent = entry.verifiedAnswerText;
        verifiedLine.appendChild(verifiedValue);
        left.appendChild(verifiedLine);
      }
      const right = document.createElement('div');
      right.className = 'text-right flex-shrink-0';
      const points = document.createElement('span');
      points.className = `font-headline font-bold text-sm ${pointsClass(entry.pointsAwarded)}`;
      const delta = entry.pointsAwarded > 0 ? `+${entry.pointsAwarded}` : String(entry.pointsAwarded);
      points.textContent = `${delta} ${scorePtsSuffix}`;
      const speedEl = document.createElement('div');
      speedEl.className = 'font-label text-[10px] text-[#a098b0] mt-0.5';
      speedEl.textContent = speed;
      right.appendChild(points);
      right.appendChild(speedEl);
      row.appendChild(left);
      row.appendChild(right);
      card.appendChild(row);
      questionsList.appendChild(card);
    }
  }

  function renderNumberedPager(container, { page, totalPages, onPage, activeVariant }) {
    if (!container) return;
    container.replaceChildren();
    if (!Number.isInteger(totalPages) || totalPages <= 1) return;

    const addChevron = (direction, disabled, targetPage) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.disabled = disabled;
      btn.className = disabled
        ? 'pq-pager-btn px-2.5 py-1.5 rounded font-bold flex items-center justify-center opacity-40 pointer-events-none'
        : 'pq-pager-btn px-2.5 py-1.5 rounded font-bold flex items-center justify-center transition-colors';
      btn.setAttribute('aria-label', direction === 'prev' ? 'Previous page' : 'Next page');
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined text-sm';
      icon.textContent = direction === 'prev' ? 'chevron_left' : 'chevron_right';
      btn.appendChild(icon);
      if (!disabled) {
        btn.addEventListener('click', () => onPage(targetPage));
      }
      container.appendChild(btn);
    };

    addChevron('prev', page <= 1, page - 1);

  const pageGroup = document.createElement('div');
    pageGroup.className = 'flex items-center gap-1';
    for (let i = 1; i <= totalPages; i += 1) {
      const pageBtn = document.createElement('button');
      pageBtn.type = 'button';
      const active = i === page;
      if (active && activeVariant === 'leaderboard') {
        pageBtn.className =
          'pq-pager-btn pq-pager-btn--active w-7 h-7 rounded flex items-center justify-center font-bold text-xs';
      } else if (active) {
        pageBtn.className =
          'w-7 h-7 rounded border border-secondary bg-secondary/15 text-secondary font-bold text-xs flex items-center justify-center shadow-[0_0_10px_rgba(0,255,204,0.3)]';
      } else {
        pageBtn.className =
          'pq-pager-btn w-7 h-7 rounded flex items-center justify-center font-bold text-xs transition-colors';
      }
      pageBtn.textContent = String(i);
      pageBtn.setAttribute('aria-label', `Page ${i}`);
      if (!active) {
        pageBtn.addEventListener('click', () => onPage(i));
      } else {
        pageBtn.setAttribute('aria-current', 'page');
      }
      pageGroup.appendChild(pageBtn);
    }
    container.appendChild(pageGroup);
    addChevron('next', page >= totalPages, page + 1);
  }

  function applyMetrics(metrics) {
    if (!metrics) return;
    if (fields.score) {
      fields.score.textContent = `${metrics.totalScore}/${metrics.maxScore}`;
    }
    if (fields.accuracy) {
      fields.accuracy.textContent = `${metrics.accuracyPercent}%`;
    }
    if (fields.speed) {
      fields.speed.textContent = metrics.avgSpeedSeconds != null ? `${metrics.avgSpeedSeconds}s` : '—';
    }
    if (fields.rank) {
      fields.rank.textContent = metrics.rank
        ? formatTemplate(rankTemplate, { rank: metrics.rank, total: metrics.playerCount })
        : '—';
    }
    if (fields.rounds) {
      fields.rounds.textContent = metrics.roundsLabel || '—';
    }
  }

  function renderLeaderboardPage() {
    if (!leaderboardList) return;
    leaderboardList.replaceChildren();
    const total = leaderboardData.length;
    const totalPages = total ? Math.ceil(total / LEADERBOARD_PAGE_SIZE) : 1;
    if (leaderboardPage > totalPages) leaderboardPage = totalPages;
    if (leaderboardPage < 1) leaderboardPage = 1;
    const startIndex = (leaderboardPage - 1) * LEADERBOARD_PAGE_SIZE;
    const slice = leaderboardData.slice(startIndex, startIndex + LEADERBOARD_PAGE_SIZE);

    if (leaderboardCount) {
      leaderboardCount.textContent = formatTemplate(playersLoggedTemplate, { count: total });
    }
    const start = total === 0 ? 0 : startIndex + 1;
    const end = total === 0 ? 0 : Math.min(startIndex + LEADERBOARD_PAGE_SIZE, total);
    if (leaderboardRange) {
      leaderboardRange.textContent = formatTemplate(leaderboardPagerTemplate, { start, end, total });
    }

    for (const entry of slice) {
      const row = document.createElement('div');
      const isYou = entry.userId === viewerUserId;
      row.className = isYou ? 'pq-leaderboard-row pq-leaderboard-row--you' : 'pq-leaderboard-row';
      const left = document.createElement('div');
      left.className = 'flex items-center gap-2 min-w-0';
      const rank = document.createElement('span');
      rank.className = leaderboardRankTierClass(entry, isYou);
      rank.textContent = `#${entry.rank}`;
      const meta = document.createElement('div');
      meta.className = 'min-w-0';
      const nameRow = document.createElement('div');
      nameRow.className = 'font-bold flex items-center gap-1.5 flex-wrap';
      nameRow.appendChild(document.createTextNode(entry.handle || 'Player'));
      if (isYou) {
        const you = document.createElement('span');
        you.className = 'pq-leaderboard-you-badge';
        you.textContent = youLabel;
        nameRow.appendChild(you);
      }
      const sub = document.createElement('div');
      sub.className = 'text-[10px] text-[#a098b0] font-normal';
      const speed = entry.avgSpeedSeconds != null ? entry.avgSpeedSeconds : '—';
      sub.textContent = formatTemplate(leaderboardLineTemplate, {
        correct: entry.correctCount,
        total: entry.questionTotal,
        speed,
      });
      meta.appendChild(nameRow);
      meta.appendChild(sub);
      left.appendChild(rank);
      left.appendChild(meta);
      const pts = document.createElement('span');
      pts.className = leaderboardPtsTierClass(entry, isYou);
      pts.textContent = `${entry.totalScore} ${scorePtsSuffix}`;
      row.appendChild(left);
      row.appendChild(pts);
      leaderboardList.appendChild(row);
    }

    renderNumberedPager(leaderboardPagerEl, {
      page: leaderboardPage,
      totalPages,
      onPage: (next) => {
        leaderboardPage = next;
        renderLeaderboardPage();
      },
      activeVariant: 'leaderboard',
    });
  }

  async function loadBreakdownPage(page) {
    if (!activePin) return;
    const url = `/api/games/${encodeURIComponent(activePin)}/breakdown?page=${encodeURIComponent(String(page))}`;
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return;
    const payload = await response.json();
    breakdownPage = payload.page;
    leaderboardData = Array.isArray(payload.leaderboard) ? payload.leaderboard : [];
    if (page === 1) leaderboardPage = 1;
    applyMetrics(payload.metrics);
    renderQuestionRows(payload.entries || []);

    const totalQ = payload.totalQuestions || 0;
    if (logPager && totalQ) {
      logPager.textContent = formatTemplate(questionsRoundsTemplate, { count: totalQ });
    }
    const qStart = payload.entries.length ? (payload.page - 1) * payload.pageSize + 1 : 0;
    const qEnd = Math.min(payload.page * payload.pageSize, totalQ);
    if (logRange) {
      logRange.textContent = formatTemplate(roundsPagerTemplate, {
        start: qStart,
        end: qEnd,
        total: totalQ,
      });
    }

    renderNumberedPager(breakdownPagerEl, {
      page: payload.page,
      totalPages: payload.totalPages,
      onPage: (next) => loadBreakdownPage(next).catch(() => {}),
      activeVariant: 'questions',
    });
    renderLeaderboardPage();
    modalHud?.setAttribute('data-breakdown-page', String(payload.page));
  }

  function openModal(row) {
    if (fields.code) fields.code.textContent = row.getAttribute('data-code') || '#000000';
    if (fields.date) fields.date.textContent = row.getAttribute('data-date') || '—';
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
    activePin = row.getAttribute('data-game-pin') || null;
    breakdownPage = 1;
    leaderboardPage = 1;
    modal.classList.remove('hidden');
    loadBreakdownPage(1).catch(() => {});
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