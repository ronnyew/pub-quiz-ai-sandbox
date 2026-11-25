const { assertPackIds, createGameRoom, getGameRoom, updateGameRoom } = require('../db');

const { formatCopyTemplate, getStaticCopy } = require('./content-store');

const GAME_PIN_RE = /^\d{6}$/;
const PACK_PAGE_SIZE = 6;
const DEFAULT_QUESTION_COUNT = 10;
const MAX_PIN_ATTEMPTS = 5;
const DEFAULT_PUBLIC_BASE_URL = 'https://pubquiz.app';

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

const joinWaitingRoom = ({ roomId, userId, handle }) => joinWaitingGame({
  gamePin: roomId,
  userId,
  handle,
});

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
  buildInviteUrl,
  createWaitingGame,
  createWaitingRoom,
  filterAndPageTopicPacks,
  getPublicGame,
  getPublicRoom,
  isValidGamePin,
  isValidRoomPin,
  joinWaitingGame,
  joinWaitingRoom,
  reserveGamePin,
  reserveRoomPin,
  resolvePublicBaseUrl,
  saveLobbyPackSelection,
  toPublicGameJson,
  toPublicRoomJson,
  isRoomAlreadyExistsError,
  DEFAULT_PUBLIC_BASE_URL,
};