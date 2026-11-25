const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const app = require('../index');
const { renderPlayerShell } = require('../lib/player-layout');
const {
  getFooterLinks,
  renderMarkdownContent,
  validateFooterLinkPath,
} = require('../lib/content-store');

function request(pathname) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      http.get({ hostname: '127.0.0.1', port, path: pathname }, (res) => {
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
      }).on('error', (err) => {
        server.close(() => reject(err));
      });
    });
  });
}

test('GET /styles/neon-tokyo.css serves Stitch tokens', async () => {
  const res = await request('/styles/neon-tokyo.css');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/css/);
  for (const token of [
    '.cyber-grid',
    '.neon-glow-pink',
    '.neon-glow-cyan',
    '#ff2d78',
    '#00ffcc',
    'Sora',
    'Space Grotesk',
    'Inter',
  ]) {
    assert.match(res.body, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('GET / returns Neon Tokyo gateway shell', async () => {
  const res = await request('/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.body, /data-theme="taproom"/);
  assert.match(res.body, /href="\/styles\/neon-tokyo\.css"/);
  assert.match(res.body, /@tailwindcss\/browser@4/);
  assert.match(res.body, /cyber-grid/);
  for (const link of getFooterLinks()) {
    assert.match(res.body, new RegExp(`href="/${link.path}"`));
  }
  assert.doesNotMatch(res.body, /daisyui/i);
  assert.doesNotMatch(res.body, /cdn\.tailwindcss\.com/);
  assert.doesNotMatch(res.body, /setInterval/);
});

test('logged-out wordmark links home; signed-in links to dashboard', () => {
  const loggedOut = renderPlayerShell({ signedIn: false, title: 'Test', mainHtml: '' });
  const signedIn = renderPlayerShell({ signedIn: true, title: 'Test', mainHtml: '' });
  assert.match(loggedOut, /<a[^>]+href="\/"[^>]*>[\s\S]*PUB QUIZ/i);
  assert.match(signedIn, /<a[^>]+href="\/dashboard"[^>]*>[\s\S]*PUB QUIZ/i);
});

test('GET /terms and /privacy render static-content template with sidebar menu', async () => {
  const terms = await request('/terms');
  const privacy = await request('/privacy');
  for (const res of [terms, privacy]) {
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /data-theme="taproom"/);
    assert.match(res.body, /href="\/styles\/neon-tokyo\.css"/);
    assert.match(res.body, /cyber-grid/);
    assert.match(res.body, />MENU</);
    for (const link of getFooterLinks()) {
      assert.match(res.body, new RegExp(`href="/${link.path}"`));
    }
    assert.doesNotMatch(res.body, /setInterval/);
  }
  assert.match(terms.body, /Terms/i);
  assert.match(terms.body, /<h1 class="[^"]*font-headline/);
  assert.match(terms.body, /<h2 class="[^"]*font-headline/);
  assert.match(terms.body, /<h3 class="[^"]*font-headline/);
  assert.match(terms.body, /static-content-ul/);
  assert.match(terms.body, /static-content-li/);
  assert.match(terms.body, /<ol class="/);
  assert.match(terms.body, /<li class="/);
  assert.match(terms.body, /<a[^>]*href="mailto:legal@pubquiz.app"[^>]*class="/);
  assert.match(terms.body, /border-\[#00ffcc\]\/40 bg-\[#1a1a2e\] text-\[#00ffcc\]/);
  assert.match(terms.body, /text-\[#00ffcc\].*Conditions/);
  assert.match(terms.body, /OCT 2024/);
  assert.match(privacy.body, /Privacy/i);
  assert.match(privacy.body, /FirebaseUI/);
  assert.match(privacy.body, /Cloud Firestore/);
  assert.match(privacy.body, /erasure/i);
  assert.match(privacy.body, /portability/i);
  assert.match(privacy.body, /zero monetization/i);
  assert.match(privacy.body, /border-\[#00ffcc\]\/40 bg-\[#1a1a2e\] text-\[#00ffcc\]/);
  assert.match(privacy.body, /text-\[#00ffcc\].*Policy/);
});

test('renderMarkdownContent preserves balanced nested list DOM', () => {
  const nested = ['- Outer', '  - Inner 1', '  - Inner 2', '- Second'].join('\n');
  const html = renderMarkdownContent(nested);
  for (const tag of ['ul', 'li']) {
    const open = (html.match(new RegExp(`<${tag}(\\s|>)`, 'g')) || []).length;
    const close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    assert.equal(open, close, `expected balanced <${tag}> tags`);
  }
  assert.doesNotMatch(html, /<div class="text-sm">/);
  assert.match(html, /Inner 1/);
  assert.match(html, /Inner 2/);
});

test('content-store blocks unsafe slugs and sanitizes CMS HTML', () => {
  assert.throws(() => validateFooterLinkPath('/evil.example'));
  assert.throws(() => validateFooterLinkPath('admin'));
  assert.throws(() => validateFooterLinkPath('../terms'));

  const protoHtml = renderMarkdownContent('[x](//evil.example/x)');
  assert.doesNotMatch(protoHtml, /href="\/\/evil/);
  assert.doesNotMatch(protoHtml, /<a[^>]+href=/);

  const classHtml = renderMarkdownContent('<p class="bad-class">Injected</p>\n\nParagraph two.');
  assert.doesNotMatch(classHtml, /bad-class/);
  assert.match(classHtml, /<p class="[^"]*text-base/);
});

test('server modules under test do not start timers', () => {
  const root = path.join(__dirname, '..');
  const files = [
    'index.js',
    'auth.js',
    'lib/player-layout.js',
    'lib/player-pages.js',
    'lib/content-store.js',
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /\bsetInterval\s*\(/);
    assert.doesNotMatch(source, /\bsetTimeout\s*\(/);
  }
});