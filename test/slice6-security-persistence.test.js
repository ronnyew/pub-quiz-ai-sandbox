const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';

const db = require('../db');
const {
  buildDashboardMatchSummaries,
  buildMatchBreakdown,
  BreakdownNotCompleteError,
  buildPlayerSummariesForCompletedRoom,
  listRecentMatchesForUser,
} = require('../lib/results');
const { signSessionCookie } = require('../auth');
const app = require('../index');

function createMockFirestoreWithQueries() {
  const store = new Map();
  let chain = Promise.resolve();

  function docRef(collection, id) {
    const key = `${collection}/${id}`;
    return {
      _key: key,
      get: async () => ({
        exists: store.has(key),
        data: () => (store.has(key) ? structuredClone(store.get(key)) : undefined),
      }),
      set: async (data, opts) => {
        if (opts?.merge) {
          store.set(key, { ...(store.get(key) || {}), ...structuredClone(data) });
        } else {
          store.set(key, structuredClone(data));
        }
      },
      create: async (data) => {
        if (store.has(key)) {
          const err = new Error('already exists');
          err.code = 6;
          throw err;
        }
        store.set(key, structuredClone(data));
      },
    };
  }

  function queryChain(collectionName) {
    const state = { filters: [], orderField: 'createdAt', orderLimit: 50 };
    const api = {
      where(field, op, value) {
        state.filters.push({ field, op, value });
        return api;
      },
      orderBy(field) {
        state.orderField = field;
        return api;
      },
      limit(n) {
        state.orderLimit = n;
        return api;
      },
      async get() {
        const docs = [];
        for (const [key, data] of store) {
          if (!key.startsWith(`${collectionName}/`)) continue;
          const id = key.slice(collectionName.length + 1);
          let ok = true;
          for (const filter of state.filters) {
            if (filter.op === 'array-contains') {
              ok = Array.isArray(data[filter.field]) && data[filter.field].includes(filter.value);
            } else if (filter.op === '==') {
              ok = data[filter.field] === filter.value;
            }
            if (!ok) break;
          }
          if (!ok) continue;
          docs.push({
            id,
            data: () => structuredClone(data),
          });
        }
        docs.sort((a, b) => String(b.data()[state.orderField]).localeCompare(String(a.data()[state.orderField])));
        return { docs: docs.slice(0, state.orderLimit) };
      },
    };
    return api;
  }

  return {
    store,
    queryTrace: [],
    collection(name) {
      return {
        doc(id) {
          return docRef(name, id);
        },
        where(field, op, value) {
          return queryChain(name).where(field, op, value);
        },
      };
    },
    runTransaction(updateFn) {
      chain = chain.then(async () => {
        const pendingWrites = new Map();
        const tx = {
          async get(ref) {
            return ref.get();
          },
          set(ref, data) {
            pendingWrites.set(ref._key, structuredClone(data));
          },
        };
        const result = await updateFn(tx);
        for (const [key, value] of pendingWrites) {
          store.set(key, value);
        }
        return result;
      });
      return chain;
    },
  };
}

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

test('breakdown API returns 409 while ACTIVE and full grading when COMPLETED', async () => {
  db.resetGameRoomsForTest();
  db.resetGameRoomSecretsForTest();
  await db.createGameRoom({
    roomId: '333333',
    hostUserId: 'fast-user',
    status: 'ACTIVE',
    topicPackIds: ['pop_culture_01'],
    questionCount: 1,
    timeLimitPerQuestion: 30,
    currentQuestionIndex: 0,
    players: [{ userId: 'fast-user', handle: 'Fast' }],
    scores: { 'fast-user': 0 },
    createdAt: '2026-11-25T12:00:00.000Z',
    dealQuestions: [oneQuestion],
  });
  await db.createGameRoomSecrets({
    roomId: '333333',
    currentQuestionIndex: 0,
    openedAt: 1,
    closesAt: 31_000,
    advancedThroughIndex: -1,
    secretQuestions: [{
      questionId: 'q-1',
      correctAnswerId: 'A',
      basePoints: 100,
      explanation: 'Because',
      sourceCitations: [{ title: 'S', link: 'https://example.com/a' }],
    }],
    responses: [],
  });
  const cookie = signSessionCookie({ uid: 'fast-user', provider: 'google.com', handle: 'Fast' });
  const active = await request('GET', '/api/games/333333/breakdown?page=1', { cookie });
  assert.equal(active.status, 409);
  assert.match(active.body, /game_not_complete/);

  await db.updateGameRoom('333333', (room) => {
    const secretsStub = {
      secretQuestions: [{ questionId: 'q-1', correctAnswerId: 'A', basePoints: 100 }],
      responses: [],
    };
    return {
      ...room,
      status: 'COMPLETED',
      playerSummaries: buildPlayerSummariesForCompletedRoom(room, {
        roomId: '333333',
        responses: [],
        secretQuestions: [{
          questionId: 'q-1',
          correctAnswerId: 'A',
          basePoints: 100,
          explanation: 'Because',
          sourceCitations: [{ title: 'S', link: 'https://example.com/a' }],
        }],
      }),
    };
  });

  const completed = await request('GET', '/api/games/333333/breakdown?page=1', { cookie });
  assert.equal(completed.status, 200);
  const body = JSON.parse(completed.body);
  assert.ok('metrics' in body);
});

test('buildMatchBreakdown throws BreakdownNotCompleteError for ACTIVE rooms', () => {
  const room = {
    roomId: '123456',
    hostUserId: 'host',
    status: 'ACTIVE',
    topicPackIds: ['pop_culture_01'],
    questionCount: 1,
    timeLimitPerQuestion: 30,
    currentQuestionIndex: 0,
    players: [{ userId: 'u1', handle: 'U1' }],
    scores: {},
    createdAt: '2026-11-20T12:00:00.000Z',
    dealQuestions: [oneQuestion],
  };
  const secrets = {
    roomId: '123456',
    currentQuestionIndex: 0,
    openedAt: 1,
    closesAt: 31_000,
    advancedThroughIndex: -1,
    secretQuestions: [{
      questionId: 'q-1',
      correctAnswerId: 'A',
      basePoints: 100,
      explanation: 'E',
      sourceCitations: [{ title: 'S', link: 'https://example.com/a' }],
    }],
    responses: [],
  };
  assert.throws(
    () => buildMatchBreakdown({ room, secrets, userId: 'u1', page: 1 }),
    BreakdownNotCompleteError,
  );
});

test('listGameRoomsForUser returns only COMPLETED rooms by default', async () => {
  db.resetGameRoomsForTest();
  const base = {
    hostUserId: 'viewer',
    topicPackIds: ['pop_culture_01'],
    questionCount: 1,
    timeLimitPerQuestion: 30,
    currentQuestionIndex: 0,
    players: [{ userId: 'viewer', handle: 'Viewer' }],
    createdAt: '2026-11-18T12:00:00.000Z',
  };
  await db.createGameRoom({ ...base, roomId: '111111', status: 'WAITING' });
  await db.createGameRoom({
    ...base,
    roomId: '222222',
    status: 'COMPLETED',
    scores: { viewer: 50 },
    dealQuestions: [oneQuestion],
    playerSummaries: {
      viewer: {
        score: 50,
        rank: 1,
        correctCount: 1,
        totalQuestions: 1,
        accuracyPercent: 100,
        avgSpeedSeconds: 1.2,
        maxScore: 100,
      },
    },
    createdAt: '2026-11-25T12:00:00.000Z',
  });
  const matches = await listRecentMatchesForUser('viewer');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].roomId, '222222');
});

function createMockFirestoreIndexFailure() {
  const base = createMockFirestoreWithQueries();
  const origCollection = base.collection.bind(base);
  base.collection = function collection(name) {
    const coll = origCollection(name);
    if (name !== 'game_rooms') {
      return coll;
    }
    return {
      doc(id) {
        return coll.doc(id);
      },
      where(field, op, value) {
        const chain = coll.where(field, op, value);
        const origGet = chain.get.bind(chain);
        chain.get = async () => {
          const err = new Error('9 FAILED_PRECONDITION: The query requires an index');
          err.code = 9;
          throw err;
        };
        return chain;
      },
    };
  };
  return base;
}

test('listGameRoomsForUser returns empty array on Firestore FAILED_PRECONDITION index error', async () => {
  const previousBackend = process.env.DATA_BACKEND;
  process.env.DATA_BACKEND = 'firestore';
  db.resetGameRoomsForTest();
  db.setFirestoreClientForTest(createMockFirestoreIndexFailure());
  db.setGameRoomPersistenceForTest('firestore');
  const rooms = await db.listGameRoomsForUser('viewer-fs', { limit: 10, status: 'COMPLETED' });
  assert.deepEqual(rooms, []);
  if (previousBackend === undefined) delete process.env.DATA_BACKEND;
  else process.env.DATA_BACKEND = previousBackend;
  db.resetGameRoomsForTest();
  db.resetGameRoomTestHooks();
});

test('listGameRoomsForUser uses bounded Firestore query when DATA_BACKEND=firestore', async () => {
  const previousBackend = process.env.DATA_BACKEND;
  process.env.DATA_BACKEND = 'firestore';
  db.resetGameRoomsForTest();
  const mock = createMockFirestoreWithQueries();
  db.setFirestoreClientForTest(mock);
  db.setGameRoomPersistenceForTest('firestore');

  await db.createGameRoom({
    roomId: '444444',
    hostUserId: 'viewer-fs',
    status: 'COMPLETED',
    topicPackIds: ['pop_culture_01'],
    questionCount: 1,
    timeLimitPerQuestion: 30,
    currentQuestionIndex: 0,
    players: [{ userId: 'viewer-fs', handle: 'Viewer' }],
    playerIds: ['viewer-fs'],
    scores: { 'viewer-fs': 80 },
    dealQuestions: [oneQuestion],
    playerSummaries: {
      'viewer-fs': {
        score: 80,
        rank: 1,
        correctCount: 1,
        totalQuestions: 1,
        accuracyPercent: 100,
        avgSpeedSeconds: 2.1,
        maxScore: 100,
      },
    },
    createdAt: '2026-11-24T12:00:00.000Z',
  });
  await db.createGameRoom({
    roomId: '555555',
    hostUserId: 'viewer-fs',
    status: 'WAITING',
    topicPackIds: ['pop_culture_01'],
    questionCount: 10,
    timeLimitPerQuestion: 30,
    currentQuestionIndex: -1,
    players: [{ userId: 'viewer-fs', handle: 'Viewer' }],
    playerIds: ['viewer-fs'],
    createdAt: '2026-11-26T12:00:00.000Z',
  });

  const rooms = await db.listGameRoomsForUser('viewer-fs', { limit: 10, status: 'COMPLETED' });
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].roomId, '444444');

  if (previousBackend === undefined) delete process.env.DATA_BACKEND;
  else process.env.DATA_BACKEND = previousBackend;
  db.resetGameRoomsForTest();
  db.resetGameRoomTestHooks();
});

test('buildDashboardMatchSummaries uses cached playerSummaries without secrets', () => {
  const room = {
    roomId: '999999',
    status: 'COMPLETED',
    hostUserId: 'viewer',
    topicPackIds: ['pop_culture_01'],
    questionCount: 2,
    players: [
      { userId: 'viewer', handle: 'Viewer' },
      { userId: 'other', handle: 'Other' },
    ],
    createdAt: '2026-11-20T12:00:00.000Z',
    dealQuestions: [oneQuestion, oneQuestion],
    playerSummaries: {
      viewer: {
        score: 120,
        rank: 1,
        correctCount: 2,
        totalQuestions: 2,
        accuracyPercent: 100,
        avgSpeedSeconds: 1.5,
        maxScore: 200,
      },
    },
  };
  const rows = buildDashboardMatchSummaries({ rooms: [room], userId: 'viewer' });
  assert.equal(rows.length, 1);
  assert.match(rows[0].score_label, /120 \/ 200 PTS/);
  assert.equal(rows[0].accuracy, '100%');
  assert.equal(rows[0].rounds, '2/2');
});