const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';

const {
  buildInviteUrl,
  filterAndPageTopicPacks,
  isValidGamePin,
  reserveGamePin,
  resolvePublicBaseUrl,
  toPublicGameJson,
} = require('../lib/rooms');
const { listTopicPacks, resetGameRoomsForTest, resetUserProfilesForTest } = require('../db');
const { signSessionCookie } = require('../auth');
const { renderDashboardPage, renderHostLobbyPage, renderWaitingRoomPage } = require('../lib/player-pages');
const app = require('../index');

const SECRET_KEYS = ['correctAnswerId', 'explanation', 'sourceCitations'];

function extractHeader(html) {
  const match = html.match(/<header[\s\S]*?<\/header>/i);
  return match ? match[0] : '';
}

function assertLaunchPlacement(html) {
  const inviteIdx = html.indexOf('pq-invite-url');
  const launchIdx = html.indexOf('launch-game-btn');
  const gridIdx = html.indexOf('pq-host-player-grid-card');
  assert.ok(inviteIdx > -1 && launchIdx > -1 && gridIdx > -1);
  assert.ok(inviteIdx < launchIdx && launchIdx < gridIdx);
}

function request(method, pathname, { body, cookie, headers, host } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const reqHeaders = { ...(headers || {}) };
      if (cookie) {
        reqHeaders.Cookie = cookie;
      }
      if (host) {
        reqHeaders.Host = host;
      }
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
      req.on('error', (err) => {
        server.close(() => reject(err));
      });
      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  });
}

function jsonRequest(method, pathname, data, cookie, host) {
  const body = data === undefined ? undefined : JSON.stringify(data);
  const headers = body
    ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    : {};
  return request(method, pathname, { cookie, body, headers, host });
}

function formRequest(method, pathname, fields, cookie) {
  const params = new URLSearchParams();
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value)) {
        value.forEach((entry) => params.append(key, entry));
      } else if (value !== undefined) {
        params.append(key, value);
      }
    }
  }
  const body = params.toString();
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(body),
  };
  return request(method, pathname, { cookie, body, headers });
}

test('new game PINs match six digits and collision retries within five attempts', async () => {
  const occupied = new Set(['111111', '222222']);
  let call = 0;
  const rng = () => {
    call += 1;
    if (call === 1) return 0.111111;
    if (call === 2) return 0.222222;
    return 0.849849;
  };
  const pin = await reserveGamePin({
    exists: async (candidate) => occupied.has(candidate),
    rng,
    maxAttempts: 5,
  });
  assert.match(pin, /^\d{6}$/);
  assert.equal(pin, '849849');
  assert.equal(isValidGamePin('12345'), false);
  assert.equal(isValidGamePin('1234567'), false);
  assert.equal(isValidGamePin('123456'), true);
});

test('pack search is case-insensitive with six per page and pager label', () => {
  const packs = listTopicPacks({ limit: 24 });
  assert.ok(packs.length > 6, 'seed must expose more than six packs for pagination');
  const all = filterAndPageTopicPacks(packs, { search: '', page: 1 });
  assert.equal(all.packs.length, 6);
  assert.equal(all.pagerLabel, `Showing 1–6 of ${packs.length} Topics`);

  const gaming = filterAndPageTopicPacks(packs, { search: 'GAMING', page: 1 });
  assert.ok(gaming.packs.length >= 1);
  assert.ok(
    gaming.packs.every((pack) => {
      const hay = `${pack.title} ${pack.category} ${pack.description}`.toLowerCase();
      return hay.includes('gaming');
    }),
  );
});

test('inviteUrl honors APP_BASE_URL and join?game= query', () => {
  const previous = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = 'http://localhost:8080/';
  assert.equal(buildInviteUrl('489028', resolvePublicBaseUrl()), 'http://localhost:8080/join?game=489028');
  if (previous === undefined) delete process.env.APP_BASE_URL;
  else process.env.APP_BASE_URL = previous;
  assert.equal(buildInviteUrl('123456', 'https://example.test'), 'https://example.test/join?game=123456');
});

test('resolvePublicBaseUrl falls back to request origin', () => {
  const base = resolvePublicBaseUrl({
    secure: false,
    get: (name) => (name === 'host' ? '127.0.0.1:3333' : undefined),
    headers: {},
  });
  assert.equal(base, 'http://127.0.0.1:3333');
});

test('dashboard CREATE NEW GAME submits POST /game and includes match modal shell', () => {
  const html = renderDashboardPage({ uid: 'u1', handle: 'Neo7', provider: 'google.com' });
  assert.match(html, /action="\/game"/);
  assert.match(html, /method="post"/i);
  assert.match(html, /id="pq-create-game-cta"/);
  assert.ok(!html.includes('action="/api/rooms"'));
  assert.ok(!html.includes('POST /api/rooms'));
  assert.match(html, /id="pq-dashboard-sign-out"/);
  assert.match(html, /class="pq-dashboard-signout/);
  assert.match(html, /action="\/api\/auth\/signout"/);
  assert.match(html, /Sign Out/i);
  assert.match(html, /pq-dashboard-handle/);
  assert.match(html, /text-\[#ff2d78\]/);
  assert.match(html, /pq-dashboard-card--start/);
  assert.match(html, /pq-dashboard-card--join/);
  assert.match(html, /pq-join-pin-input/);
  assert.match(html, /pq-dashboard-history-table/);
  assert.match(html, /Complete a live session to populate your match history/);
  assert.match(html, /id="match-modal"/);
  assert.match(html, /id="modal-game-code"/);
  assert.match(html, /text-\[#00ffcc\][^"]*" id="modal-game-code"/);
  assert.match(html, /id="modal-rounds"/);
  assert.match(html, /id="modal-leaderboard-list"/);
  assert.match(html, /id="modal-leaderboard-pager"/);
  assert.match(html, /pq-match-modal/);
  assert.match(html, /pq-match-modal-corner--tl/);
  assert.match(html, /pq-match-modal-corner--tr/);
  assert.match(html, /pq-match-modal-corner--bl/);
  assert.match(html, /pq-match-modal-corner--br/);
  assert.match(html, /dashboard-match-modal\.js/);
});

test('POST /game/:gamePin/launch deals deck and zero-pack shows inline alert', async () => {
  resetGameRoomsForTest();
  resetUserProfilesForTest();
  const cookie = signSessionCookie({
    uid: 'host-launch',
    provider: 'google.com',
    handle: 'HostLaunch',
  });
  const createRes = await request('POST', '/game', { cookie });
  assert.equal(createRes.status, 303);
  const location = createRes.headers.location || '';
  assert.match(location, /^\/game\/\d{6}$/);
  const gamePin = location.split('/').pop();

  const launchRes = await formRequest(
    'POST',
    `/game/${gamePin}/launch`,
    { topicPackIds: ['pop_culture_01', 'science_tech_01'] },
    cookie,
  );
  assert.equal(launchRes.status, 303);
  assert.match(launchRes.headers.location || '', new RegExp(`/game/${gamePin}/play$`));
  const activeRoom = await require('../db').getGameRoom(gamePin);
  assert.equal(activeRoom.status, 'ACTIVE');
  assert.equal(activeRoom.questionCount, 20);
  assert.equal(activeRoom.dealQuestions.length, 20);

  const createEmptyRes = await request('POST', '/game', { cookie });
  const emptyPin = (createEmptyRes.headers.location || '').split('/').pop();
  const emptyRes = await formRequest('POST', `/game/${emptyPin}/launch`, {}, cookie);
  assert.equal(emptyRes.status, 200);
  assert.match(emptyRes.body, /role="alert"/i);
  assert.match(emptyRes.body, /Select at least one topic pack/i);
  assert.ok(!emptyRes.body.includes('Invalid pack selection'));

  const createInvalidRes = await request('POST', '/game', { cookie });
  const invalidPin = (createInvalidRes.headers.location || '').split('/').pop();
  const invalidRes = await formRequest(
    'POST',
    `/game/${invalidPin}/launch`,
    { topicPackIds: ['not-valid!!'] },
    cookie,
  );
  assert.equal(invalidRes.status, 200);
  assert.match(invalidRes.body, /role="alert"/i);
  assert.ok(!invalidRes.body.includes('Invalid pack selection'));
});

test('GET /game/:gamePin lobby uses Game PIN labels and not Room PIN', async () => {
  resetGameRoomsForTest();
  const hostCookie = signSessionCookie({
    uid: 'host-lobby',
    provider: 'google.com',
    handle: 'HostLobby',
  });
  const gameRes = await request('POST', '/game', { cookie: hostCookie });
  assert.equal(gameRes.status, 303);
  const location = gameRes.headers.location || '';
  assert.match(location, /^\/game\/\d{6}$/);
  const gamePin = location.split('/').pop();
  const lobbyRes = await request('GET', location, { cookie: hostCookie });
  assert.equal(lobbyRes.status, 200);
  assert.match(lobbyRes.body, /GAME PIN RESERVATION/);
  assert.ok(!/ROOM PIN/i.test(lobbyRes.body));
  assert.ok(!/\/game\/\d{6}\/host/.test(lobbyRes.body));
  assert.match(lobbyRes.body, new RegExp(`/game/${gamePin}`));
  assert.match(lobbyRes.body, /join\?game=/);
  const lobbyHeader = extractHeader(lobbyRes.body);
  assert.ok(!lobbyHeader.includes('GAME PIN'));
  assertLaunchPlacement(lobbyRes.body);
});

test('host and waiting pages keep game pin and players out of top header chrome', () => {
  const hostHtml = renderHostLobbyPage({
    session: { uid: 'host1', handle: 'Neo7', provider: 'google.com' },
    room: {
      roomId: '361235',
      status: 'WAITING',
      players: [{ userId: 'host1', handle: 'Neo7' }, { userId: 'p2', handle: 'Ally' }],
      topicPackIds: [],
    },
    packView: {
      packs: [],
      pagerLabel: 'Showing 0–0 of 0 Topics',
      page: 1,
      totalPages: 1,
      search: '',
      selectedIds: [],
    },
    inviteUrl: 'http://localhost:8080/join?game=361235',
  });
  const waitHtml = renderWaitingRoomPage({
    session: { uid: 'p2', handle: 'Ally', provider: 'google.com' },
    room: {
      roomId: '361235',
      status: 'WAITING',
      players: [{ userId: 'host1', handle: 'Neo7' }, { userId: 'p2', handle: 'Ally' }],
    },
  });
  const hostHeader = extractHeader(hostHtml);
  const waitHeader = extractHeader(waitHtml);
  assert.ok(!hostHeader.includes('GAME PIN'));
  assert.ok(!hostHeader.includes('PLAYERS'));
  assert.ok(!waitHeader.includes('GAME PIN'));
  assert.ok(!waitHeader.includes('PLAYERS'));
  assert.match(hostHtml, /GAME PIN RESERVATION/);
  assert.match(waitHtml, /PLAYER GRID/);
});

test('host lobby places launch CTA between invite block and player grid', () => {
  const hostHtml = renderHostLobbyPage({
    session: { uid: 'host1', handle: 'Neo7', provider: 'google.com' },
    room: {
      roomId: '123456',
      status: 'WAITING',
      players: [{ userId: 'host1', handle: 'Neo7' }],
      topicPackIds: [],
    },
    packView: {
      packs: [
        {
          topicPackId: 'pop_culture_01',
          title: 'Pop Culture',
          category: 'Film',
          icon: 'movie',
          totalQuestions: 10,
          isFeatured: true,
        },
      ],
      pagerLabel: 'Showing 1–1 of 1 Topics',
      page: 1,
      totalPages: 1,
      search: '',
      selectedIds: [],
    },
    inviteUrl: 'http://localhost:8080/join?game=123456',
  });
  assertLaunchPlacement(hostHtml);
  assert.ok(!hostHtml.includes('Pack selection is saved on the lobby'));
  assert.match(hostHtml, /pq-topic-card/);
  assert.match(hostHtml, /aria-checked="/);
  assert.match(hostHtml, /host-topic-cards\.js/);
  assert.match(hostHtml, /from-\[#ff2d78\].*to-\[#00ffcc\]/);
  assert.match(hostHtml, /pq-invite-copy-btn/);
  assert.match(hostHtml, /pq-launch-btn/);
  assert.match(hostHtml, /id="launch-game-form"/);
  assert.match(hostHtml, /form="launch-game-form"/);
  assert.match(hostHtml, /id="pq-launch-pack-hidden"/);
  assert.match(hostHtml, /pq-lobby-panel--topics/);
  assert.match(hostHtml, /pq-pager-btn--active/);
  assert.ok(!hostHtml.includes('bg-gradient-to-r from-primary'));
});

test('lobby HTML escapes handles and pack titles with HTML characters', () => {
  const hostHtml = renderHostLobbyPage({
    session: { uid: 'host1', handle: 'Neo7', provider: 'google.com' },
    room: {
      roomId: '123456',
      status: 'WAITING',
      players: [{ userId: 'host1', handle: '<script>' }],
      topicPackIds: [],
    },
    packView: {
      packs: [
        {
          topicPackId: 'evil_pack',
          title: '<b>Evil</b>',
          category: 'Test',
          icon: 'quiz',
          totalQuestions: 10,
          isFeatured: false,
        },
      ],
      pagerLabel: 'Showing 1–1 of 1 Topics',
      page: 1,
      totalPages: 1,
      search: '',
      selectedIds: [],
    },
    inviteUrl: 'http://localhost:8080/join?game=123456',
  });
  assert.ok(!hostHtml.includes('<b>Evil</b>'));
  assert.ok(hostHtml.includes('&lt;b&gt;Evil&lt;/b&gt;'));
  assert.ok(hostHtml.includes('&lt;script&gt;'));
  assert.ok(!hostHtml.includes('"><script>'));

  const waitHtml = renderWaitingRoomPage({
    session: { uid: 'p2', handle: 'Ally', provider: 'google.com' },
    room: {
      roomId: '123456',
      status: 'WAITING',
      players: [{ userId: 'p2', handle: '<img>' }],
    },
  });
  assert.ok(!waitHtml.includes('<img>'));
  assert.ok(waitHtml.includes('&lt;img&gt;'));
  assert.ok(!/ROOM PIN/i.test(waitHtml));
});

test('GET /api/games/:gamePin returns public game fields only', async () => {
  resetUserProfilesForTest();
  resetGameRoomsForTest();
  const hostCookie = signSessionCookie({
    uid: 'host-game-api',
    provider: 'google.com',
    handle: 'HostApi',
  });
  const createRes = await jsonRequest('POST', '/api/games', {}, hostCookie, '127.0.0.1:9001');
  assert.equal(createRes.status, 201);
  const created = JSON.parse(createRes.body);
  assert.match(created.gamePin, /^\d{6}$/);
  assert.match(created.inviteUrl, /\/join\?game=\d{6}$/);

  const joinCookie = signSessionCookie({
    uid: 'joiner1',
    provider: 'google.com',
    handle: 'Joiner1',
  });
  const joinRes = await request('GET', `/join?game=${created.gamePin}`, { cookie: joinCookie });
  assert.equal(joinRes.status, 200);

  const apiRes = await request('GET', `/api/games/${created.gamePin}`);
  assert.equal(apiRes.status, 200);
  const game = JSON.parse(apiRes.body);
  assert.ok(Array.isArray(game.players));
  assert.equal(game.status, 'WAITING');
  assert.equal(game.gamePin, created.gamePin);
  for (const key of SECRET_KEYS) {
    assert.equal(game[key], undefined, `public game must not expose ${key}`);
  }
});

test('POST /api/games inviteUrl uses request host when APP_BASE_URL unset', async () => {
  resetGameRoomsForTest();
  delete process.env.APP_BASE_URL;
  delete process.env.PUBLIC_BASE_URL;
  const hostCookie = signSessionCookie({
    uid: 'host-base-url',
    provider: 'google.com',
    handle: 'BaseUrl',
  });
  const createRes = await jsonRequest('POST', '/api/games', {}, hostCookie, '127.0.0.1:4242');
  const created = JSON.parse(createRes.body);
  assert.equal(created.inviteUrl, `http://127.0.0.1:4242/join?game=${created.gamePin}`);
});

test('game module and routes avoid server timers and WebSockets', () => {
  const files = [
    path.join(__dirname, '..', 'lib', 'rooms.js'),
    path.join(__dirname, '..', 'index.js'),
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(!source.includes('setInterval'), `${path.basename(file)} must not use setInterval`);
    assert.ok(!source.includes('setTimeout'), `${path.basename(file)} must not use setTimeout`);
    assert.ok(!/\bWebSocket\b/.test(source), `${path.basename(file)} must not use WebSocket`);
  }
});

test('toPublicGameJson strips nested secret fields and exposes gamePin', () => {
  const payload = toPublicGameJson({
    roomId: '123456',
    status: 'WAITING',
    players: [{ userId: 'u1', handle: 'Neo7' }],
    questions: [
      {
        questionText: 'Q?',
        options: [{ id: 'A', text: 'a' }],
        correctAnswerId: 'A',
        explanation: 'Because',
        sourceCitations: [{ title: 'T', link: 'https://example.com' }],
      },
    ],
  });
  assert.equal(payload.gamePin, '123456');
  assert.equal(payload.correctAnswerId, undefined);
  assert.equal(payload.questions, undefined);
});