const PACK_ID = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const HOST_DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);
const MIX = [
  { key: 'EASY', numer: 2 },
  { key: 'MEDIUM', numer: 2 },
  { key: 'HARD', numer: 1 },
];
const MIX_DENOM = 5;

function buildDeck({ topicPackIds, questionCount, difficulty, rng, questions }) {
  assertPackIds(topicPackIds);
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100) {
    throw new TypeError('questionCount must be an integer from 1 to 100');
  }
  const filter = normalizeDifficulty(difficulty);
  const random = typeof rng === 'function' ? rng : Math.random;
  const pool = Array.isArray(questions)
    ? questions
    : require('../db').listQuestionsByPackIds(topicPackIds);

  const groups = packQuotas(topicPackIds, questionCount).map(({ topicPackId, count }) => {
    const bank = pool.filter((question) => question && question.topicPackId === topicPackId);
    return selectForPack(bank, count, filter, random, topicPackId);
  });

  const secretDeck = interleave(groups).map((question) => shuffleQuestionOptions(question, random));
  const clientDeck = secretDeck.map(toClientQuestion);
  return { clientDeck, secretDeck };
}

function shuffleQuestionOptions(question, rng) {
  const copy = structuredClone(question);
  const letters = ['A', 'B', 'C', 'D'];
  const options = copy.options || [];
  if (options.length !== letters.length) {
    throw new TypeError('questions need 4 options before shuffle');
  }
  const correctText = options.find((option) => option.id === copy.correctAnswerId)?.text;
  if (!correctText) {
    throw new TypeError('correctAnswerId must match an option before shuffle');
  }
  const shuffled = shuffle(options, rng);
  copy.options = shuffled.map((option, index) => ({
    id: letters[index],
    text: option.text,
  }));
  const remapped = copy.options.find((option) => option.text === correctText);
  copy.correctAnswerId = remapped.id;
  return copy;
}

function packQuotas(topicPackIds, questionCount) {
  const base = Math.floor(questionCount / topicPackIds.length);
  const remainder = questionCount % topicPackIds.length;
  return topicPackIds.map((topicPackId, index) => ({
    topicPackId,
    count: base + (index < remainder ? 1 : 0),
  }));
}

function difficultyQuotas(total) {
  const rows = MIX.map((part, index) => {
    const product = total * part.numer;
    return {
      key: part.key,
      index,
      floor: Math.floor(product / MIX_DENOM),
      remainder: product % MIX_DENOM,
    };
  });
  let left = total - rows.reduce((sum, row) => sum + row.floor, 0);
  const ranked = [...rows].sort((leftRow, rightRow) => {
    if (rightRow.remainder !== leftRow.remainder) return rightRow.remainder - leftRow.remainder;
    return leftRow.index - rightRow.index;
  });
  const extras = new Map();
  while (left > 0) {
    for (const row of ranked) {
      if (left <= 0) break;
      extras.set(row.key, (extras.get(row.key) || 0) + 1);
      left -= 1;
    }
  }
  const quotas = {};
  for (const row of rows) {
    quotas[row.key] = row.floor + (extras.get(row.key) || 0);
  }
  return quotas;
}

function selectForPack(bank, count, filter, rng, topicPackId) {
  if (count === 0) return [];
  if (filter) {
    return take(bank.filter((question) => question.difficultyRating === filter), count, rng, topicPackId, filter);
  }
  const quotas = difficultyQuotas(count);
  const picked = [];
  for (const key of ['EASY', 'MEDIUM', 'HARD']) {
    picked.push(...take(
      bank.filter((question) => question.difficultyRating === key),
      quotas[key],
      rng,
      topicPackId,
      key,
    ));
  }
  return picked;
}

function take(pool, count, rng, topicPackId, difficulty) {
  if (count === 0) return [];
  if (pool.length < count) {
    throw new Error(`Not enough ${difficulty} questions in ${topicPackId} (need ${count}, have ${pool.length})`);
  }
  return shuffle(pool, rng).slice(0, count);
}

function interleave(groups) {
  const queues = groups.map((group) => group.slice());
  const deck = [];
  const total = queues.reduce((sum, queue) => sum + queue.length, 0);
  while (deck.length < total) {
    for (const queue of queues) {
      if (queue.length > 0) deck.push(queue.shift());
    }
  }
  return deck;
}

function shuffle(items, rng) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1, rng);
    const current = copy[index];
    copy[index] = copy[swap];
    copy[swap] = current;
  }
  return copy;
}

function randomIndex(length, rng) {
  const raw = Number(rng());
  const unit = raw > 0 && raw < 1 ? raw : 0;
  return Math.floor(unit * length);
}

function toClientQuestion(question) {
  return {
    questionId: question.questionId,
    topicPackId: question.topicPackId,
    category: question.category,
    tags: Array.isArray(question.tags) ? question.tags.slice() : [],
    difficultyRating: question.difficultyRating,
    basePoints: question.basePoints,
    questionText: question.questionText,
    options: (question.options || []).map((option) => ({ id: option.id, text: option.text })),
  };
}

function normalizeDifficulty(difficulty) {
  if (difficulty == null) return null;
  if (HOST_DIFFICULTIES.has(difficulty)) return difficulty;
  throw new TypeError('difficulty must be EASY, MEDIUM, or HARD');
}

function assertPackIds(topicPackIds) {
  if (!Array.isArray(topicPackIds) || topicPackIds.length < 1 || topicPackIds.length > 24) {
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

module.exports = {
  buildDeck,
  shuffleQuestionOptions,
};
