const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';

const db = require('../db');
const {
  advanceGameQuestion,
  createWaitingGame,
  joinWaitingGame,
  launchActiveGame,
  submitGameAnswer,
  getGameplayQuestionJson,
} = require('../lib/rooms');
const { signSessionCookie } = require('../auth');
const app = require('../index');

const SECRET_KEYS = ['correctAnswerId', 'explanation', 'sourceCitations'];

function request(method, pathname, { body, cookie, headers } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const reqHeaders = { ...(headers || {}) };
      if (cookie) reqHeaders.Cookie = cookie;
      const payload = body === undefined ? null : body;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: pathname,
          method,
          headers: reqHeaders,
        },
        (res) => {
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
        },
      );
      req.on('error', (err) => server.close(() => reject(err)));
      if (payload) req.write(payload);
      req.end();
    });
  });
}

function jsonRequest(method, pathname, data, cookie) {
  const body = data === undefined ? undefined : JSON.stringify(data);
  const headers = body
    ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    : {};
  return request(method, pathname, { cookie, body, headers });
}

function formRequest(method, pathname, fields, cookie) {
  const params = new URLSearchParams();
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
      else if (value !== undefined) params.append(key, value);
    }
  }
  const body = params.toString();
  return request(method, pathname, {
    cookie,
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  });
}

async function setupActiveGame({ rng = () => 0.42 } = {}) {
  db.resetGameRoomsForTest();
  db.resetGameRoomSecretsForTest();
  const waiting = await createWaitingGame({
    hostUserId: 'host-gp',
    hostHandle: 'HostGp',
    rng,
  });
  const gamePin = waiting.roomId;
  await joinWaitingGame({ gamePin, userId: 'player-gp', handle: 'PlayerGp' });
  const launched = await launchActiveGame({
    gamePin,
    hostUserId: 'host-gp',
    topicPackIds: ['pop_culture_01'],
    questionCount: 3,
    rng,
    now: Date.now(),
  });
  return { gamePin, launched };
}

test('launch writes public dealQuestions without secrets and secrets document keeps keys', async () => {
  const { gamePin } = await setupActiveGame();
  const room = await db.getGameRoom(gamePin);
  assert.equal(room.status, 'ACTIVE');
  assert.ok(Array.isArray(room.dealQuestions));
  assert.ok(room.dealQuestions.length >= 1);
  for (const question of room.dealQuestions) {
    for (const key of SECRET_KEYS) {
      assert.equal(question[key], undefined);
    }
    assert.ok(question.options?.every((opt) => /^[A-D]$/.test(opt.id)));
  }
  const secrets = await db.getGameRoomSecrets(gamePin);
  assert.ok(secrets);
  assert.ok(Array.isArray(secrets.secretQuestions));
  assert.equal(secrets.secretQuestions.length, room.dealQuestions.length);
  const first = secrets.secretQuestions[0];
  assert.ok(OPTION_OR_SECRET(first));
  assert.ok(first.sourceCitations?.length >= 1);
  assert.equal(typeof secrets.openedAt, 'number');
  assert.equal(secrets.closesAt, secrets.openedAt + 30_000);
});

function OPTION_OR_SECRET(secretQ) {
  return /^[A-D]$/.test(secretQ.correctAnswerId)
    && typeof secretQ.explanation === 'string'
    && secretQ.explanation.length > 0;
}

test('submitAnswer scores basePoints on time, rejects duplicate, late answer scores 0', async () => {
  const { gamePin } = await setupActiveGame();
  const secrets = await db.getGameRoomSecrets(gamePin);
  const idx = secrets.currentQuestionIndex;
  const secretQ = secrets.secretQuestions[idx];
  const openedAt = secrets.openedAt;
  const closesAt = secrets.closesAt;

  const first = await submitGameAnswer({
    gamePin,
    userId: 'player-gp',
    selectedAnswerId: secretQ.correctAnswerId,
    now: openedAt + 2_000,
  });
  assert.equal(first.ok, true);
  assert.equal(first.locked, true);
  assert.equal(first.roundPhase, 'OPEN');
  assert.equal(first.isCorrect, undefined);
  assert.equal(first.pointsAwarded, undefined);

  const dupe = await submitGameAnswer({
    gamePin,
    userId: 'player-gp',
    selectedAnswerId: secretQ.correctAnswerId,
    now: openedAt + 3_000,
  });
  assert.equal(dupe.ok, false);
  assert.equal(dupe.reason, 'already_answered');

  const late = await submitGameAnswer({
    gamePin,
    userId: 'host-gp',
    selectedAnswerId: secretQ.correctAnswerId,
    now: closesAt + 50,
  });
  assert.equal(late.ok, true);
  assert.equal(late.roundPhase, 'REVEAL');
  assert.equal(late.pointsAwarded, 0);
});

test('submitAnswer deducts basePoints for wrong on-time answers', async () => {
  const { gamePin } = await setupActiveGame();
  const secrets = await db.getGameRoomSecrets(gamePin);
  const secretQ = secrets.secretQuestions[secrets.currentQuestionIndex];
  const wrongId = secretQ.correctAnswerId === 'A' ? 'B' : 'A';
  await submitGameAnswer({
    gamePin,
    userId: 'player-gp',
    selectedAnswerId: wrongId,
    now: secrets.openedAt + 1_000,
  });
  const room = await db.getGameRoom(gamePin);
  assert.equal(room.scores['player-gp'], -secretQ.basePoints);
  const updated = await db.getGameRoomSecrets(gamePin);
  const resp = updated.responses.find((entry) => entry.userId === 'player-gp');
  assert.equal(resp.pointsAwarded, -secretQ.basePoints);
});

test('latencyMs in stored response matches grade timestamps not client body', async () => {
  const { gamePin } = await setupActiveGame();
  const secrets = await db.getGameRoomSecrets(gamePin);
  const secretQ = secrets.secretQuestions[secrets.currentQuestionIndex];
  const receivedAt = secrets.openedAt + 1_820;
  const result = await submitGameAnswer({
    gamePin,
    userId: 'player-gp',
    selectedAnswerId: secretQ.correctAnswerId,
    now: receivedAt,
    clientLatencyMs: 42,
  });
  assert.equal(result.ok, true);
  assert.equal(result.latencyMs, undefined);
});

test('active play-state JSON has A-D options and no explanation or citations', async () => {
  const { gamePin } = await setupActiveGame();
  const payload = await getGameplayQuestionJson({
    gamePin,
    userId: 'player-gp',
    now: (await db.getGameRoomSecrets(gamePin)).openedAt + 500,
  });
  assert.ok(payload);
  assert.deepEqual(payload.options.map((o) => o.id), ['A', 'B', 'C', 'D']);
  assert.equal(payload.explanation, undefined);
  assert.equal(payload.sourceCitations, undefined);
  assert.equal(payload.correctAnswerId, undefined);
});

test('play-state reveals grading without explanation after round closes', async () => {
  const { gamePin } = await setupActiveGame();
  const secrets = await db.getGameRoomSecrets(gamePin);
  const secretQ = secrets.secretQuestions[secrets.currentQuestionIndex];
  await submitGameAnswer({
    gamePin,
    userId: 'player-gp',
    selectedAnswerId: secretQ.correctAnswerId,
    now: secrets.openedAt + 500,
  });
  const whileOpen = await getGameplayQuestionJson({
    gamePin,
    userId: 'player-gp',
    now: secrets.openedAt + 550,
  });
  assert.equal(whileOpen.roundPhase, 'OPEN');
  assert.equal(whileOpen.reveal, undefined);
  assert.equal(whileOpen.playerAnswer?.pointsAwarded, undefined);
  await submitGameAnswer({
    gamePin,
    userId: 'host-gp',
    selectedAnswerId: secretQ.correctAnswerId,
    now: secrets.openedAt + 600,
  });
  const afterAll = await getGameplayQuestionJson({
    gamePin,
    userId: 'player-gp',
    now: secrets.openedAt + 700,
  });
  assert.equal(afterAll.roundPhase, 'REVEAL');
  assert.equal(afterAll.reveal.correctAnswerId, secretQ.correctAnswerId);
  assert.equal(afterAll.reveal.explanation, undefined);
  assert.equal(afterAll.playerAnswer.isCorrect, true);
  assert.equal(afterAll.playerAnswer.pointsAwarded, 10);
  assert.equal(afterAll.explanation, undefined);
  const afterTimer = await getGameplayQuestionJson({
    gamePin,
    userId: 'player-gp',
    now: secrets.closesAt + 1,
  });
  assert.equal(afterTimer.roundPhase, 'REVEAL');
  assert.equal(afterTimer.reveal.explanation, undefined);
  assert.ok(afterTimer.scores);
});

test('advance proceeds when all players answered before timer closes', async () => {
  const { gamePin } = await setupActiveGame();
  const secrets = await db.getGameRoomSecrets(gamePin);
  const secretQ = secrets.secretQuestions[secrets.currentQuestionIndex];
  const midWindow = secrets.openedAt + 500;
  await submitGameAnswer({
    gamePin,
    userId: 'player-gp',
    selectedAnswerId: secretQ.correctAnswerId,
    now: midWindow,
  });
  await submitGameAnswer({
    gamePin,
    userId: 'host-gp',
    selectedAnswerId: secretQ.correctAnswerId,
    now: midWindow + 50,
  });
  const payload = await getGameplayQuestionJson({
    gamePin,
    userId: 'player-gp',
    now: midWindow + 100,
  });
  assert.equal(payload.allPlayersAnswered, true);
  const advanced = await advanceGameQuestion({ gamePin, now: midWindow + 100, hostUserId: 'host-gp' });
  assert.equal(advanced.advanced, true);
  const roomAfter = await db.getGameRoom(gamePin);
  assert.equal(roomAfter.currentQuestionIndex, 1);
});

test('advance route is idempotent after timer closes', async () => {
  const { gamePin } = await setupActiveGame();
  const secrets = await db.getGameRoomSecrets(gamePin);
  const afterClose = secrets.closesAt + 100;
  const first = await advanceGameQuestion({ gamePin, now: afterClose, hostUserId: 'host-gp' });
  assert.equal(first.ok, true);
  assert.equal(first.advanced, true);
  const roomAfter = await db.getGameRoom(gamePin);
  assert.equal(roomAfter.currentQuestionIndex, 1);
  const second = await advanceGameQuestion({ gamePin, now: afterClose + 5, hostUserId: 'host-gp' });
  assert.equal(second.ok, true);
  assert.equal(second.advanced, false);
  const roomAgain = await db.getGameRoom(gamePin);
  assert.equal(roomAgain.currentQuestionIndex, 1);
});

test('POST /api/rooms/:pin/answers and GET play question route enforce anti-cheat split', async () => {
  const { gamePin } = await setupActiveGame();
  const playerCookie = signSessionCookie({
    uid: 'player-gp',
    provider: 'google.com',
    handle: 'PlayerGp',
  });
  const secrets = await db.getGameRoomSecrets(gamePin);
  const secretQ = secrets.secretQuestions[secrets.currentQuestionIndex];

  const answerRes = await jsonRequest(
    'POST',
    `/api/rooms/${gamePin}/answers`,
    { selectedAnswerId: secretQ.correctAnswerId },
    playerCookie,
  );
  assert.equal(answerRes.status, 200);
  const answerBody = JSON.parse(answerRes.body);
  assert.equal(answerBody.ok, true);
  assert.equal(answerBody.roundPhase, 'OPEN');
  assert.equal(answerBody.pointsAwarded, undefined);
  assert.equal(answerBody.isCorrect, undefined);

  const stateRes = await jsonRequest(
    'GET',
    `/api/games/${gamePin}/question`,
    undefined,
    playerCookie,
  );
  assert.equal(stateRes.status, 200);
  const state = JSON.parse(stateRes.body);
  assert.deepEqual(state.options.map((o) => o.id), ['A', 'B', 'C', 'D']);
  for (const key of SECRET_KEYS) {
    assert.equal(state[key], undefined);
  }
});

test('late joiner enters ACTIVE game and sees current question window', async () => {
  const { gamePin } = await setupActiveGame();
  const { joinActiveGame } = require('../lib/rooms');
  const joined = await joinActiveGame({
    gamePin,
    userId: 'late-player',
    handle: 'LateJoin',
  });
  assert.equal(joined.ok, true);
  const payload = await getGameplayQuestionJson({
    gamePin,
    userId: 'late-player',
    now: Date.now(),
  });
  assert.ok(payload.questionText);
  assert.ok(Number.isFinite(payload.closesAt));
  const joinRes = await request('GET', `/join?game=${gamePin}`, {
    cookie: signSessionCookie({
      uid: 'late-player',
      provider: 'google.com',
      handle: 'LateJoin',
    }),
  });
  assert.equal(joinRes.status, 302);
  assert.match(joinRes.headers.location || '', new RegExp(`/game/${gamePin}/play`));
});

test('GET /join renders unavailable screen for missing or completed games', async () => {
  const cookie = signSessionCookie({
    uid: 'join-closed',
    provider: 'google.com',
    handle: 'JoinClosed',
  });
  const copy = require('../lib/content-store').getStaticCopy().join_unavailable;
  const missing = await request('GET', '/join?game=999999', { cookie });
  assert.equal(missing.status, 404);
  assert.match(missing.body, new RegExp(escapeRegex(copy.headline)));
  assert.match(missing.body, new RegExp(escapeRegex(copy.body)));
  assert.match(missing.body, /href="\/dashboard"/);

  const { gamePin } = await setupActiveGame();
  const room = await db.getGameRoom(gamePin);
  await db.updateGameRoom(gamePin, () => ({ ...room, status: 'COMPLETED' }));
  const completed = await request('GET', `/join?game=${gamePin}`, { cookie });
  assert.equal(completed.status, 410);
  assert.match(completed.body, new RegExp(escapeRegex(copy.headline)));
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('POST /game/:gamePin/launch deals deck and redirects to play', async () => {
  db.resetGameRoomsForTest();
  db.resetGameRoomSecretsForTest();
  const hostCookie = signSessionCookie({
    uid: 'host-launch5',
    provider: 'google.com',
    handle: 'Launch5',
  });
  const createRes = await jsonRequest('POST', '/api/games', {}, hostCookie);
  const { gamePin } = JSON.parse(createRes.body);
  const launchRes = await formRequest(
    'POST',
    `/game/${gamePin}/launch`,
    { topicPackIds: 'pop_culture_01' },
    hostCookie,
  );
  assert.equal(launchRes.status, 303);
  assert.match(launchRes.headers.location || '', new RegExp(`/game/${gamePin}/play`));
  const room = await db.getGameRoom(gamePin);
  assert.equal(room.status, 'ACTIVE');
});

test('POST answer and GET question reveal grading without explanation after round closes', async () => {
  const { gamePin } = await setupActiveGame();
  const playerCookie = signSessionCookie({
    uid: 'player-gp',
    provider: 'google.com',
    handle: 'PlayerGp',
  });
  const secrets = await db.getGameRoomSecrets(gamePin);
  const secretQ = secrets.secretQuestions[secrets.currentQuestionIndex];
  const midWindow = secrets.openedAt + 400;
  const answerRes = await jsonRequest(
    'POST',
    `/api/games/${gamePin}/answers`,
    { selectedAnswerId: secretQ.correctAnswerId },
    playerCookie,
  );
  assert.equal(answerRes.status, 200);
  const answerBody = JSON.parse(answerRes.body);
  assert.equal(answerBody.roundPhase, 'OPEN');
  assert.equal(answerBody.isCorrect, undefined);

  const hostCookie = signSessionCookie({
    uid: 'host-gp',
    provider: 'google.com',
    handle: 'HostGp',
  });
  await jsonRequest(
    'POST',
    `/api/games/${gamePin}/answers`,
    { selectedAnswerId: secretQ.correctAnswerId },
    hostCookie,
  );
  const revealRes = await jsonRequest(
    'GET',
    `/api/games/${gamePin}/question`,
    undefined,
    playerCookie,
  );
  const revealState = JSON.parse(revealRes.body);
  assert.equal(revealState.roundPhase, 'REVEAL');
  assert.equal(revealState.reveal.correctAnswerId, secretQ.correctAnswerId);
  assert.equal(revealState.reveal.explanation, undefined);
  assert.equal(revealState.playerAnswer.pointsAwarded, 10);
});

test('non-members receive 403 on question and advance APIs', async () => {
  const { gamePin } = await setupActiveGame();
  const outsiderCookie = signSessionCookie({
    uid: 'outsider-gp',
    provider: 'google.com',
    handle: 'Outsider',
  });
  const questionRes = await jsonRequest(
    'GET',
    `/api/games/${gamePin}/question`,
    undefined,
    outsiderCookie,
  );
  assert.equal(questionRes.status, 403);
  const advanceRes = await jsonRequest(
    'POST',
    `/api/games/${gamePin}/advance`,
    {},
    outsiderCookie,
  );
  assert.equal(advanceRes.status, 403);
  const playerCookie = signSessionCookie({
    uid: 'player-gp',
    provider: 'google.com',
    handle: 'PlayerGp',
  });
  const playerAdvance = await jsonRequest(
    'POST',
    `/api/games/${gamePin}/advance`,
    {},
    playerCookie,
  );
  assert.equal(playerAdvance.status, 403);
});

test('launch deals all questions from selected packs when count omitted', async () => {
  db.resetGameRoomsForTest();
  db.resetGameRoomSecretsForTest();
  const waiting = await createWaitingGame({
    hostUserId: 'multi-pack-host',
    hostHandle: 'MultiPack',
    rng: () => 0.77,
  });
  const gamePin = waiting.roomId;
  const topicPackIds = ['pop_culture_01', 'science_tech_01', 'craft_beer_01'];
  const launched = await launchActiveGame({
    gamePin,
    hostUserId: 'multi-pack-host',
    topicPackIds,
    rng: () => 0.33,
    now: Date.now(),
  });
  assert.equal(launched.ok, true);
  const room = await db.getGameRoom(gamePin);
  assert.equal(room.questionCount, 30);
  assert.equal(room.dealQuestions.length, 30);
});

test('double launch keeps one dealQuestions and secrets pair', async () => {
  db.resetGameRoomsForTest();
  db.resetGameRoomSecretsForTest();
  const waiting = await createWaitingGame({
    hostUserId: 'race-host',
    hostHandle: 'RaceHost',
    rng: () => 0.99,
  });
  const gamePin = waiting.roomId;
  const first = await launchActiveGame({
    gamePin,
    hostUserId: 'race-host',
    topicPackIds: ['pop_culture_01'],
    questionCount: 5,
    rng: () => 0.2,
    now: Date.now(),
  });
  assert.equal(first.ok, true);
  const second = await launchActiveGame({
    gamePin,
    hostUserId: 'race-host',
    topicPackIds: ['pop_culture_01'],
    questionCount: 5,
    rng: () => 0.8,
    now: Date.now(),
  });
  assert.equal(second.ok, false);
  const room = await db.getGameRoom(gamePin);
  const secrets = await db.getGameRoomSecrets(gamePin);
  assert.equal(room.dealQuestions.length, secrets.secretQuestions.length);
  assert.equal(room.status, 'ACTIVE');
});