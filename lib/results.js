const { getGameRoom, getGameRoomSecrets, listTopicPacks } = require('../db');
const { isValidGamePin } = require('./rooms');
const { formatCopyTemplate, getStaticCopy } = require('./content-store');

const BREAKDOWN_PAGE_SIZE = 5;
const LEADERBOARD_PAGE_SIZE = 10;
const MAX_RECENT_MATCHES = 50;

function parseBreakdownPage(raw) {
  if (raw === undefined || raw === null) return 1;
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) {
    return 1;
  }
  return Number(raw);
}

function optionTextFor(question, answerId) {
  if (!question || !answerId) return null;
  const option = question.options?.find((entry) => entry.id === answerId);
  return option?.text ?? null;
}

function responsesForUser(secrets, userId) {
  return (secrets?.responses || []).filter((entry) => entry.userId === userId);
}

function averageLatencyMs(responses) {
  if (!responses.length) return null;
  const total = responses.reduce((sum, entry) => sum + entry.latencyMs, 0);
  return Math.round(total / responses.length);
}

function computeLongestCorrectStreak(room, secrets, userId) {
  let longest = 0;
  let current = 0;
  for (const question of room.dealQuestions || []) {
    const response = secrets.responses.find(
      (entry) => entry.questionId === question.questionId && entry.userId === userId,
    );
    if (response?.isCorrect) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }
  return longest;
}

function countCorrectAnswers(room, secrets, userId) {
  const questionIds = new Set((room.dealQuestions || []).map((q) => q.questionId));
  return secrets.responses.filter(
    (entry) => entry.userId === userId && questionIds.has(entry.questionId) && entry.isCorrect,
  ).length;
}

function computePlayerTelemetry({ room, secrets, userId }) {
  const userResponses = responsesForUser(secrets, userId);
  const questionTotal = room.dealQuestions?.length || 0;
  const correctCount = countCorrectAnswers(room, secrets, userId);
  const xp = userResponses.reduce((sum, entry) => sum + entry.pointsAwarded, 0);
  const avgLatency = averageLatencyMs(userResponses);
  const accuracyPercent = questionTotal
    ? Math.round((correctCount / questionTotal) * 100)
    : 0;
  return {
    userId,
    xp,
    correctCount,
    questionTotal,
    accuracyPercent,
    longestStreak: computeLongestCorrectStreak(room, secrets, userId),
    avgLatencyMs: avgLatency,
    avgSpeedSeconds: avgLatency === null ? null : Number((avgLatency / 1000).toFixed(1)),
    totalScore: room.scores?.[userId] ?? xp,
  };
}

function rankLeaderboard({ room, secrets }) {
  const players = room.players || [];
  const entries = players.map((player) => {
    const telemetry = computePlayerTelemetry({ room, secrets, userId: player.userId });
    return {
      userId: player.userId,
      handle: player.handle,
      totalScore: telemetry.totalScore,
      correctCount: telemetry.correctCount,
      questionTotal: telemetry.questionTotal,
      avgLatencyMs: telemetry.avgLatencyMs ?? Number.POSITIVE_INFINITY,
      avgSpeedSeconds: telemetry.avgSpeedSeconds,
      xp: telemetry.xp,
      longestStreak: telemetry.longestStreak,
    };
  });
  entries.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (a.avgLatencyMs !== b.avgLatencyMs) return a.avgLatencyMs - b.avgLatencyMs;
    return a.userId.localeCompare(b.userId);
  });
  return entries.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

function maxPossibleScore(room, secrets) {
  return (room.dealQuestions || []).reduce((sum, question, index) => {
    const secret = secrets.secretQuestions?.[index];
    return sum + (secret?.basePoints || 0);
  }, 0);
}

function buildMatchBreakdown({ room, secrets, userId, page = 1, leaderboardPage = 1 }) {
  const safePage = Number.isInteger(page) && page >= 1 ? page : parseBreakdownPage(String(page));
  const safeLeaderboardPage = Number.isInteger(leaderboardPage) && leaderboardPage >= 1
    ? leaderboardPage
    : parseBreakdownPage(String(leaderboardPage));
  const totalQuestions = room.dealQuestions?.length || 0;
  const revealVerified = room.status === 'COMPLETED';
  const rows = (room.dealQuestions || []).map((question, index) => {
    const secret = secrets.secretQuestions?.[index];
    const response = secrets.responses.find(
      (entry) => entry.questionId === question.questionId && entry.userId === userId,
    );
    const row = {
      questionIndex: index,
      questionId: question.questionId,
      questionText: question.questionText,
      selectedAnswerText: response?.selectedAnswerId
        ? optionTextFor(question, response.selectedAnswerId)
        : null,
      latencyMs: response?.latencyMs ?? null,
      speedSeconds: response?.latencyMs != null ? Number((response.latencyMs / 1000).toFixed(1)) : null,
      verifiedAnswerText: null,
    };
    if (revealVerified) {
      row.selectedAnswerId = response?.selectedAnswerId ?? null;
      row.pointsAwarded = response?.pointsAwarded ?? 0;
      row.isCorrect = Boolean(response?.isCorrect);
      if (secret) {
        row.correctAnswerId = secret.correctAnswerId;
        row.verifiedAnswerText = optionTextFor(question, secret.correctAnswerId);
        row.explanation = secret.explanation;
        row.sourceCitations = structuredClone(secret.sourceCitations);
      }
    }
    return row;
  });
  const start = (safePage - 1) * BREAKDOWN_PAGE_SIZE;
  const entries = start >= rows.length ? [] : rows.slice(start, start + BREAKDOWN_PAGE_SIZE);
  const leaderboard = rankLeaderboard({ room, secrets });
  const leaderboardTotalPlayers = leaderboard.length;
  const leaderboardTotalPages = leaderboardTotalPlayers
    ? Math.max(1, Math.ceil(leaderboardTotalPlayers / LEADERBOARD_PAGE_SIZE))
    : 1;
  const boundedLbPage = Math.min(Math.max(safeLeaderboardPage, 1), leaderboardTotalPages);
  const leaderboardSliceStart = (boundedLbPage - 1) * LEADERBOARD_PAGE_SIZE;
  const leaderboardEntries = leaderboardTotalPlayers
    ? leaderboard.slice(leaderboardSliceStart, leaderboardSliceStart + LEADERBOARD_PAGE_SIZE)
    : [];
  const self = leaderboard.find((entry) => entry.userId === userId) || computePlayerTelemetry({ room, secrets, userId });
  const maxScore = maxPossibleScore(room, secrets);
  return {
    gamePin: room.roomId,
    status: room.status,
    userId,
    page: safePage,
    pageSize: BREAKDOWN_PAGE_SIZE,
    totalQuestions,
    totalPages: totalQuestions ? Math.max(1, Math.ceil(totalQuestions / BREAKDOWN_PAGE_SIZE)) : 1,
    entries,
    metrics: {
      totalScore: self.totalScore ?? self.xp ?? 0,
      maxScore,
      accuracyPercent: self.accuracyPercent ?? computePlayerTelemetry({ room, secrets, userId }).accuracyPercent,
      avgSpeedSeconds: self.avgSpeedSeconds
        ?? computePlayerTelemetry({ room, secrets, userId }).avgSpeedSeconds,
      rank: leaderboard.find((entry) => entry.userId === userId)?.rank ?? null,
      playerCount: room.players.length,
      correctCount: self.correctCount ?? countCorrectAnswers(room, secrets, userId),
      roundsLabel: `${self.correctCount ?? 0}/${totalQuestions}`,
    },
    leaderboard,
    leaderboardPage: boundedLbPage,
    leaderboardPageSize: LEADERBOARD_PAGE_SIZE,
    leaderboardTotalPlayers,
    leaderboardTotalPages,
    leaderboardEntries,
  };
}

async function listRecentMatchesForUser(userId, { limit = MAX_RECENT_MATCHES, status = 'COMPLETED' } = {}) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    return [];
  }
  const { listGameRoomsForUser } = require('../db');
  const rooms = await listGameRoomsForUser(userId, { limit, status });
  return rooms;
}

function buildPlayerSummariesForCompletedRoom(room, secrets) {
  const leaderboard = rankLeaderboard({ room, secrets });
  const totalQuestions = room.dealQuestions?.length || 0;
  const maxScore = maxPossibleScore(room, secrets);
  const summaries = {};
  for (const entry of leaderboard) {
    summaries[entry.userId] = {
      score: entry.totalScore,
      rank: entry.rank,
      correctCount: entry.correctCount,
      totalQuestions,
      accuracyPercent: totalQuestions
        ? Math.round((entry.correctCount / totalQuestions) * 100)
        : 0,
      avgSpeedSeconds: entry.avgSpeedSeconds,
      maxScore,
    };
  }
  return summaries;
}

function formatMatchDateLabel(iso) {
  if (typeof iso !== 'string') return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return '—';
  return date
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase();
}

function topicLabelsForRoom(room) {
  const packs = listTopicPacks({ limit: 24 });
  const byId = new Map(packs.map((pack) => [pack.topicPackId, pack]));
  const labels = (room.topicPackIds || [])
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((pack) => pack.title);
  return labels.length ? labels.join(', ') : '—';
}

function buildDashboardMatchSummaries({ rooms, userId }) {
  const copy = getStaticCopy().dashboard;
  const shared = getStaticCopy().shared;
  const ptsSuffix = shared.score_pts_suffix || 'PTS';
  return rooms
    .filter((room) => room.status === 'COMPLETED')
    .map((room) => {
      const summary = room.playerSummaries?.[userId];
      let scoreLabel = '—';
      let outcome = copy.history_outcome_completed;
      let outcomeType = 'completed';
      let accuracy = '—';
      let speed = '—';
      let rank = '—';
      const totalQuestions = summary?.totalQuestions
        ?? room.dealQuestions?.length
        ?? room.questionCount
        ?? 0;
      if (summary) {
        scoreLabel = `${summary.score} / ${summary.maxScore} ${ptsSuffix}`;
        if (summary.rank === 1) {
          outcome = copy.history_outcome_first;
          outcomeType = '1st';
        } else if (summary.rank > 1) {
          outcome = formatCopyTemplate(copy.history_outcome_place_template, { rank: summary.rank });
          outcomeType = 'completed';
        }
        accuracy = `${summary.accuracyPercent}%`;
        speed = summary.avgSpeedSeconds != null ? `${summary.avgSpeedSeconds}s` : '—';
        rank = formatCopyTemplate(shared.modal_rank_of_template, {
          rank: summary.rank,
          total: room.players.length,
        });
      }
      return {
        game_code: room.roomId,
        categories: topicLabelsForRoom(room),
        date_label: formatMatchDateLabel(room.createdAt),
        score_label: scoreLabel,
        outcome,
        outcome_type: outcomeType,
        accuracy,
        speed,
        rank,
        rounds: summary
          ? `${summary.correctCount}/${summary.totalQuestions}`
          : `0/${totalQuestions}`,
        breakdown_href: `/rooms/${room.roomId}/breakdown?user=${encodeURIComponent(userId)}`,
      };
    });
}

async function loadResultsBundle(gamePin) {
  if (!isValidGamePin(gamePin)) return null;
  const room = await getGameRoom(gamePin);
  if (!room) return null;
  const secrets = await getGameRoomSecrets(gamePin);
  if (!secrets) return null;
  return { room, secrets };
}

module.exports = {
  BREAKDOWN_PAGE_SIZE,
  LEADERBOARD_PAGE_SIZE,
  buildDashboardMatchSummaries,
  buildMatchBreakdown,
  buildPlayerSummariesForCompletedRoom,
  computePlayerTelemetry,
  formatMatchDateLabel,
  listRecentMatchesForUser,
  loadResultsBundle,
  parseBreakdownPage,
  rankLeaderboard,
  topicLabelsForRoom,
};