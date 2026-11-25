const crypto = require('node:crypto');

const SESSION_COOKIE = 'pq_session';
const JOIN_INTENT_COOKIE = 'pq_join_intent';
const JOIN_INTENT_MAX_AGE_SEC = 900;
const GAME_PIN_RE = /^\d{6}$/;
const HANDLE_REGEX = /^[A-Za-z0-9]{3,18}$/;

const SESSION_AUTH_PROVIDERS = new Set([
  'emailLink',
  'phone',
  'google.com',
  'apple.com',
]);

function envFlagTrue(name) {
  return String(process.env[name] || '').toLowerCase() === 'true';
}

function envFlagEnabled(name, defaultWhenUnset) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return defaultWhenUnset;
  }
  const normalized = String(raw).toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  return defaultWhenUnset;
}

function firebaseConfigPresent() {
  const apiKey = process.env.FIREBASE_API_KEY || '';
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN || '';
  const projectId = process.env.FIREBASE_PROJECT_ID || '';
  return Boolean(apiKey && authDomain && projectId);
}

function resolveSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === 'test') {
    return 'test-session-secret';
  }
  throw new Error('SESSION_SECRET must be set');
}

function getAuthProviders() {
  const providers = [];
  if (envFlagEnabled('AUTH_ENABLE_GOOGLE', true)) {
    providers.push('google');
  }
  if (envFlagEnabled('AUTH_ENABLE_EMAIL', true)) {
    providers.push('emailLink');
  }
  if (envFlagEnabled('AUTH_ENABLE_PHONE', false)) {
    providers.push('phone');
  }
  if (envFlagTrue('AUTH_ENABLE_APPLE')) {
    providers.push('apple.com');
  }
  return providers;
}

function normalizeProviderGateKey(provider) {
  if (provider === 'google.com') {
    return 'google';
  }
  if (provider === 'apple') {
    return 'apple.com';
  }
  return provider;
}

function isAuthProviderEnabled(provider) {
  const key = normalizeProviderGateKey(provider);
  return getAuthProviders().includes(key);
}

function assertAuthProviderEnabled(provider) {
  if (!isAuthProviderEnabled(provider)) {
    const err = new Error('auth provider disabled');
    err.statusCode = 403;
    throw err;
  }
}

function decodeJwtPayload(idToken) {
  if (typeof idToken !== 'string') return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function emailVerifiedFromLookup(user, jwtPayload) {
  if (user?.emailVerified === true || user?.emailVerified === 'true') {
    return true;
  }
  return jwtPayload?.email_verified === true;
}

const FIREBASE_EMAIL_CREDENTIAL_PROVIDER = 'password';

function resolveEmailCredentialProvider(user, jwtPayload) {
  const emailVerified = emailVerifiedFromLookup(user, jwtPayload);
  const hasStoredCredentialDigest = Boolean(user?.passwordHash);
  const emailLinkEnabled = envFlagEnabled('AUTH_ENABLE_EMAIL', true);
  if (emailLinkEnabled && emailVerified && !hasStoredCredentialDigest) {
    return 'emailLink';
  }
  return FIREBASE_EMAIL_CREDENTIAL_PROVIDER;
}

function resolveProviderFromFirebaseUser(user, jwtPayload) {
  const signInProvider = jwtPayload?.firebase?.sign_in_provider
    || jwtPayload?.sign_in_provider
    || null;

  if (!Array.isArray(user?.providerUserInfo) || user.providerUserInfo.length === 0) {
    return 'anonymous';
  }

  if (signInProvider) {
    if (signInProvider === FIREBASE_EMAIL_CREDENTIAL_PROVIDER) {
      return resolveEmailCredentialProvider(user, jwtPayload);
    }
    return signInProvider;
  }

  const linkedProvider = user.providerUserInfo[0]?.providerId;
  if (linkedProvider === FIREBASE_EMAIL_CREDENTIAL_PROVIDER) {
    return resolveEmailCredentialProvider(user, jwtPayload);
  }
  return linkedProvider || 'anonymous';
}

function rejectForbiddenSignInProvider(provider) {
  if (provider === 'anonymous' || provider === 'password') {
    const err = new Error('auth provider disabled');
    err.statusCode = 403;
    throw err;
  }
}

function identityFromFirebaseLookup(user, idToken) {
  if (!user?.localId) {
    throw new Error('invalid id token');
  }
  const provider = resolveProviderFromFirebaseUser(user, decodeJwtPayload(idToken));
  rejectForbiddenSignInProvider(provider);
  return normalizeVerifiedIdentity({
    uid: user.localId,
    provider,
    email: user.email || null,
  });
}

async function identityFromIdToken(idToken) {
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('FIREBASE_API_KEY is required to verify id tokens');
  }
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!response.ok) {
    throw new Error('invalid id token');
  }
  const payload = await response.json();
  const user = payload?.users?.[0];
  return identityFromFirebaseLookup(user, idToken);
}

function isRequestSecure(req) {
  if (!req) return false;
  if (req.secure) return true;
  const forwarded = req.headers?.['x-forwarded-proto'];
  if (typeof forwarded === 'string' && forwarded.split(',')[0].trim().toLowerCase() === 'https') {
    return true;
  }
  if (process.env.NODE_ENV === 'production') return true;
  if (process.env.K_SERVICE) return true;
  return false;
}

function assertAllowedAuthProvider(provider) {
  if (!SESSION_AUTH_PROVIDERS.has(provider)) {
    throw new Error('unsupported auth provider');
  }
}

function getAdminPolicy() {
  const allowedDomain = (process.env.ADMIN_ALLOWED_DOMAIN || '').trim();
  const allowedEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return { allowedDomain, allowedEmails };
}

function isAdminEmail(email, policy = getAdminPolicy()) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  const normalized = email.trim().toLowerCase();
  if (policy.allowedEmails.some((entry) => entry.toLowerCase() === normalized)) {
    return true;
  }
  if (policy.allowedDomain) {
    const suffix = `@${policy.allowedDomain.toLowerCase()}`;
    return normalized.endsWith(suffix);
  }
  return false;
}

function normalizeVerifiedIdentity(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('identity required');
  }
  const uid = typeof raw.uid === 'string' ? raw.uid.trim() : '';
  const provider = typeof raw.provider === 'string' ? raw.provider.trim() : '';
  const email = raw.email === null || raw.email === undefined
    ? null
    : String(raw.email).trim();
  if (!uid || !provider) {
    throw new Error('uid and provider are required');
  }
  rejectForbiddenSignInProvider(provider);
  assertAllowedAuthProvider(provider);
  return { uid, provider, email: email || null, phoneNumber: null };
}

function createPlayerSession({ uid, provider, handle = null, isAdmin = false }) {
  if (typeof uid !== 'string' || uid.trim() === '') {
    throw new Error('uid required');
  }
  if (typeof provider !== 'string' || provider.trim() === '') {
    throw new Error('provider required');
  }
  assertAllowedAuthProvider(provider);
  const session = {
    uid: uid.trim(),
    provider: provider.trim(),
    isAdmin: Boolean(isAdmin),
  };
  if (handle) {
    const validated = validateHandle(handle);
    if (validated) session.handle = validated;
  }
  return session;
}

function assertSessionHasNoPii(session) {
  if (!session || typeof session !== 'object') return;
  for (const forbidden of ['email', 'phoneNumber', 'phone', 'phone_number']) {
    if (Object.prototype.hasOwnProperty.call(session, forbidden)) {
      throw new Error(`session must not include ${forbidden}`);
    }
  }
}

function validateHandle(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!HANDLE_REGEX.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function computeSessionIntegrityMac(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

function signSessionPayload(session) {
  assertSessionHasNoPii(session);
  const secret = resolveSessionSecret();
  const body = Buffer.from(JSON.stringify(session)).toString('base64url');
  const mac = computeSessionIntegrityMac(body, secret);
  return `${body}.${mac}`;
}

function parseSessionPayload(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [body, sig] = parts;
  const secret = resolveSessionSecret();
  const expected = computeSessionIntegrityMac(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!session || typeof session.uid !== 'string') {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function parseCookieHeader(header, name) {
  if (!header) {
    return null;
  }
  const segments = header.split(';');
  for (const segment of segments) {
    const idx = segment.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = segment.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(segment.slice(idx + 1).trim());
    }
  }
  return null;
}

function signSessionCookie(session, { forHeader = false, secure = false } = {}) {
  const token = signSessionPayload(session);
  if (!forHeader) {
    return `${SESSION_COOKIE}=${token}`;
  }
  const secureFlag = secure ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secureFlag}`;
}

function readSessionFromRequest(req) {
  const token = parseCookieHeader(req.headers?.cookie, SESSION_COOKIE);
  return parseSessionPayload(token);
}

function attachSession(req, res, next) {
  req.session = readSessionFromRequest(req) || null;
  req.signedIn = Boolean(req.session?.uid);
  next();
}

function getFirebaseClientConfig() {
  const apiKey = process.env.FIREBASE_API_KEY || '';
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN || '';
  const projectId = process.env.FIREBASE_PROJECT_ID || '';
  if (!apiKey || !authDomain || !projectId) {
    return null;
  }
  return { apiKey, authDomain, projectId };
}

function clearSessionCookie({ secure = false } = {}) {
  const secureFlag = secure ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`;
}

function assertJoinGamePin(gamePin) {
  if (typeof gamePin !== 'string' || !GAME_PIN_RE.test(gamePin)) {
    throw new TypeError('invalid join game pin');
  }
  return gamePin;
}

function signJoinIntentPayload(gamePin) {
  const pin = assertJoinGamePin(gamePin);
  const secret = resolveSessionSecret();
  const body = Buffer.from(JSON.stringify({ pin, exp: Date.now() + JOIN_INTENT_MAX_AGE_SEC * 1000 })).toString('base64url');
  const mac = computeSessionIntegrityMac(body, secret);
  return `${body}.${mac}`;
}

function parseJoinIntentPayload(token) {
  if (typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  const [body, sig] = token.split('.');
  const secret = resolveSessionSecret();
  const expected = computeSessionIntegrityMac(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || typeof payload.pin !== 'string' || !GAME_PIN_RE.test(payload.pin)) {
      return null;
    }
    if (!Number.isFinite(payload.exp) || payload.exp < Date.now()) {
      return null;
    }
    return payload.pin;
  } catch {
    return null;
  }
}

function signJoinIntentCookie(gamePin, { forHeader = true, secure = false } = {}) {
  const token = signJoinIntentPayload(gamePin);
  const secureFlag = secure ? '; Secure' : '';
  const header = `${JOIN_INTENT_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${JOIN_INTENT_MAX_AGE_SEC}${secureFlag}`;
  return forHeader ? header : `${JOIN_INTENT_COOKIE}=${token}`;
}

function readJoinIntentFromRequest(req) {
  const token = parseCookieHeader(req.headers?.cookie, JOIN_INTENT_COOKIE);
  return parseJoinIntentPayload(token);
}

function clearJoinIntentCookie({ secure = false } = {}) {
  const secureFlag = secure ? '; Secure' : '';
  return `${JOIN_INTENT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`;
}

function resolveAuthRedirectPath(session, joinPin) {
  const hasHandle = Boolean(session?.handle);
  if (joinPin) {
    return hasHandle ? `/join?game=${joinPin}` : '/onboarding/handle';
  }
  return hasHandle ? '/dashboard' : '/onboarding/handle';
}

function escapeHandleForHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  SESSION_AUTH_PROVIDERS,
  SESSION_COOKIE,
  assertAllowedAuthProvider,
  assertSessionHasNoPii,
  attachSession,
  clearJoinIntentCookie,
  clearSessionCookie,
  JOIN_INTENT_COOKIE,
  createPlayerSession,
  escapeHandleForHtml,
  getAdminPolicy,
  getAuthProviders,
  getFirebaseClientConfig,
  isAdminEmail,
  assertAuthProviderEnabled,
  decodeJwtPayload,
  identityFromFirebaseLookup,
  identityFromIdToken,
  isAuthProviderEnabled,
  isRequestSecure,
  normalizeVerifiedIdentity,
  parseJoinIntentPayload,
  parseSessionPayload,
  readJoinIntentFromRequest,
  readSessionFromRequest,
  resolveAuthRedirectPath,
  rejectForbiddenSignInProvider,
  resolveProviderFromFirebaseUser,
  resolveSessionSecret,
  signJoinIntentCookie,
  signJoinIntentPayload,
  signSessionCookie,
  validateHandle,
};