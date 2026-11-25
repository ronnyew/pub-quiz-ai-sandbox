(function () {
  function readJson(id) {
    const node = document.getElementById(id);
    if (!node) return null;
    try {
      return JSON.parse(node.textContent);
    } catch {
      return null;
    }
  }

  const config = readJson('pq-firebase-config');
  const copy = readJson('pq-auth-copy') || {};
  const providers = new Set(readJson('pq-auth-providers') || []);

  if (!config || typeof firebase === 'undefined') {
    return;
  }

  firebase.initializeApp(config);
  const auth = firebase.auth();

  const STORAGE_EMAIL = 'pq.emailForSignIn';
  let phoneConfirmation = null;
  let recaptchaVerifier = null;

  function clearAlerts() {
    setError('');
    setSuccess('');
  }

  function setError(message) {
    const errorEl = document.getElementById('pq-auth-error');
    const successEl = document.getElementById('pq-auth-success');
    if (!errorEl) return;
    if (!message) {
      errorEl.classList.add('hidden');
      errorEl.textContent = '';
      return;
    }
    if (successEl) {
      successEl.classList.add('hidden');
      successEl.textContent = '';
    }
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }

  function setSuccess(message) {
    const errorEl = document.getElementById('pq-auth-error');
    const successEl = document.getElementById('pq-auth-success');
    if (!successEl) return;
    if (!message) {
      successEl.classList.add('hidden');
      successEl.textContent = '';
      return;
    }
    if (errorEl) {
      errorEl.classList.add('hidden');
      errorEl.textContent = '';
    }
    successEl.textContent = message;
    successEl.classList.remove('hidden');
  }

  async function exchangeSession(user) {
    const idToken = await user.getIdToken();
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) {
      let message = copy.auth_error_generic || 'Authentication failed';
      try {
        const payload = await res.json();
        if (payload?.error) message = payload.error;
      } catch {
        // keep generic message
      }
      throw new Error(message);
    }
    const payload = await res.json();
    window.location.href = payload.redirectTo || payload.next || '/onboarding/handle';
  }

  function switchAuthTab(mode) {
    clearAlerts();
    const panels = document.querySelectorAll('[data-auth-panel]');
    for (const panel of panels) {
      panel.classList.toggle('hidden', panel.getAttribute('data-auth-panel') !== mode);
    }
    const tabs = document.querySelectorAll('[data-auth-tab]');
    for (const tab of tabs) {
      const isActive = tab.getAttribute('data-auth-tab') === mode;
      tab.classList.toggle('pq-auth-tab-active', isActive);
    }
    if (mode === 'phone') {
      ensureRecaptcha();
    } else {
      resetPhoneSmsStep();
    }
  }

  function ensureRecaptcha() {
    if (recaptchaVerifier || !providers.has('phone')) return;
    const container = document.getElementById('pq-recaptcha');
    if (!container) return;
    try {
      recaptchaVerifier = new firebase.auth.RecaptchaVerifier(container, {
        size: 'invisible',
        callback: () => {},
        'expired-callback': () => {},
      });
    } catch {
      recaptchaVerifier = new firebase.auth.RecaptchaVerifier(container, { size: 'normal' });
    }
    const observer = new MutationObserver(() => {
      const hasChallenge = container.querySelector('iframe, div[style]');
      if (hasChallenge) {
        container.classList.add('pq-recaptcha-challenge-visible');
      }
    });
    observer.observe(container, { childList: true, subtree: true });
  }

  function showSmsVerifyStep() {
    const step = document.getElementById('pq-sms-verify-step');
    const sendBtn = document.getElementById('pq-send-sms');
    if (step) step.classList.remove('hidden');
    if (sendBtn) {
      sendBtn.classList.remove('pq-auth-cta-primary');
      sendBtn.classList.add('pq-auth-cta-secondary');
    }
    const codeInput = document.getElementById('pq-sms-code');
    if (codeInput) {
      codeInput.value = '';
      codeInput.focus();
    }
  }

  function resetPhoneSmsStep() {
    phoneConfirmation = null;
    const step = document.getElementById('pq-sms-verify-step');
    const sendBtn = document.getElementById('pq-send-sms');
    const codeInput = document.getElementById('pq-sms-code');
    const recaptcha = document.getElementById('pq-recaptcha');
    if (step) step.classList.add('hidden');
    if (codeInput) codeInput.value = '';
    if (sendBtn) {
      sendBtn.classList.add('pq-auth-cta-primary');
      sendBtn.classList.remove('pq-auth-cta-secondary');
    }
    if (recaptcha) recaptcha.classList.remove('pq-recaptcha-challenge-visible');
    if (recaptchaVerifier) {
      try {
        recaptchaVerifier.clear();
      } catch {
        // ignore
      }
      recaptchaVerifier = null;
    }
  }

  function showEmailConfirmPanel() {
    const wrap = document.getElementById('pq-email-confirm-wrap');
    if (wrap) wrap.classList.remove('hidden');
    switchAuthTab('email');
  }

  async function completeAuthFlow(promise) {
    clearAlerts();
    try {
      const credential = await promise;
      await exchangeSession(credential.user);
    } catch (err) {
      setError(err.message || copy.auth_error_generic || 'Authentication failed');
    }
  }

  const defaultTabEl = document.getElementById('pq-auth-default-tab');
  const defaultTab = defaultTabEl?.getAttribute('data-default-tab') || 'signin';
  switchAuthTab(defaultTab);

  for (const tab of document.querySelectorAll('[data-auth-tab]')) {
    tab.addEventListener('click', () => {
      switchAuthTab(tab.getAttribute('data-auth-tab'));
    });
  }

  document.getElementById('pq-google-sign-in')?.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    completeAuthFlow(auth.signInWithPopup(provider));
  });

  document.getElementById('pq-phone-number')?.addEventListener('input', () => {
    if (phoneConfirmation || !document.getElementById('pq-sms-verify-step')?.classList.contains('hidden')) {
      resetPhoneSmsStep();
      clearAlerts();
    }
  });

  document.getElementById('pq-phone-change')?.addEventListener('click', () => {
    resetPhoneSmsStep();
    clearAlerts();
    document.getElementById('pq-phone-number')?.focus();
  });

  document.getElementById('pq-send-sms')?.addEventListener('click', async () => {
    const phoneInput = document.getElementById('pq-phone-number');
    const phone = phoneInput?.value?.trim();
    if (!phone) return;
    ensureRecaptcha();
    clearAlerts();
    try {
      phoneConfirmation = await auth.signInWithPhoneNumber(phone, recaptchaVerifier);
      setSuccess(copy.sms_sent_message || 'SMS code sent.');
      showSmsVerifyStep();
    } catch (err) {
      setError(err.message || copy.auth_error_generic);
    }
  });

  document.getElementById('pq-verify-sms')?.addEventListener('click', async () => {
    const code = document.getElementById('pq-sms-code')?.value?.trim();
    if (!code || !phoneConfirmation) return;
    await completeAuthFlow(phoneConfirmation.confirm(code));
  });

  document.getElementById('pq-email-link')?.addEventListener('click', async () => {
    const email = document.getElementById('pq-email')?.value?.trim();
    if (!email) return;
    clearAlerts();
    try {
      const actionCodeSettings = {
        url: `${window.location.origin}/`,
        handleCodeInApp: true,
      };
      await auth.sendSignInLinkToEmail(email, actionCodeSettings);
      window.localStorage.setItem(STORAGE_EMAIL, email);
      setSuccess(copy.email_link_sent_message || 'Check your inbox for your sign-in link.');
    } catch (err) {
      setError(err.message || copy.auth_error_generic);
    }
  });

  document.getElementById('pq-email-link-complete')?.addEventListener('click', async () => {
    const stored = window.localStorage.getItem(STORAGE_EMAIL);
    const confirmInput = document.getElementById('pq-email-confirm');
    const email = (stored || confirmInput?.value || '').trim();
    if (!email) {
      setError(copy.email_link_missing_storage_message || copy.auth_error_generic);
      return;
    }
    if (!auth.isSignInWithEmailLink(window.location.href)) {
      setError(copy.auth_error_generic || 'Authentication failed');
      return;
    }
    clearAlerts();
    try {
      const credential = await auth.signInWithEmailLink(email, window.location.href);
      window.localStorage.removeItem(STORAGE_EMAIL);
      await exchangeSession(credential.user);
    } catch (err) {
      setError(err.message || copy.auth_error_generic);
    }
  });

  async function handleEmailLinkCallback() {
    if (!providers.has('emailLink')) return;
    if (!auth.isSignInWithEmailLink(window.location.href)) return;
    const email = window.localStorage.getItem(STORAGE_EMAIL);
    if (!email) {
      setError(copy.email_link_missing_storage_message || copy.auth_error_generic);
      showEmailConfirmPanel();
      return;
    }
    clearAlerts();
    try {
      const credential = await auth.signInWithEmailLink(email, window.location.href);
      window.localStorage.removeItem(STORAGE_EMAIL);
      await exchangeSession(credential.user);
    } catch (err) {
      setError(err.message || copy.auth_error_generic);
      showEmailConfirmPanel();
    }
  }

  handleEmailLinkCallback();
})();