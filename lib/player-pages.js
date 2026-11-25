const {
  formatCopyTemplate,
  getStaticCopy,
  getFooterLinks,
  getFooterLinkByPath,
  renderMarkdownContent,
  validateFooterLinkPath,
} = require('./content-store');
const { getAuthProviders } = require('../auth');
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
  const menuLabel = escapeHtml(getStaticCopy().legal_menu_label);
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

function renderGatewayAuthPayload(firebaseConfig, copy) {
  if (!firebaseConfig) {
    return '';
  }
  const providers = getAuthProviders();
  const safeConfig = JSON.stringify(firebaseConfig).replace(/</g, '\\u003c');
  const safeCopy = JSON.stringify(copy).replace(/</g, '\\u003c');
  const safeProviders = JSON.stringify(providers).replace(/</g, '\\u003c');
  return `<script src="https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.0/firebase-auth-compat.js"></script>
<script id="pq-firebase-config" type="application/json">${safeConfig}</script>
<script id="pq-auth-copy" type="application/json">${safeCopy}</script>
<script id="pq-auth-providers" type="application/json">${safeProviders}</script>
<script src="/scripts/gateway-auth.js" defer></script>`;
}

function renderPhoneRecaptchaNotice(copy) {
  const privacyHref = escapeHtml(copy.phone_recaptcha_privacy_href);
  const termsHref = escapeHtml(copy.phone_recaptcha_terms_href);
  return `<p class="text-xs text-slate-400 font-body leading-relaxed pt-1">
${escapeHtml(copy.phone_recaptcha_notice_prefix)}
<a class="underline hover:text-[#00ffcc] transition-colors" href="${privacyHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.phone_recaptcha_privacy_label)}</a>
${escapeHtml(copy.phone_recaptcha_notice_middle)}
<a class="underline hover:text-[#00ffcc] transition-colors" href="${termsHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.phone_recaptcha_terms_label)}</a>
${escapeHtml(copy.phone_recaptcha_notice_suffix)}
</p>`;
}

function renderAuthCard(copy, firebaseConfig) {
  const providers = getAuthProviders();
  const showGoogle = providers.includes('google');
  const showSignInTab = showGoogle;
  const showEmailTab = providers.includes('emailLink');
  const showPhoneTab = providers.includes('phone');

  const tabOrder = [];
  if (showSignInTab) tabOrder.push({ id: 'signin', label: copy.auth_sign_in_tab, btnId: 'tab-sign-in-btn' });
  if (showEmailTab) tabOrder.push({ id: 'email', label: copy.auth_email_tab, btnId: 'tab-email-btn' });
  if (showPhoneTab) tabOrder.push({ id: 'phone', label: copy.auth_phone_tab, btnId: 'tab-phone-btn' });
  const defaultTab = tabOrder[0]?.id || 'signin';
  const showTabBar = tabOrder.length > 1;

  const firebaseNote = firebaseConfig
    ? ''
    : `<p class="font-body text-xs text-[#a098b0] mb-4">${escapeHtml(copy.firebase_unconfigured_note)}</p>`;

  const tabButtons = showTabBar
    ? tabOrder
      .map((tab, index) => {
        const active = tab.id === defaultTab ? ' pq-auth-tab-active' : '';
        return `<button type="button" class="pq-auth-tab${active}" id="${tab.btnId}" data-auth-tab="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>`;
      })
      .join('')
    : '';

  const tabBar = showTabBar
    ? `<div class="flex border border-[#302840] rounded-lg mb-6 bg-[#0f0f1a] overflow-hidden p-1 gap-1" id="pq-auth-tab-bar">${tabButtons}</div>`
    : '';

  const panelHidden = (tabId) => (tabId === defaultTab ? '' : ' hidden');

  const googleButton = showGoogle
    ? `<button type="button" id="pq-google-sign-in" class="pq-auth-provider-btn group">
<div class="flex items-center gap-3">
<svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"></path>
<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"></path>
</svg>
<span class="font-label font-bold text-xs sm:text-sm tracking-wider uppercase text-white group-hover:text-[#00ffcc] transition-colors">${escapeHtml(copy.google_button_label)}</span>
</div>
<span class="material-symbols-outlined text-[#00ffcc] text-base group-hover:translate-x-1 transition-transform">arrow_forward</span>
</button>`
    : '';

  const signInPanel = showSignInTab
    ? `<div class="space-y-3${panelHidden('signin')}" id="auth-sign-in" data-auth-panel="signin">
${googleButton}
</div>`
    : '';

  const emailPanel = showEmailTab
    ? `<div class="space-y-4${panelHidden('email')}" id="auth-email" data-auth-panel="email">
<div>
<label class="block font-label text-xs font-bold uppercase tracking-wider text-[#a098b0] mb-1" for="pq-email">${escapeHtml(copy.email_label)}</label>
<input class="pq-auth-input" id="pq-email" type="email" autocomplete="email" placeholder="${escapeHtml(copy.email_placeholder)}">
</div>
<div class="pt-2">
<button type="button" id="pq-email-link" class="pq-auth-cta-primary">${escapeHtml(copy.email_link_button_label)}</button>
</div>
<div id="pq-email-confirm-wrap" class="hidden space-y-2 pt-2 border-t border-[#302840]">
<label class="block font-label text-xs font-bold uppercase tracking-wider text-[#a098b0] mb-1" for="pq-email-confirm">${escapeHtml(copy.email_confirm_label)}</label>
<input class="pq-auth-input" id="pq-email-confirm" type="email" autocomplete="email" placeholder="${escapeHtml(copy.email_placeholder)}">
<button type="button" id="pq-email-link-complete" class="pq-auth-cta-primary">${escapeHtml(copy.email_link_complete_button_label)}</button>
</div>
</div>`
    : '';

  const phonePanel = showPhoneTab
    ? `<div class="space-y-4${panelHidden('phone')}" id="auth-phone" data-auth-panel="phone">
<div id="pq-phone-step-send">
<label class="block font-label text-xs font-bold uppercase tracking-wider text-[#a098b0] mb-1" for="pq-phone-number">${escapeHtml(copy.phone_number_label)}</label>
<input class="pq-auth-input" id="pq-phone-number" type="tel" autocomplete="tel" placeholder="${escapeHtml(copy.phone_number_placeholder)}">
<div id="pq-recaptcha" class="pq-recaptcha-host" aria-hidden="true"></div>
<button type="button" id="pq-send-sms" class="pq-auth-cta-primary w-full mt-2">${escapeHtml(copy.send_sms_button_label)}</button>
</div>
<div id="pq-sms-verify-step" class="hidden space-y-3 pt-1">
<label class="block font-label text-xs font-bold uppercase tracking-wider text-[#a098b0] mb-1" for="pq-sms-code">${escapeHtml(copy.sms_code_label)}</label>
<input class="pq-auth-input" id="pq-sms-code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="${escapeHtml(copy.sms_code_placeholder)}">
<button type="button" id="pq-verify-sms" class="pq-auth-cta-primary w-full">${escapeHtml(copy.verify_sms_button_label)}</button>
<button type="button" id="pq-phone-change" class="font-label text-[11px] uppercase tracking-wider text-[#00ffcc] hover:underline w-full text-left">${escapeHtml(copy.phone_change_label)}</button>
</div>
${renderPhoneRecaptchaNotice(copy)}
</div>`
    : '';

  return `<div class="pq-auth-card bg-[#141422]/95 border-2 border-[#ff2d78]/50 shadow-[0_0_35px_rgba(255,45,120,0.25)] rounded-xl p-6 sm:p-8 backdrop-blur-xl relative overflow-hidden">
<div class="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#00ffcc]"></div>
<div class="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#ff2d78]"></div>
<div class="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#ff2d78]"></div>
<div class="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#00ffcc]"></div>
<div class="border-b-2 border-[#302840] pb-5 mb-6">
<h2 class="font-headline font-bold text-3xl text-white tracking-tight uppercase drop-shadow-[0_0_10px_rgba(255,45,120,0.4)]">${escapeHtml(copy.auth_card_title)}</h2>
</div>
${firebaseNote}
${tabBar}
<div id="pq-auth-error" class="pq-auth-alert pq-auth-alert-error hidden mb-4" role="alert" aria-live="polite"></div>
<div id="pq-auth-success" class="pq-auth-alert pq-auth-alert-success hidden mb-4" role="status" aria-live="polite"></div>
<div id="pq-auth-default-tab" class="hidden" data-default-tab="${escapeHtml(defaultTab)}"></div>
${signInPanel}
${emailPanel}
${phonePanel}
<div class="mt-6 pt-4 border-t-2 border-[#302840]"></div>
</div>`;
}

function renderGatewayPage({ signedIn = false, firebaseConfig = null, extraFootHtml = '' } = {}) {
  const copy = getStaticCopy().gateway;
  const authHtml = signedIn
    ? `<div class="bg-[#141422]/95 border-2 border-[#00ffcc]/50 rounded-xl p-8 text-center">
<p class="font-body text-[#e8e0f0] mb-4">${escapeHtml(copy.signed_in_cta)}</p>
<a href="/dashboard" class="inline-flex items-center gap-2 py-3 px-6 bg-[#ff2d78] text-white font-label font-bold text-xs tracking-widest uppercase rounded-lg">${escapeHtml(copy.signed_in_dashboard_label)}</a>
</div>`
    : renderAuthCard(copy, firebaseConfig);

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
      ${authHtml}
    </div>
  </section>
</div>
${!signedIn ? renderGatewayAuthPayload(firebaseConfig, copy) : ''}
${extraFootHtml}`;

  return renderPlayerShell({
    title: 'Pub Quiz - Gateway',
    signedIn,
    centerMain: true,
    mainHtml,
  });
}

function renderHandlePage({ draftHandle = '', errorMessage = null, signedIn = true }) {
  const copy = getStaticCopy().onboarding;
  const safeDraft = escapeHtml(draftHandle);
  const errorBlock = errorMessage
    ? `<p class="font-label text-sm text-[#ff4444] tracking-wide">${escapeHtml(errorMessage)}</p>`
    : '';

  const mainHtml = `
<div class="flex flex-col w-full items-center justify-center relative pt-4 pb-6">
<div class="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
<div class="relative w-full max-w-xl bg-[#141422]/90 backdrop-blur-xl rounded-xl shadow-2xl p-6 sm:p-10 z-10 border-2 border-[#00ffcc]/40">
<div class="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-secondary"></div>
<div class="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-primary"></div>
<div class="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-primary"></div>
<div class="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-secondary"></div>
<div class="space-y-3 mb-8">
<h1 class="font-headline font-extrabold text-2xl sm:text-3xl text-white tracking-tight uppercase leading-none">
${escapeHtml(copy.title_line_before)} <span class="text-primary">${escapeHtml(copy.title_highlight)}</span>
</h1>
<p class="font-body text-sm sm:text-base text-[#a098b0] leading-relaxed">${escapeHtml(copy.subtitle)}</p>
</div>
<form method="post" action="/onboarding/handle" class="space-y-6">
<div class="space-y-2">
<label class="font-label text-xs uppercase tracking-wider font-semibold text-[#a098b0] flex items-center gap-1.5" for="handleInput">
<span class="material-symbols-outlined text-sm text-secondary">terminal</span>
${escapeHtml(copy.input_label)}
</label>
<div class="relative group">
<div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
<span class="font-headline font-bold text-lg text-secondary/70">@</span>
</div>
<input id="handleInput" name="handle" autocomplete="off" maxlength="18" spellcheck="false" type="text"
  value="${safeDraft}" placeholder="${escapeHtml(copy.placeholder)}"
  class="w-full bg-[#0a0a12] text-white font-headline font-semibold text-base sm:text-lg pl-10 pr-4 py-3.5 rounded-lg border-2 border-[#302840] focus:border-secondary focus:outline-none transition-all" />
</div>
<span class="font-label text-[11px] text-[#5a5068]">${escapeHtml(copy.rule_text)}</span>
${errorBlock}
</div>
<button type="submit" class="w-full bg-primary hover:bg-[#b3004e] text-white font-headline font-bold text-base py-4 px-6 rounded-lg shadow-[0_0_20px_rgba(255,45,120,0.4)] uppercase tracking-wider flex items-center justify-center gap-2">
${escapeHtml(copy.submit_label)}
<span class="material-symbols-outlined text-lg">arrow_forward</span>
</button>
<p class="flex items-center justify-center gap-2 text-center text-xs text-[#a098b0] font-body">
<span class="material-symbols-outlined text-sm text-[#5a5068]">verified_user</span>
<span>${escapeHtml(copy.profile_note)}</span>
</p>
</form>
</div>
</div>`;

  return renderPlayerShell({
    title: 'Pub Quiz - Handle Setup',
    signedIn,
    centerMain: true,
    mainHtml,
  });
}

function renderGameStartPage({ session }) {
  const copy = getStaticCopy().game_start;
  const dashCopy = getStaticCopy().dashboard;
  const shared = getStaticCopy().shared;
  const handle = session?.handle
    ? escapeHtml(session.handle.toUpperCase())
    : escapeHtml(shared.default_player_label);

  const mainHtml = `
<div class="flex flex-col w-full max-w-3xl mx-auto px-6 py-16">
<section class="bg-[#141422]/95 border-2 border-primary/50 rounded-xl p-8 sm:p-12 relative overflow-hidden shadow-[0_0_35px_rgba(255,45,120,0.15)]">
<div class="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-secondary pointer-events-none"></div>
<div class="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-primary pointer-events-none"></div>
<h1 class="font-headline font-extrabold text-4xl sm:text-5xl uppercase tracking-tight text-white leading-none mb-6">
${escapeHtml(copy.title_line_before)} <span class="text-[#00ffcc]">${escapeHtml(copy.title_line_accent)}</span>
</h1>
<p class="font-body text-[#a098b0] text-base leading-relaxed mb-8">${escapeHtml(copy.body)}</p>
<p class="font-label text-xs uppercase tracking-widest text-[#a098b0] mb-8">${escapeHtml(dashCopy.welcome_prefix)} <span class="text-[#ff2d78]">${handle}</span></p>
<form method="post" action="/game" class="pt-4 border-t border-[#302840]">
<button type="submit" id="pq-create-game-cta" class="pq-dashboard-start-cta group w-full flex items-center justify-between bg-primary hover:bg-[#b3004e] text-white border border-primary px-6 py-4 rounded-lg font-label uppercase font-bold text-base tracking-wider transition-all shadow-[0_0_20px_rgba(255,45,120,0.4)] hover:shadow-[0_0_30px_rgba(255,45,120,0.7)]">
<span>${escapeHtml(copy.submit_label)}</span>
<span class="material-symbols-outlined text-xl transition-transform group-hover:translate-x-1">arrow_forward</span>
</button>
</form>
</section>
</div>`;

  return renderPlayerShell({
    title: 'Pub Quiz - Start Game',
    signedIn: Boolean(session?.uid),
    mainHtml,
  });
}

function renderDashboardMatchRow(match) {
  const code = escapeHtml(match.game_code);
  const categories = escapeHtml(match.categories);
  const date = escapeHtml(match.date_label);
  const score = escapeHtml(match.score_label);
  const outcome = escapeHtml(match.outcome);
  const outcomeType = escapeHtml(match.outcome_type || 'completed');
  const accuracy = escapeHtml(match.accuracy);
  const speed = escapeHtml(match.speed);
  const rank = escapeHtml(match.rank);
  const rounds = escapeHtml(match.rounds);
  const badge = outcomeType === '1st'
    ? `<span class="pq-match-outcome-badge inline-flex items-center gap-1.5 px-3 py-1 bg-primary/20 text-primary border border-primary/60 rounded-md font-label text-xs font-bold uppercase shadow-[0_0_12px_rgba(255,45,120,0.3)]"><span class="material-symbols-outlined text-sm" style="font-variation-settings: &quot;FILL&quot; 1;">workspace_premium</span> ${outcome}</span>`
    : '';
  return `<tr class="match-row group cursor-pointer hover:bg-[#1a1a2e]/70 hover:shadow-[inset_0_0_20px_rgba(0,255,204,0.12)] transition-all"
data-accuracy="${accuracy}" data-categories="${categories}" data-code="#${code}" data-date="${date}" data-outcome="${outcome}" data-outcome-type="${outcomeType}" data-rank="${rank}" data-rounds="${rounds}" data-score="${score}" data-speed="${speed}">
<td class="py-4 px-6 font-headline font-bold text-secondary text-base group-hover:text-white group-hover:drop-shadow-[0_0_8px_rgba(0,255,204,0.7)] transition-colors pq-match-code">#${code}</td>
<td class="py-4 px-6 font-medium text-[#e8e0f0]">${categories}</td>
<td class="py-4 px-6 font-label uppercase text-xs text-[#a098b0]">${date}</td>
<td class="py-4 px-6 font-headline font-bold text-base text-secondary">${score}</td>
<td class="py-4 px-6 text-right">${badge}</td>
<td class="py-4 pr-6 pl-2 text-right"><span class="row-arrow material-symbols-outlined text-secondary text-lg">chevron_right</span></td>
</tr>`;
}

function renderDashboardPage(session) {
  const copy = getStaticCopy().dashboard;
  const shared = getStaticCopy().shared;
  const handle = session?.handle
    ? escapeHtml(session.handle.toUpperCase())
    : escapeHtml(shared.default_player_label);
  const matches = Array.isArray(copy.demo_matches) ? copy.demo_matches : [];
  const matchRows = matches.length
    ? matches.map((match) => renderDashboardMatchRow(match)).join('')
    : `<tr><td colspan="6" class="py-8 px-6 text-center font-body text-sm text-[#a098b0]">${escapeHtml(copy.history_empty_note)}</td></tr>`;
  const pagerLabel = matches.length
    ? formatCopyTemplate(copy.history_sessions_pager_template, {
      count: matches.length,
      total: matches.length,
    })
    : copy.history_pager_label;

  const mainHtml = `
<div class="flex flex-col w-full">
<section class="pq-dashboard-hero w-full border-b border-primary/30 px-6 lg:px-12 py-8 relative overflow-hidden shadow-[0_4px_30px_rgba(255,45,120,0.1)]">
<div class="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-secondary pointer-events-none"></div>
<div class="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
<div class="space-y-3">
<h1 class="text-4xl sm:text-5xl lg:text-6xl font-headline font-bold uppercase tracking-tight text-white leading-none drop-shadow-[0_0_20px_rgba(255,45,120,0.3)]">
${escapeHtml(copy.welcome_prefix)}<br class="hidden sm:inline"> <span class="pq-dashboard-handle text-[#ff2d78]">${handle}!</span>
</h1>
</div>
<form method="post" action="/api/auth/signout" class="self-start md:self-end relative z-10 shrink-0">
<button type="submit" id="pq-dashboard-sign-out" class="pq-dashboard-signout px-4 py-2 border border-[#302840] text-[#a098b0] font-label text-xs uppercase tracking-widest rounded-lg">${escapeHtml(copy.sign_out_label)}</button>
</form>
</div>
</section>
<section class="max-w-7xl mx-auto w-full px-6 lg:px-12 py-12">
<div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
<div class="pq-dashboard-card pq-dashboard-card--start relative bg-[#141422]/90 backdrop-blur-xl border border-primary/50 rounded-xl p-8 lg:p-10 flex flex-col justify-between shadow-[0_0_30px_rgba(255,45,120,0.15)] transition-all duration-200 hover:-translate-y-1 hover:border-primary hover:shadow-[0_0_35px_rgba(255,45,120,0.3)]">
<div class="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-secondary pointer-events-none"></div>
<div class="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-primary pointer-events-none"></div>
<div class="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-primary pointer-events-none"></div>
<div class="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-secondary pointer-events-none"></div>
<div class="space-y-6">
<h2 class="text-3xl lg:text-4xl font-headline font-bold uppercase tracking-tight text-white drop-shadow-[0_0_12px_rgba(255,45,120,0.3)]">${escapeHtml(copy.start_game_title)}</h2>
<p class="font-body text-[#a098b0] text-base leading-relaxed">${escapeHtml(copy.start_game_body)}</p>
</div>
<div class="mt-8 pt-6 border-t border-[#302840]">
<form method="post" action="/game" class="w-full">
<button type="submit" id="pq-create-game-cta" class="pq-dashboard-start-cta group w-full flex items-center justify-between bg-primary hover:bg-[#b3004e] text-white border border-primary px-6 py-4 rounded-lg font-label uppercase font-bold text-base tracking-wider transition-all shadow-[0_0_20px_rgba(255,45,120,0.4)] hover:shadow-[0_0_30px_rgba(255,45,120,0.7)]">
<span>${escapeHtml(copy.start_game_cta)}</span>
<span class="material-symbols-outlined text-xl transition-transform group-hover:translate-x-1">arrow_forward</span>
</button>
</form>
</div>
</div>
<div class="pq-dashboard-card pq-dashboard-card--join relative bg-[#141422]/90 backdrop-blur-xl border border-secondary/50 rounded-xl p-8 lg:p-10 flex flex-col justify-between shadow-[0_0_30px_rgba(0,255,204,0.12)] transition-all duration-200 hover:-translate-y-1 hover:border-secondary hover:shadow-[0_0_35px_rgba(0,255,204,0.3)]">
<div class="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-primary pointer-events-none"></div>
<div class="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-secondary pointer-events-none"></div>
<div class="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-secondary pointer-events-none"></div>
<div class="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-primary pointer-events-none"></div>
<div class="space-y-6">
<h2 class="text-3xl lg:text-4xl font-headline font-bold uppercase tracking-tight text-white drop-shadow-[0_0_12px_rgba(0,255,204,0.3)]">${escapeHtml(copy.join_game_title)}</h2>
<p class="font-body text-[#a098b0] text-base leading-relaxed">${escapeHtml(copy.join_game_body)}</p>
<form method="get" action="/join" class="space-y-3 pt-2">
<label class="block font-label text-xs uppercase tracking-widest font-bold text-secondary" for="game-pin-input">${escapeHtml(copy.game_pin_input_label)}</label>
<div class="relative flex items-center">
<span class="absolute left-4 font-headline text-2xl font-bold text-secondary/70">#</span>
<input id="game-pin-input" name="game" maxlength="6" inputmode="numeric" pattern="\\d{6}" class="pq-join-pin-input w-full bg-[#0a0a12] rounded-lg pl-11 pr-4 py-3 text-2xl font-headline font-bold uppercase tracking-widest text-secondary border-2 border-secondary/60 focus:border-secondary focus:bg-[#0f0f1a] focus:outline-none placeholder:text-[#5a5068] transition-all" placeholder="${escapeHtml(copy.game_pin_placeholder)}" type="text" required />
</div>
<div class="mt-8 pt-6 border-t border-[#302840]">
<button type="submit" class="pq-dashboard-join-cta group w-full flex items-center justify-between bg-secondary hover:bg-[#00e6b8] text-[#0a0a12] border border-secondary px-6 py-4 rounded-lg font-label uppercase font-bold text-base tracking-wider transition-all shadow-[0_0_20px_rgba(0,255,204,0.4)] hover:shadow-[0_0_30px_rgba(0,255,204,0.7)]">
<span>${escapeHtml(copy.join_game_cta)}</span>
<span class="material-symbols-outlined text-xl transition-transform group-hover:translate-x-1">play_arrow</span>
</button>
</div>
</form>
</div>
</div>
</div>
</section>
<section class="max-w-7xl mx-auto w-full px-6 lg:px-12 py-12">
<div class="space-y-6">
<h3 class="text-3xl font-headline font-bold uppercase text-white">${escapeHtml(copy.recent_history_title)}</h3>
<div class="pq-dashboard-history-table border border-[#302840] rounded-xl bg-[#141422]/90 backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.5)] overflow-x-auto relative">
<div class="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-secondary pointer-events-none"></div>
<div class="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-primary pointer-events-none"></div>
<table class="w-full text-left border-collapse">
<thead><tr class="bg-[#1e1e30]/90 text-[#a098b0] font-label uppercase text-xs tracking-widest border-b border-[#302840]">
<th class="py-4 px-6 font-bold">${escapeHtml(copy.table_game_code)}</th>
<th class="py-4 px-6 font-bold">${escapeHtml(shared.table_categories)}</th>
<th class="py-4 px-6 font-bold">${escapeHtml(shared.table_date)}</th>
<th class="py-4 px-6 font-bold">${escapeHtml(shared.table_score)}</th>
<th class="py-4 px-6 font-bold text-right">${escapeHtml(shared.table_outcome)}</th>
<th class="py-4 pr-6 pl-2 w-10 text-center font-bold"></th>
</tr></thead>
<tbody class="divide-y divide-[#302840]/60 font-body text-sm" id="match-table-body">${matchRows}</tbody>
</table>
</div>
<div class="flex items-center justify-between pt-2">
<span class="font-label text-xs uppercase tracking-wider text-[#a098b0] font-bold">${escapeHtml(pagerLabel)}</span>
</div>
</div>
</section>
<div class="fixed inset-0 z-50 flex items-center justify-center px-6 lg:px-12 pt-12 pb-6 overflow-y-auto hidden" id="match-modal">
<div class="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity" id="modal-backdrop"></div>
<div class="pq-match-modal relative w-full max-w-4xl bg-[#141422]/95 border-2 border-secondary/70 rounded-xl shadow-[0_0_50px_rgba(0,255,204,0.25),0_0_20px_rgba(255,45,120,0.2)] overflow-hidden z-10 my-8">
<div class="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-secondary pointer-events-none"></div>
<div class="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-primary pointer-events-none"></div>
<div class="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-primary pointer-events-none"></div>
<div class="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-secondary pointer-events-none"></div>
<div class="px-6 py-5 bg-[#1e1e30]/90 border-b border-[#302840] flex items-center justify-between gap-4">
<div class="flex flex-wrap items-center gap-3">
<span class="font-headline font-bold text-2xl text-secondary tracking-wider drop-shadow-[0_0_10px_rgba(0,255,204,0.6)]" id="modal-game-code">#000000</span>
<span class="text-[#5a5068]">/</span>
<span class="font-label text-xs uppercase tracking-widest text-[#a098b0] font-bold" id="modal-date">—</span>
<div id="modal-badge-container"></div>
</div>
<button type="button" id="modal-close-btn" class="w-9 h-9 flex items-center justify-center rounded-lg border border-[#302840] bg-[#0a0a12] text-[#a098b0] hover:text-white hover:border-primary hover:shadow-[0_0_15px_rgba(255,45,120,0.5)] transition-all font-label text-sm font-bold cursor-pointer" title="Close">✕</button>
</div>
<div class="p-6 sm:p-8 space-y-6 max-h-[75vh] overflow-y-auto">
<div class="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-[#0a0a12]/90 border border-[#302840] rounded-lg p-4 shadow-inner">
<div class="border-r border-[#302840]/60 pr-2"><div class="font-label text-[10px] uppercase tracking-widest text-[#a098b0]">${escapeHtml(shared.modal_total_score)}</div><div class="font-headline font-bold text-xl sm:text-2xl text-secondary drop-shadow-[0_0_8px_rgba(0,255,204,0.4)]" id="modal-score">—</div></div>
<div class="border-r border-[#302840]/60 pr-2"><div class="font-label text-[10px] uppercase tracking-widest text-[#a098b0]">${escapeHtml(shared.modal_accuracy)}</div><div class="font-headline font-bold text-xl sm:text-2xl text-white" id="modal-accuracy">—</div></div>
<div class="border-r border-[#302840]/60 pr-2"><div class="font-label text-[10px] uppercase tracking-widest text-[#a098b0]">${escapeHtml(shared.modal_avg_speed)}</div><div class="font-headline font-bold text-xl sm:text-2xl text-tertiary" id="modal-speed">—</div></div>
<div class="border-r border-[#302840]/60 pr-2"><div class="font-label text-[10px] uppercase tracking-widest text-[#a098b0]">${escapeHtml(shared.modal_rank)}</div><div class="font-headline font-bold text-xl sm:text-2xl text-primary drop-shadow-[0_0_8px_rgba(255,45,120,0.4)]" id="modal-rank">—</div></div>
<div class="col-span-2 sm:col-span-1"><div class="font-label text-[10px] uppercase tracking-widest text-[#a098b0]">${escapeHtml(shared.modal_rounds)}</div><div class="font-headline font-bold text-xl sm:text-2xl text-white" id="modal-rounds">—</div></div>
</div>
<p class="font-body text-sm text-[#a098b0]" id="modal-categories">—</p>
</div>
</div>
</div>
</div>
<script src="/scripts/dashboard-match-modal.js" defer></script>`;

  return renderPlayerShell({
    title: 'Pub Quiz - Dashboard',
    signedIn: true,
    mainHtml,
  });
}

function renderPackCard(pack, selected) {
  const shared = getStaticCopy().shared;
  const title = escapeHtml(pack.title);
  const category = escapeHtml(pack.category);
  const total = Number.isInteger(pack.totalQuestions) ? pack.totalQuestions : 0;
  const questionsLabel = escapeHtml(
    formatCopyTemplate(shared.pack_questions_template, { n: total }),
  );
  const checked = selected ? 'checked' : '';
  const ariaChecked = selected ? 'true' : 'false';
  const icon = selected ? 'check_box' : 'check_box_outline_blank';
  return `<label class="pq-topic-card cursor-pointer text-left p-4 sm:p-5 rounded-xl flex flex-col justify-between relative overflow-hidden${selected ? ' pq-topic-card--selected neon-glow-pink' : ''}" tabindex="0" role="checkbox" aria-checked="${ariaChecked}" data-topic-pack-id="${escapeHtml(pack.topicPackId)}">
<input type="checkbox" name="topicPackIds" value="${escapeHtml(pack.topicPackId)}" class="pq-topic-checkbox sr-only" ${checked}>
<div class="flex justify-between items-start w-full relative z-10">
<span class="pq-topic-category-pill px-2 py-0.5 font-label text-[10px] uppercase font-bold tracking-widest rounded">${category}</span>
<span class="pq-topic-check-icon material-symbols-outlined text-2xl">${icon}</span>
</div>
<div class="relative z-10 mt-3">
<div class="pq-topic-title font-headline font-bold text-base sm:text-lg uppercase tracking-tight leading-tight text-white">${title}</div>
<div class="pq-topic-meta flex items-center gap-2 mt-1.5 font-label text-xs font-semibold uppercase tracking-wider">
<span class="material-symbols-outlined text-sm">quiz</span>
<span>${questionsLabel}</span>
</div>
</div>
</label>`;
}

function renderTopicPager(packView, gamePinEscaped) {
  const shared = getStaticCopy().shared;
  const page = packView.page || 1;
  const totalPages = packView.totalPages || 1;
  const total = packView.total ?? 0;
  const start = packView.start ?? 0;
  const end = packView.end ?? 0;
  const rangeText = total === 0 ? '0' : `${start}–${end}`;
  const searchQ = packView.search ? `search=${encodeURIComponent(packView.search)}&` : '';

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  const prevHref = prevDisabled
    ? '#'
    : `/game/${gamePinEscaped}?${searchQ}page=${page - 1}`;
  const nextHref = nextDisabled
    ? '#'
    : `/game/${gamePinEscaped}?${searchQ}page=${page + 1}`;
  const prevClass = prevDisabled
    ? 'pq-pager-btn px-2.5 py-1.5 rounded font-bold flex items-center justify-center opacity-40 pointer-events-none'
    : 'pq-pager-btn px-2.5 py-1.5 rounded font-bold flex items-center justify-center transition-colors';
  const nextClass = nextDisabled
    ? 'pq-pager-btn px-2.5 py-1.5 rounded font-bold flex items-center justify-center opacity-40 pointer-events-none'
    : 'pq-pager-btn px-2.5 py-1.5 rounded font-bold flex items-center justify-center transition-colors';

  const pageLinks = [];
  for (let i = 1; i <= totalPages; i += 1) {
    const active = i === page;
    const btnClass = active
      ? 'pq-pager-btn pq-pager-btn--active w-7 h-7 rounded flex items-center justify-center font-bold text-xs'
      : 'pq-pager-btn w-7 h-7 rounded flex items-center justify-center font-bold text-xs transition-colors';
    const q = packView.search
      ? `search=${encodeURIComponent(packView.search)}&page=${i}`
      : `page=${i}`;
    pageLinks.push(`<a class="${btnClass}" href="/game/${gamePinEscaped}?${escapeHtml(q)}">${i}</a>`);
  }

  const pagerSummary = formatCopyTemplate(shared.topics_pager_range_template, {
    range: rangeText,
    total: String(total),
  });

  return `<div class="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-[#302840] font-label text-xs" id="pagination-info">
<div class="text-[#a098b0] uppercase font-semibold tracking-wider pq-topics-pager-label">${escapeHtml(pagerSummary)}</div>
<div class="inline-flex items-center gap-1.5 flex-wrap justify-center">
<a class="${prevClass}" href="${prevHref}" aria-label="Previous page"><span class="material-symbols-outlined text-sm">chevron_left</span></a>
${pageLinks.join('')}
<a class="${nextClass}" href="${nextHref}" aria-label="Next page"><span class="material-symbols-outlined text-sm">chevron_right</span></a>
</div>
</div>`;
}

function renderHostLobbyPage({ session, room, packView, inviteUrl, message = null, error = null }) {
  const copy = getStaticCopy().host_lobby;
  const pin = escapeHtml(room.roomId);
  const playerCount = room.players?.length || 0;
  const selected = new Set(packView.selectedIds || []);

  const searchValue = escapeHtml(packView.search || '');
  const packsHtml = packView.packs.length
    ? packView.packs.map((pack) => renderPackCard(pack, selected.has(pack.topicPackId))).join('')
  : `<div class="py-10 text-center font-label text-xs text-[#a098b0] uppercase tracking-widest col-span-full">
<span class="material-symbols-outlined text-3xl text-primary mb-2 block">search_off</span>
${escapeHtml(copy.no_results_label)}
</div>`;

  const pagerHtml = renderTopicPager(packView, pin);

  const messageBlock = message
    ? `<p class="font-label text-xs uppercase tracking-wider text-secondary">${escapeHtml(message)}</p>`
    : '';

  const errorBlock = error
    ? `<div class="pq-lobby-alert pq-auth-alert pq-auth-alert-error" role="alert">${escapeHtml(error)}</div>`
    : '';

  const visiblePackIds = new Set((packView.packs || []).map((pack) => pack.topicPackId));
  const persistedSelected = Array.isArray(packView.selectedIds) ? packView.selectedIds : [];
  const offPageSelected = persistedSelected.filter((id) => visiblePackIds.has(id) === false);
  const hiddenPackInputs = offPageSelected
    .map(
      (id) => `<input type="hidden" name="topicPackIds" value="${escapeHtml(id)}" class="pq-launch-pack-hidden" data-pack-id="${escapeHtml(id)}">`,
    )
    .join('');
  const launchConfigJson = JSON.stringify({ selectedIds: persistedSelected }).replace(/</g, '\\u003c');

  const playerTiles = (room.players || [])
    .map(
      (player) => `<div class="flex items-center gap-2 px-3 py-2 bg-[#0f0f1a] border border-[#302840] rounded-lg">
<span class="material-symbols-outlined text-secondary text-sm">person</span>
<span class="font-label text-xs uppercase font-bold tracking-wider text-white">${escapeHtml(player.handle)}</span>
</div>`,
    )
    .join('');

  const mainHtml = `
<div class="flex flex-col w-full">
<div class="relative mb-10 lg:mb-14">
<div class="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b-2 border-[#302840]">
<div>
<h1 class="font-headline font-extrabold text-4xl sm:text-6xl lg:text-7xl uppercase tracking-tight text-white leading-none drop-shadow-[0_0_20px_rgba(255,45,120,0.2)]">
${escapeHtml(copy.title_line_before)}<br class="hidden sm:inline"><span class="text-transparent bg-clip-text bg-gradient-to-r from-[#ff2d78] via-pink-400 to-[#00ffcc]">${escapeHtml(copy.title_line_accent)}</span></h1>
</div>
<div class="flex flex-wrap items-start md:items-end justify-start md:justify-end gap-6 text-left md:text-right">
<div class="flex flex-col items-start md:items-end">
<p class="font-label text-xs uppercase font-bold tracking-widest text-[#a098b0]">${escapeHtml(copy.game_pin_label)}</p>
<div class="pq-lobby-pin-badge mt-2 inline-flex items-center gap-3 bg-[#141422] px-4 py-2 rounded">
<span class="font-headline text-2xl font-bold tracking-widest text-[#00ffcc] drop-shadow-[0_0_8px_#00ffcc]"># ${pin}</span>
<span class="w-2.5 h-2.5 rounded-full bg-[#00ffcc] animate-ping"></span>
</div>
</div>
<div class="flex flex-col items-start md:items-end">
<p class="font-label text-xs uppercase font-bold tracking-widest text-[#a098b0]">${escapeHtml(copy.players_waiting_label)}</p>
<div class="pq-lobby-pin-badge mt-2 inline-flex items-center gap-3 bg-[#141422] px-4 py-2 rounded">
<span class="material-symbols-outlined text-[#00ffcc] text-xl drop-shadow-[0_0_8px_#00ffcc]">group</span>
<span id="pq-player-count" class="font-headline text-2xl font-bold tracking-widest text-[#00ffcc] drop-shadow-[0_0_8px_#00ffcc]">${playerCount}</span>
</div>
</div>
</div>
</div>
</div>
<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
<div class="lg:col-span-7 flex flex-col gap-8">
<section class="pq-lobby-panel pq-lobby-panel--topics bg-[#141422]/95 backdrop-blur-xl p-6 sm:p-8 border rounded-xl relative overflow-hidden">
<div class="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-secondary pointer-events-none"></div>
<div class="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-primary pointer-events-none"></div>
<div class="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-primary pointer-events-none"></div>
<div class="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-secondary pointer-events-none"></div>
<div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 border-b border-[#302840] gap-3">
<div class="flex items-center gap-3">
<span class="pq-lobby-step-badge w-7 h-7 font-headline font-bold text-sm flex items-center justify-center rounded">1</span>
<h2 class="font-headline font-bold text-xl uppercase tracking-tight text-white">${escapeHtml(copy.select_topics_title)}</h2>
</div>
<span class="pq-mandatory-badge font-label text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded self-start sm:self-auto">${escapeHtml(copy.select_topics_badge)}</span>
</div>
<form method="get" action="/game/${pin}" class="mb-5 flex gap-2">
<div class="relative flex-1 flex items-center">
<span class="material-symbols-outlined absolute left-3.5 text-[#a098b0] text-lg pointer-events-none">search</span>
<input name="search" value="${searchValue}" class="w-full bg-[#0f0f1a] border border-[#302840] focus:border-secondary focus:ring-1 focus:ring-secondary text-white font-label text-xs placeholder:text-[#5a5068] pl-10 pr-4 py-2.5 rounded-lg outline-none tracking-wider uppercase" placeholder="${escapeHtml(copy.search_placeholder)}" type="search" />
</div>
<a href="/game/${pin}" class="px-4 py-2.5 border border-[#302840] text-[#a098b0] hover:text-white hover:border-secondary rounded font-label text-xs uppercase font-bold tracking-wider flex items-center">${escapeHtml(copy.clear_search_label)}</a>
</form>
<form method="post" action="/game/${pin}/launch" id="launch-game-form">
<div id="pq-launch-pack-hidden" class="pq-launch-pack-hidden-host" aria-hidden="true">${hiddenPackInputs}</div>
<div class="grid grid-cols-1 sm:grid-cols-2 gap-4" id="pq-topic-grid">
${packsHtml}
</div>
</form>
${pagerHtml}
</section>
</div>
<div class="lg:col-span-5 flex flex-col gap-8">
<section class="pq-lobby-panel pq-lobby-panel--invite bg-[#141422]/95 backdrop-blur-xl p-6 border rounded-xl relative overflow-hidden flex flex-col pb-6">
<div class="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-primary pointer-events-none"></div>
<div class="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-secondary pointer-events-none"></div>
<div class="flex items-center gap-3 pb-4 mb-6 border-b border-[#302840]">
<span class="pq-lobby-step-badge w-7 h-7 font-headline font-bold text-sm flex items-center justify-center rounded">2</span>
<h2 class="font-headline font-bold text-xl uppercase tracking-tight text-white">${escapeHtml(copy.invite_label)}</h2>
</div>
<div class="flex flex-col sm:flex-row items-stretch border border-[#00ffcc]/50 bg-[#0f0f1a] rounded-lg overflow-hidden shadow-[0_0_12px_rgba(0,255,204,0.15)]">
<div id="pq-invite-url" class="flex-1 px-3.5 py-2.5 font-mono text-xs font-semibold text-[#00ffcc] truncate select-all flex items-center">${escapeHtml(inviteUrl)}</div>
<button type="button" id="pq-copy-invite" data-copy-label="${escapeHtml(copy.copy_button_label)}" data-copied-label="${escapeHtml(copy.copy_done_label)}" class="pq-invite-copy-btn px-4 py-2.5 font-label text-xs uppercase font-extrabold tracking-wider transition-colors border-t sm:border-t-0 sm:border-l border-[#00ffcc]/50">${escapeHtml(copy.copy_button_label)}</button>
</div>
</section>
<div class="flex flex-col gap-3">
<button type="submit" form="launch-game-form" id="launch-game-btn" class="pq-launch-btn launch-btn w-full py-5 px-6 font-headline font-extrabold text-lg sm:text-xl uppercase tracking-wider rounded-xl flex items-center justify-center gap-3 group">
<span class="pq-launch-label">${escapeHtml(copy.launch_button_label)}</span>
<span class="material-symbols-outlined text-2xl transition-transform group-hover:translate-x-1.5">rocket_launch</span>
</button>
${errorBlock}
${messageBlock}
</div>
<section class="bg-[#141422]/70 border border-[#302840] rounded-xl p-6" id="pq-host-player-grid-card">
<h3 class="font-label text-xs uppercase tracking-widest text-[#a098b0] mb-4">${escapeHtml(getStaticCopy().waiting_room.player_grid_label)}</h3>
<div id="pq-player-grid" class="flex flex-wrap gap-2">${playerTiles}</div>
</section>
</div>
</div>
</div>
<script id="pq-room-sync-config" type="application/json" data-ping-template="${escapeHtml(getStaticCopy().waiting_room.ping_template)}">${JSON.stringify({ gamePin: room.roomId }).replace(/</g, '\\u003c')}</script>
<script id="pq-launch-config" type="application/json">${launchConfigJson}</script>
<script src="/scripts/host-topic-cards.js" defer></script>
<script src="/scripts/invite-copy.js" defer></script>
<script src="/scripts/room-lobby-sync.js" defer></script>`;

  return renderPlayerShell({
    title: 'Pub Quiz - Host Lobby',
    signedIn: Boolean(session?.uid),
    hideHeaderMeta: true,
    mainHtml,
  });
}

function renderWaitingRoomPage({ session, room }) {
  const copy = getStaticCopy().waiting_room;
  const shared = getStaticCopy().shared;
  const pin = escapeHtml(room.roomId);
  const body = escapeHtml(copy.body_template.replace('{pin}', room.roomId));
  const pingTemplateAttr = escapeHtml(copy.ping_template);
  const pingText = escapeHtml(formatCopyTemplate(copy.ping_template, { ms: 1 }));
  const players = room.players || [];
  const playersCountSuffix = formatCopyTemplate(shared.players_count_template, { n: '' }).trim();

  const playerGrid = players
    .map(
      (player) => `<div class="flex items-center gap-2 px-3 py-2 bg-[#0f0f1a] border border-[#302840] rounded-lg">
<span class="material-symbols-outlined text-secondary text-sm">person</span>
<span class="font-label text-xs uppercase font-bold tracking-wider text-white">${escapeHtml(player.handle)}</span>
</div>`,
    )
    .join('');

  const mainHtml = `
<div class="w-full max-w-7xl mx-auto relative z-10">
<div class="relative mb-8 lg:mb-10">
<div class="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b-2 border-[#302840]">
<div>
<h1 class="font-headline font-extrabold text-4xl sm:text-6xl lg:text-7xl uppercase tracking-tight text-white leading-none drop-shadow-[0_0_20px_rgba(255,45,120,0.2)]">
${escapeHtml(copy.title_line_before)}<br class="hidden sm:inline"><span class="text-transparent bg-clip-text bg-gradient-to-r from-[#ff2d78] via-pink-400 to-[#00ffcc]">${escapeHtml(copy.title_line_accent)}</span></h1>
</div>
<div class="flex flex-col items-start md:items-end text-left md:text-right">
<p class="font-label text-xs uppercase font-bold tracking-widest text-[#a098b0]">${escapeHtml(copy.game_pin_label)}</p>
<div class="mt-2 inline-flex items-center gap-3 bg-[#141422] px-4 py-2 border-2 border-[#00ffcc]/60 rounded shadow-[0_0_20px_rgba(0,255,204,0.25)]">
<span class="font-headline text-2xl font-bold tracking-widest text-[#00ffcc] drop-shadow-[0_0_8px_#00ffcc]"># ${pin}</span>
<span class="w-2.5 h-2.5 rounded-full bg-[#00ffcc] animate-ping"></span>
</div>
</div>
</div>
</div>
<div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
<div class="lg:col-span-5">
<div class="pq-radar-disk w-full aspect-square max-w-sm mx-auto relative rounded-full border-2 border-[#00ffcc]/40 bg-[#0a0a12] shadow-[0_0_40px_rgba(0,255,204,0.2)] overflow-hidden">
<div class="absolute inset-0 bg-[conic-gradient(from_0deg,transparent_0deg,rgba(0,255,204,0.15)_50deg,transparent_100deg)] animate-spin" style="animation-duration:4s"></div>
<div class="absolute inset-8 rounded-full border border-[#ff2d78]/30"></div>
<div class="absolute inset-16 rounded-full border border-[#302840]"></div>
<div class="absolute left-1/2 top-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 bg-[#00ffcc] rounded-full shadow-[0_0_12px_#00ffcc]"></div>
</div>
<p class="mt-4 text-center font-label text-xs uppercase tracking-widest text-[#a098b0]">${escapeHtml(copy.sync_ping_label)}</p>
<p id="pq-sync-ping" class="text-center font-mono text-sm text-secondary">${pingText}</p>
</div>
<div class="lg:col-span-7 space-y-6">
<div class="w-full bg-[#141422]/90 border-2 border-[#302840] rounded-xl p-8 sm:p-12 relative overflow-hidden">
<h2 class="font-headline font-extrabold text-2xl sm:text-3xl uppercase tracking-tight text-white mb-4 text-center">${escapeHtml(copy.headline)}</h2>
<p class="font-body text-[#a098b0] text-sm sm:text-base leading-relaxed max-w-lg mx-auto text-center">${body}</p>
</div>
<div class="bg-[#141422]/70 border border-[#302840] rounded-xl p-6">
<h3 class="font-label text-xs uppercase tracking-widest text-[#a098b0] mb-4">${escapeHtml(copy.player_grid_label)}</h3>
<div id="pq-player-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-2">${playerGrid}</div>
<p class="mt-4 font-label text-xs uppercase tracking-widest text-secondary text-center"><span id="pq-player-count">${players.length}</span> ${escapeHtml(playersCountSuffix)}</p>
</div>
</div>
</div>
</div>
<script id="pq-room-sync-config" type="application/json" data-ping-template="${pingTemplateAttr}">${JSON.stringify({ gamePin: room.roomId }).replace(/</g, '\\u003c')}</script>
<script src="/scripts/room-lobby-sync.js" defer></script>`;

  return renderPlayerShell({
    title: 'Pub Quiz - Waiting Room',
    signedIn: Boolean(session?.uid),
    hideHeaderMeta: true,
    mainHtml,
  });
}

function renderGameplayOption(option, selectedId) {
  const isSelected = selectedId === option.id;
  const baseClasses = isSelected
    ? 'pq-gameplay-option pq-gameplay-option--locked relative text-left p-5 sm:p-6 bg-[#1a0010] text-white rounded-xl border-2 border-[#ff2d78] neon-glow-pink flex flex-col justify-between transition-all duration-200 cursor-pointer'
    : 'pq-gameplay-option relative text-left p-5 sm:p-6 bg-[#141422] text-[#e8e0f0] rounded-xl border border-[#302840] hover:border-[#00ffcc] hover:shadow-[0_0_15px_rgba(0,255,204,0.25)] flex flex-col justify-between transition-all duration-200 cursor-pointer';
  const badge = isSelected
    ? `<div class="flex items-center gap-1 bg-[#ff2d78] text-[#1a0010] px-3 py-1 rounded font-label text-[11px] font-extrabold uppercase tracking-wider shadow-[0_0_10px_rgba(255,45,120,0.5)]">
<span class="material-symbols-outlined text-sm font-bold">check_circle</span>
${escapeHtml(getStaticCopy().gameplay.option_selected_label)}
</div>`
    : '';
  const letterClasses = isSelected
    ? 'w-10 h-10 rounded-lg bg-[#ff2d78] text-[#1a0010] font-headline font-extrabold text-lg flex items-center justify-center shadow-[0_0_12px_#ff2d78]'
    : 'w-10 h-10 rounded-lg bg-[#1e1e30] text-[#00ffcc] border border-[#302840] font-headline font-bold text-lg flex items-center justify-center';
  return `<button type="button" class="${baseClasses}" data-answer-id="${escapeHtml(option.id)}" ${isSelected ? 'disabled aria-pressed="true"' : 'aria-pressed="false"'}>
<div class="flex items-center justify-between w-full mb-3">
<div class="${letterClasses}">${escapeHtml(option.id)}</div>
${badge}
</div>
<span class="font-headline font-bold text-xl sm:text-2xl block tracking-tight text-white">${escapeHtml(option.text)}</span>
</button>`;
}

function renderGameplayPage({ session, room, state }) {
  const copy = getStaticCopy().gameplay;
  const pin = escapeHtml(room.roomId);
  const questionIndex = state?.questionIndex ?? 0;
  const questionCount = state?.questionCount ?? room.questionCount ?? 0;
  const displayIndex = questionIndex + 1;
  const questionBadge = escapeHtml(
    formatCopyTemplate(copy.question_badge_template, {
      current: String(displayIndex).padStart(2, '0'),
      total: String(questionCount).padStart(2, '0'),
    }),
  );
  const readyLabel = state
    ? escapeHtml(formatCopyTemplate(copy.ready_count_template, {
      ready: String(state.playersReady || 0),
      total: String(state.playersTotal || 0),
    }))
    : '';
  const options = (state?.options || []).map((option) => renderGameplayOption(option, state?.playerAnswer?.selectedAnswerId || null)).join('');
  const questionText = state ? escapeHtml(state.questionText) : '';
  const gameplayErrorsJson = JSON.stringify({
    generic: copy.answer_error_generic,
    already_answered: copy.answer_error_already_answered,
    network: copy.answer_error_network,
  }).replace(/</g, '\\u003c');
  const completedView = room.status === 'COMPLETED'
    ? `<div class="bg-[#141422]/95 border-2 border-primary/60 rounded-xl p-8 text-center">
<h2 class="font-headline font-extrabold text-3xl uppercase text-white mb-4">${escapeHtml(copy.completed_headline)}</h2>
<p class="font-body text-[#a098b0] mb-8">${escapeHtml(copy.completed_body)}</p>
<a href="/dashboard" class="inline-flex items-center gap-2 py-3 px-6 bg-primary text-white font-label uppercase tracking-widest rounded-lg cursor-pointer">${escapeHtml(copy.return_dashboard_label)}</a>
</div>`
    : '';

  const mainHtml = `
<div class="flex flex-col w-full">
<div class="relative mb-8 lg:mb-10">
<div class="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b-2 border-[#302840]">
<div>
<h1 class="font-headline font-extrabold text-4xl sm:text-6xl lg:text-7xl uppercase tracking-tight text-white leading-none drop-shadow-[0_0_20px_rgba(255,45,120,0.2)]">
${escapeHtml(copy.title_line_before)}<br class="hidden sm:inline"><span class="text-transparent bg-clip-text bg-gradient-to-r from-[#ff2d78] via-pink-400 to-[#00ffcc]">${escapeHtml(copy.title_line_accent)}</span></h1>
</div>
<div class="flex flex-col items-start md:items-end text-left md:text-right">
<p class="font-label text-xs uppercase font-bold tracking-widest text-[#a098b0]">${escapeHtml(copy.game_pin_label)}</p>
<div class="mt-2 inline-flex items-center gap-3 bg-[#141422] px-4 py-2 border-2 border-[#00ffcc]/60 rounded shadow-[0_0_20px_rgba(0,255,204,0.25)]">
<span class="font-headline text-2xl font-bold tracking-widest text-[#00ffcc] drop-shadow-[0_0_8px_#00ffcc]"># ${pin}</span>
<span class="w-2.5 h-2.5 rounded-full bg-[#00ffcc] animate-ping"></span>
</div>
</div>
</div>
</div>
${room.status === 'COMPLETED' ? completedView : `
<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
<div class="flex flex-col gap-6 lg:col-span-4">
<div class="bg-[#141422]/90 backdrop-blur-xl border border-[#ff2d78]/40 rounded-xl p-6 sm:p-7 relative overflow-hidden shadow-[0_0_30px_rgba(255,45,120,0.18)]">
<div class="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#00ffcc]"></div>
<div class="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#ff2d78]"></div>
<div class="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#ff2d78]"></div>
<div class="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#00ffcc]"></div>
<div class="flex flex-col gap-2.5 mb-6">
<div class="flex items-start">
<span id="pq-question-badge" class="inline-flex items-center gap-2 self-start bg-[#ff2d78]/15 border border-[#ff2d78]/70 text-[#ff2d78] font-label text-xs tracking-widest font-bold px-3 py-1.5 rounded-lg shadow-[0_0_12px_rgba(255,45,120,0.3)]">
<span class="material-symbols-outlined text-xs leading-none" style="font-variation-settings: &quot;FILL&quot; 1;">hotel_class</span>
${questionBadge}</span>
</div>
</div>
<div class="bg-[#0f0f1a] border border-[#302840] rounded-xl p-6 flex items-center justify-between relative overflow-hidden">
<div class="flex flex-col">
<span class="font-label text-[11px] tracking-widest uppercase text-[#a098b0] flex items-center gap-1.5 mb-1">
<span class="material-symbols-outlined text-sm text-[#00ffcc]">alarm</span>
${escapeHtml(copy.countdown_label)}
</span>
<div class="font-headline font-extrabold text-4xl sm:text-5xl tracking-tight text-white flex items-baseline drop-shadow-[0_0_15px_rgba(0,255,204,0.4)]">
<span id="pq-timer-display">00:30</span>
<span id="pq-timer-suffix" class="text-xl text-[#00ffcc] font-semibold ml-1">s</span>
</div>
</div>
<div class="relative w-24 h-24 shrink-0 flex items-center justify-center">
<svg class="w-24 h-24 transform -rotate-90" viewBox="0 0 80 80" aria-hidden="true">
<circle class="text-[#1e1e30]" cx="40" cy="40" fill="transparent" r="34" stroke="currentColor" stroke-width="5"></circle>
<circle class="text-[#00ffcc] transition-all duration-300 ease-linear" cx="40" cy="40" fill="transparent" id="pq-timer-ring" r="34" stroke="currentColor" stroke-dasharray="213.6" stroke-dashoffset="0" stroke-linecap="round" stroke-width="5"></circle>
</svg>
</div>
</div>
<div class="mt-4 flex items-center justify-between p-3.5 bg-[#1e1e30]/80 border border-[#302840] rounded-xl">
<div class="flex items-center gap-2.5">
<span id="pq-awaiting-dot" class="w-2.5 h-2.5 rounded-full bg-[#ff2d78] shadow-[0_0_8px_#ff2d78] animate-ping"></span>
<span class="font-label text-xs uppercase font-bold tracking-wider text-[#e8e0f0]">${escapeHtml(copy.awaiting_answers_label)}</span>
</div>
<span id="pq-ready-count" class="font-label text-xs text-[#00ffcc] font-semibold">${readyLabel}</span>
</div>
</div>
</div>
<div class="flex flex-col gap-6 lg:col-span-8">
<div class="bg-[#141422]/95 border-2 border-[#00ffcc]/60 rounded-xl p-6 sm:p-8 relative shadow-[0_0_35px_rgba(0,255,204,0.18)]">
<h2 id="pq-question-text" class="font-headline font-bold text-xl sm:text-2xl lg:text-3xl text-white leading-relaxed tracking-tight">${questionText}</h2>
</div>
<div id="pq-gameplay-error" class="pq-gameplay-alert pq-auth-alert pq-auth-alert-error hidden mb-4" role="alert" aria-live="polite"></div>
<div id="pq-answer-grid" class="grid grid-cols-1 md:grid-cols-2 gap-4">${options}</div>
</div>
</div>`}
</div>
<script id="pq-gameplay-config" type="application/json" data-selected-label="${escapeHtml(copy.option_selected_label)}" data-advance-delay-ms="3000" data-gameplay-errors="${escapeHtml(gameplayErrorsJson)}" data-question-badge-template="${escapeHtml(copy.question_badge_template)}" data-ready-count-template="${escapeHtml(copy.ready_count_template)}">${JSON.stringify({
    gamePin: room.roomId,
    questionId: state?.questionId ?? null,
    closesAt: state?.closesAt ?? null,
    openedAt: state?.openedAt ?? null,
    status: room.status,
    isHost: room.hostUserId === session?.uid,
  }).replace(/</g, '\\u003c')}</script>
<script src="/scripts/gameplay-sync.js" defer></script>`;

  return renderPlayerShell({
    title: 'Pub Quiz - Live Gameplay',
    signedIn: Boolean(session?.uid),
    hideHeaderMeta: true,
    mainHtml,
  });
}

function renderJoinUnavailablePage({ session, gamePin = null } = {}) {
  const copy = getStaticCopy().join_unavailable;
  const pinBlock = gamePin && /^\d{6}$/.test(String(gamePin))
    ? `<div class="flex flex-col items-start md:items-end text-left md:text-right">
<p class="font-label text-xs uppercase font-bold tracking-widest text-[#a098b0]">${escapeHtml(copy.game_pin_label)}</p>
<div class="mt-2 inline-flex items-center gap-3 bg-[#141422] px-4 py-2 border-2 border-[#00ffcc]/60 rounded shadow-[0_0_20px_rgba(0,255,204,0.25)]">
<span class="font-headline text-2xl font-bold tracking-widest text-[#00ffcc] drop-shadow-[0_0_8px_#00ffcc]"># ${escapeHtml(String(gamePin))}</span>
<span class="w-2.5 h-2.5 rounded-full bg-[#a098b0]"></span>
</div>
</div>`
    : '';
  const mainHtml = `
<div class="flex flex-col w-full">
<div class="relative mb-8 lg:mb-10">
<div class="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b-2 border-[#302840]">
<div>
<h1 class="font-headline font-extrabold text-4xl sm:text-6xl lg:text-7xl uppercase tracking-tight text-white leading-none drop-shadow-[0_0_20px_rgba(255,45,120,0.2)]">
${escapeHtml(copy.title_line_before)}<br class="hidden sm:inline"><span class="text-transparent bg-clip-text bg-gradient-to-r from-[#ff2d78] via-pink-400 to-[#00ffcc]">${escapeHtml(copy.title_line_accent)}</span></h1>
</div>
${pinBlock}
</div>
</div>
<div class="bg-[#141422]/95 border-2 border-primary/60 rounded-xl p-8 sm:p-12 text-center max-w-3xl mx-auto">
<h2 class="font-headline font-extrabold text-3xl uppercase text-white mb-4">${escapeHtml(copy.headline)}</h2>
<p class="font-body text-[#a098b0] mb-8">${escapeHtml(copy.body)}</p>
<a href="/dashboard" class="inline-flex items-center gap-2 py-3 px-6 bg-primary text-white font-label uppercase tracking-widest rounded-lg cursor-pointer">${escapeHtml(copy.return_dashboard_label)}</a>
</div>
</div>`;
  return renderPlayerShell({
    title: 'Pub Quiz - Join Unavailable',
    signedIn: Boolean(session?.uid),
    hideHeaderMeta: true,
    mainHtml,
  });
}

module.exports = {
  renderDashboardPage,
  renderGatewayPage,
  renderGameplayPage,
  renderGameStartPage,
  renderHandlePage,
  renderHostLobbyPage,
  renderJoinUnavailablePage,
  renderStaticContentPage,
  renderWaitingRoomPage,
};