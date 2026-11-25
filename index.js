const path = require('node:path');
const express = require('express');
const { getFooterLinks, validateFooterLinkPath } = require('./lib/content-store');
const {
  renderDashboardPage,
  renderGatewayPage,
  renderHandlePage,
  renderStaticContentPage,
} = require('./lib/player-pages');
const { getUserProfile, listTopicPacks, saveUserProfile } = require('./db');
const {
  assertAuthProviderEnabled,
  attachSession,
  clearSessionCookie,
  createPlayerSession,
  escapeHandleForHtml,
  getFirebaseClientConfig,
  isAdminEmail,
  identityFromIdToken,
  isRequestSecure,
  normalizeVerifiedIdentity,
  parseSessionPayload,
  signSessionCookie,
  validateHandle,
} = require('./auth');

const app = express();
const port = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(attachSession);

function requireSession(req, res, next) {
  if (!req.session?.uid) {
    res.redirect(302, '/');
    return;
  }
  next();
}

function persistSession(req, res, session) {
  res.setHeader(
    'Set-Cookie',
    signSessionCookie(session, { forHeader: true, secure: isRequestSecure(req) }),
  );
}

function lockHandle(session, rawHandle) {
  const validated = validateHandle(rawHandle);
  if (!validated) {
    return { ok: false, draft: typeof rawHandle === 'string' ? rawHandle : '' };
  }
  const handle = escapeHandleForHtml(validated);
  const nextSession = { ...session, handle: validated };
  return { ok: true, handle: validated, storedHandle: handle, session: nextSession };
}

app.get('/', (req, res) => {
  if (req.session?.uid) {
    if (req.session.handle) {
      res.redirect(302, '/dashboard');
      return;
    }
    res.redirect(302, '/onboarding/handle');
    return;
  }
  res.type('html').send(
    renderGatewayPage({
      signedIn: false,
      firebaseConfig: getFirebaseClientConfig(),
    }),
  );
});

app.get('/onboarding/handle', requireSession, (req, res) => {
  if (req.session.handle) {
    res.redirect(302, '/dashboard');
    return;
  }
  res
    .type('html')
    .send(renderHandlePage({ signedIn: true }));
});

app.post('/onboarding/handle', requireSession, async (req, res) => {
  const copy = require('./lib/content-store').getStaticCopy().onboarding;
  const result = lockHandle(req.session, req.body?.handle);
  if (!result.ok) {
    res
      .status(400)
      .type('html')
      .send(
        renderHandlePage({
          signedIn: true,
          draftHandle: result.draft,
          errorMessage: copy.invalid_handle_message,
        }),
      );
    return;
  }
  try {
    await saveUserProfile(result.session.uid, {
      handle: result.handle,
      provider: result.session.provider,
    });
  } catch {
    res.status(500).type('text/plain').send('Failed to save handle');
    return;
  }
  persistSession(req, res, result.session);
  res.redirect(302, '/dashboard');
});

app.post('/api/handle', requireSession, async (req, res) => {
  const result = lockHandle(req.session, req.body?.handle);
  if (!result.ok) {
    res.status(400).json({ error: 'handle must be 3-18 alphanumeric characters' });
    return;
  }
  try {
    await saveUserProfile(result.session.uid, {
      handle: result.handle,
      provider: result.session.provider,
    });
  } catch {
    res.status(500).json({ error: 'failed to persist handle' });
    return;
  }
  persistSession(req, res, result.session);
  res.json({ handle: result.storedHandle });
});

app.post('/api/auth/session', async (req, res) => {
  try {
    let identity;
    if (process.env.NODE_ENV === 'test' && req.body?.uid) {
      identity = normalizeVerifiedIdentity(req.body);
    } else if (req.body?.idToken) {
      identity = await identityFromIdToken(req.body.idToken);
    } else {
      res.status(400).json({ error: 'authentication payload required' });
      return;
    }
    assertAuthProviderEnabled(identity.provider);
    const isAdmin = isAdminEmail(identity.email);
    const profile = await getUserProfile(identity.uid);
    const handle = profile?.handle || null;
    const session = createPlayerSession({
      uid: identity.uid,
      provider: identity.provider,
      handle,
      isAdmin,
    });
    persistSession(req, res, session);
    const redirectTo = session.handle ? '/dashboard' : '/onboarding/handle';
    res.json({
      ok: true,
      uid: session.uid,
      provider: session.provider,
      redirectTo,
      next: redirectTo,
      isAdmin: session.isAdmin,
    });
  } catch (err) {
    const status = err.statusCode === 403 ? 403 : 401;
    res.status(status).json({ error: err.message || 'authentication failed' });
  }
});

app.post('/api/auth/signout', (req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie({ secure: isRequestSecure(req) }));
  if (req.is('application/json')) {
    res.json({ ok: true });
    return;
  }
  if (req.accepts('html')) {
    res.redirect(302, '/');
    return;
  }
  res.json({ ok: true });
});

app.get('/dashboard', requireSession, async (req, res) => {
  let handle = req.session.handle;
  if (!handle) {
    const profile = await getUserProfile(req.session.uid);
    handle = profile?.handle || null;
  }
  if (!handle) {
    res.redirect(302, '/onboarding/handle');
    return;
  }
  const viewSession = req.session.handle
    ? req.session
    : { ...req.session, handle };
  if (!req.session.handle) {
    persistSession(req, res, viewSession);
  }
  res.type('html').send(renderDashboardPage(viewSession));
});

for (const link of getFooterLinks()) {
  const slug = validateFooterLinkPath(link.path);
  app.get(`/${slug}`, (req, res) => {
    const html = renderStaticContentPage(slug, Boolean(req.session?.uid));
    if (!html) {
      res.status(404).type('text/plain').send('Not Found');
      return;
    }
    res.type('html').send(html);
  });
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

app.get('/api/topic-packs', (req, res) => {
  let limit;
  try {
    limit = parseTopicPackLimit(req.query.limit);
  } catch {
    res.status(400).json({ error: 'limit must be an integer from 1 to 24' });
    return;
  }
  res.json({ topicPacks: listTopicPacks({ limit }) });
});

function parseTopicPackLimit(raw) {
  if (raw === undefined) return 24;
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) {
    throw new RangeError('limit must be an integer from 1 to 24');
  }
  const limit = Number(raw);
  if (limit > 24) {
    throw new RangeError('limit must be an integer from 1 to 24');
  }
  return limit;
}

if (require.main === module) {
  try {
    require('./auth').resolveSessionSecret();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  app.listen(port, () => console.log(`Listening on port ${port}`));
}

module.exports = app;