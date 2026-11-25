const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';

const db = require('../db');
const { parseJoinIntentPayload, signJoinIntentPayload, signSessionCookie } = require('../auth');
const { createWaitingGame } = require('../lib/rooms');
const app = require('../index');

function cookieFromSetCookie(headers) {
  const raw = headers['set-cookie'];
  const line = Array.isArray(raw) ? raw.find((entry) => entry.startsWith('pq_join_intent=')) : raw;
  if (!line) return null;
  return line.split(';')[0];
}

function request(method, pathname, { cookie, headers, body } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const reqHeaders = { ...(headers || {}) };
      if (cookie) reqHeaders.Cookie = cookie;
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
      if (body) req.write(body);
      req.end();
    });
  });
}

function jsonRequest(method, pathname, data, cookie) {
  const body = JSON.stringify(data);
  return request(method, pathname, {
    cookie,
    body,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  });
}

test('unsigned join intent cookie round-trips valid game pin', () => {
  const token = signJoinIntentPayload('256026');
  assert.equal(parseJoinIntentPayload(token), '256026');
  assert.equal(parseJoinIntentPayload('bad.token'), null);
});

test('unauthenticated GET /join stores intent and redirects to gateway', async () => {
  db.resetGameRoomsForTest();
  const waiting = await createWaitingGame({
    hostUserId: 'host-ji',
    hostHandle: 'HostJi',
    rng: () => 0.123456,
  });
  const pin = waiting.roomId;
  const res = await request('GET', `/join?game=${pin}`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, `/?join=${pin}`);
  const intentCookie = cookieFromSetCookie(res.headers);
  assert.ok(intentCookie);
  assert.equal(parseJoinIntentPayload(intentCookie.split('=')[1]), pin);
});

test('returning user signs in once with join intent then lands on waiting room', async () => {
  db.resetGameRoomsForTest();
  db.resetUserProfilesForTest();
  await db.saveUserProfile('returning-join', { handle: 'Joiner7', provider: 'google.com' });
  const waiting = await createWaitingGame({
    hostUserId: 'host-ji2',
    hostHandle: 'HostJi2',
    rng: () => 0.234567,
  });
  const pin = waiting.roomId;

  const boot = await request('GET', `/join?game=${pin}`);
  const intentCookie = cookieFromSetCookie(boot.headers);
  assert.ok(intentCookie);

  const sessionRes = await jsonRequest(
    'POST',
    '/api/auth/session',
    { uid: 'returning-join', provider: 'google.com', email: null },
    intentCookie,
  );
  assert.equal(sessionRes.status, 200);
  const payload = JSON.parse(sessionRes.body);
  assert.equal(payload.redirectTo, `/join?game=${pin}`);

  const sessionLine = Array.isArray(sessionRes.headers['set-cookie'])
    ? sessionRes.headers['set-cookie'].find((line) => line.startsWith('pq_session='))
    : sessionRes.headers['set-cookie'];
  const joinCookie = `${intentCookie}; ${sessionLine.split(';')[0]}`;
  const joinRes = await request('GET', `/join?game=${pin}`, { cookie: joinCookie });
  assert.equal(joinRes.status, 200);
  assert.match(joinRes.body, /Waiting for host/i);
});

test('new user flow: join intent survives login and handle onboarding', async () => {
  db.resetGameRoomsForTest();
  db.resetUserProfilesForTest();
  const waiting = await createWaitingGame({
    hostUserId: 'host-ji3',
    hostHandle: 'HostJi3',
    rng: () => 0.345678,
  });
  const pin = waiting.roomId;

  const boot = await request('GET', `/join?game=${pin}`);
  const intentCookie = cookieFromSetCookie(boot.headers);

  const sessionRes = await jsonRequest(
    'POST',
    '/api/auth/session',
    { uid: 'new-join', provider: 'google.com', email: null },
    intentCookie,
  );
  const authPayload = JSON.parse(sessionRes.body);
  assert.equal(authPayload.redirectTo, '/onboarding/handle');

  const sessionLine = Array.isArray(sessionRes.headers['set-cookie'])
    ? sessionRes.headers['set-cookie'][0]
    : sessionRes.headers['set-cookie'];
  const sessionPair = sessionLine.split(';')[0];
  const authed = `${intentCookie}; ${sessionPair}`;

  const handleRes = await request(
    'POST',
    '/onboarding/handle',
    {
      cookie: authed,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'handle=NewJoin9',
    },
  );
  assert.equal(handleRes.status, 302);
  assert.equal(handleRes.headers.location, `/join?game=${pin}`);
});