const { getFooterLinks, getStaticCopy, validateFooterLinkPath } = require('./content-store');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderFooterLinks() {
  return getFooterLinks()
    .map((link) => {
      const slug = validateFooterLinkPath(link.path);
      return `<a class="hover:text-secondary transition-colors underline decoration-secondary/50 underline-offset-4" href="/${escapeHtml(slug)}">${escapeHtml(link.title)}</a>`;
    })
    .join('\n    ');
}

function renderPlayerShell({
  title,
  mainHtml,
  signedIn = false,
  centerMain = false,
  gamePin = null,
  roomPin = null,
  playerCount = null,
  hideHeaderMeta = false,
}) {
  const pin = gamePin || roomPin;
  const wordmarkHref = signedIn ? '/dashboard' : '/';
  const safeTitle = escapeHtml(title);
  const footerStatus = escapeHtml(getStaticCopy().footer?.status_text || '© 2024 / ONLINE');
  const headerMeta = [];

  if (!hideHeaderMeta && pin) {
    headerMeta.push(
      `<span class="font-label text-xs uppercase font-bold tracking-widest text-secondary">GAME PIN ${escapeHtml(pin)}</span>`,
    );
  }
  if (!hideHeaderMeta && typeof playerCount === 'number') {
    headerMeta.push(
      `<span class="font-label text-xs uppercase font-bold tracking-widest text-[#a098b0]">${playerCount} PLAYERS</span>`,
    );
  }

  const headerMetaHtml = headerMeta.length
    ? `<div class="flex items-center gap-4">${headerMeta.join('')}</div>`
    : '';

  const mainClass = centerMain
    ? 'w-full flex-1 max-w-7xl mx-auto px-6 sm:px-12 pb-6 flex flex-col justify-center min-h-0'
    : 'w-full flex-1 max-w-7xl mx-auto pt-8 px-6 sm:px-12 pb-6';

  return `<!DOCTYPE html>
<html data-theme="taproom" class="dark" lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=Sora:wght@600;700;800&amp;family=Space+Grotesk:wght@500;600;700&amp;display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles/neon-tokyo.css">
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
</head>
<body class="bg-background text-[#e8e0f0] font-body min-h-screen flex flex-col selection:bg-primary selection:text-white crt-matrix cyber-grid">
<header class="w-full z-50 bg-[#0a0a12]/90 backdrop-blur-md border-b border-[#302840]">
  <div class="max-w-7xl mx-auto px-6 sm:px-12 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 min-w-0">
      <a href="${wordmarkHref}" class="font-bold text-sm tracking-widest font-headline text-white flex items-center gap-2 shrink-0 hover:text-secondary transition-colors">
        <span class="material-symbols-outlined text-base text-primary" style="font-variation-settings: &quot;FILL&quot; 1;">quiz</span>
        PUB QUIZ
      </a>
    </div>
    ${headerMetaHtml}
  </div>
  <div class="h-px w-full bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
</header>
<main class="${mainClass}">
${mainHtml}
</main>
<footer class="w-full bg-[#0a0a12] border-t-2 border-[#302840] py-5 px-6 sm:px-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-label uppercase tracking-widest z-20">
  <div class="font-bold text-sm tracking-widest font-headline text-white flex items-center gap-2">
    <span class="material-symbols-outlined text-base text-primary" style="font-variation-settings: &quot;FILL&quot; 1;">quiz</span>
    PUB QUIZ
  </div>
  <div class="flex items-center gap-6 font-bold text-xs uppercase tracking-widest text-[#a098b0]">
    ${renderFooterLinks()}
  </div>
  <div class="text-xs font-medium text-[#5a5068]">${footerStatus}</div>
</footer>
</body>
</html>`;
}

module.exports = { renderPlayerShell, escapeHtml };