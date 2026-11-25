const PACK_ID = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

function buildDeck({ topicPackIds, questionCount, rng, questions }) {
  assertPackIds(topicPackIds);
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100) {
    throw new TypeError('questionCount must be an integer from 1 to 100');
  }
  const random = typeof rng === 'function' ? rng : Math.random;
  const pool = Array.isArray(questions)
    ? questions
    : require('../db').listQuestionsByPackIds(topicPackIds);
  const allowed = new Set(topicPackIds);
  const matches = pool.filter((question) => question && allowed.has(question.topicPackId));
  if (matches.length < questionCount) {
    throw new RangeError(`need at least ${questionCount} questions across selected packs`);
  }
  const picked = shuffle(matches, random).slice(0, questionCount);
  const secretDeck = picked.map((question) => shuffleQuestionOptions(question, random));
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
    questionText: question.questionText,
    options: (question.options || []).map((option) => ({ id: option.id, text: option.text })),
  };
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