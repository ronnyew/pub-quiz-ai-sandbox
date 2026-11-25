const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';

const pathFixed = require('node:path');

const { resetGameRoomsForTest, resetUserProfilesForTest } = require('../db');
const { signSessionCookie } = require('../auth');
const app = require('../index');

function request(method, pathname, { body, cookie, headers } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const reqHeaders = { ...(headers || {}) };
      if (cookie) {
        reqHeaders.Cookie = cookie;
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

function jsonRequest(method, pathname, data, cookie) {
  const body = data === undefined ? undefined : JSON.stringify(data);
  const headers = body
    ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    : {};
  return request(method, pathname, { cookie, body, headers });
}

test('GET /game does not create a room; POST /game does and redirects with 303', async () => {
  resetGameRoomsForTest();
  const cookie = signSessionCookie({
    uid: 'get-post-game',
    provider: 'google.com',
    handle: 'GetPost',
  });

  const before = await request('GET', '/api/games/000001');
  assert.equal(before.status, 404);

  const getShell = await request('GET', '/game', { cookie });
  assert.equal(getShell.status, 200);
  assert.match(getShell.body, /method="post"/i);
  assert.match(getShell.body, /action="\/game"/);

  const createRes = await request('POST', '/game', { cookie });
  assert.equal(createRes.status, 303);
  const location = createRes.headers.location || '';
  assert.match(location, /^\/game\/\d{6}$/);
  const gamePin = location.split('/').pop();

  const apiRes = await request('GET', `/api/games/${gamePin}`);
  assert.equal(apiRes.status, 200);
});

test('POST /api/rooms and GET /api/rooms/:pin mirror /api/games handlers', async () => {
  resetGameRoomsForTest();
  const cookie = signSessionCookie({
    uid: 'rooms-alias',
    provider: 'google.com',
    handle: 'Alias',
  });

  const createRes = await jsonRequest('POST', '/api/rooms', {}, cookie);
  assert.equal(createRes.status, 201);
  const created = JSON.parse(createRes.body);
  assert.match(created.gamePin, /^\d{6}$/);
  assert.match(created.inviteUrl, /\/join\?game=/);

  const getRes = await request('GET', `/api/rooms/${created.gamePin}`);
  assert.equal(getRes.status, 200);
  const room = JSON.parse(getRes.body);
  assert.equal(room.gamePin, created.gamePin);
  assert.equal(room.correctAnswerId, undefined);
});

test('dashboard-match-modal.js does not assign innerHTML from data-outcome', () => {
  const source = fs.readFileSync(
    pathFixed.join(__dirname, '..', 'public', 'scripts', 'dashboard-match-modal.js'),
    'utf8',
  );
  assert.ok(!source.includes('.innerHTML'), 'modal must not use innerHTML for outcomes');
});