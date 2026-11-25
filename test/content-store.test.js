const test = require('node:test');
const assert = require('node:assert/strict');
const { renderMarkdownContent } = require('../lib/content-store');

const SAMPLE_MARKDOWN = `# Top Title

## Section Two

### Subsection

Paragraph with **bold** and *emphasis* plus \`inline code\`.

- Bullet alpha
- Bullet beta

1. First ordered
2. Second ordered

[External link](https://example.com)

[Mail link](mailto:hello@pubquiz.app)

<script>alert('xss')</script>

<img src=x onerror=alert(1)>
`;

function assertBalancedTags(html, tagName) {
  const open = (html.match(new RegExp(`<${tagName}(\\s|>)`, 'g')) || []).length;
  const close = (html.match(new RegExp(`</${tagName}>`, 'g')) || []).length;
  assert.equal(open, close, `expected balanced <${tagName}> tags`);
}

test('renderMarkdownContent emits styled semantic tags', () => {
  const html = renderMarkdownContent(SAMPLE_MARKDOWN);
  for (const tag of ['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li']) {
    assert.match(html, new RegExp(`<${tag}\\s+class="[^"]+"`), `expected styled <${tag}>`);
  }
  assert.match(html, /class="static-content-ul/);
  assert.match(html, /class="static-content-li/);
  assert.match(html, /class="static-content-ol/);
  assert.doesNotMatch(html, /<div class="text-sm">/);
  assert.match(html, /<a\s+[^>]*class="[^"]*"[^>]*>/);
  assert.match(html, /<strong/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /href="mailto:hello@pubquiz.app"/);
});

test('renderMarkdownContent keeps nested lists as balanced DOM', () => {
  const nested = ['- Outer', '  - Inner 1', '  - Inner 2', '- Second'].join('\n');
  const html = renderMarkdownContent(nested);
  for (const tag of ['ul', 'li']) {
    assertBalancedTags(html, tag);
  }
  assert.match(html, /<li class="[^"]*">Outer<ul/);
  assert.match(html, /Inner 1/);
  assert.match(html, /Inner 2/);
  assert.match(html, /Second/);
});

test('renderMarkdownContent strips script and unsafe markup', () => {
  const html = renderMarkdownContent(SAMPLE_MARKDOWN);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /onerror=/i);
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /alert\('xss'\)/);
});

test('renderMarkdownContent rejects javascript: href schemes', () => {
  const html = renderMarkdownContent('[bad](javascript:alert(1))');
  assert.doesNotMatch(html, /javascript:/i);
});