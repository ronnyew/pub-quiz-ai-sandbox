const {
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
  const privacyHref = escapeHtml(copy.phone_recaptcha_privacy_href || 'https://policies.google.com/privacy');
  const termsHref = escapeHtml(copy.phone_recaptcha_terms_href || 'https://policies.google.com/terms');
  return `<p class="text-xs text-slate-400 font-body leading-relaxed pt-1">
${escapeHtml(copy.phone_recaptcha_notice_prefix || 'This site is protected by reCAPTCHA and the Google')}
<a class="underline hover:text-[#00ffcc] transition-colors" href="${privacyHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.phone_recaptcha_privacy_label || 'Privacy Policy')}</a>
${escapeHtml(copy.phone_recaptcha_notice_middle || 'and')}
<a class="underline hover:text-[#00ffcc] transition-colors" href="${termsHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy.phone_recaptcha_terms_label || 'Terms of Service')}</a>
${escapeHtml(copy.phone_recaptcha_notice_suffix || 'apply.')}
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

function renderDashboardPage(session) {
  const copy = getStaticCopy().dashboard;
  const handle = session?.handle ? escapeHtml(session.handle) : '—';

  const mainHtml = `
<div class="max-w-3xl mx-auto space-y-8 pt-6">
<h1 class="font-headline font-extrabold text-4xl text-white uppercase tracking-tight">${escapeHtml(copy.title)}</h1>
<div class="bg-[#141422]/95 border-2 border-[#00ffcc]/40 rounded-xl p-8 space-y-4">
<p class="font-body text-[#a098b0]">${escapeHtml(copy.signed_in_as)} <span class="text-white font-semibold">${handle}</span></p>
<p class="font-label text-xs uppercase tracking-widest text-secondary">${escapeHtml(copy.handle_label)}: ${handle}</p>
<p class="font-body text-sm text-[#e8e0f0]">${escapeHtml(copy.lobby_placeholder)}</p>
<form method="post" action="/api/auth/signout">
<button type="submit" class="py-3 px-6 border border-[#302840] hover:border-primary text-white font-label text-xs uppercase tracking-widest rounded-lg transition-colors">${escapeHtml(copy.sign_out_label)}</button>
</form>
</div>
</div>`;

  return renderPlayerShell({
    title: 'Pub Quiz - Dashboard',
    signedIn: true,
    mainHtml,
  });
}

module.exports = {
  renderDashboardPage,
  renderGatewayPage,
  renderHandlePage,
  renderStaticContentPage,
};