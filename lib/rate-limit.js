const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 120;
const GAME_READ_MAX = 300;
const GAME_WRITE_MAX = 60;
const MAX_TRACKED_KEYS = 10_000;
const CLEANUP_INTERVAL_MS = 300_000;

/** @type {Map<string, number[]>} */
const buckets = new Map();
let cleanupTimer = null;

function rateLimitActive(options = {}) {
  if (options.enabled === true) {
    return true;
  }
  return process.env.NODE_ENV !== 'test';
}

function resolveRateLimitKey(req) {
  const uid = req.user?.uid;
  if (uid) {
    return `user:${uid}`;
  }
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

function isReadMethod(method) {
  return method === 'GET' || method === 'HEAD';
}

function isGameApiPath(path) {
  return path.startsWith('/api/games') || path.startsWith('/api/rooms');
}

function pruneTimestamps(entries, now, windowMs) {
  const cutoff = now - windowMs;
  let start = 0;
  while (start < entries.length && entries[start] <= cutoff) {
    start += 1;
  }
  if (start > 0) {
    entries.splice(0, start);
  }
}

function capBucketMap() {
  if (buckets.size <= MAX_TRACKED_KEYS) {
    return;
  }
  const dropCount = buckets.size - MAX_TRACKED_KEYS;
  let dropped = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    dropped += 1;
    if (dropped >= dropCount) {
      break;
    }
  }
}

function ensurePeriodicCleanup(windowMs) {
  if (process.env.NODE_ENV === 'test' || cleanupTimer) {
    return;
  }
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entries] of buckets) {
      pruneTimestamps(entries, now, windowMs);
      if (!entries.length) {
        buckets.delete(key);
      }
    }
    capBucketMap();
  }, CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }
}

function createRateLimiter({
  windowMs = DEFAULT_WINDOW_MS,
  max = DEFAULT_MAX_REQUESTS,
  enabled,
  tier = 'default',
} = {}) {
  return function rateLimitMiddleware(req, res, next) {
    if (!rateLimitActive({ enabled })) {
      next();
      return;
    }
    if (process.env.NODE_ENV !== 'test') {
      ensurePeriodicCleanup(windowMs);
    }
    const now = Date.now();
    const limitKey = resolveRateLimitKey(req);
    const bucketId = `${tier}:${limitKey}`;
    let entries = buckets.get(bucketId);
    if (!entries) {
      entries = [];
      buckets.set(bucketId, entries);
    }
    pruneTimestamps(entries, now, windowMs);
    if (entries.length >= max) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      if (req.path.startsWith('/api/')) {
        res.status(429).json({ error: 'too many requests' });
      } else {
        res.status(429).type('text/plain').send('Too many requests');
      }
      return;
    }
    entries.push(now);
    capBucketMap();
    next();
  };
}

function resetRateLimitBucketsForTest() {
  buckets.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

function shouldApplyRateLimit(path) {
  return (
    path.startsWith('/api/auth')
    || path === '/api/handle'
    || path.startsWith('/onboarding/handle')
    || path.startsWith('/api/games')
    || path.startsWith('/api/rooms')
  );
}

function createSensitiveRouteRateLimiter(options = {}) {
  const {
    enabled,
    windowMs = DEFAULT_WINDOW_MS,
    defaultMax = DEFAULT_MAX_REQUESTS,
    readMax = GAME_READ_MAX,
    writeMax = GAME_WRITE_MAX,
  } = options;

  const defaultLimiter = createRateLimiter({
    enabled,
    max: defaultMax,
    windowMs,
    tier: 'default',
  });
  const readLimiter = createRateLimiter({
    enabled,
    max: readMax,
    windowMs,
    tier: 'read',
  });
  const writeLimiter = createRateLimiter({
    enabled,
    max: writeMax,
    windowMs,
    tier: 'write',
  });

  return function sensitiveRouteRateLimit(req, res, next) {
    if (!shouldApplyRateLimit(req.path)) {
      next();
      return;
    }
    if (isGameApiPath(req.path)) {
      const limiter = isReadMethod(req.method) ? readLimiter : writeLimiter;
      return limiter(req, res, next);
    }
    return defaultLimiter(req, res, next);
  };
}

module.exports = {
  GAME_READ_MAX,
  GAME_WRITE_MAX,
  createRateLimiter,
  createSensitiveRouteRateLimiter,
  isGameApiPath,
  isReadMethod,
  resetRateLimitBucketsForTest,
  resolveRateLimitKey,
  shouldApplyRateLimit,
};