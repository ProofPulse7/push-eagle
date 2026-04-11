(function () {
  var DEFAULT_PROXY_BOOTSTRAP_PATH = '/apps/push-eagle/bootstrap';
  var DEFAULT_PROXY_SERVICE_WORKER_PATH = '/apps/push-eagle/sw.js';
  var DEFAULT_PROXY_TOKEN_PATH = '/apps/push-eagle/token';
  var roots = document.querySelectorAll('[data-push-eagle-root]');
  if (!roots || roots.length === 0) {
    return;
  }

  var fallbackFirebaseConfig = {
    apiKey: 'AIzaSyCdvIUZWdBYVySpYjoh1uW7ceEq-JRyRYs',
    authDomain: 'push-eagle7.firebaseapp.com',
    projectId: 'push-eagle7',
    storageBucket: 'push-eagle7.firebasestorage.app',
    messagingSenderId: '398105125549',
    appId: '1:398105125549:web:18005a5cbb324f329fdc24',
    measurementId: 'G-JSNXN0BFCP',
    vapidKey: 'BBYMZqB-pyUMdSTJVC6qC_0p4KzX7cVqzWB9g4dkBcw5poVMOtqnKqV0Fsuh_KywnVtEHQILWswYeR0gc7kWfWs'
  };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        resolve();
        return;
      }

      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        reject(new Error('Failed loading ' + src));
      };
      document.head.appendChild(script);
    });
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function safeLocalStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function safeLocalStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (_error) {
      // ignore storage failures
    }
  }

  function safeLocalStorageRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (_error) {
      // ignore storage failures
    }
  }

  function getStorageKey(shopDomain, suffix) {
    return 'push_eagle_' + suffix + '_' + shopDomain;
  }

  function getOrCreateAnonExternalId(shopDomain) {
    var key = getStorageKey(shopDomain, 'external_id');
    var existing = safeLocalStorageGet(key);
    if (existing) {
      return existing;
    }

    var random = 'anon:' + String(Date.now()) + '_' + Math.random().toString(36).slice(2, 14);
    safeLocalStorageSet(key, random);
    return random;
  }

  function detectBrowser() {
    var ua = navigator.userAgent || '';
    if (/Edg\//.test(ua)) return 'edge';
    if (/OPR\//.test(ua) || /Opera/.test(ua)) return 'opera';
    if (/SamsungBrowser\//.test(ua)) return 'samsung';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/CriOS\//.test(ua) || /Chrome\//.test(ua)) return 'chrome';
    if (/Safari\//.test(ua) && !/Chrome|CriOS|Edg\//.test(ua)) return 'safari';
    return 'unknown';
  }

  function detectPlatform() {
    var ua = navigator.userAgent || '';
    if (/Android/.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
    return 'desktop';
  }

  function getBrowserSupport() {
    if (typeof window === 'undefined') {
      return { supported: false, reason: 'unsupported' };
    }

    if (!window.isSecureContext) {
      return { supported: false, reason: 'https-required' };
    }

    if (detectPlatform() === 'ios' && !isStandaloneIos()) {
      return { supported: false, reason: 'ios-home-screen' };
    }

    if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) {
      return { supported: false, reason: 'unsupported' };
    }

    return { supported: true, reason: null };
  }

  function isPromptDismissed(shopDomain) {
    var dismissedUntil = Number(safeLocalStorageGet(getStorageKey(shopDomain, 'dismissed_until')) || '0');
    return dismissedUntil > Date.now();
  }

  function dismissPrompt(shopDomain, remindAfterDays) {
    var days = Number(remindAfterDays || 7);
    var safeDays = isNaN(days) ? 7 : Math.max(1, days);
    safeLocalStorageSet(getStorageKey(shopDomain, 'dismissed_until'), String(Date.now() + safeDays * 24 * 60 * 60 * 1000));
  }

  function clearPromptDismissal(shopDomain) {
    safeLocalStorageRemove(getStorageKey(shopDomain, 'dismissed_until'));
  }

  function markSubscribed(shopDomain, token) {
    safeLocalStorageSet(getStorageKey(shopDomain, 'subscribed'), 'true');
    if (token) {
      safeLocalStorageSet(getStorageKey(shopDomain, 'last_token'), token);
    }
    clearPromptDismissal(shopDomain);
  }

  function isMarkedSubscribed(shopDomain) {
    return safeLocalStorageGet(getStorageKey(shopDomain, 'subscribed')) === 'true';
  }

  async function bootstrap(config) {
    var bootstrapUrl = config.proxyBootstrapPath || DEFAULT_PROXY_BOOTSTRAP_PATH;

    try {
      var response = await fetch(bootstrapUrl, { credentials: 'include' });
      var data = await response.json();
      if (response.ok && data && data.ok) {
        return data;
      }
    } catch (_error) {
      // fallback below
    }

    return {
      ok: true,
      shopDomain: config.shopDomain,
      externalId: getOrCreateAnonExternalId(config.shopDomain),
      tokenEndpoint: config.proxyTokenPath || DEFAULT_PROXY_TOKEN_PATH,
      firebase: fallbackFirebaseConfig
    };
  }

  async function initFirebaseMessaging(firebase) {
    await loadScript('https://www.gstatic.com/firebasejs/9.2.0/firebase-app-compat.js');
    await loadScript('https://www.gstatic.com/firebasejs/9.2.0/firebase-messaging-compat.js');

    if (!window.firebase || !window.firebase.messaging) {
      throw new Error('Firebase SDK failed to load on storefront.');
    }

    try {
      window.firebase.app();
    } catch (_error) {
      window.firebase.initializeApp({
        apiKey: firebase.apiKey,
        authDomain: firebase.authDomain,
        projectId: firebase.projectId,
        storageBucket: firebase.storageBucket,
        messagingSenderId: firebase.messagingSenderId,
        appId: firebase.appId,
        measurementId: firebase.measurementId
      });
    }

    return window.firebase.messaging();
  }

  async function registerToken(runtimeConfig, boot, options) {
    var support = getBrowserSupport();
    if (!support.supported) {
      return { ok: false, reason: support.reason || 'unsupported' };
    }

    var settings = options || {};
    var permission = Notification.permission;
    if (permission === 'denied') {
      return { ok: false, reason: 'permission-denied' };
    }

    if (permission !== 'granted') {
      if (settings.silent) {
        return { ok: false, reason: 'permission-default' };
      }
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      return { ok: false, reason: 'permission-denied' };
    }

    try {
      var messaging = await initFirebaseMessaging(boot.firebase || fallbackFirebaseConfig);

      var swPath = runtimeConfig.proxyServiceWorkerPath || DEFAULT_PROXY_SERVICE_WORKER_PATH;
      var registration = await navigator.serviceWorker.register(swPath, { scope: '/' });

      var token = await messaging.getToken({
        vapidKey: (boot.firebase && boot.firebase.vapidKey) || fallbackFirebaseConfig.vapidKey,
        serviceWorkerRegistration: registration
      });

      if (!token) {
        return { ok: false, reason: 'token-empty' };
      }

      var tokenResponse = await fetch(boot.tokenEndpoint || runtimeConfig.proxyTokenPath || DEFAULT_PROXY_TOKEN_PATH, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shopDomain: boot.shopDomain,
          externalId: boot.externalId,
          token: token,
          browser: detectBrowser(),
          platform: detectPlatform(),
          locale: navigator.language
        })
      });

      if (!tokenResponse.ok) {
        return { ok: false, reason: 'token-save-failed' };
      }

      markSubscribed(boot.shopDomain, token);
      return { ok: true, token: token };
    } catch (error) {
      var message = error && error.message ? String(error.message) : '';
      if (/unsupported-browser|not supported|secure context/i.test(message)) {
        return { ok: false, reason: 'unsupported' };
      }

      return { ok: false, reason: 'registration-failed', message: message };
    }
  }

  function isIosSafari() {
    var ua = navigator.userAgent || '';
    var isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isWebkit = /WebKit/.test(ua);
    var isCriOS = /CriOS/.test(ua);
    return isIos && isWebkit && !isCriOS;
  }

  function isStandaloneIos() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function closePrompt(root) {
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
  }

  function openPrompt(root) {
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
  }

  function showStatus(root, message, kind) {
    var status = root.querySelector('[data-push-eagle-status]');
    if (!status) {
      return;
    }

    status.textContent = message;
    status.setAttribute('data-kind', kind || 'info');
  }

  function bindManualTrigger(root, config, openHandler) {
    var selector = config.manualSelector || '[data-push-eagle-open]';
    if (!selector) {
      return false;
    }

    var triggers;
    try {
      triggers = document.querySelectorAll(selector);
    } catch (_error) {
      showStatus(root, 'Manual trigger selector is invalid.', 'error');
      return false;
    }

    if (!triggers || triggers.length === 0) {
      return false;
    }

    for (var index = 0; index < triggers.length; index += 1) {
      var trigger = triggers[index];
      if (trigger.dataset.pushEagleBound === '1') {
        continue;
      }

      trigger.dataset.pushEagleBound = '1';
      trigger.addEventListener('click', function (event) {
        event.preventDefault();
        openHandler();
      });
    }

    return true;
  }

  function explainUnsupported(root, reason) {
    if (reason === 'permission-denied') {
      showStatus(root, 'Permission denied. You can enable notifications from browser settings.', 'error');
      return;
    }

    if (reason === 'ios-home-screen') {
      showStatus(root, 'On iPhone and iPad, open this store from Home Screen to enable notifications.', 'info');
      return;
    }

    if (reason === 'https-required') {
      showStatus(root, 'Notifications require HTTPS.', 'error');
      return;
    }

    showStatus(root, 'This browser does not support web push notifications for this store.', 'info');
  }

  async function runPrompt(root) {
    if (root.dataset.initialized === '1') {
      return;
    }

    root.dataset.initialized = '1';

    var config = {
      enabled: root.dataset.enabled === 'true',
      mode: root.dataset.mode || 'custom',
      appUrl: root.dataset.appUrl || '',
      shopDomain: root.dataset.shopDomain || '',
      proxyBootstrapPath: root.dataset.proxyBootstrapPath || DEFAULT_PROXY_BOOTSTRAP_PATH,
      proxyServiceWorkerPath: root.dataset.proxyServiceWorkerPath || DEFAULT_PROXY_SERVICE_WORKER_PATH,
      proxyTokenPath: root.dataset.proxyTokenPath || DEFAULT_PROXY_TOKEN_PATH,
      displayTrigger: root.dataset.displayTrigger || 'auto',
      manualSelector: root.dataset.manualSelector || '[data-push-eagle-open]',
      remindAfterDays: Number(root.dataset.remindAfterDays || '7'),
      delayMs: Number(root.dataset.delayMs || '0')
    };

    var effectiveMode = config.mode;
    if (isIosSafari() && config.mode !== 'browser') {
      effectiveMode = 'ios';
    }

    if (!config.enabled) {
      closePrompt(root);
      return;
    }

    if (!config.shopDomain) {
      showStatus(root, 'Push Eagle not configured: missing shop domain.', 'error');
      openPrompt(root);
      return;
    }

    var boot = await bootstrap(config);
    var support = getBrowserSupport();

    var primaryButton = root.querySelector('[data-push-eagle-action]');
    var secondaryButton = root.querySelector('[data-push-eagle-dismiss]');

    if (secondaryButton) {
      secondaryButton.addEventListener('click', function () {
        dismissPrompt(config.shopDomain, config.remindAfterDays);
        closePrompt(root);
      });
    }

    if (Notification.permission === 'granted' || isMarkedSubscribed(config.shopDomain)) {
      var syncResult = await registerToken(config, boot, { silent: true });
      if (syncResult.ok) {
        closePrompt(root);
        return;
      }
    }

    if (Notification.permission === 'denied') {
      explainUnsupported(root, 'permission-denied');
      openPrompt(root);
      return;
    }

    if (!support.supported) {
      explainUnsupported(root, support.reason);
      if (config.displayTrigger === 'manual') {
        bindManualTrigger(root, config, function () {
          openPrompt(root);
        });
        return;
      }

      if (config.delayMs > 0) {
        await delay(config.delayMs);
      }

      openPrompt(root);
      return;
    }

    if (effectiveMode === 'ios' && !isStandaloneIos()) {
      explainUnsupported(root, 'ios-home-screen');
    }

    var showPrompt = function () {
      openPrompt(root);
      if (effectiveMode === 'ios' && !isStandaloneIos()) {
        explainUnsupported(root, 'ios-home-screen');
      }
    };

    if (config.displayTrigger === 'manual') {
      var bound = bindManualTrigger(root, config, function () {
        showPrompt();
      });

      if (!bound) {
        showStatus(root, 'No manual trigger element found. Falling back to automatic display.', 'info');
      } else {
        closePrompt(root);
        return;
      }
    }

    if (isPromptDismissed(config.shopDomain)) {
      closePrompt(root);
      return;
    }

    if (config.delayMs > 0) {
      await delay(config.delayMs);
    }

    showPrompt();

    if (primaryButton) {
      primaryButton.addEventListener('click', async function () {
        if (effectiveMode === 'ios' && !isStandaloneIos()) {
          showStatus(root, 'iOS requires Home Screen mode first. Tap Share -> Add to Home Screen, then reopen this app.', 'info');
          return;
        }

        primaryButton.disabled = true;
        primaryButton.setAttribute('aria-busy', 'true');

        var result = await registerToken(config, boot, { silent: false });
        if (result.ok) {
          showStatus(root, 'Notifications enabled.', 'success');
          closePrompt(root);
        } else if (result.reason === 'unsupported' || result.reason === 'https-required') {
          explainUnsupported(root, result.reason);
        } else if (result.reason === 'permission-denied') {
          showStatus(root, 'Permission denied. You can enable notifications from browser settings.', 'error');
        } else {
          showStatus(root, 'Setup failed (' + result.reason + '). Please retry.', 'error');
        }

        primaryButton.disabled = false;
        primaryButton.removeAttribute('aria-busy');
      });
    }
  }

  for (var i = 0; i < roots.length; i += 1) {
    runPrompt(roots[i]);
  }
})();
