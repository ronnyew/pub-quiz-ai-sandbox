const fs = require('node:fs');
const path = require('node:path');
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

const DEFAULT_CONTENT_PATH = path.join(__dirname, '..', 'content', 'site-content.json');

const CONTENT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_CONTENT_SLUGS = new Set(['admin', 'api', 'health', 'dashboard']);

const TYPOGRAPHY_CLASSES = {
  h1: 'font-headline font-extrabold text-3xl sm:text-4xl text-white uppercase tracking-tight mb-6',
  h2: 'font-headline font-bold text-2xl sm:text-3xl uppercase tracking-tight text-white mb-4 mt-10',
  h3: 'font-headline font-bold text-xl uppercase tracking-tight text-white mb-3 mt-6',
  p: 'text-base text-[#a098b0] font-medium leading-relaxed mb-4',
  ul: 'static-content-ul list-none pl-0 space-y-4 mb-4',
  ol: 'static-content-ol list-decimal pl-6 space-y-2 mb-6 marker:text-[#00ffcc]',
  li: 'static-content-li text-sm leading-relaxed text-[#a098b0]',
  a: 'text-secondary hover:text-white underline decoration-secondary/50 underline-offset-4 transition-colors',
  strong: 'font-headline uppercase text-white tracking-wide',
  em: 'italic text-[#e8e0f0]',
  code: 'font-mono text-xs text-secondary bg-[#0f0f1a] px-1.5 py-0.5 rounded border border-[#302840]',
  blockquote:
    'border-l-4 border-primary pl-4 text-[#a098b0] font-medium italic mb-6',
};

function isAllowedContentSlug(slug) {
  const normalized = String(slug).trim();
  if (!CONTENT_SLUG_REGEX.test(normalized)) {
    return false;
  }
  if (RESERVED_CONTENT_SLUGS.has(normalized)) {
    return false;
  }
  return true;
}

function validateFooterLinkPath(slug) {
  if (!isAllowedContentSlug(slug)) {
    throw new Error(`Invalid or reserved footer_links path slug: ${slug}`);
  }
  return String(slug).trim();
}

function loadSiteContent(contentPath = DEFAULT_CONTENT_PATH) {
  const raw = fs.readFileSync(contentPath, 'utf8');
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object') {
    throw new Error('site-content.json must be a JSON object');
  }
  if (!Array.isArray(data.footer_links)) {
    throw new Error('site-content.json must include footer_links array');
  }
  if (!data.static_copy || typeof data.static_copy !== 'object') {
    throw new Error('site-content.json must include static_copy object');
  }

  data.footer_links = data.footer_links.map((entry) => ({
    ...entry,
    path: validateFooterLinkPath(entry.path),
  }));

  return data;
}

let cachedContent = null;

function getSiteContent() {
  if (!cachedContent) {
    cachedContent = loadSiteContent();
  }
  return cachedContent;
}

function resetSiteContentCache() {
  cachedContent = null;
}

function getStaticCopy() {
  return getSiteContent().static_copy;
}

function getFooterLinks() {
  return getSiteContent().footer_links;
}

function getFooterLinkByPath(slug) {
  if (!isAllowedContentSlug(slug)) {
    return null;
  }
  const normalized = String(slug).trim();
  return getFooterLinks().find((entry) => entry.path === normalized) || null;
}

function applyTypographyClass(tagName, attribs) {
  const className = TYPOGRAPHY_CLASSES[tagName];
  const next = { ...attribs };
  delete next.class;
  if (className) {
    next.class = className;
  }
  if (tagName === 'a') {
    next.rel = 'noopener noreferrer';
  }
  return { tagName, attribs: next };
}

function sanitizeAnchorTag(_tagName, attribs) {
  const next = applyTypographyClass('a', attribs);
  const href = next.attribs.href;
  if (typeof href === 'string' && href.startsWith('//')) {
    delete next.attribs.href;
  }
  return next;
}

function renderMarkdownContent(markdown) {
  const rawHtml = marked.parse(String(markdown), { async: false });
  const transformTags = { a: sanitizeAnchorTag };
  for (const tag of Object.keys(TYPOGRAPHY_CLASSES)) {
    if (tag === 'a') {
      continue;
    }
    transformTags[tag] = (_tagName, attribs) => applyTypographyClass(tag, attribs);
  }

  const sanitized = sanitizeHtml(rawHtml, {
    allowedTags: ['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'code', 'blockquote'],
    allowedAttributes: {
      a: ['href', 'rel', 'class'],
      '*': ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      a: ['http', 'https', 'mailto'],
    },
    transformTags,
  });

  return sanitized;
}

module.exports = {
  CONTENT_SLUG_REGEX,
  RESERVED_CONTENT_SLUGS,
  loadSiteContent,
  getSiteContent,
  resetSiteContentCache,
  getStaticCopy,
  getFooterLinks,
  getFooterLinkByPath,
  validateFooterLinkPath,
  isAllowedContentSlug,
  renderMarkdownContent,
  TYPOGRAPHY_CLASSES,
};