const path = require('node:path');
const express = require('express');
const { getFooterLinks, validateFooterLinkPath } = require('./lib/content-store');
const {
  renderDashboardPage,
  renderGatewayPage,
  renderGameStartPage,
  renderHandlePage,
  renderGameplayPage,
  renderHostLobbyPage,
  renderJoinUnavailablePage,
  renderStaticContentPage,
  renderWaitingRoomPage,
} = require('./lib/player-pages');
const {
  buildInviteUrl,
  createWaitingGame,
  filterAndPageTopicPacks,
  getPublicGame,
  isValidGamePin,
  advanceGameQuestion,
  getGameplayQuestionJson,
  joinWaitingGame,
  joinActiveGame,
  launchActiveGame,
  resolvePublicBaseUrl,
  submitGameAnswer,
} = require('./lib/rooms');
const { getGameRoom, getUserProfile, listTopicPacks, saveUserProfile } = require('./db');
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

function requireSessionApi(req, res, next) {
  if (!req.session?.uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

function requireSessionWithHandle(req, res, next) {
  if (!req.session?.uid) {
    res.redirect(302, '/');
    return;
  }
  resolveSessionHandle(req)
    .then((handle) => {
      if (!handle) {
        res.redirect(302, '/onboarding/handle');
        return;
      }
      req.resolvedHandle = handle;
      next();
    })
    .catch(next);
}

function persistSession(req, res, session) {
  res.setHeader(
    'Set-Cookie',
    signSessionCookie(session, { forHeader: true, secure: isRequestSecure(req) }),
  );
}

async function resolveSessionHandle(req) {
  if (req.session?.handle) {
    return req.session.handle;
  }
  if (!req.session?.uid) {
    return null;
  }
  const profile = await getUserProfile(req.session.uid);
  return profile?.handle || null;
}

function parsePositivePage(raw) {
  if (raw === undefined) return 1;
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) {
    return 1;
  }
  return Number(raw);
}

function parseTopicPackIdsFromBody(body) {
  const raw = body?.topicPackIds;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((entry) => typeof entry === 'string');
  }
  if (typeof raw === 'string') {
    return [raw];
  }
  return [];
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

app.get('/dashboard', requireSessionWithHandle, async (req, res) => {
  const handle = req.resolvedHandle;
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

async function renderGameLobby(req, res, gamePin, { saved = false, error = null } = {}) {
  const room = await getGameRoom(gamePin);
  if (!room || room.hostUserId !== req.session.uid) {
    res.status(404).type('text/plain').send('Not Found');
    return;
  }
  const handle = req.resolvedHandle;
  const allPacks = listTopicPacks({ limit: 24 });
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const page = parsePositivePage(req.query.page);
  const paged = filterAndPageTopicPacks(allPacks, { search, page });
  const copy = require('./lib/content-store').getStaticCopy().host_lobby;
  const packView = {
    ...paged,
    search,
    selectedIds: room.topicPackIds || [],
  };
  const baseUrl = resolvePublicBaseUrl(req);
  res.type('html').send(
    renderHostLobbyPage({
      session: { ...req.session, handle },
      room,
      packView,
      inviteUrl: buildInviteUrl(gamePin, baseUrl),
      message: saved && !error ? copy.launch_saved_message : null,
      error,
    }),
  );
}

app.get('/game', requireSessionWithHandle, (req, res) => {
  const handle = req.resolvedHandle;
  res.type('html').send(
    renderGameStartPage({
      session: { ...req.session, handle },
    }),
  );
});

app.post('/game', requireSessionWithHandle, async (req, res) => {
  try {
    const room = await createWaitingGame({
      hostUserId: req.session.uid,
      hostHandle: req.resolvedHandle,
    });
    res.redirect(303, `/game/${room.roomId}`);
  } catch {
    res.status(500).type('text/plain').send('Failed to create game');
  }
});

app.get('/game/:gamePin', requireSessionWithHandle, async (req, res) => {
  const gamePin = req.params.gamePin;
  if (!isValidGamePin(gamePin)) {
    res.status(404).type('text/plain').send('Not Found');
    return;
  }
  await renderGameLobby(req, res, gamePin, { saved: req.query.saved === '1' });
});

app.post('/game/:gamePin/launch', requireSessionWithHandle, async (req, res) => {
  const gamePin = req.params.gamePin;
  if (!isValidGamePin(gamePin)) {
    res.status(404).type('text/plain').send('Not Found');
    return;
  }
  const copy = require('./lib/content-store').getStaticCopy().host_lobby;
  const topicPackIds = parseTopicPackIdsFromBody(req.body);
  if (topicPackIds.length < 1) {
    await renderGameLobby(req, res, gamePin, { error: copy.launch_error_no_topics });
    return;
  }
  try {
    const result = await launchActiveGame({
      gamePin,
      hostUserId: req.session.uid,
      topicPackIds,
    });
    if (!result.ok) {
      const status = result.reason === 'forbidden' ? 403 : result.reason === 'not_found' ? 404 : 400;
      res.status(status).type('text/plain').send('Unable to launch game');
      return;
    }
    res.redirect(303, `/game/${gamePin}/play`);
  } catch {
    await renderGameLobby(req, res, gamePin, { error: copy.launch_error_invalid });
  }
});

app.get('/game/:gamePin/play', requireSessionWithHandle, async (req, res) => {
  const gamePin = req.params.gamePin;
  if (!isValidGamePin(gamePin)) {
    res.status(404).type('text/plain').send('Not Found');
    return;
  }
  const room = await getGameRoom(gamePin);
  if (!room) {
    res.status(404).type('text/plain').send('Not Found');
    return;
  }
  if (room.status === 'WAITING') {
    res.redirect(302, `/join?game=${gamePin}`);
    return;
  }
  if (!room.players.some((player) => player.userId === req.session.uid)) {
    res.status(403).type('text/plain').send('Forbidden');
    return;
  }
  const state = await getGameplayQuestionJson({
    gamePin,
    userId: req.session.uid,
    now: Date.now(),
  });
  if (state?.forbidden) {
    res.status(403).type('text/plain').send('Forbidden');
    return;
  }
  res.type('html').send(
    renderGameplayPage({
      session: { ...req.session, handle: req.resolvedHandle },
      room,
      state,
    }),
  );
});

async function handleGameplayQuestionApi(req, res) {
  const gamePin = req.params.gamePin || req.params.pin;
  if (!isValidGamePin(gamePin)) {
    res.status(400).json({ error: 'invalid game pin' });
    return;
  }
  if (!req.session?.uid) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const payload = await getGameplayQuestionJson({
    gamePin,
    userId: req.session.uid,
    now: Date.now(),
  });
  if (payload?.forbidden) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  if (!payload) {
    res.status(404).json({ error: 'game not found' });
    return;
  }
  res.json(payload);
}

app.get('/api/games/:gamePin/question', requireSessionApi, handleGameplayQuestionApi);
app.get('/api/rooms/:pin/question', requireSessionApi, handleGameplayQuestionApi);

async function handleSubmitAnswerApi(req, res) {
  const gamePin = req.params.gamePin || req.params.pin;
  if (!isValidGamePin(gamePin)) {
    res.status(400).json({ error: 'invalid game pin' });
    return;
  }
  const selectedAnswerId = typeof req.body?.selectedAnswerId === 'string'
    ? req.body.selectedAnswerId.trim()
    : '';
  const result = await submitGameAnswer({
    gamePin,
    userId: req.session.uid,
    selectedAnswerId,
    now: Date.now(),
    clientLatencyMs: req.body?.latencyMs,
  });
  if (!result.ok) {
    const status = result.reason === 'already_answered' ? 409 : result.reason === 'not_player' ? 403 : 400;
    res.status(status).json({ ok: false, reason: result.reason });
    return;
  }
  res.json(result);
}

app.post('/api/games/:gamePin/answers', requireSessionWithHandle, handleSubmitAnswerApi);
app.post('/api/rooms/:pin/answers', requireSessionWithHandle, handleSubmitAnswerApi);

async function handleAdvanceApi(req, res) {
  const gamePin = req.params.gamePin || req.params.pin;
  if (!isValidGamePin(gamePin)) {
    res.status(400).json({ error: 'invalid game pin' });
    return;
  }
  const result = await advanceGameQuestion({
    gamePin,
    now: Date.now(),
    hostUserId: req.session.uid,
  });
  if (!result.ok && result.reason === 'forbidden') {
    res.status(403).json(result);
    return;
  }
  if (!result.ok && result.reason === 'not_active') {
    res.status(400).json(result);
    return;
  }
  res.json(result);
}

app.post('/api/games/:gamePin/advance', requireSessionWithHandle, handleAdvanceApi);
app.post('/api/rooms/:pin/advance', requireSessionWithHandle, handleAdvanceApi);

async function handleCreateGameApi(req, res) {
  try {
    const room = await createWaitingGame({
      hostUserId: req.session.uid,
      hostHandle: req.resolvedHandle,
    });
    const baseUrl = resolvePublicBaseUrl(req);
    res.status(201).json({
      gamePin: room.roomId,
      inviteUrl: buildInviteUrl(room.roomId, baseUrl),
      status: room.status,
    });
  } catch {
    res.status(500).json({ error: 'failed to create game' });
  }
}

app.post('/api/games', requireSessionWithHandle, handleCreateGameApi);
app.post('/api/rooms', requireSessionWithHandle, handleCreateGameApi);

app.get('/join', requireSessionWithHandle, async (req, res) => {
  const gamePin = typeof req.query.game === 'string'
    ? req.query.game.trim()
    : typeof req.query.room === 'string'
      ? req.query.room.trim()
      : '';
  if (!isValidGamePin(gamePin)) {
    res.status(400).type('text/plain').send('Invalid game PIN');
    return;
  }
  const existingRoom = await getGameRoom(gamePin);
  if (!existingRoom) {
    res.status(404).type('html').send(
      renderJoinUnavailablePage({
        session: { ...req.session, handle: req.resolvedHandle },
        gamePin,
      }),
    );
    return;
  }
  if (existingRoom.status === 'COMPLETED') {
    res.status(410).type('html').send(
      renderJoinUnavailablePage({
        session: { ...req.session, handle: req.resolvedHandle },
        gamePin,
      }),
    );
    return;
  }
  if (existingRoom.status === 'ACTIVE') {
    const joinLive = await joinActiveGame({
      gamePin,
      userId: req.session.uid,
      handle: req.resolvedHandle,
    });
    if (!joinLive.ok) {
      res.status(400).type('html').send(
        renderJoinUnavailablePage({
          session: { ...req.session, handle: req.resolvedHandle },
          gamePin,
        }),
      );
      return;
    }
    res.redirect(302, `/game/${gamePin}/play`);
    return;
  }
  const result = await joinWaitingGame({
    gamePin,
    userId: req.session.uid,
    handle: req.resolvedHandle,
  });
  if (!result.ok) {
    res.status(400).type('html').send(
      renderJoinUnavailablePage({
        session: { ...req.session, handle: req.resolvedHandle },
        gamePin,
      }),
    );
    return;
  }
  res.type('html').send(
    renderWaitingRoomPage({
      session: { ...req.session, handle: req.resolvedHandle },
      room: result.room,
    }),
  );
});

async function handleGetPublicGameApi(req, res) {
  const gamePin = req.params.gamePin || req.params.pin;
  if (!isValidGamePin(gamePin)) {
    res.status(400).json({ error: 'invalid game pin' });
    return;
  }
  const game = await getPublicGame(gamePin);
  if (!game) {
    res.status(404).json({ error: 'game not found' });
    return;
  }
  res.json(game);
}

app.get('/api/games/:gamePin', handleGetPublicGameApi);
app.get('/api/rooms/:pin', handleGetPublicGameApi);

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