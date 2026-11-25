const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
delete process.env.GOOGLE_CLOUD_PROJECT;
delete process.env.GCLOUD_PROJECT;
delete process.env.DATA_BACKEND;

const db = require('../db');
const app = require('../index');

const SECRET_KEYS = ['questionText', 'correctAnswerId', 'explanation', 'sourceCitations', 'options', 'questionId'];

function firestoreModuleLoaded() {
  try {
    return Boolean(require.cache[require.resolve('@google-cloud/firestore')]);
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') return false;
    throw err;
  }
}

function request(pathname) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      http.get({ hostname: '127.0.0.1', port, path: pathname }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          server.close(() => {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        });
      }).on('error', (err) => {
        server.close(() => reject(err));
      });
    });
  });
}

test('seeding and reads do not require GCP credentials', () => {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);

  db.seed();
  const packs = db.listTopicPacks({ limit: 24 });
  assert.ok(packs.length >= 4, `expected at least 4 packs, got ${packs.length}`);

  const questions = db.listQuestionsByPackIds(packs.map((pack) => pack.topicPackId));
  assert.ok(questions.length >= 12, `expected at least 12 questions, got ${questions.length}`);

  const difficulties = new Set(questions.map((question) => question.difficultyRating));
  assert.ok(difficulties.has('EASY'));
  assert.ok(difficulties.has('MEDIUM'));
  assert.ok(difficulties.has('HARD'));

  const beer = packs.find((pack) => pack.topicPackId === 'craft_beer_01');
  assert.equal(beer.difficultyRating, 'FUN');

  for (const pack of packs) {
    assert.equal(
      pack.totalQuestions,
      6,
      `${pack.topicPackId} should have 6 seeded questions`,
    );
    const packQuestions = questions.filter((question) => question.topicPackId === pack.topicPackId);
    for (const band of ['EASY', 'MEDIUM', 'HARD']) {
      assert.equal(
        packQuestions.filter((question) => question.difficultyRating === band).length,
        2,
        `${pack.topicPackId} should have 2 ${band} questions`,
      );
    }
  }

  const { buildDeck } = require('../lib/sample-deck');
  for (const topicPackId of [
    'world_history_01',
    'music_80s_90s_01',
    'video_game_lore_01',
  ]) {
    const solo = buildDeck({ topicPackIds: [topicPackId], questionCount: 5, rng: () => 0.5 });
    assert.equal(solo.clientDeck.length, 5);
  }

  const trio = buildDeck({
    topicPackIds: ['world_history_01', 'music_80s_90s_01', 'video_game_lore_01'],
    questionCount: 10,
    rng: () => 0.5,
  });
  assert.equal(trio.clientDeck.length, 10);

  assert.equal(firestoreModuleLoaded(), false);

  const seededDeal = require('../lib/sample-deck').buildDeck({
    topicPackIds: ['pop_culture_01', 'science_tech_01', 'craft_beer_01'],
    questionCount: 10,
    rng: () => 0.5,
  });
  assert.deepEqual(
    ['pop_culture_01', 'science_tech_01', 'craft_beer_01'].map(
      (id) => seededDeal.clientDeck.filter((question) => question.topicPackId === id).length,
    ),
    [4, 3, 3],
  );
});

test('listTopicPacks rejects a limit above 24', () => {
  db.seed();
  assert.throws(() => db.listTopicPacks({ limit: 25 }), /24/);
});

test('GET /api/topic-packs returns metadata only and rejects limit above 24', async () => {
  const ok = await request('/api/topic-packs');
  assert.equal(ok.status, 200);
  assert.match(ok.headers['content-type'], /application\/json/);

  const body = JSON.parse(ok.body);
  assert.ok(Array.isArray(body.topicPacks));
  assert.ok(body.topicPacks.length >= 4);
  assert.ok(body.topicPacks.length <= 24);

  for (const pack of body.topicPacks) {
    assert.equal(typeof pack.topicPackId, 'string');
    assert.equal(typeof pack.title, 'string');
    assert.equal(typeof pack.totalQuestions, 'number');
    assert.equal(pack.questions, undefined);
    for (const key of SECRET_KEYS) {
      assert.equal(Object.hasOwn(pack, key), false);
    }
  }

  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes('questionText'), false);
  assert.equal(serialized.includes('correctAnswerId'), false);
  assert.equal(serialized.includes('sourceCitations'), false);

  const rejected = await request('/api/topic-packs?limit=25');
  assert.equal(rejected.status, 400);

  const capped = await request('/api/topic-packs?limit=24');
  assert.equal(capped.status, 200);
});
