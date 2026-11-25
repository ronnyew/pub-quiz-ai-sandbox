const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';

const {
  decodeJwtPayload,
  identityFromFirebaseLookup,
  rejectForbiddenSignInProvider,
  resolveProviderFromFirebaseUser,
  getAuthProviders,
  createPlayerSession,
  assertAuthProviderEnabled,
} = require('../auth');

function fakeJwt(signInProvider, extraPayload = {}) {
  const payload = {
    firebase: { sign_in_provider: signInProvider },
    ...extraPayload,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `hdr.${body}.sig`;
}

function firebaseUser(providerIds, userFields = {}) {
  return {
    localId: 'uid_test_1',
    email: 'player@example.com',
    providerUserInfo: providerIds.map((providerId) => ({ providerId })),
    ...userFields,
  };
}

test('resolveProviderFromFirebaseUser treats empty providerUserInfo as anonymous', () => {
  const user = { localId: 'u1', providerUserInfo: [] };
  assert.equal(resolveProviderFromFirebaseUser(user, decodeJwtPayload(fakeJwt('google.com'))), 'anonymous');
  assert.equal(resolveProviderFromFirebaseUser(user, null), 'anonymous');
});

test('resolveProviderFromFirebaseUser prefers JWT sign_in_provider when present', () => {
  const user = firebaseUser(['google.com', 'password']);
  assert.equal(
    resolveProviderFromFirebaseUser(user, decodeJwtPayload(fakeJwt('emailLink'))),
    'emailLink',
  );
  assert.equal(resolveProviderFromFirebaseUser(user, decodeJwtPayload(fakeJwt('phone'))), 'phone');
  assert.equal(
    resolveProviderFromFirebaseUser(user, decodeJwtPayload(fakeJwt('apple.com'))),
    'apple.com',
  );
  assert.equal(
    resolveProviderFromFirebaseUser(user, decodeJwtPayload(fakeJwt('google.com'))),
    'google.com',
  );
});

test('resolveProviderFromFirebaseUser maps Firebase magic-link password tokens to emailLink', () => {
  const magicUser = firebaseUser(['password'], { emailVerified: true });
  const jwt = decodeJwtPayload(fakeJwt('password', { email_verified: true }));
  assert.equal(resolveProviderFromFirebaseUser(magicUser, jwt), 'emailLink');
  assert.equal(
    resolveProviderFromFirebaseUser(magicUser, decodeJwtPayload(fakeJwt('password'))),
    'emailLink',
  );
});

test('resolveProviderFromFirebaseUser keeps unverified or password-hash accounts on password', () => {
  const unverified = firebaseUser(['password'], { emailVerified: false });
  assert.equal(
    resolveProviderFromFirebaseUser(unverified, decodeJwtPayload(fakeJwt('password'))),
    'password',
  );
  const hashed = firebaseUser(['password'], { emailVerified: true, passwordHash: 'scrypt:fake' });
  assert.equal(
    resolveProviderFromFirebaseUser(hashed, decodeJwtPayload(fakeJwt('password', { email_verified: true }))),
    'password',
  );
});

test('resolveProviderFromFirebaseUser falls back to first linked provider', () => {
  const user = firebaseUser(['google.com']);
  assert.equal(resolveProviderFromFirebaseUser(user, null), 'google.com');
});

test('identityFromFirebaseLookup rejects anonymous and raw password sign-in', () => {
  const emptyProviders = { localId: 'u1', providerUserInfo: [] };
  assert.throws(
    () => identityFromFirebaseLookup(emptyProviders, fakeJwt('google.com')),
    (err) => err.statusCode === 403,
  );

  const passwordUser = firebaseUser(['password'], { emailVerified: false, passwordHash: 'scrypt:fake' });
  assert.throws(
    () => identityFromFirebaseLookup(passwordUser, fakeJwt('password')),
    (err) => err.statusCode === 403,
  );
});

test('identityFromFirebaseLookup accepts federated, phone, apple, and magic-link email', () => {
  const googleUser = firebaseUser(['google.com']);
  let identity = identityFromFirebaseLookup(googleUser, fakeJwt('google.com'));
  assert.equal(identity.provider, 'google.com');
  assert.equal(identity.uid, 'uid_test_1');

  const magicUser = firebaseUser(['password'], { emailVerified: true });
  identity = identityFromFirebaseLookup(magicUser, fakeJwt('password', { email_verified: true }));
  assert.equal(identity.provider, 'emailLink');
  assertAuthProviderEnabled(identity.provider);
  const session = createPlayerSession({ uid: identity.uid, provider: identity.provider });
  assert.equal(session.provider, 'emailLink');

  const phoneUser = firebaseUser(['phone']);
  identity = identityFromFirebaseLookup(phoneUser, fakeJwt('phone'));
  assert.equal(identity.provider, 'phone');

  const appleUser = firebaseUser(['apple.com']);
  identity = identityFromFirebaseLookup(appleUser, fakeJwt('apple.com'));
  assert.equal(identity.provider, 'apple.com');
});

test('rejectForbiddenSignInProvider blocks anonymous and password', () => {
  for (const provider of ['anonymous', 'password']) {
    assert.throws(() => rejectForbiddenSignInProvider(provider), (err) => err.statusCode === 403);
  }
  assert.doesNotThrow(() => rejectForbiddenSignInProvider('google.com'));
});

test('AUTH_ENABLE_APPLE adds apple.com to provider gate list', () => {
  const saved = process.env.AUTH_ENABLE_APPLE;
  process.env.AUTH_ENABLE_APPLE = 'true';
  const appleProviderId = 'apple.com';
  assert.ok(
    getAuthProviders().some((providerId) => providerId === appleProviderId),
  );
  if (saved === undefined) {
    delete process.env.AUTH_ENABLE_APPLE;
  } else {
    process.env.AUTH_ENABLE_APPLE = saved;
  }
});