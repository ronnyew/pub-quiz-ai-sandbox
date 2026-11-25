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

  for (const pack of packs) {
    assert.equal(pack.totalQuestions, 10, `${pack.topicPackId} should have 10 seeded questions`);
    assert.equal(Object.hasOwn(pack, 'difficultyRating'), false);
    const packQuestions = questions.filter((question) => question.topicPackId === pack.topicPackId);
    assert.equal(packQuestions.length, 10);
    for (const question of packQuestions) {
      assert.equal(Object.hasOwn(question, 'difficultyRating'), false);
      assert.equal(Object.hasOwn(question, 'tags'), false);
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
});

test('GET /health returns ok', async () => {
  const res = await request('/health');
  assert.equal(res.status, 200);
});

test('runGameRoomLaunchTransaction preserves players joined before commit', async () => {
  db.resetGameRoomsForTest();
  db.resetGameRoomSecretsForTest();
  const { createWaitingGame, joinWaitingGame } = require('../lib/rooms');
  const { buildDeck } = require('../lib/sample-deck');
  const waiting = await createWaitingGame({
    hostUserId: 'launch-merge-host',
    hostHandle: 'LaunchMerge',
    rng: () => 0.55,
  });
  const gamePin = waiting.roomId;
  await joinWaitingGame({ gamePin, userId: 'launch-merge-guest', handle: 'GuestMerge' });
  const live = await db.getGameRoom(gamePin);
  assert.equal(live.players.length, 2);
  const { clientDeck, secretDeck } = buildDeck({
    topicPackIds: ['pop_culture_01'],
    questionCount: 3,
    rng: () => 0.5,
  });
  const staleHostOnly = structuredClone(live);
  staleHostOnly.players = [live.players[0]];
  const secretQuestions = secretDeck.map((question) => ({
    questionId: question.questionId,
    correctAnswerId: question.correctAnswerId,
    basePoints: question.basePoints,
    explanation: question.explanation,
    sourceCitations: question.sourceCitations,
  }));
  const openedAt = Date.now();
  const nextRoom = {
    ...staleHostOnly,
    status: 'ACTIVE',
    topicPackIds: ['pop_culture_01'],
    questionCount: clientDeck.length,
    currentQuestionIndex: 0,
    dealQuestions: clientDeck,
    scores: { 'launch-merge-host': 0 },
  };
  const nextSecrets = {
    roomId: gamePin,
    secretQuestions,
    currentQuestionIndex: 0,
    openedAt,
    closesAt: openedAt + 30_000,
    advancedThroughIndex: -1,
    responses: [],
  };
  await db.runGameRoomLaunchTransaction(gamePin, { nextRoom, nextSecrets });
  const launched = await db.getGameRoom(gamePin);
  assert.equal(launched.status, 'ACTIVE');
  assert.equal(launched.players.length, 2);
  assert.equal(launched.players.some((p) => p.userId === 'launch-merge-guest'), true);
  assert.equal(launched.scores['launch-merge-host'], 0);
  assert.equal(launched.scores['launch-merge-guest'], 0);
});

test('runGameRoomLaunchTransaction rejects second launch for same pin', async () => {
  db.resetGameRoomsForTest();
  db.resetGameRoomSecretsForTest();
  const { createWaitingGame, launchActiveGame } = require('../lib/rooms');
  const waiting = await createWaitingGame({
    hostUserId: 'launch-tx-host',
    hostHandle: 'LaunchTx',
    rng: () => 0.11,
  });
  const gamePin = waiting.roomId;
  const topicPackIds = ['pop_culture_01'];
  const first = await launchActiveGame({
    gamePin,
    hostUserId: 'launch-tx-host',
    topicPackIds,
    questionCount: 3,
    rng: () => 0.42,
    now: Date.now(),
  });
  assert.equal(first.ok, true);
  const second = await launchActiveGame({
    gamePin,
    hostUserId: 'launch-tx-host',
    topicPackIds,
    questionCount: 3,
    rng: () => 0.43,
    now: Date.now(),
  });
  assert.equal(second.ok, false);
  assert.ok(['already_launched', 'not_waiting'].includes(second.reason));
  const room = await db.getGameRoom(gamePin);
  const secrets = await db.getGameRoomSecrets(gamePin);
  assert.equal(room.dealQuestions.length, secrets.secretQuestions.length);
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
    assert.equal(Object.hasOwn(pack, 'difficultyRating'), false);
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