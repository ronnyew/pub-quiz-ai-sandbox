const crypto = require('node:crypto');

const {
  assertPackIds,
  createGameRoom,
  getGameRoom,
  getGameRoomSecrets,
  listQuestionsByPackIds,
  runGameRoomBundleTransaction,
  runGameRoomLaunchTransaction,
  updateGameRoom,
} = require('../db');
const { buildDeck } = require('./sample-deck');
const { gradeAnswer } = require('./grade');

const { formatCopyTemplate, getStaticCopy } = require('./content-store');

const GAME_PIN_RE = /^\d{6}$/;
const PACK_PAGE_SIZE = 6;
const DEFAULT_QUESTION_COUNT = 10;
const MAX_DEAL_QUESTIONS = 100;
const MAX_PIN_ATTEMPTS = 5;
const DEFAULT_PUBLIC_BASE_URL = 'https://pubquiz.app';
const QUESTION_WINDOW_MS = 30_000;
const OPTION_ID = /^[A-D]$/;

function isValidGamePin(gamePin) {
  return typeof gamePin === 'string' && GAME_PIN_RE.test(gamePin);
}

/** @deprecated alias */
const isValidRoomPin = isValidGamePin;

function generateGamePin(rng = Math.random) {
  const n = Math.floor(rng() * 1_000_000);
  return String(n).padStart(6, '0');
}

async function reserveGamePin({ exists, rng = Math.random, maxAttempts = MAX_PIN_ATTEMPTS }) {
  if (typeof exists !== 'function') {
    throw new TypeError('exists callback required');
  }
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const gamePin = generateGamePin(rng);
    if (isValidGamePin(gamePin) && !(await exists(gamePin))) {
      return gamePin;
    }
  }
  throw new Error('game pin reservation failed');
}

const reserveRoomPin = reserveGamePin;

function resolvePublicBaseUrl(req) {
  const fromEnv = (process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }
  if (!req) {
    return DEFAULT_PUBLIC_BASE_URL;
  }
  const forwarded = req.headers?.['x-forwarded-proto'];
  const proto = req.secure || (typeof forwarded === 'string' && forwarded.split(',')[0].trim() === 'https')
    ? 'https'
    : 'http';
  const host = req.get?.('host') || '';
  if (!host) {
    return DEFAULT_PUBLIC_BASE_URL;
  }
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function buildInviteUrl(gamePin, baseUrl) {
  if (!isValidGamePin(gamePin)) {
    throw new TypeError('invalid game pin');
  }
  const base = (baseUrl || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');
  return `${base}/join?game=${gamePin}`;
}

function searchTopicPacks(packs, searchText) {
  const query = (searchText || '').trim().toLowerCase();
  if (!query) {
    return packs;
  }
  return packs.filter((pack) => {
    const haystack = `${pack.title} ${pack.category} ${pack.description}`.toLowerCase();
    return haystack.includes(query);
  });
}

function pageTopicPacks(packs, page = 1, pageSize = PACK_PAGE_SIZE) {
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const total = packs.length;
  const startIndex = (safePage - 1) * pageSize;
  const slice = packs.slice(startIndex, startIndex + pageSize);
  const startDisplay = total === 0 ? 0 : startIndex + 1;
  const endDisplay = total === 0 ? 0 : Math.min(startIndex + pageSize, total);
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  const pagerLabel = formatCopyTemplate(getStaticCopy().shared.topics_pager_template, {
    start: startDisplay,
    end: endDisplay,
    total,
  });
  return {
    packs: slice,
    total,
    page: safePage,
    pageSize,
    totalPages,
    pagerLabel,
    start: startDisplay,
    end: endDisplay,
  };
}

function filterAndPageTopicPacks(allPacks, { search = '', page = 1 } = {}) {
  const filtered = searchTopicPacks(allPacks, search);
  return pageTopicPacks(filtered, page);
}

function toPublicGameJson(room) {
  if (!room) return null;
  return {
    gamePin: room.roomId,
    hostUserId: room.hostUserId,
    status: room.status,
    topicPackIds: Array.isArray(room.topicPackIds) ? [...room.topicPackIds] : [],
    questionCount: room.questionCount,
    timeLimitPerQuestion: room.timeLimitPerQuestion,
    currentQuestionIndex: room.currentQuestionIndex,
    players: Array.isArray(room.players)
      ? room.players.map((player) => ({
          userId: player.userId,
          handle: player.handle,
        }))
      : [],
    createdAt: room.createdAt,
  };
}

const toPublicRoomJson = toPublicGameJson;

async function createWaitingGame({ hostUserId, hostHandle, rng }) {
  if (typeof hostUserId !== 'string' || hostUserId.trim() === '') {
    throw new TypeError('hostUserId required');
  }
  if (typeof hostHandle !== 'string' || hostHandle.trim() === '') {
    throw new TypeError('hostHandle required');
  }
  for (let attempt = 0; attempt < MAX_PIN_ATTEMPTS; attempt += 1) {
    const gamePin = generateGamePin(rng);
    if (!isValidGamePin(gamePin)) continue;
    const room = {
      roomId: gamePin,
      hostUserId,
      status: 'WAITING',
      topicPackIds: [],
      questionCount: DEFAULT_QUESTION_COUNT,
      timeLimitPerQuestion: 30,
      currentQuestionIndex: -1,
      players: [{ userId: hostUserId, handle: hostHandle.trim() }],
      createdAt: new Date().toISOString(),
    };
    try {
      await createGameRoom(room);
      return room;
    } catch (err) {
      if (!isRoomAlreadyExistsError(err)) {
        throw err;
      }
    }
  }
  throw new Error('game pin reservation failed');
}

function isRoomAlreadyExistsError(err) {
  if (!err) return false;
  if (err.message === 'room already exists') return true;
  return err.code === 6 || err.code === 'already-exists';
}

const createWaitingRoom = createWaitingGame;

async function getPublicGame(gamePin) {
  if (!isValidGamePin(gamePin)) {
    return null;
  }
  const room = await getGameRoom(gamePin);
  return toPublicGameJson(room);
}

const getPublicRoom = getPublicGame;

async function joinWaitingGame({ gamePin, userId, handle }) {
  if (!isValidGamePin(gamePin)) {
    throw new TypeError('invalid game pin');
  }
  const room = await getGameRoom(gamePin);
  if (!room) {
    return { ok: false, reason: 'not_found' };
  }
  if (room.status !== 'WAITING') {
    return { ok: false, reason: 'not_waiting' };
  }
  const trimmedHandle = typeof handle === 'string' ? handle.trim() : '';
  if (!trimmedHandle) {
    return { ok: false, reason: 'handle_required' };
  }
  await updateGameRoom(gamePin, (current) => {
    if (current.players.some((player) => player.userId === userId)) {
      return current;
    }
    return {
      ...current,
      players: [...current.players, { userId, handle: trimmedHandle }],
    };
  });
  return { ok: true, room: await getGameRoom(gamePin) };
}

async function joinActiveGame({ gamePin, userId, handle }) {
  if (!isValidGamePin(gamePin)) {
    throw new TypeError('invalid game pin');
  }
  const room = await getGameRoom(gamePin);
  if (!room) {
    return { ok: false, reason: 'not_found' };
  }
  if (room.status !== 'ACTIVE') {
    return { ok: false, reason: 'not_active' };
  }
  const trimmedHandle = typeof handle === 'string' ? handle.trim() : '';
  if (!trimmedHandle) {
    return { ok: false, reason: 'handle_required' };
  }
  await updateGameRoom(gamePin, (current) => {
    const existing = current.players.some((player) => player.userId === userId);
    if (existing) {
      return current;
    }
    const nextScores = { ...(current.scores || {}) };
    nextScores[userId] = nextScores[userId] || 0;
    return {
      ...current,
      players: [...current.players, { userId, handle: trimmedHandle }],
      scores: nextScores,
    };
  });
  return { ok: true, room: await getGameRoom(gamePin) };
}

const joinWaitingRoom = ({ roomId, userId, handle }) => joinWaitingGame({
  gamePin: roomId,
  userId,
  handle,
});

function defaultNow(now) {
  return Number.isFinite(now) ? now : Date.now();
}

function toSecretQuestion(question) {
  return {
    questionId: question.questionId,
    correctAnswerId: question.correctAnswerId,
    basePoints: question.basePoints,
    explanation: question.explanation,
    sourceCitations: question.sourceCitations.map((entry) => ({
      title: entry.title,
      link: entry.link,
    })),
  };
}

function isPlayerInRoom(room, userId) {
  return Boolean(userId && room.players?.some((player) => player.userId === userId));
}

function isRoundClosed({ room, secrets, now }) {
  const at = defaultNow(now);
  const publicQuestion = room.dealQuestions?.[secrets.currentQuestionIndex];
  if (!publicQuestion) return false;
  const playersReady = countReady(secrets.responses, publicQuestion.questionId);
  return at >= secrets.closesAt || playersReady >= room.players.length;
}

function roundPhaseFor({ room, secrets, now }) {
  return isRoundClosed({ room, secrets, now }) ? 'REVEAL' : 'OPEN';
}

function initialScores(players) {
  const scores = {};
  for (const player of players || []) {
    scores[player.userId] = 0;
  }
  return scores;
}

function countReady(responses, questionId) {
  return responses.filter((entry) => entry.questionId === questionId).length;
}

function resolveLaunchQuestionCount(topicPackIds) {
  const pool = listQuestionsByPackIds(topicPackIds);
  if (pool.length < 1) return 0;
  return Math.min(pool.length, MAX_DEAL_QUESTIONS);
}

async function launchActiveGame({
  gamePin,
  hostUserId,
  topicPackIds,
  questionCount,
  rng = Math.random,
  now,
}) {
  if (!isValidGamePin(gamePin)) {
    throw new TypeError('invalid game pin');
  }
  assertPackIds(topicPackIds);
  const room = await getGameRoom(gamePin);
  if (!room) {
    return { ok: false, reason: 'not_found' };
  }
  if (room.hostUserId !== hostUserId) {
    return { ok: false, reason: 'forbidden' };
  }
  if (room.status !== 'WAITING') {
    return { ok: false, reason: 'not_waiting' };
  }
  const existingSecrets = await getGameRoomSecrets(gamePin);
  if (existingSecrets) {
    return { ok: false, reason: 'already_launched' };
  }
  const poolSize = listQuestionsByPackIds(topicPackIds).length;
  const requestedCount = Number.isInteger(questionCount)
    ? questionCount
    : resolveLaunchQuestionCount(topicPackIds);
  if (requestedCount < 1 || poolSize < requestedCount) {
    return { ok: false, reason: 'insufficient_questions' };
  }
  const openedAt = defaultNow(now);
  let clientDeck;
  let secretDeck;
  try {
    const built = buildDeck({
      topicPackIds,
      questionCount: requestedCount,
      rng,
    });
    clientDeck = built.clientDeck;
    secretDeck = built.secretDeck;
  } catch {
    return { ok: false, reason: 'insufficient_questions' };
  }
  const dealCount = clientDeck.length;
  const secretQuestions = secretDeck.map(toSecretQuestion);
  const nextRoom = {
    ...room,
    status: 'ACTIVE',
    topicPackIds: [...topicPackIds],
    questionCount: dealCount,
    currentQuestionIndex: 0,
    dealQuestions: clientDeck,
    scores: initialScores(room.players),
  };
  const secrets = {
    roomId: gamePin,
    secretQuestions,
    currentQuestionIndex: 0,
    openedAt,
    closesAt: openedAt + QUESTION_WINDOW_MS,
    advancedThroughIndex: -1,
    responses: [],
  };
  try {
    await runGameRoomLaunchTransaction(gamePin, { nextRoom, nextSecrets: secrets });
  } catch (err) {
    if (err && err.message === 'not_waiting') {
      return { ok: false, reason: 'not_waiting' };
    }
    if (err && err.message === 'secrets already exist') {
      return { ok: false, reason: 'already_launched' };
    }
    if (err && err.message === 'room not found') {
      return { ok: false, reason: 'not_found' };
    }
    return { ok: false, reason: 'already_launched' };
  }
  return { ok: true, room: await getGameRoom(gamePin), secrets: await getGameRoomSecrets(gamePin) };
}

function projectQuestionPayload({ room, secrets, userId, now }) {
  if (room.status !== 'ACTIVE') {
    return { ok: false, reason: 'not_active' };
  }
  const index = secrets.currentQuestionIndex;
  const publicQuestion = room.dealQuestions[index];
  const secretQuestion = secrets.secretQuestions[index];
  if (!publicQuestion || !secretQuestion) {
    return { ok: false, reason: 'no_question' };
  }
  const playersReady = countReady(secrets.responses, publicQuestion.questionId);
  const allPlayersAnswered = playersReady >= room.players.length;
  const phase = roundPhaseFor({ room, secrets, now });
  const playerResponse = userId
    ? secrets.responses.find(
      (entry) => entry.questionId === publicQuestion.questionId && entry.userId === userId,
    )
    : null;
  const payload = {
    gamePin: room.roomId,
    status: room.status,
    roundPhase: phase,
    questionIndex: index,
    questionCount: room.questionCount,
    questionId: publicQuestion.questionId,
    questionText: publicQuestion.questionText,
    options: publicQuestion.options,
    openedAt: secrets.openedAt,
    closesAt: secrets.closesAt,
    playersReady,
    playersTotal: room.players.length,
    allPlayersAnswered,
    playerAnswer: playerResponse
      ? {
          selectedAnswerId: playerResponse.selectedAnswerId,
          locked: true,
        }
      : null,
  };
  if (phase === 'REVEAL') {
    payload.reveal = {
      correctAnswerId: secretQuestion.correctAnswerId,
    };
    if (playerResponse) {
      payload.playerAnswer = {
        ...payload.playerAnswer,
        isCorrect: playerResponse.isCorrect,
        pointsAwarded: playerResponse.pointsAwarded,
      };
    }
    payload.scores = { ...(room.scores || {}) };
  }
  return { ok: true, payload };
}

function redactSubmitResponse(meta, { room, secrets, now }) {
  if (!meta?.ok || !meta.response) return meta;
  const phase = roundPhaseFor({ room, secrets, now });
  const { selectedAnswerId, timestamp } = meta.response;
  const body = {
    ok: true,
    locked: true,
    selectedAnswerId,
    receivedAt: timestamp,
    roundPhase: phase,
  };
  if (phase === 'REVEAL') {
    body.isCorrect = meta.response.isCorrect;
    body.pointsAwarded = meta.response.pointsAwarded;
  }
  return body;
}

async function getGameplayQuestionJson({ gamePin, userId, now }) {
  if (!isValidGamePin(gamePin)) {
    return null;
  }
  const room = await getGameRoom(gamePin);
  if (!room) {
    return null;
  }
  if (room.status === 'COMPLETED') {
    return {
      gamePin: room.roomId,
      status: 'COMPLETED',
    };
  }
  if (!isPlayerInRoom(room, userId)) {
    return { forbidden: true };
  }
  const secrets = await getGameRoomSecrets(gamePin);
  if (!secrets) {
    return null;
  }
  const projected = projectQuestionPayload({ room, secrets, userId, now });
  return projected.ok ? projected.payload : null;
}

async function submitGameAnswer({
  gamePin,
  userId,
  selectedAnswerId,
  now,
  clientLatencyMs: _clientLatencyMs,
}) {
  if (!isValidGamePin(gamePin)) {
    return { ok: false, reason: 'invalid_pin' };
  }
  if (typeof userId !== 'string' || userId.trim() === '') {
    return { ok: false, reason: 'unauthorized' };
  }
  if (typeof selectedAnswerId !== 'string' || !OPTION_ID.test(selectedAnswerId)) {
    return { ok: false, reason: 'invalid_answer' };
  }
  const receivedAt = defaultNow(now);
  try {
    const bundle = await runGameRoomBundleTransaction(gamePin, ({ room, secrets }) => {
      if (room.status !== 'ACTIVE') {
        return { room, secrets, meta: { ok: false, reason: 'not_active' } };
      }
      if (!room.players.some((player) => player.userId === userId)) {
        return { room, secrets, meta: { ok: false, reason: 'not_player' } };
      }
      const index = secrets.currentQuestionIndex;
      const publicQuestion = room.dealQuestions[index];
      const secretQuestion = secrets.secretQuestions[index];
      if (!publicQuestion || !secretQuestion) {
        return { room, secrets, meta: { ok: false, reason: 'no_question' } };
      }
      const already = secrets.responses.find(
        (entry) => entry.questionId === publicQuestion.questionId && entry.userId === userId,
      );
      if (already) {
        return { room, secrets, meta: { ok: false, reason: 'already_answered' } };
      }
      const graded = gradeAnswer({
        correctAnswerId: secretQuestion.correctAnswerId,
        selectedAnswerId,
        basePoints: secretQuestion.basePoints,
        receivedAt,
        openedAt: secrets.openedAt,
        closesAt: secrets.closesAt,
      });
      const response = {
        responseId: `resp_${crypto.randomBytes(6).toString('hex')}`,
        questionId: publicQuestion.questionId,
        userId,
        selectedAnswerId,
        isCorrect: graded.isCorrect,
        latencyMs: graded.latencyMs,
        pointsAwarded: graded.pointsAwarded,
        timestamp: receivedAt,
      };
      const nextSecrets = {
        ...secrets,
        responses: [...secrets.responses, response],
      };
      const nextScores = { ...(room.scores || {}) };
      nextScores[userId] = (nextScores[userId] || 0) + graded.pointsAwarded;
      const nextRoom = {
        ...room,
        scores: nextScores,
      };
      return {
        room: nextRoom,
        secrets: nextSecrets,
        meta: { ok: true, response },
      };
    });
    const meta = bundle.meta || { ok: false, reason: 'unknown' };
    if (!meta.ok) return meta;
    return redactSubmitResponse(meta, {
      room: bundle.room,
      secrets: bundle.secrets,
      now: receivedAt,
    });
  } catch {
    return { ok: false, reason: 'not_found' };
  }
}

async function advanceGameQuestion({ gamePin, now, hostUserId }) {
  if (!isValidGamePin(gamePin)) {
    return { ok: false, reason: 'invalid_pin' };
  }
  const room = await getGameRoom(gamePin);
  if (!room) {
    return { ok: false, reason: 'not_found', advanced: false };
  }
  if (!hostUserId || !isPlayerInRoom(room, hostUserId)) {
    return { ok: false, reason: 'forbidden', advanced: false };
  }
  if (room.hostUserId !== hostUserId) {
    return { ok: false, reason: 'forbidden', advanced: false };
  }
  const at = defaultNow(now);
  try {
    const bundle = await runGameRoomBundleTransaction(gamePin, ({ room: activeRoom, secrets }) => {
      if (activeRoom.status !== 'ACTIVE') {
        return { room: activeRoom, secrets, meta: { ok: false, reason: 'not_active', advanced: false } };
      }
      if (activeRoom.hostUserId !== hostUserId) {
        return { room: activeRoom, secrets, meta: { ok: false, reason: 'forbidden', advanced: false } };
      }
      if (!isPlayerInRoom(activeRoom, hostUserId)) {
        return { room: activeRoom, secrets, meta: { ok: false, reason: 'forbidden', advanced: false } };
      }
      const room = activeRoom;
      const closedIndex = secrets.currentQuestionIndex;
      const currentQuestion = room.dealQuestions[closedIndex];
      const readyCount = currentQuestion
        ? countReady(secrets.responses, currentQuestion.questionId)
        : 0;
      const allAnswered = readyCount >= room.players.length;
      const timerExpired = at > secrets.closesAt;
      if (!timerExpired && !allAnswered) {
        return { room, secrets, meta: { ok: true, advanced: false } };
      }
      if (secrets.advancedThroughIndex >= closedIndex) {
        return { room, secrets, meta: { ok: true, advanced: false } };
      }
      const nextIndex = closedIndex + 1;
      let nextRoom = { ...room };
      let nextSecrets = {
        ...secrets,
        advancedThroughIndex: closedIndex,
      };
      if (nextIndex >= room.dealQuestions.length) {
        nextRoom = {
          ...nextRoom,
          status: 'COMPLETED',
          currentQuestionIndex: closedIndex,
        };
        return {
          room: nextRoom,
          secrets: nextSecrets,
          meta: { ok: true, advanced: true, completed: true },
        };
      }
      nextRoom = {
        ...nextRoom,
        currentQuestionIndex: nextIndex,
      };
      nextSecrets = {
        ...nextSecrets,
        currentQuestionIndex: nextIndex,
        openedAt: at,
        closesAt: at + QUESTION_WINDOW_MS,
      };
      return {
        room: nextRoom,
        secrets: nextSecrets,
        meta: { ok: true, advanced: true, completed: false },
      };
    });
    return bundle.meta || { ok: false, advanced: false };
  } catch {
    return { ok: false, reason: 'not_found', advanced: false };
  }
}

async function saveLobbyPackSelection({ gamePin, hostUserId, topicPackIds, roomId }) {
  const pin = gamePin || roomId;
  if (!isValidGamePin(pin)) {
    throw new TypeError('invalid game pin');
  }
  assertPackIds(topicPackIds);
  const room = await getGameRoom(pin);
  if (!room) {
    return { ok: false, reason: 'not_found' };
  }
  if (room.hostUserId !== hostUserId) {
    return { ok: false, reason: 'forbidden' };
  }
  if (room.status !== 'WAITING') {
    return { ok: false, reason: 'not_waiting' };
  }
  await updateGameRoom(pin, (current) => ({
    ...current,
    topicPackIds: [...topicPackIds],
  }));
  return { ok: true, room: await getGameRoom(pin) };
}

module.exports = {
  PACK_PAGE_SIZE,
  QUESTION_WINDOW_MS,
  advanceGameQuestion,
  buildInviteUrl,
  createWaitingGame,
  createWaitingRoom,
  filterAndPageTopicPacks,
  getGameplayQuestionJson,
  getPublicGame,
  getPublicRoom,
  isValidGamePin,
  isValidRoomPin,
  joinWaitingGame,
  joinActiveGame,
  joinWaitingRoom,
  launchActiveGame,
  resolveLaunchQuestionCount,
  reserveGamePin,
  reserveRoomPin,
  resolvePublicBaseUrl,
  saveLobbyPackSelection,
  submitGameAnswer,
  toPublicGameJson,
  toPublicRoomJson,
  isRoomAlreadyExistsError,
  DEFAULT_PUBLIC_BASE_URL,
};