const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';

const {
  createRateLimiter,
  createSensitiveRouteRateLimiter,
  resetRateLimitBucketsForTest,
  resolveRateLimitKey,
  shouldApplyRateLimit,
} = require('../lib/rate-limit');

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json() {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    type() {
      return this;
    },
    send() {},
  };
}

function runLimiter(limiter, req) {
  const res = mockRes();
  let nextCalled = false;
  limiter(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

test('shouldApplyRateLimit covers auth, handle, onboarding, and game APIs', () => {
  assert.equal(shouldApplyRateLimit('/api/auth/session'), true);
  assert.equal(shouldApplyRateLimit('/api/handle'), true);
  assert.equal(shouldApplyRateLimit('/onboarding/handle'), true);
  assert.equal(shouldApplyRateLimit('/api/games/123456/answers'), true);
  assert.equal(shouldApplyRateLimit('/api/rooms/123456/breakdown'), true);
  assert.equal(shouldApplyRateLimit('/health'), false);
  assert.equal(shouldApplyRateLimit('/dashboard'), false);
});

test('createRateLimiter is a no-op when NODE_ENV is test and enabled is not set', () => {
  resetRateLimitBucketsForTest();
  const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
  const first = runLimiter(limiter, { headers: {}, path: '/api/auth/session', ip: '127.0.0.1' });
  const second = runLimiter(limiter, { headers: {}, path: '/api/auth/session', ip: '127.0.0.1' });
  assert.equal(first.nextCalled, true);
  assert.equal(second.nextCalled, true);
  assert.equal(first.res.statusCode, 200);
  assert.equal(second.res.statusCode, 200);
});

test('authenticated users on the same req.ip use independent buckets', () => {
  resetRateLimitBucketsForTest();
  const limiter = createSensitiveRouteRateLimiter({
    enabled: true,
    readMax: 2,
    writeMax: 2,
    defaultMax: 2,
    windowMs: 60_000,
  });
  const sharedIp = '203.0.113.50';
  const base = {
    headers: {},
    ip: sharedIp,
    method: 'GET',
    path: '/api/games/123456/question',
  };

  const userOne = { ...base, user: { uid: 'uid-1' } };
  const userTwo = { ...base, user: { uid: 'uid-2' } };

  assert.equal(runLimiter(limiter, userOne).nextCalled, true);
  assert.equal(runLimiter(limiter, userOne).nextCalled, true);
  const blocked = runLimiter(limiter, userOne);
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.headers['Retry-After'], '60');

  const otherUser = runLimiter(limiter, userTwo);
  assert.equal(otherUser.nextCalled, true);
  assert.equal(otherUser.res.statusCode, 200);
});

test('resolveRateLimitKey ignores spoofed X-Forwarded-For and keys unauthenticated traffic by req.ip', () => {
  resetRateLimitBucketsForTest();
  const limiter = createRateLimiter({ enabled: true, max: 2, windowMs: 60_000, tier: 'default' });
  const reqBase = {
    path: '/api/auth/session',
    method: 'POST',
    ip: '198.51.100.10',
    headers: { 'x-forwarded-for': '203.0.113.1' },
  };
  assert.equal(resolveRateLimitKey(reqBase), 'ip:198.51.100.10');

  assert.equal(runLimiter(limiter, reqBase).nextCalled, true);
  reqBase.headers['x-forwarded-for'] = '198.51.100.99';
  assert.equal(runLimiter(limiter, reqBase).nextCalled, true);
  const blocked = runLimiter(limiter, reqBase);
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.res.statusCode, 429);
});

test('game API read and write tiers enforce separate thresholds', () => {
  resetRateLimitBucketsForTest();
  const limiter = createSensitiveRouteRateLimiter({
    enabled: true,
    readMax: 3,
    writeMax: 2,
    defaultMax: 120,
    windowMs: 60_000,
  });
  const user = {
    user: { uid: 'player-a' },
    ip: '10.0.0.1',
    headers: {},
    path: '/api/games/654321/question',
  };

  for (let i = 0; i < 3; i += 1) {
    const outcome = runLimiter(limiter, { ...user, method: 'GET' });
    assert.equal(outcome.nextCalled, true, `GET attempt ${i + 1}`);
  }
  const readBlocked = runLimiter(limiter, { ...user, method: 'GET' });
  assert.equal(readBlocked.nextCalled, false);
  assert.equal(readBlocked.res.statusCode, 429);
  assert.equal(readBlocked.res.headers['Retry-After'], '60');

  assert.equal(runLimiter(limiter, { ...user, method: 'POST', path: '/api/games/654321/answers' }).nextCalled, true);
  assert.equal(runLimiter(limiter, { ...user, method: 'POST', path: '/api/games/654321/answers' }).nextCalled, true);
  const writeBlocked = runLimiter(limiter, {
    ...user,
    method: 'POST',
    path: '/api/games/654321/answers',
  });
  assert.equal(writeBlocked.nextCalled, false);
  assert.equal(writeBlocked.res.statusCode, 429);
  assert.equal(writeBlocked.res.headers['Retry-After'], '60');

  assert.equal(runLimiter(limiter, { ...user, method: 'HEAD', path: '/api/rooms/654321' }).nextCalled, false);
});