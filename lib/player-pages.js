const {
  getStaticCopy,
  getFooterLinks,
  getFooterLinkByPath,
  renderMarkdownContent,
  validateFooterLinkPath,
} = require('./content-store');
const { renderPlayerShell, escapeHtml } = require('./player-layout');

function renderLegalHeadline(doc) {
  if (doc.headline_primary && doc.headline_accent) {
    return `<h1 class="font-headline font-extrabold text-4xl sm:text-6xl text-white uppercase tracking-tight leading-none mb-6 drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">
${escapeHtml(doc.headline_primary)}<br>
<span class="text-[#00ffcc] drop-shadow-[0_0_15px_rgba(0,255,204,0.4)]">${escapeHtml(doc.headline_accent)}</span>
</h1>`;
  }
  return `<h1 class="font-headline font-extrabold text-4xl sm:text-6xl text-white uppercase tracking-tight leading-none mb-6 drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">${escapeHtml(doc.title)}</h1>`;
}

function renderLegalSidebar(activePath) {
  const menuLabel = escapeHtml(getStaticCopy().legal_menu_label || 'MENU');
  const items = getFooterLinks()
    .map((link) => {
      const isActive = link.path === activePath;
      const linkClasses = isActive
        ? 'group flex items-center justify-between p-2.5 rounded-lg border border-[#00ffcc]/40 bg-[#1a1a2e] text-[#00ffcc] transition-all'
        : 'group flex items-center justify-between p-2.5 rounded-lg border border-transparent hover:border-[#00ffcc]/40 bg-[#0f0f1a] hover:bg-[#1a1a2e] text-[#e8e0f0] hover:text-[#00ffcc] transition-all';
      const slug = validateFooterLinkPath(link.path);
      return `<li>
<a class="${linkClasses}" href="/${escapeHtml(slug)}">
<span>${escapeHtml(link.title)}</span>
<span class="material-symbols-outlined text-sm text-[#00ffcc] group-hover:translate-x-1 transition-transform">arrow_forward</span>
</a>
</li>`;
    })
    .join('');

  return `<aside class="lg:col-span-4 sticky top-28 space-y-6">
<div class="bg-[#141422]/90 backdrop-blur-xl border border-[#ff2d78]/40 p-6 rounded-xl shadow-[0_0_25px_rgba(255,45,120,0.15)] relative overflow-hidden">
<div class="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-[#00ffcc]"></div>
<div class="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-[#ff2d78]"></div>
<div class="border-b border-[#302840] pb-3 mb-4 flex items-center justify-between">
<span class="font-headline font-bold text-xs uppercase tracking-widest text-[#00ffcc]">${menuLabel}</span>
</div>
<ul class="space-y-2.5 font-label text-xs uppercase font-bold">
${items}
</ul>
</div>
</aside>`;
}

function renderStaticContentPage(pathSlug, signedIn = false) {
  const doc = getFooterLinkByPath(pathSlug);
  if (!doc) {
    return null;
  }

  const bodyHtml = renderMarkdownContent(doc.content);
  const breadcrumb = escapeHtml(doc.title.toUpperCase());
  const dateLabel = doc.date_label
    ? `<div class="flex flex-wrap items-center gap-6 font-label text-xs font-bold uppercase tracking-wider text-[#a098b0] pt-2">
<span class="flex items-center gap-1.5 text-[#00ffcc]">${escapeHtml(doc.date_label)}</span>
</div>`
    : '';

  const mainHtml = `
<div class="flex flex-col w-full">
  <nav aria-label="Breadcrumb" class="w-full pb-6">
    <ol class="inline-flex items-center gap-2 font-label text-xs uppercase font-bold tracking-wider">
      <li><a class="text-[#a098b0] hover:text-[#00ffcc] flex items-center gap-1 transition-colors" href="/"><span class="material-symbols-outlined text-[16px] text-[#00ffcc]">home</span><span>home</span></a></li>
      <li class="text-[#ff2d78] font-bold">/</li>
      <li aria-current="page" class="text-[#00ffcc] underline decoration-2 underline-offset-4 drop-shadow-[0_0_8px_rgba(0,255,204,0.4)]">${breadcrumb}</li>
    </ol>
  </nav>
  <div class="w-full">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      ${renderLegalSidebar(pathSlug)}
      <article class="lg:col-span-8 bg-[#141422]/95 border-2 border-[#00ffcc]/50 rounded-xl p-8 sm:p-12 shadow-[0_0_35px_rgba(0,255,204,0.12)] relative overflow-hidden">
        <div class="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#ff2d78]"></div>
        <div class="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#00ffcc]"></div>
        <header class="border-b border-[#302840] pb-8 mb-10">
          ${renderLegalHeadline(doc)}
          <div class="bg-[#1e1e30]/80 border border-[#302840] rounded-lg p-4 sm:p-6 mb-4">
            <p class="lead font-body text-base sm:text-lg text-[#e8e0f0] font-medium leading-relaxed">${escapeHtml(doc.leading_paragraph)}</p>
          </div>
          ${dateLabel}
        </header>
        <div class="space-y-12 text-[#e8e0f0] font-body leading-relaxed content-markdown">
          ${bodyHtml}
        </div>
      </article>
    </div>
  </div>
</div>`;

  return renderPlayerShell({
    title: `Pub Quiz - ${doc.title}`,
    signedIn,
    mainHtml,
  });
}

function renderGatewayPage() {
  const copy = getStaticCopy().gateway;
  const mainHtml = `
<div class="flex flex-col w-full max-w-7xl mx-auto flex-1 justify-center pt-12 px-0 sm:px-4 pb-6">
  <section class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
    <div class="lg:col-span-7 flex flex-col space-y-6">
      <div class="space-y-1">
        <h1 class="font-headline font-extrabold text-5xl sm:text-7xl lg:text-8xl tracking-tighter leading-[0.92] text-white uppercase drop-shadow-[0_0_25px_rgba(255,45,120,0.25)]">
          ${escapeHtml(copy.hero_line_before)} <br>
          <span class="bg-[#141422] text-[#00ffcc] px-3 py-1 border-2 border-[#00ffcc] shadow-[0_0_20px_rgba(0,255,204,0.35)] rounded-lg inline-block transform -rotate-1 mt-1 font-headline">${escapeHtml(copy.hero_highlight)}</span> <br>
          ${escapeHtml(copy.hero_line_after)}
        </h1>
      </div>
      <p class="font-body text-lg text-[#a098b0] max-w-xl">
        ${escapeHtml(copy.subtitle)}
      </p>
    </div>
    <div class="lg:col-span-5 w-full">
      <div class="bg-[#141422]/95 border-2 border-[#ff2d78]/50 shadow-[0_0_35px_rgba(255,45,120,0.25)] rounded-xl p-6 sm:p-8 backdrop-blur-xl relative overflow-hidden">
        <div class="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#00ffcc]"></div>
        <div class="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#ff2d78]"></div>
        <div class="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#ff2d78]"></div>
        <div class="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#00ffcc]"></div>
        <div class="border-b-2 border-[#302840] pb-5 mb-6">
          <h2 class="font-headline font-bold text-3xl text-white tracking-tight uppercase">${escapeHtml(copy.join_card_title)}</h2>
        </div>
        <label class="block font-label text-xs font-bold uppercase tracking-wider text-[#a098b0] mb-2" for="guest-pin">${escapeHtml(copy.pin_label)}</label>
        <input id="guest-pin" type="text" inputmode="numeric" maxlength="6" placeholder="${escapeHtml(copy.pin_placeholder)}" disabled
          class="w-full bg-[#0f0f1a] text-white border border-[#302840] rounded-lg px-3 py-2 text-sm font-body opacity-70 cursor-not-allowed mb-4" />
        <button type="button" disabled class="w-full py-3 bg-[#ff2d78]/40 text-white border border-[#ff2d78]/40 rounded-lg font-label font-bold text-xs tracking-widest uppercase cursor-not-allowed">
          ${escapeHtml(copy.join_button_label)}
        </button>
        <button type="button" disabled class="w-full mt-3 py-3 bg-[#0f0f1a] text-white border border-[#302840] rounded-lg font-label font-bold text-xs tracking-widest uppercase cursor-not-allowed">
          ${escapeHtml(copy.host_button_label)}
        </button>
      </div>
    </div>
  </section>
</div>`;

  return renderPlayerShell({
    title: 'Pub Quiz - Gateway',
    signedIn: false,
    centerMain: true,
    mainHtml,
  });
}

module.exports = {
  renderGatewayPage,
  renderStaticContentPage,
};