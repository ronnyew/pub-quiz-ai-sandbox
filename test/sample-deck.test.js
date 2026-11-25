const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
delete process.env.GOOGLE_CLOUD_PROJECT;
delete process.env.GCLOUD_PROJECT;
delete process.env.DATA_BACKEND;

const { buildDeck } = require('../lib/sample-deck');

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];

function makeQuestion(topicPackId, difficultyRating, index) {
  return {
    questionId: `${topicPackId}_${difficultyRating}_${index}`,
    topicPackId,
    category: 'Test',
    tags: ['test', difficultyRating.toLowerCase()],
    difficultyRating,
    basePoints: 10,
    questionText: `Question ${topicPackId} ${difficultyRating} ${index}?`,
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

function bank(topicPackIds, perDifficulty) {
  const questions = [];
  for (const topicPackId of topicPackIds) {
    for (const difficultyRating of DIFFICULTIES) {
      for (let index = 0; index < perDifficulty; index += 1) {
        questions.push(makeQuestion(topicPackId, difficultyRating, index));
      }
    }
  }
  return questions;
}

function countsBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function assertNoAdjacentWhileOthersRemain(deck, topicPackIds, questionCount) {
  const base = Math.floor(questionCount / topicPackIds.length);
  const remainder = questionCount % topicPackIds.length;
  const quota = new Map(
    topicPackIds.map((id, index) => [id, base + (index < remainder ? 1 : 0)]),
  );
  const used = new Map(topicPackIds.map((id) => [id, 0]));

  for (let index = 0; index < deck.length; index += 1) {
    const topicPackId = deck[index].topicPackId;
    if (index > 0 && deck[index - 1].topicPackId === topicPackId) {
      const otherPackStillHasCards = topicPackIds.some(
        (otherId) => otherId !== topicPackId && used.get(otherId) < quota.get(otherId),
      );
      assert.equal(
        otherPackStillHasCards,
        false,
        `adjacent ${topicPackId} at index ${index} while another pack still has questions`,
      );
    }
    used.set(topicPackId, used.get(topicPackId) + 1);
  }
}

test('buildDeck gives the earliest packs the remainder (4, 3, 3)', () => {
  const topicPackIds = ['pack_c', 'pack_a', 'pack_b'];
  const { clientDeck } = buildDeck({
    topicPackIds,
    questionCount: 10,
    rng: () => 0.5,
    questions: bank(topicPackIds, 8),
  });

  assert.equal(clientDeck.length, 10);
  assert.deepEqual(
    topicPackIds.map((id) => clientDeck.filter((question) => question.topicPackId === id).length),
    [4, 3, 3],
  );
});

test('default mix follows largest remainder within one of 40/40/20', () => {
  const topicPackId = 'pack_mix';
  const questionCount = 11;
  const { clientDeck } = buildDeck({
    topicPackIds: [topicPackId],
    questionCount,
    rng: () => 0.5,
    questions: bank([topicPackId], 30),
  });

  const actual = countsBy(clientDeck, (question) => question.difficultyRating);
  assert.equal(actual.get('EASY'), 5);
  assert.equal(actual.get('MEDIUM'), 4);
  assert.equal(actual.get('HARD'), 2);

  const ideal = { EASY: questionCount * 0.4, MEDIUM: questionCount * 0.4, HARD: questionCount * 0.2 };
  for (const [difficulty, target] of Object.entries(ideal)) {
    assert.ok(
      Math.abs(actual.get(difficulty) - target) <= 1,
      `${difficulty} count ${actual.get(difficulty)} is more than one away from ${target}`,
    );
  }
});

test('an explicit HARD filter returns only HARD questions', () => {
  const topicPackIds = ['pack_c', 'pack_a', 'pack_b'];
  const { clientDeck } = buildDeck({
    topicPackIds,
    questionCount: 10,
    difficulty: 'HARD',
    rng: () => 0.5,
    questions: bank(topicPackIds, 8),
  });

  assert.equal(clientDeck.length, 10);
  assert.ok(clientDeck.every((question) => question.difficultyRating === 'HARD'));
  assert.deepEqual(
    topicPackIds.map((id) => clientDeck.filter((question) => question.topicPackId === id).length),
    [4, 3, 3],
  );
});

test('interleave keeps packs apart while another selected pack still has cards', () => {
  const topicPackIds = ['pack_c', 'pack_a', 'pack_b'];
  const balanced = buildDeck({
    topicPackIds,
    questionCount: 10,
    rng: () => 0.5,
    questions: bank(topicPackIds, 8),
  });
  assert.deepEqual(
    balanced.clientDeck.map((question) => question.topicPackId),
    [
      'pack_c', 'pack_a', 'pack_b',
      'pack_c', 'pack_a', 'pack_b',
      'pack_c', 'pack_a', 'pack_b',
      'pack_c',
    ],
  );
  assertNoAdjacentWhileOthersRemain(balanced.clientDeck, topicPackIds, 10);

  const unevenIds = ['pack_a', 'pack_b'];
  const uneven = buildDeck({
    topicPackIds: unevenIds,
    questionCount: 5,
    difficulty: 'EASY',
    rng: () => 0.5,
    questions: bank(unevenIds, 8),
  });
  assert.deepEqual(
    uneven.clientDeck.map((question) => question.topicPackId),
    ['pack_a', 'pack_b', 'pack_a', 'pack_b', 'pack_a'],
  );
  assertNoAdjacentWhileOthersRemain(uneven.clientDeck, unevenIds, 5);
});

test('client deck keeps question text and options and drops answer keys', () => {
  const topicPackIds = ['pack_a', 'pack_b'];
  const { clientDeck, secretDeck } = buildDeck({
    topicPackIds,
    questionCount: 4,
    rng: () => 0.5,
    questions: bank(topicPackIds, 6),
  });

  assert.equal(clientDeck.length, secretDeck.length);
  for (const question of clientDeck) {
    assert.equal(typeof question.questionText, 'string');
    assert.ok(question.questionText.length > 0);
    assert.ok(Array.isArray(question.options));
    assert.ok(question.options.length >= 2);
    for (const option of question.options) {
      assert.equal(typeof option.id, 'string');
      assert.equal(typeof option.text, 'string');
    }
    assert.equal(Object.hasOwn(question, 'correctAnswerId'), false);
    assert.equal(Object.hasOwn(question, 'explanation'), false);
    assert.equal(Object.hasOwn(question, 'sourceCitations'), false);
  }

  for (const question of secretDeck) {
    assert.equal(typeof question.correctAnswerId, 'string');
    assert.equal(typeof question.explanation, 'string');
    assert.ok(Array.isArray(question.sourceCitations));
    assert.equal(typeof question.sourceCitations[0].title, 'string');
    assert.equal(typeof question.sourceCitations[0].link, 'string');
  }
});

test('seeded bank does not tie correctAnswerId to questionId index suffix', () => {
  const { questions } = require('../data/seed');
  const bySuffix = new Map();
  for (const question of questions) {
    const match = question.questionId.match(/_(\d+)$/);
    assert.ok(match, `expected numeric suffix on ${question.questionId}`);
    const suffix = match[1];
    if (!bySuffix.has(suffix)) bySuffix.set(suffix, []);
    bySuffix.get(suffix).push(question.correctAnswerId);
  }
  const suffixOnes = bySuffix.get('1');
  assert.ok(suffixOnes.length >= 4);
  assert.notDeepEqual(suffixOnes, suffixOnes.map(() => 'A'));
  assert.ok(new Set(suffixOnes).size >= 3, 'index _1 answers should use multiple slots');
  for (const [, answers] of bySuffix) {
    assert.ok(new Set(answers).size >= 2, 'each index suffix should not map to a single letter');
  }
});

test('buildDeck shuffles option order independently per question', () => {
  const { questions } = require('../data/seed');
  const packId = 'pop_culture_01';
  const bank = questions.filter((question) => question.topicPackId === packId);
  let sawShuffle = false;

  for (let trial = 0; trial < 24; trial += 1) {
    let step = 0;
    const rng = () => ((trial * 0.13 + step++ * 0.29) % 0.98) + 0.01;
    const { secretDeck } = buildDeck({
      topicPackIds: [packId],
      questionCount: 5,
      rng,
      questions: bank,
    });

    for (const dealt of secretDeck) {
      const canonical = bank.find((question) => question.questionId === dealt.questionId);
      const bankOrder = canonical.options.map((option) => option.text).join('\0');
      const dealOrder = dealt.options.map((option) => option.text).join('\0');
      if (bankOrder !== dealOrder) sawShuffle = true;

      const correctText = canonical.options
        .find((option) => option.id === canonical.correctAnswerId)
        .text;
      const dealtCorrect = dealt.options.find((option) => option.id === dealt.correctAnswerId);
      assert.equal(dealtCorrect.text, correctText);
    }
  }

  assert.equal(sawShuffle, true);
});
