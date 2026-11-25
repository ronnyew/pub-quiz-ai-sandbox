const PACK_ID = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OPTION_ID = /^[A-D]$/;
const QUESTION_DIFFICULTY = new Set(['EASY', 'MEDIUM', 'HARD']);
const MAX_PACK_LIMIT = 24;
const MAX_QUESTION_READ = 500;

const fs = require('node:fs');
const path = require('node:path');

const USERS_FILE = path.join(__dirname, '.data', 'users.json');
const USER_UID = /^[A-Za-z0-9_-]{1,128}$/;

const memory = {
  topicPacks: new Map(),
  questions: new Map(),
  users: new Map(),
};

let usersHydratedFromDisk = false;
let firestoreClient = null;

let seeded = false;

function assertMemoryStore() {
  if (process.env.NODE_ENV === 'test') return;
  if (process.env.DATA_BACKEND === 'firestore') {
    throw new Error('Firestore backend is not available in this build');
  }
}

function seed(dataset) {
  assertMemoryStore();
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
  assertMemoryStore();
  ensureSeeded();
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PACK_LIMIT) {
    throw new RangeError(`limit must be an integer from 1 to ${MAX_PACK_LIMIT}`);
  }
  return [...memory.topicPacks.values()].slice(0, limit).map((pack) => structuredClone(pack));
}

function listQuestionsByPackIds(topicPackIds, { limit = MAX_QUESTION_READ } = {}) {
  assertMemoryStore();
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
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;
  if (process.env.K_SERVICE) return true;
  if (process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT) return true;
  return false;
}

function getFirestoreClient() {
  if (!firestoreClient) {
    const { Firestore } = require('@google-cloud/firestore');
    firestoreClient = new Firestore();
  }
  return firestoreClient;
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

module.exports = {
  seed,
  listTopicPacks,
  listQuestionsByPackIds,
  getUserProfile,
  saveUserProfile,
  resetUserProfilesForTest,
};
