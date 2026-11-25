const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
delete process.env.GOOGLE_CLOUD_PROJECT;
delete process.env.GCLOUD_PROJECT;
delete process.env.DATA_BACKEND;

const { buildDeck } = require('../lib/sample-deck');

function makeQuestion(topicPackId, index) {
  return {
    questionId: `${topicPackId}_q${String(index).padStart(2, '0')}`,
    topicPackId,
    category: 'Test',
    basePoints: 10,
    questionText: `Question ${topicPackId} ${index}?`,
    options: [
      { id: 'A', text: 'Alpha' },
      { id: 'B', text: 'Beta' },
      { id: 'C', text: 'Gamma' },
      { id: 'D', text: 'Delta' },
    ],
    correctAnswerId: 'A',
    explanation: `Because ${topicPackId} ${index}.`,
    sourceCitations: [{ title: 'Seed Notes', link: 'https://example.com/notes' }],
  };
}

function bank(topicPackIds, perPack) {
  const questions = [];
  for (const topicPackId of topicPackIds) {
    for (let index = 1; index <= perPack; index += 1) {
      questions.push(makeQuestion(topicPackId, index));
    }
  }
  return questions;
}

test('buildDeck pools selected packs, shuffles, and slices questionCount', () => {
  const topicPackIds = ['pack_a', 'pack_b', 'pack_c'];
  const { clientDeck } = buildDeck({
    topicPackIds,
    questionCount: 10,
    rng: () => 0.5,
    questions: bank(topicPackIds, 12),
  });
  assert.equal(clientDeck.length, 10);
  const allowed = new Set(topicPackIds);
  assert.ok(clientDeck.every((question) => allowed.has(
    bank(topicPackIds, 12).find((row) => row.questionId === question.questionId).topicPackId,
  )));
});

test('buildDeck rejects when pool smaller than questionCount', () => {
  assert.throws(
    () => buildDeck({
      topicPackIds: ['pack_a'],
      questionCount: 10,
      rng: () => 0.5,
      questions: bank(['pack_a'], 5),
    }),
    RangeError,
  );
});

test('client deck drops answer keys and has no difficulty or tags fields', () => {
  const { clientDeck, secretDeck } = buildDeck({
    topicPackIds: ['pack_a', 'pack_b'],
    questionCount: 4,
    rng: () => 0.5,
    questions: bank(['pack_a', 'pack_b'], 10),
  });
  assert.equal(clientDeck.length, secretDeck.length);
  for (const question of clientDeck) {
    assert.equal(Object.hasOwn(question, 'difficultyRating'), false);
    assert.equal(Object.hasOwn(question, 'tags'), false);
    assert.equal(Object.hasOwn(question, 'correctAnswerId'), false);
    assert.equal(Object.hasOwn(question, 'explanation'), false);
  }
});

test('seed bank has at least ten questions per pack', () => {
  const { topicPacks, questions } = require('../data/seed');
  for (const pack of topicPacks) {
    const count = questions.filter((question) => question.topicPackId === pack.topicPackId).length;
    assert.ok(count >= 10, `${pack.topicPackId} has ${count} questions`);
  }
});

test('buildDeck shuffles option order independently per question', () => {
  const { questions } = require('../data/seed');
  const packId = 'pop_culture_01';
  const pool = questions.filter((question) => question.topicPackId === packId);
  let sawShuffle = false;
  for (let trial = 0; trial < 24; trial += 1) {
    let step = 0;
    const rng = () => ((trial * 0.13 + step++ * 0.29) % 0.98) + 0.01;
    const { secretDeck } = buildDeck({
      topicPackIds: [packId],
      questionCount: 5,
      rng,
      questions: pool,
    });
    for (const dealt of secretDeck) {
      const canonical = pool.find((question) => question.questionId === dealt.questionId);
      const bankOrder = canonical.options.map((option) => option.text).join('\0');
      const dealOrder = dealt.options.map((option) => option.text).join('\0');
      if (bankOrder !== dealOrder) sawShuffle = true;
      const correctText = canonical.options.find((option) => option.id === canonical.correctAnswerId).text;
      const dealtCorrect = dealt.options.find((option) => option.id === dealt.correctAnswerId);
      assert.equal(dealtCorrect.text, correctText);
    }
  }
  assert.equal(sawShuffle, true);
});