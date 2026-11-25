const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const db = require('../db');
const { joinWaitingGame, createWaitingGame } = require('../lib/rooms');

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
      return {
        doc(id) {
          return docRef(name, id);
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

test('Firestore-backed game room CRUD strips forbidden fields', async () => {
  db.resetGameRoomsForTest();
  const mock = createMockFirestore();
  db.setFirestoreClientForTest(mock);
  db.setGameRoomPersistenceForTest('firestore');

  const room = {
    roomId: '123456',
    hostUserId: 'host-1',
    status: 'WAITING',
    topicPackIds: [],
    questionCount: 10,
    timeLimitPerQuestion: 30,
    currentQuestionIndex: -1,
    players: [{ userId: 'host-1', handle: 'HostOne' }],
    createdAt: new Date().toISOString(),
    correctAnswerId: 'A',
    explanation: 'secret',
    sourceCitations: [{ title: 'T', link: 'https://example.com' }],
    questions: [{ questionText: 'Q?' }],
  };

  await db.createGameRoom(room);
  const stored = mock.store.get('game_rooms/123456');
  assert.ok(stored);
  assert.equal(stored.correctAnswerId, undefined);
  assert.equal(stored.explanation, undefined);
  assert.equal(stored.questions, undefined);

  const loaded = await db.getGameRoom('123456');
  assert.equal(loaded.hostUserId, 'host-1');

  await db.updateGameRoom('123456', (current) => ({
    ...current,
    topicPackIds: ['pop_culture_01'],
  }));
  const updated = await db.getGameRoom('123456');
  assert.deepEqual(updated.topicPackIds, ['pop_culture_01']);

  db.setGameRoomPersistenceForTest('memory');
  db.setFirestoreClientForTest(null);
  db.resetGameRoomsForTest();
});

test('concurrent player joins preserve every player', async () => {
  db.resetGameRoomsForTest();
  db.setGameRoomPersistenceForTest('memory');

  const waiting = await createWaitingGame({
    hostUserId: 'host-cc',
    hostHandle: 'HostCc',
    rng: () => 0.123456,
  });
  const pin = waiting.roomId;

  const [joinA, joinB] = await Promise.all([
    joinWaitingGame({ gamePin: pin, userId: 'player-a', handle: 'Alpha' }),
    joinWaitingGame({ gamePin: pin, userId: 'player-b', handle: 'Beta' }),
  ]);

  assert.equal(joinA.ok, true);
  assert.equal(joinB.ok, true);

  const room = await db.getGameRoom(pin);
  const ids = new Set(room.players.map((player) => player.userId));
  assert.ok(ids.has('host-cc'));
  assert.ok(ids.has('player-a'));
  assert.ok(ids.has('player-b'));
  assert.equal(room.players.length, 3);
});