(function () {
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

  function safeJsonParse(value) {
    try {
      return JSON.parse(value);
    } catch (_error) {
      return null;
    }
  }

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

  function getOrCreateAnonExternalId(shopDomain) {
    var key = 'push_eagle_external_id_' + shopDomain;
    var existing = window.localStorage.getItem(key);
    if (existing) {
      return existing;
    }

    var random = 'anon:' + String(Date.now()) + '_' + Math.random().toString(36).slice(2, 14);
    window.localStorage.setItem(key, random);
    return random;
  }

  async function bootstrap(config) {
    var bootstrapUrl = config.proxyBootstrapPath || '/apps/push-eagle/bootstrap';

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
      tokenEndpoint: config.appUrl.replace(/\/$/, '') + '/api/storefront/token',
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

  async function registerToken(runtimeConfig, boot) {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      return { ok: false, reason: 'unsupported' };
    }

    var permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, reason: 'permission-denied' };
    }

    var messaging = await initFirebaseMessaging(boot.firebase || fallbackFirebaseConfig);

    var swPath = runtimeConfig.proxyServiceWorkerPath || '/apps/push-eagle/sw.js';
    var registration = await navigator.serviceWorker.register(swPath, { scope: '/' });

    var token = await messaging.getToken({
      vapidKey: (boot.firebase && boot.firebase.vapidKey) || fallbackFirebaseConfig.vapidKey,
      serviceWorkerRegistration: registration
    });

    if (!token) {
      return { ok: false, reason: 'token-empty' };
    }

    var tokenResponse = await fetch(boot.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        shopDomain: boot.shopDomain,
        externalId: boot.externalId,
        token: token,
        browser: navigator.userAgent,
        platform: navigator.platform,
        locale: navigator.language
      })
    });

    if (!tokenResponse.ok) {
      return { ok: false, reason: 'token-save-failed' };
    }

    return { ok: true };
  }

  function isIosSafari() {
    var ua = navigator.userAgent || '';
    var isIos = /iPad|iPhone|iPod/.test(ua);
    var isWebkit = /WebKit/.test(ua);
    var isCriOS = /CriOS/.test(ua);
    return isIos && isWebkit && !isCriOS;
  }

  function isStandaloneIos() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function closePrompt(root) {
    root.style.display = 'none';
  }

  function showStatus(root, message, kind) {
    var status = root.querySelector('[data-push-eagle-status]');
    if (!status) {
      return;
    }

    status.textContent = message;
    status.setAttribute('data-kind', kind || 'info');
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
      proxyBootstrapPath: root.dataset.proxyBootstrapPath || '/apps/push-eagle/bootstrap',
      proxyServiceWorkerPath: root.dataset.proxyServiceWorkerPath || '/apps/push-eagle/sw.js',
      autoShow: root.dataset.autoShow === 'true',
      delayMs: Number(root.dataset.delayMs || '0')
    };

    if (!config.enabled) {
      closePrompt(root);
      return;
    }

    if (!config.shopDomain) {
      showStatus(root, 'Push Eagle not configured: missing shop domain.', 'error');
      return;
    }

    if (config.delayMs > 0) {
      await delay(config.delayMs);
    }

    var boot = await bootstrap(config);

    var primaryButton = root.querySelector('[data-push-eagle-action]');
    var secondaryButton = root.querySelector('[data-push-eagle-dismiss]');

    if (secondaryButton) {
      secondaryButton.addEventListener('click', function () {
        closePrompt(root);
      });
    }

    if (config.mode === 'ios') {
      if (!isIosSafari()) {
        closePrompt(root);
        return;
      }

      if (!isStandaloneIos()) {
        showStatus(root, 'Add this store to Home Screen, then open it from there to enable iOS push.', 'info');
      }
    }

    if (config.mode === 'browser' && config.autoShow) {
      var browserResult = await registerToken(config, boot);
      if (browserResult.ok) {
        showStatus(root, 'Notifications enabled.', 'success');
        closePrompt(root);
      } else {
        showStatus(root, 'Could not enable notifications yet (' + browserResult.reason + ').', 'error');
      }
      return;
    }

    if (primaryButton) {
      primaryButton.addEventListener('click', async function () {
        primaryButton.disabled = true;
        primaryButton.setAttribute('aria-busy', 'true');

        var result = await registerToken(config, boot);
        if (result.ok) {
          showStatus(root, 'Notifications enabled.', 'success');
          closePrompt(root);
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
