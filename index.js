const path = require('node:path');
const express = require('express');
const { getFooterLinks, validateFooterLinkPath } = require('./lib/content-store');
const { renderGatewayPage, renderStaticContentPage } = require('./lib/player-pages');
const { listTopicPacks } = require('./db');

const app = express();
const port = process.env.PORT || 8080;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.type('html').send(renderGatewayPage());
});

for (const link of getFooterLinks()) {
  const slug = validateFooterLinkPath(link.path);
  app.get(`/${slug}`, (req, res) => {
    const html = renderStaticContentPage(slug);
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
  app.listen(port, () => console.log(`Listening on port ${port}`));
}

module.exports = app;