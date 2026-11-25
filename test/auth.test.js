const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';

const AUTH_ENV_KEYS = [
  'AUTH_ENABLE_GOOGLE',
  'AUTH_ENABLE_EMAIL',
  'AUTH_ENABLE_PHONE',
  'AUTH_ENABLE_APPLE',
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
];

const {
  getAuthProviders,
  getAdminPolicy,
  isAdminEmail,
  parseSessionPayload,
  resolveSessionSecret,
  signSessionCookie,
} = require('../auth');
const { getUserProfile, resetUserProfilesForTest, saveUserProfile } = require('../db');
const { renderGatewayPage } = require('../lib/player-pages');
const app = require('../index');

function saveEnv(keys) {
  const snapshot = {};
  for (const key of keys) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function enableAllAuthProvidersInEnv() {
  delete process.env.AUTH_ENABLE_GOOGLE;
  delete process.env.AUTH_ENABLE_EMAIL;
  delete process.env.AUTH_ENABLE_APPLE;
  process.env.AUTH_ENABLE_PHONE = '1';
  process.env.FIREBASE_API_KEY = 'test-key';
  process.env.FIREBASE_AUTH_DOMAIN = 'example.firebaseapp.com';
  process.env.FIREBASE_PROJECT_ID = 'example';
}

function postJson(pathname, body, cookie) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      };
      if (cookie) {
        headers.Cookie = cookie;
      }
      const req = http.request(
        { hostname: '127.0.0.1', port, path: pathname, method: 'POST', headers },
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
      req.write(payload);
      req.end();
    });
  });
}

function sessionCookieFromResponse(headers) {
  const setCookie = headers['set-cookie'];
  const line = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return line?.split(';')[0];
}

test('getAuthProviders enables google and emailLink by default; phone is opt-in', () => {
  const env = saveEnv(AUTH_ENV_KEYS);
  delete process.env.AUTH_ENABLE_GOOGLE;
  delete process.env.AUTH_ENABLE_EMAIL;
  delete process.env.AUTH_ENABLE_PHONE;
  delete process.env.AUTH_ENABLE_APPLE;
  assert.deepEqual(getAuthProviders(), ['google', 'emailLink']);
  assert.ok(!getAuthProviders().includes('phone'));
  process.env.AUTH_ENABLE_PHONE = '1';
  assert.ok(getAuthProviders().includes('phone'));
  process.env.AUTH_ENABLE_PHONE = 'true';
  assert.ok(getAuthProviders().includes('phone'));
  restoreEnv(env);
});

test('AUTH_ENABLE_* flags disable individual providers', () => {
  const env = saveEnv(AUTH_ENV_KEYS);
  enableAllAuthProvidersInEnv();
  process.env.AUTH_ENABLE_PHONE = '0';
  assert.ok(!getAuthProviders().includes('phone'));
  process.env.AUTH_ENABLE_EMAIL = 'false';
  assert.ok(!getAuthProviders().includes('emailLink'));
  process.env.AUTH_ENABLE_GOOGLE = 'false';
  assert.deepEqual(getAuthProviders(), []);
  restoreEnv(env);
});

test('POST /api/auth/session accepts enabled providers', async () => {
  const env = saveEnv(AUTH_ENV_KEYS);
  enableAllAuthProvidersInEnv();
  for (const provider of ['emailLink', 'phone', 'google.com']) {
    const uid = `uid_${provider.replace(/\./g, '_')}`;
    const res = await postJson('/api/auth/session', {
      uid,
      provider,
      email: 'player@example.com',
    });
    assert.equal(res.status, 200, provider);
  }
  restoreEnv(env);
});

test('POST /api/auth/session rejects anonymous and password providers', async () => {
  const env = saveEnv(AUTH_ENV_KEYS);
  enableAllAuthProvidersInEnv();
  let res = await postJson('/api/auth/session', { uid: 'an_u1', provider: 'anonymous', email: null });
  assert.equal(res.status, 403);
  res = await postJson('/api/auth/session', {
    uid: 'pw_u1',
    provider: 'password',
    email: 'player@example.com',
  });
  assert.equal(res.status, 403);
  restoreEnv(env);
});

test('POST /api/auth/session returns 403 for disabled providers', async () => {
  const env = saveEnv(AUTH_ENV_KEYS);
  enableAllAuthProvidersInEnv();
  delete process.env.AUTH_ENABLE_PHONE;
  let res = await postJson('/api/auth/session', { uid: 'ph_u1', provider: 'phone', email: null });
  assert.equal(res.status, 403);

  process.env.AUTH_ENABLE_EMAIL = '0';
  res = await postJson('/api/auth/session', { uid: 'em_u1', provider: 'emailLink', email: 'a@b.com' });
  assert.equal(res.status, 403);

  delete process.env.AUTH_ENABLE_EMAIL;
  restoreEnv(env);
});

test('gateway renders 3-tab layout when all providers are enabled', () => {
  const env = saveEnv(AUTH_ENV_KEYS);
  enableAllAuthProvidersInEnv();
  const html = renderGatewayPage({
    signedIn: false,
    firebaseConfig: {
      apiKey: 'test-key',
      authDomain: 'example.firebaseapp.com',
      projectId: 'example',
    },
  });

  assert.match(html, /id="pq-auth-tab-bar"/);
  assert.match(html, /id="tab-sign-in-btn"/);
  assert.match(html, /id="tab-email-btn"/);
  assert.match(html, /id="tab-phone-btn"/);
  assert.match(html, />Sign In</);
  assert.match(html, />Email</);
  assert.match(html, />Phone</);
  assert.match(html, /id="auth-sign-in"/);
  assert.match(html, /id="pq-google-sign-in"/);
  assert.doesNotMatch(html, /id="pq-guest-sign-in"/);
  assert.match(html, /id="auth-email"/);
  assert.match(html, /id="pq-email-link"/);
  assert.match(html, /id="auth-phone"/);
  assert.match(html, /id="pq-send-sms"[^>]*class="[^"]*pq-auth-cta-primary/);
  assert.match(html, /id="pq-sms-verify-step"[^>]*class="[^"]*hidden/);
  assert.match(html, /id="pq-recaptcha"[^>]*class="[^"]*pq-recaptcha-host/);
  assert.doesNotMatch(html, /pq-recaptcha[^"]*pq-auth-surface/);
  assert.doesNotMatch(html, /id="pq-phone-open"/);
  restoreEnv(env);
});

test('phone tab keeps SMS verification step hidden in initial server HTML', () => {
  const env = saveEnv(AUTH_ENV_KEYS);
  enableAllAuthProvidersInEnv();
  const html = renderGatewayPage({
    signedIn: false,
    firebaseConfig: { apiKey: 'k', authDomain: 'd', projectId: 'p' },
  });
  const verifyStep = html.match(/id="pq-sms-verify-step"[^>]*>/);
  assert.ok(verifyStep);
  assert.match(verifyStep[0], /hidden/);
  assert.match(html, /id="pq-verify-sms"/);
  assert.match(html, /pq-recaptcha-host/);
  restoreEnv(env);
});

test('phone tab and reCAPTCHA notice appear only when AUTH_ENABLE_PHONE is set', () => {
  const env = saveEnv(AUTH_ENV_KEYS);
  delete process.env.AUTH_ENABLE_GOOGLE;
  delete process.env.AUTH_ENABLE_EMAIL;
  delete process.env.AUTH_ENABLE_PHONE;
  process.env.FIREBASE_API_KEY = 'test-key';
  process.env.FIREBASE_AUTH_DOMAIN = 'example.firebaseapp.com';
  process.env.FIREBASE_PROJECT_ID = 'example';
  let html = renderGatewayPage({
    signedIn: false,
    firebaseConfig: { apiKey: 'k', authDomain: 'd', projectId: 'p' },
  });
  assert.doesNotMatch(html, /id="tab-phone-btn"/);
  assert.doesNotMatch(html, /id="auth-phone"/);

  process.env.AUTH_ENABLE_PHONE = '0';
  html = renderGatewayPage({
    signedIn: false,
    firebaseConfig: { apiKey: 'k', authDomain: 'd', projectId: 'p' },
  });
  assert.doesNotMatch(html, /id="auth-phone"/);

  process.env.AUTH_ENABLE_PHONE = '1';
  html = renderGatewayPage({
    signedIn: false,
    firebaseConfig: { apiKey: 'k', authDomain: 'd', projectId: 'p' },
  });
  assert.match(html, /id="auth-phone"/);
  assert.match(html, /https:\/\/policies\.google\.com\/privacy/);
  assert.match(html, /https:\/\/policies\.google\.com\/terms/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /text-slate-400/);
  restoreEnv(env);
});

test('AUTH_ENABLE_EMAIL=0 removes EMAIL tab from gateway HTML', () => {
  const env = saveEnv(AUTH_ENV_KEYS);
  enableAllAuthProvidersInEnv();
  process.env.AUTH_ENABLE_EMAIL = '0';
  const html = renderGatewayPage({
    signedIn: false,
    firebaseConfig: { apiKey: 'k', authDomain: 'd', projectId: 'p' },
  });
  assert.doesNotMatch(html, /id="tab-email-btn"/);
  assert.doesNotMatch(html, /id="auth-email"/);
  restoreEnv(env);
});

test('single enabled tab hides tab switcher bar', () => {
  const env = saveEnv(AUTH_ENV_KEYS);
  enableAllAuthProvidersInEnv();
  process.env.AUTH_ENABLE_EMAIL = '0';
  process.env.AUTH_ENABLE_PHONE = '0';
  const html = renderGatewayPage({
    signedIn: false,
    firebaseConfig: { apiKey: 'k', authDomain: 'd', projectId: 'p' },
  });
  assert.doesNotMatch(html, /id="pq-auth-tab-bar"/);
  assert.match(html, /id="auth-sign-in"/);
  assert.match(html, /id="pq-google-sign-in"/);
  restoreEnv(env);
});

test('user profiles and pq_session payloads contain zero email or phoneNumber', async () => {
  resetUserProfilesForTest();
  await saveUserProfile('zero_pii_u1', { handle: 'Neo7', provider: 'google.com' });
  const profile = await getUserProfile('zero_pii_u1');
  for (const key of Object.keys(profile)) {
    assert.doesNotMatch(key, /email|phone/i);
  }
  const cookieLine = signSessionCookie({
    uid: 'zero_pii_u1',
    provider: 'google.com',
    handle: 'Neo7',
    isAdmin: false,
  });
  const token = cookieLine.split('=').slice(1).join('=');
  const session = parseSessionPayload(token);
  for (const key of Object.keys(session)) {
    assert.doesNotMatch(key, /email|phone/i);
  }
});

test('returning user restores handle and admin flag without storing email', async () => {
  resetUserProfilesForTest();
  const adminEnv = saveEnv(['ADMIN_ALLOWED_DOMAIN', 'ADMIN_EMAILS', ...AUTH_ENV_KEYS]);
  enableAllAuthProvidersInEnv();
  process.env.ADMIN_ALLOWED_DOMAIN = 'example.com';

  let res = await postJson('/api/auth/session', {
    uid: 'returning_u1',
    provider: 'emailLink',
    email: 'player@example.com',
  });
  assert.equal(res.status, 200);
  const firstCookie = sessionCookieFromResponse(res.headers);

  res = await postJson('/api/handle', { handle: 'Neo7' }, firstCookie);
  assert.equal(res.status, 200);

  res = await postJson('/api/auth/signout', {}, firstCookie);
  assert.equal(res.status, 200);

  res = await postJson('/api/auth/session', {
    uid: 'returning_u1',
    provider: 'emailLink',
    email: 'ops@example.com',
  });
  assert.equal(res.status, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.redirectTo, '/dashboard');
  assert.equal(payload.isAdmin, true);
  restoreEnv(adminEnv);
});

test('gateway HTML keeps passwordless email and crimson alert banner', () => {
  const env = saveEnv(AUTH_ENV_KEYS);
  enableAllAuthProvidersInEnv();
  const html = renderGatewayPage({
    signedIn: false,
    firebaseConfig: { apiKey: 'k', authDomain: 'd', projectId: 'p' },
  });
  assert.match(html, /id="pq-auth-error"[^>]*role="alert"/);
  assert.match(html, /Send Magic Sign-In Link/);
  assert.doesNotMatch(html, /type="password"/i);
  restoreEnv(env);
});

test('getAdminPolicy reads only from environment variables', () => {
  process.env.ADMIN_ALLOWED_DOMAIN = 'example.com';
  process.env.ADMIN_EMAILS = 'ops@example.com, captain@other.org';
  const policy = getAdminPolicy();
  assert.equal(policy.allowedDomain, 'example.com');
  assert.deepEqual(policy.allowedEmails, ['ops@example.com', 'captain@other.org']);
  assert.equal(isAdminEmail('ops@example.com', policy), true);
  assert.equal(isAdminEmail('user@example.com', policy), true);
  assert.equal(isAdminEmail('stranger@elsewhere.net', policy), false);

  delete process.env.ADMIN_ALLOWED_DOMAIN;
  delete process.env.ADMIN_EMAILS;
  const empty = getAdminPolicy();
  assert.equal(empty.allowedDomain, '');
  assert.deepEqual(empty.allowedEmails, []);
  assert.equal(isAdminEmail('anyone@example.com', empty), false);
});

test('auth.js does not hardcode an admin email domain', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'auth.js'), 'utf8');
  assert.doesNotMatch(source, /@(?:pubquiz|google|gmail)\.[a-z]+\b/i);
});

test('signSessionCookie sets Secure when secure flag is true', () => {
  const line = signSessionCookie(
    { uid: 'secure_u1', provider: 'google.com' },
    { forHeader: true, secure: true },
  );
  assert.match(line, /;\s*Secure/);
  const localLine = signSessionCookie(
    { uid: 'secure_u1', provider: 'google.com' },
    { forHeader: true, secure: false },
  );
  assert.doesNotMatch(localLine, /;\s*Secure/);
});

test('resolveSessionSecret fails closed without SESSION_SECRET outside test', () => {
  const savedEnv = process.env.NODE_ENV;
  const savedSecret = process.env.SESSION_SECRET;
  process.env.NODE_ENV = 'production';
  delete process.env.SESSION_SECRET;
  assert.throws(() => resolveSessionSecret(), /SESSION_SECRET/i);
  process.env.NODE_ENV = savedEnv;
  process.env.SESSION_SECRET = savedSecret;
});