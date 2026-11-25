const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';

const db = require('../db');
const {
  rankLeaderboard,
  computePlayerTelemetry,
  buildMatchBreakdown,
  BreakdownNotCompleteError,
  parseBreakdownPage,
  BREAKDOWN_PAGE_SIZE,
  listRecentMatchesForUser,
} = require('../lib/results');
const { signSessionCookie } = require('../auth');
const { renderBreakdownPage, renderResultsPage } = require('../lib/player-pages');
const app = require('../index');

const SECRET_KEYS = ['correctAnswerId', 'explanation', 'sourceCitations'];

function fixtureRoom(overrides = {}) {
  return {
    roomId: '123456',
    hostUserId: 'host-1',
    status: 'COMPLETED',
    topicPackIds: ['pop_culture_01'],
    questionCount: 6,
    timeLimitPerQuestion: 30,
    currentQuestionIndex: 5,
    players: [
      { userId: 'fast-user', handle: 'Fast' },
      { userId: 'slow-user', handle: 'Slow' },
      { userId: 'streak-user', handle: 'Streaker' },
    ],
    scores: { 'fast-user': 200, 'slow-user': 200, 'streak-user': 200 },
    createdAt: '2026-11-20T12:00:00.000Z',
    dealQuestions: Array.from({ length: 6 }, (_, i) => ({
      questionId: `q-${i + 1}`,
      questionText: `Question ${i + 1}`,
      options: [
        { id: 'A', text: 'Alpha' },
        { id: 'B', text: 'Beta' },
        { id: 'C', text: 'Gamma' },
        { id: 'D', text: 'Delta' },
      ],
    })),
    ...overrides,
  };
}

function fixtureSecrets(overrides = {}) {
  return {
    roomId: '123456',
    currentQuestionIndex: 5,
    openedAt: 1_000_000,
    closesAt: 1_030_000,
    advancedThroughIndex: 5,
    secretQuestions: Array.from({ length: 6 }, (_, i) => ({
      questionId: `q-${i + 1}`,
      correctAnswerId: 'A',
      basePoints: 100,
      explanation: `Explanation ${i + 1}`,
      sourceCitations: [{ title: 'Source', link: 'https://example.com/a' }],
    })),
    responses: [
      { responseId: 'r1', questionId: 'q-1', userId: 'fast-user', selectedAnswerId: 'A', isCorrect: true, latencyMs: 1000, pointsAwarded: 100, timestamp: 1 },
      { responseId: 'r2', questionId: 'q-2', userId: 'fast-user', selectedAnswerId: 'A', isCorrect: true, latencyMs: 1500, pointsAwarded: 100, timestamp: 2 },
      { responseId: 'r3', questionId: 'q-1', userId: 'slow-user', selectedAnswerId: 'A', isCorrect: true, latencyMs: 3000, pointsAwarded: 100, timestamp: 3 },
      { responseId: 'r4', questionId: 'q-2', userId: 'slow-user', selectedAnswerId: 'A', isCorrect: true, latencyMs: 4000, pointsAwarded: 100, timestamp: 4 },
      { responseId: 'r5', questionId: 'q-1', userId: 'streak-user', selectedAnswerId: 'A', isCorrect: true, latencyMs: 2000, pointsAwarded: 100, timestamp: 5 },
      { responseId: 'r6', questionId: 'q-2', userId: 'streak-user', selectedAnswerId: 'B', isCorrect: false, latencyMs: 2000, pointsAwarded: -100, timestamp: 6 },
      { responseId: 'r7', questionId: 'q-3', userId: 'streak-user', selectedAnswerId: 'A', isCorrect: true, latencyMs: 1800, pointsAwarded: 100, timestamp: 7 },
      { responseId: 'r8', questionId: 'q-4', userId: 'streak-user', selectedAnswerId: 'A', isCorrect: true, latencyMs: 1900, pointsAwarded: 100, timestamp: 8 },
      { responseId: 'r9', questionId: 'q-5', userId: 'streak-user', selectedAnswerId: 'A', isCorrect: true, latencyMs: 2100, pointsAwarded: 100, timestamp: 9 },
      { responseId: 'r10', questionId: 'q-6', userId: 'streak-user', selectedAnswerId: 'C', isCorrect: false, latencyMs: 2200, pointsAwarded: -100, timestamp: 10 },
    ],
    ...overrides,
  };
}

test('ranking places higher score first and equal scores use faster average latency', () => {
  const room = fixtureRoom();
  const secrets = fixtureSecrets();
  const ranks = rankLeaderboard({ room, secrets });
  assert.equal(ranks[0].userId, 'fast-user');
  assert.equal(ranks[1].userId, 'streak-user');
  assert.equal(ranks[2].userId, 'slow-user');
  assert.equal(ranks[0].totalScore, 200);
  assert.equal(ranks[1].totalScore, 200);
  assert.ok(ranks[0].avgLatencyMs < ranks[1].avgLatencyMs);
  assert.ok(ranks[1].avgLatencyMs < ranks[2].avgLatencyMs);
});

test('streak and accuracy match fixed response fixture', () => {
  const room = fixtureRoom();
  const secrets = fixtureSecrets();
  const stats = computePlayerTelemetry({ room, secrets, userId: 'streak-user' });
  assert.equal(stats.correctCount, 4);
  assert.equal(stats.accuracyPercent, 67);
  assert.equal(stats.longestStreak, 3);
  assert.equal(stats.xp, 200);
  assert.equal(stats.avgSpeedSeconds, 2);
});

test('breakdown page size is 5 and page 2 returns the next slice only', () => {
  assert.equal(BREAKDOWN_PAGE_SIZE, 5);
  const room = fixtureRoom({
    dealQuestions: Array.from({ length: 12 }, (_, i) => ({
      questionId: `q-${i + 1}`,
      questionText: `Question ${i + 1}`,
      options: [
        { id: 'A', text: 'Alpha' },
        { id: 'B', text: 'Beta' },
        { id: 'C', text: 'Gamma' },
        { id: 'D', text: 'Delta' },
      ],
    })),
  });
  const secrets = fixtureSecrets({
    secretQuestions: Array.from({ length: 12 }, (_, i) => ({
      questionId: `q-${i + 1}`,
      correctAnswerId: 'A',
      basePoints: 100,
      explanation: `Explanation ${i + 1}`,
      sourceCitations: [{ title: 'Source', link: 'https://example.com/a' }],
    })),
    responses: [],
  });
  const page1 = buildMatchBreakdown({ room, secrets, userId: 'fast-user', page: 1 });
  assert.equal(page1.entries.length, 5);
  assert.equal(page1.entries[0].questionId, 'q-1');
  const page2 = buildMatchBreakdown({ room, secrets, userId: 'fast-user', page: 2 });
  assert.equal(page2.entries.length, 5);
  assert.equal(page2.entries[0].questionId, 'q-6');
  const page3 = buildMatchBreakdown({ room, secrets, userId: 'fast-user', page: 3 });
  assert.equal(page3.entries.length, 2);
  const outOfRange = buildMatchBreakdown({ room, secrets, userId: 'fast-user', page: 99 });
  assert.equal(outOfRange.entries.length, 0);
});

test('buildMatchBreakdown rejects non-COMPLETED rooms; COMPLETED includes grading fields', () => {
  const room = fixtureRoom({ status: 'ACTIVE', dealQuestions: fixtureRoom().dealQuestions.slice(0, 1) });
  const secrets = fixtureSecrets({
    secretQuestions: fixtureSecrets().secretQuestions.slice(0, 1),
    responses: [],
  });
  assert.throws(
    () => buildMatchBreakdown({ room, secrets, userId: 'fast-user', page: 1 }),
    BreakdownNotCompleteError,
  );
  room.status = 'WAITING';
  assert.throws(
    () => buildMatchBreakdown({ room, secrets, userId: 'fast-user', page: 1 }),
    BreakdownNotCompleteError,
  );
  room.status = 'COMPLETED';
  const completed = buildMatchBreakdown({ room, secrets, userId: 'fast-user', page: 1 });
  assert.equal(completed.entries[0].correctAnswerId, 'A');
  assert.ok(completed.entries[0].explanation);
  assert.ok(Array.isArray(completed.entries[0].sourceCitations));
  assert.equal(typeof completed.entries[0].isCorrect, 'boolean');
  assert.equal(typeof completed.entries[0].pointsAwarded, 'number');
});

test('parseBreakdownPage requires integers >= 1', () => {
  assert.equal(parseBreakdownPage(undefined), 1);
  assert.equal(parseBreakdownPage('2'), 2);
  assert.equal(parseBreakdownPage('0'), 1);
  assert.equal(parseBreakdownPage('abc'), 1);
});

test('results HTML contains RETURN HOME linking to /dashboard', () => {
  const room = fixtureRoom();
  const secrets = fixtureSecrets();
  const html = renderResultsPage({
    session: { uid: 'fast-user', handle: 'Fast' },
    room,
    secrets,
  });
  assert.match(html, /RETURN HOME/i);
  assert.match(html, /href="\/dashboard"/);
});

test('results page links the signed-in player row to match breakdown without streak or XP chrome', () => {
  const room = fixtureRoom();
  const secrets = fixtureSecrets();
  const html = renderResultsPage({
    session: { uid: 'streak-user', handle: 'Streaker' },
    room,
    secrets,
  });
  assert.match(html, /href="\/rooms\/123456\/breakdown\?user=streak-user"/);
  assert.doesNotMatch(html, /Best Streak:/i);
  assert.doesNotMatch(html, />\s*\d+\s*XP</i);
  assert.doesNotMatch(html, /href="\/rooms\/123456\/breakdown\?user=fast-user"/);
});

test('listRecentMatchesForUser returns rooms where user played, newest first', async () => {
  db.resetGameRoomsForTest();
  db.resetGameRoomSecretsForTest();
  await db.createGameRoom({
    roomId: '111111',
    hostUserId: 'viewer',
    status: 'WAITING',
    topicPackIds: ['pop_culture_01'],
    questionCount: 10,
    timeLimitPerQuestion: 30,
    currentQuestionIndex: 0,
    players: [{ userId: 'viewer', handle: 'Viewer' }],
    createdAt: '2026-11-18T12:00:00.000Z',
  });
  const oneQuestion = {
    questionId: 'q-1',
    questionText: 'One',
    options: [
      { id: 'A', text: 'A' },
      { id: 'B', text: 'B' },
      { id: 'C', text: 'C' },
      { id: 'D', text: 'D' },
    ],
  };
  await db.createGameRoom({
    roomId: '222222',
    hostUserId: 'host-b',
    status: 'COMPLETED',
    topicPackIds: ['pop_culture_01'],
    questionCount: 1,
    timeLimitPerQuestion: 30,
    currentQuestionIndex: 0,
    players: [{ userId: 'viewer', handle: 'Viewer' }, { userId: 'other', handle: 'Other' }],
    scores: { viewer: 50, other: 0 },
    createdAt: '2026-11-25T12:00:00.000Z',
    dealQuestions: [oneQuestion],
    playerSummaries: {
      viewer: {
        score: 50,
        rank: 1,
        correctCount: 1,
        totalQuestions: 1,
        accuracyPercent: 100,
        avgSpeedSeconds: 1.1,
        maxScore: 100,
      },
      other: {
        score: 0,
        rank: 2,
        correctCount: 0,
        totalQuestions: 1,
        accuracyPercent: 0,
        avgSpeedSeconds: null,
        maxScore: 100,
      },
    },
  });
  const matches = await listRecentMatchesForUser('viewer');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].roomId, '222222');
});

function request(method, pathname, { cookie } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const reqHeaders = cookie ? { Cookie: cookie } : {};
      const req = http.request(
        { hostname: '127.0.0.1', port, path: pathname, method, headers: reqHeaders },
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
      req.end();
    });
  });
}

test('breakdown page shows green score, red rank, correct-row styling, and numbered pager', () => {
  const room = fixtureRoom({
    dealQuestions: Array.from({ length: 12 }, (_, i) => ({
      questionId: `q-${i + 1}`,
      questionText: `Question ${i + 1}`,
      options: [
        { id: 'A', text: 'Alpha' },
        { id: 'B', text: 'Beta' },
        { id: 'C', text: 'Gamma' },
        { id: 'D', text: 'Delta' },
      ],
    })),
  });
  const secrets = fixtureSecrets({
    secretQuestions: Array.from({ length: 12 }, (_, i) => ({
      questionId: `q-${i + 1}`,
      correctAnswerId: 'A',
      basePoints: 100,
      explanation: `Explanation ${i + 1}`,
      sourceCitations: [{ title: 'Source', link: 'https://example.com/a' }],
    })),
    responses: [
      {
        responseId: 'r1',
        questionId: 'q-1',
        userId: 'fast-user',
        selectedAnswerId: 'A',
        isCorrect: true,
        latencyMs: 1000,
        pointsAwarded: 100,
        timestamp: 1,
      },
    ],
  });
  const breakdown = buildMatchBreakdown({ room, secrets, userId: 'fast-user', page: 1 });
  const html = renderBreakdownPage({
    session: { uid: 'fast-user', handle: 'Fast' },
    room,
    breakdown,
    subjectUserId: 'fast-user',
  });
  assert.match(html, /text-\[#00ffcc\]">200\/1200<\/div>/);
  assert.match(html, /text-\[#ff4444\]/);
  assert.match(html, /pq-pager-btn--active/);
  assert.match(html, /pq-breakdown-pager/);
  assert.match(html, /id="breakdown-leaderboard-list"/);
  assert.match(html, /material-symbols-outlined text-\[#00ffcc\][\s\S]*analytics/);
  assert.match(html, /material-symbols-outlined text-\[#ff2d78\][\s\S]*leaderboard/);
  assert.match(html, /check_circle[\s\S]*Your Answer:[\s\S]*<span class="text-xs font-medium text-white">Alpha<\/span>/);
  assert.doesNotMatch(html, /SPEED\s+1s/);
  assert.match(html, /pq-dashboard-start-cta[\s\S]*Return home/);
  assert.match(html, /flex justify-center[\s\S]*href="\/dashboard"/);
});

test('breakdown page highlights signed-in viewer with YOU badge when not first', () => {
  const room = fixtureRoom();
  const secrets = fixtureSecrets();
  const breakdown = buildMatchBreakdown({ room, secrets, userId: 'streak-user', page: 1 });
  const html = renderBreakdownPage({
    session: { uid: 'streak-user', handle: 'Streaker' },
    room,
    breakdown,
    subjectUserId: 'streak-user',
  });
  assert.match(html, /pq-leaderboard-row--you[\s\S]*pq-leaderboard-you-badge[\s\S]*YOU/);
  assert.match(html, /#2[\s\S]*Streaker[\s\S]*YOU/);
});

test('buildMatchBreakdown paginates leaderboard slice', () => {
  const players = Array.from({ length: 11 }, (_, i) => ({
    userId: `player-${i + 1}`,
    handle: `P${i + 1}`,
  }));
  const scores = Object.fromEntries(players.map((p, i) => [p.userId, 100 - i]));
  const room = fixtureRoom({
    players,
    scores,
    dealQuestions: fixtureRoom().dealQuestions.slice(0, 1),
  });
  const secrets = fixtureSecrets({ responses: [] });
  const page1 = buildMatchBreakdown({ room, secrets, userId: 'player-1', page: 1, leaderboardPage: 1 });
  assert.equal(page1.leaderboardEntries.length, 10);
  assert.equal(page1.leaderboardTotalPages, 2);
  const page2 = buildMatchBreakdown({ room, secrets, userId: 'player-1', page: 1, leaderboardPage: 2 });
  assert.equal(page2.leaderboardEntries.length, 1);
});

test('GET /rooms/:pin/breakdown returns JSON for members', async () => {
  db.resetGameRoomsForTest();
  db.resetGameRoomSecretsForTest();
  const room = fixtureRoom();
  const secrets = fixtureSecrets();
  await db.createGameRoom(room);
  await db.createGameRoomSecrets(secrets);
  const cookie = signSessionCookie({ uid: 'fast-user', provider: 'google.com', handle: 'Fast' });
  const res = await request('GET', '/api/games/123456/breakdown?page=1', { cookie });
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.page, 1);
  assert.ok(body.entries[0].correctAnswerId);
});