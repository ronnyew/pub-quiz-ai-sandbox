const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';

const db = require('../db');
const {
  buildInviteUrl,
  createWaitingGame,
  joinWaitingGame,
  resolvePublicBaseUrl,
} = require('../lib/rooms');
const { formatCopyTemplate, getStaticCopy, resetSiteContentCache } = require('../lib/content-store');
const { renderDashboardPage } = require('../lib/player-pages');

function createMockFirestore() {
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

  return {
    store,
    collection(name) {
      return { doc(id) { return docRef(name, id); } };
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

test('DATA_BACKEND=firestore allows createGameRoom and listTopicPacks in one process', async () => {
  const previousBackend = process.env.DATA_BACKEND;
  process.env.DATA_BACKEND = 'firestore';
  db.resetGameRoomsForTest();
  db.seed();

  const mock = createMockFirestore();
  db.setFirestoreClientForTest(mock);
  db.setGameRoomPersistenceForTest('firestore');

  await db.createGameRoom({
    roomId: '654321',
    hostUserId: 'host-fs',
    status: 'WAITING',
    topicPackIds: [],
    questionCount: 10,
    timeLimitPerQuestion: 30,
    currentQuestionIndex: -1,
    players: [{ userId: 'host-fs', handle: 'HostFs' }],
    createdAt: new Date().toISOString(),
  });

  const packs = db.listTopicPacks({ limit: 4 });
  assert.ok(packs.length >= 4);

  if (previousBackend === undefined) delete process.env.DATA_BACKEND;
  else process.env.DATA_BACKEND = previousBackend;
  db.resetGameRoomsForTest();
});

test('duplicate concurrent joins for the same userId dedupe inside atomic updater', async () => {
  db.resetGameRoomsForTest();
  db.setGameRoomPersistenceForTest('memory');

  const waiting = await createWaitingGame({
    hostUserId: 'host-dedupe',
    hostHandle: 'HostDedupe',
    rng: () => 0.222222,
  });

  await Promise.all([
    joinWaitingGame({ gamePin: waiting.roomId, userId: 'dup-1', handle: 'Dup' }),
    joinWaitingGame({ gamePin: waiting.roomId, userId: 'dup-1', handle: 'Dup' }),
  ]);

  const room = await db.getGameRoom(waiting.roomId);
  const dupes = room.players.filter((player) => player.userId === 'dup-1');
  assert.equal(dupes.length, 1);
});

test('createWaitingGame retries PIN reservation on create collision', async () => {
  db.resetGameRoomsForTest();
  const mock = createMockFirestore();
  db.setFirestoreClientForTest(mock);
  db.setGameRoomPersistenceForTest('firestore');

  let rngCall = 0;
  const rng = () => {
    rngCall += 1;
    if (rngCall === 1) return 0.111111;
    return 0.849849;
  };

  await db.createGameRoom({
    roomId: '111111',
    hostUserId: 'blocker',
    status: 'WAITING',
    topicPackIds: [],
    questionCount: 10,
    timeLimitPerQuestion: 30,
    currentQuestionIndex: -1,
    players: [{ userId: 'blocker', handle: 'Block' }],
    createdAt: new Date().toISOString(),
  });

  const room = await createWaitingGame({
    hostUserId: 'host-retry',
    hostHandle: 'Retry',
    rng,
  });
  assert.equal(room.roomId, '849849');
});

test('dashboard history pager uses site-content template', () => {
  resetSiteContentCache();
  const html = renderDashboardPage({ uid: 'u1', handle: 'Neo7', provider: 'google.com' });
  const expected = formatCopyTemplate(getStaticCopy().dashboard.history_sessions_pager_template, {
    count: 1,
    total: 1,
  });
  assert.match(html, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('buildInviteUrl defaults to pubquiz.app when base URL is absent', () => {
  const previous = process.env.APP_BASE_URL;
  delete process.env.APP_BASE_URL;
  delete process.env.PUBLIC_BASE_URL;
  assert.equal(buildInviteUrl('123456', resolvePublicBaseUrl()), 'https://pubquiz.app/join?game=123456');
  if (previous === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = previous;
});