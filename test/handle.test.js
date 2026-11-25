const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';

const { validateHandle, parseSessionPayload, signSessionCookie } = require('../auth');
const { getUserProfile, resetUserProfilesForTest } = require('../db');
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

test('validateHandle rejects invalid handles and accepts Neo7', () => {
  const invalid = ['ab', 'a'.repeat(19), 'neo 7', 'neo!7', 'bad-handle'];
  for (const value of invalid) {
    assert.equal(validateHandle(value), null, `expected rejection for ${value}`);
  }
  assert.equal(validateHandle('Neo7'), 'Neo7');
});

test('POST /api/handle stores a valid handle when authenticated', async () => {
  resetUserProfilesForTest();
  const session = signSessionCookie({ uid: 'u1', provider: 'google.com' });
  const res = await jsonRequest('POST', '/api/handle', { handle: 'Neo7' }, session);
  assert.equal(res.status, 200);
  const parsed = JSON.parse(res.body);
  assert.equal(parsed.handle, 'Neo7');
  const profile = await getUserProfile('u1');
  assert.equal(profile.handle, 'Neo7');
  const setCookie = res.headers['set-cookie'];
  const line = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const token = line.split(';')[0].split('=').slice(1).join('=');
  const decoded = parseSessionPayload(token);
  assert.equal(decoded.handle, 'Neo7');
  assert.doesNotMatch(JSON.stringify(decoded), /"email"/);
});

test('POST /onboarding/handle echoes submitted value escaped in HTML', async () => {
  const session = signSessionCookie({ uid: 'u2', provider: 'google.com' });
  const body = new URLSearchParams({ handle: '<script' }).toString();
  const res = await request('POST', '/onboarding/handle', {
    cookie: session,
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  });
  assert.equal(res.status, 400);
  assert.match(res.body, /value="&lt;script"/);
});

test('signed-in GET / with handle redirects to dashboard', async () => {
  const session = signSessionCookie({
    uid: 'u3',
    provider: 'google.com',
    handle: 'Neo7',
  });
  const res = await request('GET', '/', { cookie: session });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/dashboard');
});

test('unsigned GET / keeps wordmark href on home', async () => {
  const res = await request('GET', '/');
  assert.equal(res.status, 200);
  assert.match(res.body, /<a[^>]+href="\/"[^>]*>[\s\S]*PUB QUIZ/i);
});

test('GET /dashboard redirects to onboarding when handle is missing', async () => {
  const session = signSessionCookie({ uid: 'dash_no_handle', provider: 'google.com' });
  const res = await request('GET', '/dashboard', { cookie: session });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/onboarding/handle');
});

test('/terms and /privacy still return 200 after auth routes mount', async () => {
  for (const path of ['/terms', '/privacy']) {
    const res = await request('GET', path);
    assert.equal(res.status, 200, path);
  }
});