const PACK_ID = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OPTION_ID = /^[A-D]$/;
const QUESTION_DIFFICULTY = new Set(['EASY', 'MEDIUM', 'HARD']);
const MAX_PACK_LIMIT = 24;
const MAX_QUESTION_READ = 500;

const fs = require('node:fs');
const path = require('node:path');

const USERS_FILE = path.join(__dirname, '.data', 'users.json');
const GAME_ROOMS_FILE = path.join(__dirname, '.data', 'game_rooms.json');
const USER_UID = /^[A-Za-z0-9_-]{1,128}$/;

const ROOM_ID = /^\d{6}$/;

const memory = {
  topicPacks: new Map(),
  questions: new Map(),
  users: new Map(),
  gameRooms: new Map(),
};

let usersHydratedFromDisk = false;
let gameRoomsHydratedFromDisk = false;
let firestoreClient = null;
let firestoreClientOverride = null;
let gameRoomPersistenceOverride = null;

const roomUpdateChains = new Map();

let seeded = false;

function seed(dataset) {
  const source = dataset || require('./data/seed');
  if (!source || !Array.isArray(source.topicPacks) || !Array.isArray(source.questions)) {
    throw new TypeError('seed must include topicPacks and questions arrays');
  }

  const nextPacks = new Map();
  const nextQuestions = new Map();
  const counts = new Map();

  for (const question of source.questions) {
    validateQuestion(question);
    if (nextQuestions.has(question.questionId)) {
      throw new Error(`duplicate questionId ${question.questionId}`);
    }
    nextQuestions.set(question.questionId, structuredClone(question));
    counts.set(question.topicPackId, (counts.get(question.topicPackId) || 0) + 1);
  }

  for (const pack of source.topicPacks) {
    validatePack(pack);
    if (nextPacks.has(pack.topicPackId)) {
      throw new Error(`duplicate topicPackId ${pack.topicPackId}`);
    }
    nextPacks.set(pack.topicPackId, {
      ...toPublicPack(pack),
      totalQuestions: counts.get(pack.topicPackId) || 0,
    });
  }

  for (const question of nextQuestions.values()) {
    if (!nextPacks.has(question.topicPackId)) {
      throw new Error(`question ${question.questionId} references an unknown pack`);
    }
  }

  memory.topicPacks.clear();
  memory.questions.clear();
  for (const [id, pack] of nextPacks) memory.topicPacks.set(id, pack);
  for (const [id, question] of nextQuestions) memory.questions.set(id, question);
  seeded = true;
  return {
    topicPacks: memory.topicPacks.size,
    questions: memory.questions.size,
  };
}

function ensureSeeded() {
  if (!seeded) seed();
}

function listTopicPacks({ limit = MAX_PACK_LIMIT } = {}) {
  ensureSeeded();
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PACK_LIMIT) {
    throw new RangeError(`limit must be an integer from 1 to ${MAX_PACK_LIMIT}`);
  }
  return [...memory.topicPacks.values()].slice(0, limit).map((pack) => structuredClone(pack));
}

function listQuestionsByPackIds(topicPackIds, { limit = MAX_QUESTION_READ } = {}) {
  ensureSeeded();
  assertPackIds(topicPackIds);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_QUESTION_READ) {
    throw new RangeError(`question read limit must be an integer from 1 to ${MAX_QUESTION_READ}`);
  }
  const allowed = new Set(topicPackIds);
  const matches = [];
  for (const question of memory.questions.values()) {
    if (!allowed.has(question.topicPackId)) continue;
    matches.push(structuredClone(question));
  }
  if (matches.length > limit) {
    throw new RangeError(`question read exceeds limit of ${limit}`);
  }
  return matches;
}

function toPublicPack(pack) {
  return {
    topicPackId: pack.topicPackId,
    title: pack.title,
    slug: pack.slug,
    description: pack.description,
    category: pack.category,
    icon: pack.icon,
    totalQuestions: pack.totalQuestions,
    difficultyRating: pack.difficultyRating,
    isFeatured: pack.isFeatured,
  };
}

function assertPackIds(topicPackIds) {
  if (!Array.isArray(topicPackIds) || topicPackIds.length < 1 || topicPackIds.length > MAX_PACK_LIMIT) {
    throw new TypeError('topicPackIds must list between 1 and 24 packs');
  }
  const seen = new Set();
  for (const topicPackId of topicPackIds) {
    if (typeof topicPackId !== 'string' || !PACK_ID.test(topicPackId)) {
      throw new TypeError('invalid topicPackId');
    }
    if (seen.has(topicPackId)) throw new TypeError('duplicate topicPackId');
    seen.add(topicPackId);
  }
}

function validatePack(pack) {
  if (!pack || typeof pack !== 'object') throw new TypeError('invalid topic pack');
  if (typeof pack.topicPackId !== 'string' || !PACK_ID.test(pack.topicPackId)) {
    throw new TypeError('invalid topicPackId');
  }
  if (typeof pack.title !== 'string' || pack.title.trim() === '') throw new TypeError('invalid pack title');
  if (typeof pack.slug !== 'string' || !SLUG.test(pack.slug)) throw new TypeError('invalid pack slug');
  if (typeof pack.description !== 'string' || pack.description.trim() === '') {
    throw new TypeError('invalid pack description');
  }
  if (typeof pack.category !== 'string' || pack.category.trim() === '') {
    throw new TypeError('invalid pack category');
  }
  if (typeof pack.icon !== 'string' || !/^[a-z0-9_]+$/.test(pack.icon)) {
    throw new TypeError('invalid pack icon');
  }
  if (typeof pack.difficultyRating !== 'string' || pack.difficultyRating.trim() === '') {
    throw new TypeError('invalid pack difficultyRating');
  }
  if (typeof pack.isFeatured !== 'boolean') throw new TypeError('invalid isFeatured');
}

function validateQuestion(question) {
  if (!question || typeof question !== 'object') throw new TypeError('invalid question');
  if (typeof question.questionId !== 'string' || !/^[a-z0-9_]+$/.test(question.questionId)) {
    throw new TypeError('invalid questionId');
  }
  if (typeof question.topicPackId !== 'string' || !PACK_ID.test(question.topicPackId)) {
    throw new TypeError('invalid question topicPackId');
  }
  if (typeof question.category !== 'string' || question.category.trim() === '') {
    throw new TypeError('invalid question category');
  }
  if (!Array.isArray(question.tags) || question.tags.some((tag) => typeof tag !== 'string')) {
    throw new TypeError('invalid question tags');
  }
  if (!QUESTION_DIFFICULTY.has(question.difficultyRating)) {
    throw new TypeError('invalid question difficultyRating');
  }
  if (!Number.isInteger(question.basePoints) || question.basePoints < 1) {
    throw new TypeError('invalid basePoints');
  }
  if (typeof question.questionText !== 'string' || question.questionText.trim() === '') {
    throw new TypeError('invalid questionText');
  }
  if (!Array.isArray(question.options) || question.options.length !== 4) {
    throw new TypeError('questions need 4 options');
  }
  const optionIds = new Set();
  for (const option of question.options) {
    if (!option || typeof option.id !== 'string' || !OPTION_ID.test(option.id)) {
      throw new TypeError('invalid option id');
    }
    if (typeof option.text !== 'string' || option.text.trim() === '') {
      throw new TypeError('invalid option text');
    }
    if (optionIds.has(option.id)) throw new TypeError('duplicate option id');
    optionIds.add(option.id);
  }
  if (!optionIds.has(question.correctAnswerId)) {
    throw new TypeError('correctAnswerId must match an option');
  }
  if (typeof question.explanation !== 'string' || question.explanation.trim() === '') {
    throw new TypeError('invalid explanation');
  }
  if (!Array.isArray(question.sourceCitations) || question.sourceCitations.length < 1) {
    throw new TypeError('sourceCitations required');
  }
  for (const citation of question.sourceCitations) {
    if (!citation || typeof citation.title !== 'string' || citation.title.trim() === '') {
      throw new TypeError('invalid citation title');
    }
    if (typeof citation.link !== 'string' || !/^https:\/\/[^\s]+$/.test(citation.link)) {
      throw new TypeError('citation link must be https');
    }
  }
}

function assertUid(uid) {
  if (typeof uid !== 'string' || !USER_UID.test(uid)) {
    throw new TypeError('invalid uid');
  }
}

function shouldUseFirestore() {
  if (process.env.NODE_ENV === 'test') return false;
  if (String(process.env.DATA_BACKEND || '').toLowerCase() === 'memory') return false;
  if (String(process.env.DATA_BACKEND || '').toLowerCase() === 'firestore') return true;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;
  if (process.env.K_SERVICE) return true;
  if (process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT) return true;
  return false;
}

function shouldUseLocalGameRoomDisk() {
  if (process.env.NODE_ENV === 'test') return false;
  if (gameRoomsUseFirestore()) return false;
  return String(process.env.DATA_BACKEND || '').toLowerCase() === 'local';
}

function gameRoomsUseFirestore() {
  if (gameRoomPersistenceOverride === 'firestore') return true;
  if (gameRoomPersistenceOverride === 'memory') return false;
  return shouldUseFirestore();
}

function getFirestoreClient() {
  if (firestoreClientOverride) {
    return firestoreClientOverride;
  }
  if (!firestoreClient) {
    const { Firestore } = require('@google-cloud/firestore');
    firestoreClient = new Firestore();
  }
  return firestoreClient;
}

function setFirestoreClientForTest(client) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setFirestoreClientForTest is only available in test');
  }
  firestoreClientOverride = client;
}

function setGameRoomPersistenceForTest(mode) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setGameRoomPersistenceForTest is only available in test');
  }
  gameRoomPersistenceOverride = mode;
}

function resetGameRoomTestHooks() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetGameRoomTestHooks is only available in test');
  }
  firestoreClientOverride = null;
  gameRoomPersistenceOverride = null;
  roomUpdateChains.clear();
}

function gameRoomsCollection() {
  return getFirestoreClient().collection('game_rooms');
}

function withRoomUpdateLock(roomId, fn) {
  const previous = roomUpdateChains.get(roomId) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(fn);
  roomUpdateChains.set(
    roomId,
    next.finally(() => {
      if (roomUpdateChains.get(roomId) === next) {
        roomUpdateChains.delete(roomId);
      }
    }),
  );
  return next;
}

function toStoredProfile(uid, { handle, provider, updatedAt }) {
  if (typeof handle !== 'string' || !/^[A-Za-z0-9]{3,18}$/.test(handle)) {
    throw new TypeError('invalid handle');
  }
  if (typeof provider !== 'string' || provider.trim() === '') {
    throw new TypeError('invalid provider');
  }
  return {
    uid,
    handle,
    provider: provider.trim(),
    updatedAt: updatedAt || new Date().toISOString(),
  };
}

function sanitizeLoadedProfile(data, uid) {
  if (!data || typeof data !== 'object') return null;
  try {
    return toStoredProfile(uid, {
      handle: data.handle,
      provider: data.provider,
      updatedAt: data.updatedAt,
    });
  } catch {
    return null;
  }
}

function ensureUsersHydrated() {
  if (process.env.NODE_ENV === 'test' || usersHydratedFromDisk || shouldUseFirestore()) {
    return;
  }
  usersHydratedFromDisk = true;
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    for (const [uid, record] of Object.entries(parsed)) {
      if (!USER_UID.test(uid)) continue;
      const profile = sanitizeLoadedProfile(record, uid);
      if (profile) memory.users.set(uid, profile);
    }
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err;
  }
}

function persistUsersToDisk() {
  if (process.env.NODE_ENV === 'test' || shouldUseFirestore()) return;
  const payload = Object.fromEntries(memory.users.entries());
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function getUserProfile(uid) {
  assertUid(uid);
  if (process.env.NODE_ENV === 'test') {
    const profile = memory.users.get(uid);
    return profile ? structuredClone(profile) : null;
  }
  if (shouldUseFirestore()) {
    const snapshot = await getFirestoreClient().collection('users').doc(uid).get();
    if (!snapshot.exists) return null;
    return sanitizeLoadedProfile(snapshot.data(), uid);
  }
  ensureUsersHydrated();
  const profile = memory.users.get(uid);
  return profile ? structuredClone(profile) : null;
}

async function saveUserProfile(uid, { handle, provider }) {
  assertUid(uid);
  const record = toStoredProfile(uid, { handle, provider });
  if (process.env.NODE_ENV === 'test') {
    memory.users.set(uid, record);
    return structuredClone(record);
  }
  if (shouldUseFirestore()) {
    await getFirestoreClient().collection('users').doc(uid).set(record, { merge: true });
    return structuredClone(record);
  }
  ensureUsersHydrated();
  memory.users.set(uid, record);
  persistUsersToDisk();
  return structuredClone(record);
}

function resetUserProfilesForTest() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetUserProfilesForTest is only available in test');
  }
  memory.users.clear();
}

function assertRoomId(roomId) {
  if (typeof roomId !== 'string' || !ROOM_ID.test(roomId)) {
    throw new TypeError('invalid roomId');
  }
}

function validateGameRoom(room) {
  if (!room || typeof room !== 'object') throw new TypeError('invalid room');
  assertRoomId(room.roomId);
  if (typeof room.hostUserId !== 'string' || room.hostUserId.trim() === '') {
    throw new TypeError('invalid hostUserId');
  }
  if (!['WAITING', 'ACTIVE', 'COMPLETED'].includes(room.status)) {
    throw new TypeError('invalid room status');
  }
  if (typeof room.questionCount !== 'number' || !Number.isInteger(room.questionCount)) {
    throw new TypeError('invalid questionCount');
  }
  if (room.timeLimitPerQuestion !== 30) {
    throw new TypeError('timeLimitPerQuestion must be 30');
  }
  if (!Number.isInteger(room.currentQuestionIndex)) {
    throw new TypeError('invalid currentQuestionIndex');
  }
  if (!Array.isArray(room.topicPackIds)) {
    throw new TypeError('invalid topicPackIds');
  }
  if (!Array.isArray(room.players) || room.players.length < 1) {
    throw new TypeError('invalid players');
  }
  for (const player of room.players) {
    if (!player || typeof player.userId !== 'string' || player.userId.trim() === '') {
      throw new TypeError('invalid player userId');
    }
    if (typeof player.handle !== 'string' || player.handle.trim() === '') {
      throw new TypeError('invalid player handle');
    }
  }
  if (typeof room.createdAt !== 'string' || room.createdAt.trim() === '') {
    throw new TypeError('invalid createdAt');
  }
}

function sanitizeGameRoomForStorage(room) {
  validateGameRoom(room);
  const clone = structuredClone(room);
  delete clone.correctAnswerId;
  delete clone.explanation;
  delete clone.sourceCitations;
  delete clone.questions;
  delete clone.deck;
  delete clone.secrets;
  delete clone.email;
  delete clone.phone;
  if (Array.isArray(clone.players)) {
    clone.players = clone.players.map((player) => {
      const { userId, handle } = player;
      return { userId, handle };
    });
  }
  return clone;
}

function ensureGameRoomsHydrated() {
  if (process.env.NODE_ENV === 'test' || gameRoomsHydratedFromDisk || !shouldUseLocalGameRoomDisk()) {
    return;
  }
  gameRoomsHydratedFromDisk = true;
  try {
    const raw = fs.readFileSync(GAME_ROOMS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    for (const [roomId, record] of Object.entries(parsed)) {
      if (!ROOM_ID.test(roomId)) continue;
      try {
        memory.gameRooms.set(roomId, sanitizeGameRoomForStorage({ ...record, roomId }));
      } catch {
        /* skip invalid persisted room */
      }
    }
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err;
  }
}

function persistGameRoomsToDisk() {
  if (process.env.NODE_ENV === 'test' || !shouldUseLocalGameRoomDisk()) return;
  const payload = Object.fromEntries(memory.gameRooms.entries());
  fs.mkdirSync(path.dirname(GAME_ROOMS_FILE), { recursive: true });
  fs.writeFileSync(GAME_ROOMS_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function loadGameRoomFromMemory(roomId) {
  ensureGameRoomsHydrated();
  const room = memory.gameRooms.get(roomId);
  return room ? structuredClone(room) : null;
}

function writeGameRoomToMemory(record) {
  ensureGameRoomsHydrated();
  memory.gameRooms.set(record.roomId, record);
  persistGameRoomsToDisk();
}

async function createGameRoom(room) {
  const record = sanitizeGameRoomForStorage(room);
  if (gameRoomsUseFirestore()) {
    const ref = gameRoomsCollection().doc(record.roomId);
    try {
      await ref.create(record);
    } catch (err) {
      if (err && (err.code === 6 || err.code === 'already-exists')) {
        throw new Error('room already exists');
      }
      throw err;
    }
    return structuredClone(record);
  }
  if (memory.gameRooms.has(record.roomId)) {
    throw new Error('room already exists');
  }
  writeGameRoomToMemory(record);
  return structuredClone(record);
}

async function gameRoomExists(roomId) {
  assertRoomId(roomId);
  if (gameRoomsUseFirestore()) {
    const snap = await gameRoomsCollection().doc(roomId).get();
    return snap.exists;
  }
  ensureGameRoomsHydrated();
  return memory.gameRooms.has(roomId);
}

async function getGameRoom(roomId) {
  assertRoomId(roomId);
  if (gameRoomsUseFirestore()) {
    const snap = await gameRoomsCollection().doc(roomId).get();
    if (!snap.exists) return null;
    try {
      return sanitizeGameRoomForStorage({ ...snap.data(), roomId });
    } catch {
      return null;
    }
  }
  return loadGameRoomFromMemory(roomId);
}

async function updateGameRoom(roomId, updater) {
  assertRoomId(roomId);
  if (gameRoomsUseFirestore()) {
    return getFirestoreClient().runTransaction(async (transaction) => {
      const ref = gameRoomsCollection().doc(roomId);
      const snap = await transaction.get(ref);
      if (!snap.exists) {
        throw new Error('room not found');
      }
      const existing = sanitizeGameRoomForStorage({ ...snap.data(), roomId });
      const next = typeof updater === 'function' ? updater(structuredClone(existing)) : updater;
      const record = sanitizeGameRoomForStorage(next);
      if (record.roomId !== roomId) {
        throw new TypeError('roomId mismatch on update');
      }
      transaction.set(ref, record);
      return structuredClone(record);
    });
  }
  return withRoomUpdateLock(roomId, async () => {
    const existing = loadGameRoomFromMemory(roomId);
    if (!existing) {
      throw new Error('room not found');
    }
    const next = typeof updater === 'function' ? updater(structuredClone(existing)) : updater;
    const record = sanitizeGameRoomForStorage(next);
    if (record.roomId !== roomId) {
      throw new TypeError('roomId mismatch on update');
    }
    writeGameRoomToMemory(record);
    return structuredClone(record);
  });
}

function resetGameRoomsForTest() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetGameRoomsForTest is only available in test');
  }
  memory.gameRooms.clear();
  resetGameRoomTestHooks();
}

module.exports = {
  seed,
  assertPackIds,
  listTopicPacks,
  listQuestionsByPackIds,
  getUserProfile,
  saveUserProfile,
  resetUserProfilesForTest,
  createGameRoom,
  gameRoomExists,
  getGameRoom,
  updateGameRoom,
  resetGameRoomsForTest,
  setFirestoreClientForTest,
  setGameRoomPersistenceForTest,
  shouldUseFirestore,
};
