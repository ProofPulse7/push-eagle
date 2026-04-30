(function () {
  var DEFAULT_PROXY_BOOTSTRAP_PATH = '/apps/push-eagle/bootstrap';
  var DEFAULT_PROXY_SERVICE_WORKER_PATH = '/apps/push-eagle/sw';
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

  var defaultOptInSettings = {
    promptType: 'custom',
    title: 'Never miss a sale 🛍️',
    message: 'Subscribe to get updates on our new products and exclusive promotions.',
    allowText: 'Allow',
    allowBgColor: '#2e5fdc',
    allowTextColor: '#ffffff',
    laterText: 'Later',
    logoUrl: null,
    desktopDelaySeconds: 5,
    mobileDelaySeconds: 10,
    maxDisplaysPerSession: 10,
    hideForDays: 2,
    desktopPosition: 'top-center',
    mobilePosition: 'top',
    placementPreset: 'balanced',
    offsetX: 0,
    offsetY: 0,
    iosWidgetEnabled: true,
    iosWidgetTitle: 'Get notifications on your iPhone or iPad',
    iosWidgetMessage: 'Add this store to your Home Screen. When you open it from there, we will ask for notification permission using your saved opt-in settings.'
  };
  var BROWSER_PROMPT_MAX_DISPLAYS_PER_SESSION = 1;
  var BROWSER_PROMPT_MAX_ATTEMPTS = 3;
  var BROWSER_PROMPT_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
  var IOS_HOME_SCREEN_POLL_MS = 1000;

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

  function getRemainingDelayMs(startedAt, delayMs) {
    var started = Number(startedAt || 0);
    var configuredDelay = Math.max(0, Number(delayMs || 0));

    if (!started || configuredDelay <= 0) {
      return configuredDelay;
    }

    return Math.max(0, configuredDelay - (Date.now() - started));
  }

  function deriveServiceWorkerScope(swPath) {
    try {
      var parsed = new URL(swPath, window.location.origin);
      var path = parsed.pathname || '/';
      var lastSlash = path.lastIndexOf('/');
      if (lastSlash <= 0) {
        return '/';
      }
      return path.slice(0, lastSlash + 1);
    } catch (_error) {
      return '/';
    }
  }

  function normalizeServiceWorkerPath(swPath) {
    var raw = String(swPath || '').trim();
    if (!raw) {
      return DEFAULT_PROXY_SERVICE_WORKER_PATH;
    }
    return raw.replace(/\/sw\.js(\?|$)/i, '/sw$1');
  }

  function isSameOriginEndpoint(endpoint) {
    try {
      return new URL(endpoint, window.location.origin).origin === window.location.origin;
    } catch (_error) {
      return false;
    }
  }

  function getProxyBasePathFromBootstrapPath(bootstrapPath) {
    var normalized = String(bootstrapPath || '').split('?')[0];
    return normalized.replace(/\/bootstrap$/i, '') || '/apps/push-eagle';
  }

  function buildBootstrapPathCandidates(proxyBootstrapPath) {
    var configured = String(proxyBootstrapPath || DEFAULT_PROXY_BOOTSTRAP_PATH);
    var normalized = configured.split('?')[0];
    var candidates = [normalized];

    var match = normalized.match(/^\/(a|apps|tools|community)\/([^/?#]+)\/bootstrap$/i);
    if (!match) {
      return candidates;
    }

    var subpath = match[2];
    var prefixes = ['apps', 'a', 'tools', 'community'];
    for (var i = 0; i < prefixes.length; i += 1) {
      var candidate = '/' + prefixes[i] + '/' + subpath + '/bootstrap';
      if (candidates.indexOf(candidate) === -1) {
        candidates.push(candidate);
      }
    }

    return candidates;
  }

  function waitForActiveServiceWorker(registration, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var timeout = Number(timeoutMs || 10000);

      if (registration && registration.active) {
        resolve(registration);
        return;
      }

      var settled = false;
      var timer = setTimeout(function () {
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error('Service worker activation timed out'));
      }, timeout);

      function finish(ok, error) {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (ok) {
          resolve(registration);
        } else {
          reject(error || new Error('Service worker is not active'));
        }
      }

      var worker = registration && (registration.installing || registration.waiting || registration.active);
      if (!worker) {
        finish(false, new Error('No service worker instance available'));
        return;
      }

      if (worker.state === 'activated') {
        finish(true);
        return;
      }

      worker.addEventListener('statechange', function () {
        if (worker.state === 'activated') {
          finish(true);
        }
      });
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

  function safeSessionStorageGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function safeSessionStorageSet(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
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

  function getOrCreateStableClientId(shopDomain) {
    var key = getStorageKey(shopDomain, 'client_id');
    var existing = safeLocalStorageGet(key);
    if (existing) {
      return existing;
    }

    var random = 'cid:' + String(Date.now()) + '_' + Math.random().toString(36).slice(2, 14);
    safeLocalStorageSet(key, random);
    return random;
  }

  function getShopifyCartToken() {
    try {
      if (window.Shopify && window.Shopify.cart && window.Shopify.cart.token) {
        return String(window.Shopify.cart.token);
      }
      var cookieMatch = document.cookie.match(/(?:^|;)\s*cart=([^;]*)/);
      if (cookieMatch) {
        var decoded = decodeURIComponent(cookieMatch[1] || '');
        return decoded || null;
      }
    } catch (_e) {}
    return null;
  }

  async function fetchCartTokenFromShopifyCartApi() {
    try {
      var response = await fetch('/cart.js', {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        return null;
      }

      var cart = await response.json();
      var token = cart && cart.token ? String(cart.token).trim() : '';
      return token || null;
    } catch (_error) {
      return null;
    }
  }

  async function syncExternalIdToCart(externalId, clientId) {
    if (!externalId && !clientId) {
      return;
    }

    try {
      await fetch('/cart/update.js', {
        method: 'POST',
        keepalive: true,
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          attributes: {
            _push_eagle_external_id: externalId || '',
            _push_eagle_client_id: clientId || ''
          }
        })
      });
    } catch (_error) {
      // best effort only
    }
  }

  async function sendActivityEvent(boot, eventType, metadata) {
    if (!boot || !boot.activityEndpoint || !boot.shopDomain || !boot.externalId) {
      return;
    }

    try {
      var url = window.location.href;
      var productMatch = window.location.pathname.match(/\/products\/([^/?#]+)/i);
      var detectedProductId = null;
      var productIdNode = document.querySelector('[data-product-id], [data-productid], [data-product_id], [data-product]');

      if (productIdNode) {
        detectedProductId = productIdNode.getAttribute('data-product-id')
          || productIdNode.getAttribute('data-productid')
          || productIdNode.getAttribute('data-product_id')
          || productIdNode.getAttribute('data-product');
      }

      if (!detectedProductId && metadata && metadata.productId) {
        detectedProductId = metadata.productId;
      }

      var payload = {
        shopDomain: boot.shopDomain,
        externalId: boot.externalId,
        eventType: eventType,
        pageUrl: url,
        productId: detectedProductId || (productMatch ? productMatch[1] : null),
        cartToken: (metadata && metadata.cartToken) || null,
        metadata: metadata || {}
      };
      payload.metadata.clientId = boot.clientId || null;
      var endpoints = [boot.activityEndpoint];

      if (boot.activityFallbackEndpoint && endpoints.indexOf(boot.activityFallbackEndpoint) === -1) {
        endpoints.push(boot.activityFallbackEndpoint);
      }

      for (var endpointIndex = 0; endpointIndex < endpoints.length; endpointIndex += 1) {
        var endpoint = endpoints[endpointIndex];

        try {
          var response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          if (response.ok) {
            break;
          }
        } catch (_endpointError) {
          if (endpointIndex === endpoints.length - 1) {
            throw _endpointError;
          }
        }
      }
    } catch (_error) {
      // best effort only
    }
  }

  function getProductMetadataFromElement(element) {
    var node = element;

    while (node && node !== document.body) {
      if (node.getAttribute) {
        var productId = node.getAttribute('data-product-id')
          || node.getAttribute('data-productid')
          || node.getAttribute('data-product_id')
          || node.getAttribute('data-product');
        var variantId = node.getAttribute('data-variant-id')
          || node.getAttribute('data-variantid')
          || node.getAttribute('data-variant_id')
          || node.getAttribute('data-variant');
        var cartToken = node.getAttribute('data-cart-token') || node.getAttribute('data-cart');

        if (productId || variantId || cartToken) {
          return {
            productId: productId || null,
            variantId: variantId || null,
            cartToken: cartToken || null,
          };
        }
      }
      node = node.parentElement;
    }

    return {
      productId: null,
      variantId: null,
      cartToken: null,
    };
  }

  function bindCommerceActivityTracking(boot) {
    if (!boot || !boot.activityEndpoint || window.__pushEagleCommerceTrackingBound) {
      return;
    }

    window.__pushEagleCommerceTrackingBound = true;

    var lastAddToCartSignalAt = 0;

    function isCartAddUrl(urlLike) {
      var raw = String(urlLike || '').toLowerCase();
      return raw.indexOf('/cart/add') !== -1;
    }

    function parseCartAddBody(body) {
      var parsed = { variantId: null, quantity: 1 };
      if (!body) {
        return parsed;
      }

      try {
        if (typeof body === 'string') {
          var trimmed = body.trim();
          if (trimmed.indexOf('{') === 0) {
            var json = JSON.parse(trimmed);
            parsed.variantId = json && json.id ? String(json.id) : null;
            parsed.quantity = json && json.quantity ? Number(json.quantity) : 1;
            return parsed;
          }

          var formData = new URLSearchParams(trimmed);
          parsed.variantId = formData.get('id');
          parsed.quantity = Number(formData.get('quantity') || '1');
          return parsed;
        }

        if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
          parsed.variantId = body.get('id');
          parsed.quantity = Number(body.get('quantity') || '1');
          return parsed;
        }

        if (typeof FormData !== 'undefined' && body instanceof FormData) {
          parsed.variantId = body.get('id');
          parsed.quantity = Number(body.get('quantity') || '1');
          return parsed;
        }
      } catch (_parseError) {}

      return parsed;
    }

    function reportAddToCart(details, source) {
      var now = Date.now();
      if (now - lastAddToCartSignalAt < 700) {
        return;
      }
      lastAddToCartSignalAt = now;

      var currentCartToken = getShopifyCartToken();
      var variantId = details && details.variantId ? details.variantId : null;
      var quantity = details && details.quantity ? Number(details.quantity) : 1;
      var productId = details && details.productId ? details.productId : null;

      sendActivityEvent(boot, 'add_to_cart', {
        productId: productId,
        variantId: variantId,
        quantity: Number.isFinite(quantity) ? quantity : 1,
        cartToken: currentCartToken,
        source: source || 'unknown',
      });

      var _bootExId = boot && boot.externalId ? boot.externalId : null;
      var _bootCid = boot && boot.clientId ? boot.clientId : null;
      if (_bootExId || _bootCid) {
        syncExternalIdToCart(_bootExId, _bootCid);
        setTimeout(function () {
          syncExternalIdToCart(_bootExId, _bootCid);
        }, 800);
      }

      setTimeout(function () {
        fetchCartTokenFromShopifyCartApi().then(function (latestCartToken) {
          if (!latestCartToken) {
            return;
          }

          sendActivityEvent(boot, 'add_to_cart', {
            productId: productId,
            variantId: variantId,
            quantity: Number.isFinite(quantity) ? quantity : 1,
            cartToken: latestCartToken,
            source: (source || 'unknown') + '_post_submit_cart_fetch',
          });
        });
      }, 1200);
    }

    document.addEventListener('submit', function (event) {
      var form = event.target;
      if (!form || !form.getAttribute) {
        return;
      }

      var action = String(form.getAttribute('action') || '').toLowerCase();
      if (action.indexOf('/cart/add') === -1) {
        return;
      }

      var details = getProductMetadataFromElement(form);
      var variantInput = form.querySelector('[name="id"]');
      var quantityInput = form.querySelector('[name="quantity"]');
      reportAddToCart({
        productId: details.productId,
        variantId: details.variantId || (variantInput ? variantInput.value : null),
        quantity: quantityInput ? Number(quantityInput.value || '1') : 1,
      }, 'form_submit');
    }, true);

    if (!window.__pushEagleCartAddFetchWrapped && typeof window.fetch === 'function') {
      window.__pushEagleCartAddFetchWrapped = true;
      var originalFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        var requestUrl = '';
        try {
          requestUrl = typeof input === 'string'
            ? input
            : (input && input.url ? String(input.url) : '');
        } catch (_requestUrlError) {
          requestUrl = '';
        }

        var maybeBody = init && Object.prototype.hasOwnProperty.call(init, 'body')
          ? init.body
          : null;
        var parsedBody = parseCartAddBody(maybeBody);

        return originalFetch(input, init).then(function (response) {
          if (response && response.ok && isCartAddUrl(requestUrl)) {
            reportAddToCart({
              productId: null,
              variantId: parsedBody.variantId,
              quantity: parsedBody.quantity,
            }, 'fetch_cart_add');
          }
          return response;
        });
      };
    }

    if (!window.__pushEagleCartAddXhrWrapped && window.XMLHttpRequest) {
      window.__pushEagleCartAddXhrWrapped = true;
      var originalOpen = window.XMLHttpRequest.prototype.open;
      var originalSend = window.XMLHttpRequest.prototype.send;

      window.XMLHttpRequest.prototype.open = function (method, url) {
        this.__pushEagleUrl = String(url || '');
        return originalOpen.apply(this, arguments);
      };

      window.XMLHttpRequest.prototype.send = function (body) {
        var xhr = this;
        var parsedBody = parseCartAddBody(body);

        function onLoad() {
          try {
            if (xhr && xhr.status >= 200 && xhr.status < 300 && isCartAddUrl(xhr.__pushEagleUrl)) {
              reportAddToCart({
                productId: null,
                variantId: parsedBody.variantId,
                quantity: parsedBody.quantity,
              }, 'xhr_cart_add');
            }
          } catch (_xhrTrackError) {}
        }

        try {
          xhr.addEventListener('load', onLoad, { once: true });
        } catch (_listenerError) {
          xhr.addEventListener('load', onLoad);
        }

        return originalSend.apply(this, arguments);
      };
    }

    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !target.closest) {
        return;
      }

      var checkoutTrigger = target.closest('a[href*="/checkout"], button[name="checkout"], input[name="checkout"], [data-checkout-button]');
      if (!checkoutTrigger) {
        return;
      }

      var details = getProductMetadataFromElement(checkoutTrigger);
      sendActivityEvent(boot, 'checkout_start', {
        productId: details.productId,
        variantId: details.variantId,
        cartToken: details.cartToken,
      });
    }, true);
  }

  function normalizeVersion(value) {
    return value ? String(value).replace(/_/g, '.') : null;
  }

  function normalizeBrowserName(value) {
    var raw = String(value || '').toLowerCase();
    if (raw.indexOf('edge') !== -1 || raw.indexOf('edg') !== -1) return 'edge';
    if (raw.indexOf('opera') !== -1 || raw.indexOf('opr') !== -1) return 'opera';
    if (raw.indexOf('samsung') !== -1) return 'samsung';
    if (raw.indexOf('firefox') !== -1 || raw.indexOf('fxios') !== -1) return 'firefox';
    if (raw.indexOf('webview') !== -1 || raw === 'wv') return 'webview';
    if (raw.indexOf('chrome') !== -1 || raw.indexOf('chromium') !== -1 || raw.indexOf('crios') !== -1) return 'chrome';
    if (raw.indexOf('safari') !== -1) return 'safari';
    return 'unknown';
  }

  function normalizeOsName(value) {
    var raw = String(value || '').toLowerCase();
    if (raw.indexOf('ios') !== -1 || raw.indexOf('iphone') !== -1 || raw.indexOf('ipad') !== -1) return 'ios';
    if (raw.indexOf('android') !== -1) return 'android';
    if (raw.indexOf('mac') !== -1) return 'macos';
    if (raw.indexOf('win') !== -1) return 'windows';
    if (raw.indexOf('cros') !== -1 || raw.indexOf('chrome os') !== -1) return 'chromeos';
    if (raw.indexOf('linux') !== -1) return 'linux';
    return 'desktop';
  }

  function detectBrowserFromUserAgent(ua) {
    var match;
    if ((match = ua.match(/SamsungBrowser\/([\d.]+)/i))) return { name: 'samsung', version: match[1], source: 'userAgent' };
    if ((match = ua.match(/EdgA?\/([\d.]+)/i))) return { name: 'edge', version: match[1], source: 'userAgent' };
    if ((match = ua.match(/OPR\/([\d.]+)/i))) return { name: 'opera', version: match[1], source: 'userAgent' };
    if ((match = ua.match(/FxiOS\/([\d.]+)/i))) return { name: 'firefox', version: match[1], source: 'userAgent' };
    if ((match = ua.match(/Firefox\/([\d.]+)/i))) return { name: 'firefox', version: match[1], source: 'userAgent' };
    if (/\bwv\b/i.test(ua) && (match = ua.match(/Chrome\/([\d.]+)/i))) return { name: 'webview', version: match[1], source: 'userAgent' };
    if ((match = ua.match(/CriOS\/([\d.]+)/i))) return { name: 'chrome', version: match[1], source: 'userAgent' };
    if ((match = ua.match(/Chrome\/([\d.]+)/i))) return { name: 'chrome', version: match[1], source: 'userAgent' };
    if ((match = ua.match(/Version\/([\d.]+).+Safari/i))) return { name: 'safari', version: match[1], source: 'userAgent' };
    return { name: 'unknown', version: null, source: 'userAgent' };
  }

  function detectOsFromUserAgent(ua) {
    var match;
    if ((match = ua.match(/Android\s([\d.]+)/i))) return { name: 'android', version: normalizeVersion(match[1]), source: 'userAgent' };
    if ((match = ua.match(/(?:iPhone|CPU(?: iPhone)?|iPad).*OS\s([\d_]+)/i))) return { name: 'ios', version: normalizeVersion(match[1]), source: 'userAgent' };
    if ((match = ua.match(/Windows NT\s([\d.]+)/i))) return { name: 'windows', version: normalizeVersion(match[1]), source: 'userAgent' };
    if ((match = ua.match(/Mac OS X\s([\d_]+)/i))) return { name: 'macos', version: normalizeVersion(match[1]), source: 'userAgent' };
    if ((match = ua.match(/CrOS [^ ]+\s([\d.]+)/i))) return { name: 'chromeos', version: normalizeVersion(match[1]), source: 'userAgent' };
    if (/Linux/i.test(ua)) return { name: 'linux', version: null, source: 'userAgent' };
    return { name: 'desktop', version: null, source: 'userAgent' };
  }

  function detectDeviceType(ua, osName, uaDataMobile) {
    if (uaDataMobile === true) {
      return osName === 'ios' && /iPad/i.test(ua) ? 'tablet' : 'mobile';
    }
    if (/iPad|Tablet/i.test(ua)) return 'tablet';
    if (osName === 'android') return /Mobile/i.test(ua) ? 'mobile' : 'tablet';
    if (osName === 'ios') return /iPad/i.test(ua) ? 'tablet' : 'mobile';
    return 'desktop';
  }

  function detectDeviceModel(ua, uaDataModel) {
    if (uaDataModel) {
      return String(uaDataModel);
    }
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/iPod/i.test(ua)) return 'iPod';
    return null;
  }

  function getUaDataBrandInfo(uaData) {
    if (!uaData) {
      return { name: 'unknown', version: null, source: 'userAgentData' };
    }

    var brands = Array.isArray(uaData.fullVersionList) && uaData.fullVersionList.length > 0
      ? uaData.fullVersionList
      : Array.isArray(uaData.brands)
        ? uaData.brands
        : [];

    var preferred = ['Microsoft Edge', 'Google Chrome', 'Opera', 'Samsung Internet', 'Chromium'];
    for (var preferredIndex = 0; preferredIndex < preferred.length; preferredIndex += 1) {
      for (var brandIndex = 0; brandIndex < brands.length; brandIndex += 1) {
        if (brands[brandIndex] && brands[brandIndex].brand === preferred[preferredIndex]) {
          return {
            name: normalizeBrowserName(brands[brandIndex].brand),
            version: normalizeVersion(brands[brandIndex].version),
            source: 'userAgentData'
          };
        }
      }
    }

    for (var index = 0; index < brands.length; index += 1) {
      var brand = brands[index];
      if (!brand || !brand.brand || /not.?a.?brand/i.test(brand.brand)) {
        continue;
      }
      return {
        name: normalizeBrowserName(brand.brand),
        version: normalizeVersion(brand.version),
        source: 'userAgentData'
      };
    }

    return { name: 'unknown', version: null, source: 'userAgentData' };
  }

  function extractCountryFromLocale(locale) {
    var value = String(locale || '');
    if (!value) {
      return null;
    }

    var normalized = value.replace('_', '-');
    var parts = normalized.split('-');
    for (var i = 1; i < parts.length; i += 1) {
      var part = parts[i];
      if (/^[A-Za-z]{2}$/.test(part)) {
        return part.toUpperCase();
      }
    }

    return null;
  }

  function deriveCityFromTimezone(timezone) {
    var zone = String(timezone || '');
    if (!zone || zone.indexOf('/') === -1) {
      return null;
    }

    var parts = zone.split('/');
    var cityPart = parts[parts.length - 1] || '';
    if (!cityPart) {
      return null;
    }

    return cityPart.replace(/_/g, ' ');
  }

  async function getBrowserGeoHints() {
    var timezone = (Intl.DateTimeFormat && Intl.DateTimeFormat().resolvedOptions().timeZone) || null;
    var localeCandidates = [];
    if (Array.isArray(navigator.languages)) {
      localeCandidates = navigator.languages.slice(0, 5);
    }
    if (navigator.language) {
      localeCandidates.push(navigator.language);
    }

    var country = null;
    for (var localeIndex = 0; localeIndex < localeCandidates.length; localeIndex += 1) {
      country = extractCountryFromLocale(localeCandidates[localeIndex]);
      if (country) {
        break;
      }
    }

    var city = deriveCityFromTimezone(timezone);
    var geolocationPermission = null;

    try {
      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        var status = await navigator.permissions.query({ name: 'geolocation' });
        geolocationPermission = status && status.state ? String(status.state) : null;
      }
    } catch (_error) {
      geolocationPermission = null;
    }

    return {
      country: country,
      city: city,
      geolocationPermission: geolocationPermission,
      timezone: timezone
    };
  }

  function getCurrentStandaloneState() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function getShopifyConsentState(shopify) {
    var privacy = shopify && shopify.customerPrivacy ? shopify.customerPrivacy : null;
    var consent = {
      apiAvailable: !!privacy,
      userCanBeTracked: null,
      analyticsProcessingAllowed: null,
      marketingAllowed: null,
      preferencesProcessingAllowed: null,
      saleOfDataAllowed: null,
      currentVisitorConsent: null
    };

    if (!privacy) {
      return consent;
    }

    try {
      if (typeof privacy.userCanBeTracked === 'function') {
        consent.userCanBeTracked = privacy.userCanBeTracked();
      }
      if (typeof privacy.analyticsProcessingAllowed === 'function') {
        consent.analyticsProcessingAllowed = privacy.analyticsProcessingAllowed();
      }
      if (typeof privacy.marketingAllowed === 'function') {
        consent.marketingAllowed = privacy.marketingAllowed();
      }
      if (typeof privacy.preferencesProcessingAllowed === 'function') {
        consent.preferencesProcessingAllowed = privacy.preferencesProcessingAllowed();
      }
      if (typeof privacy.saleOfDataAllowed === 'function') {
        consent.saleOfDataAllowed = privacy.saleOfDataAllowed();
      }
      if (typeof privacy.currentVisitorConsent === 'function') {
        consent.currentVisitorConsent = privacy.currentVisitorConsent();
      }
    } catch (_error) {
      return consent;
    }

    return consent;
  }

  function getShopifyContext(root, boot) {
    var shopify = window.Shopify || {};
    var consent = getShopifyConsentState(shopify);
    return {
      shopId: root.dataset.shopifyShopId || shopify.shopId || null,
      shopName: root.dataset.shopifyShopName || shopify.shopName || null,
      shopDomain: (boot && boot.shopDomain) || root.dataset.shopDomain || shopify.shop || null,
      locale: root.dataset.shopifyLocale || shopify.locale || null,
      country: root.dataset.shopifyCountry || shopify.country || null,
      analyticsAvailable: !!shopify.analytics,
      customerPrivacy: consent,
      designMode: shopify.designMode === true,
      themeName: shopify.theme && shopify.theme.name ? shopify.theme.name : null,
      themeId: shopify.theme && shopify.theme.id ? String(shopify.theme.id) : null,
      routesRoot: shopify.routes && shopify.routes.root ? shopify.routes.root : null,
      capabilities: boot && boot.shopifyCapabilities ? boot.shopifyCapabilities : null
    };
  }

  async function getUserAgentDataDetails() {
    var uaData = navigator.userAgentData;
    if (!uaData) {
      return null;
    }

    var base = {
      brands: Array.isArray(uaData.brands) ? uaData.brands : [],
      mobile: uaData.mobile === true,
      platform: uaData.platform || null,
      source: 'userAgentData'
    };

    if (typeof uaData.getHighEntropyValues !== 'function') {
      return base;
    }

    try {
      var highEntropy = await uaData.getHighEntropyValues([
        'architecture',
        'bitness',
        'fullVersionList',
        'model',
        'platform',
        'platformVersion'
      ]);
      return Object.assign({}, base, highEntropy || {});
    } catch (_error) {
      return base;
    }
  }

  async function buildClientProfile(root, boot) {
    var ua = navigator.userAgent || '';
    var uaData = await getUserAgentDataDetails();
    var uaBrowser = detectBrowserFromUserAgent(ua);
    var uaOs = detectOsFromUserAgent(ua);
    var hintBrowser = getUaDataBrandInfo(uaData);
    var hintOsName = uaData && uaData.platform ? normalizeOsName(uaData.platform) : null;
    var hintOsVersion = uaData && uaData.platformVersion ? normalizeVersion(uaData.platformVersion) : null;
    var osName = hintOsName || uaOs.name;
    var shopifyContext = getShopifyContext(root, boot);
    var deviceType = detectDeviceType(ua, osName, uaData && uaData.mobile);
    var geoHints = await getBrowserGeoHints();

    if ((navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) && osName === 'macos') {
      osName = 'ios';
      if (deviceType === 'desktop') {
        deviceType = 'tablet';
      }
    }

    var browserName = hintBrowser.name !== 'unknown' ? hintBrowser.name : uaBrowser.name;
    var browserVersion = hintBrowser.version || uaBrowser.version;
    var standalone = getCurrentStandaloneState();

    return {
      browserName: browserName,
      browserVersion: browserVersion,
      browserSource: hintBrowser.name !== 'unknown' ? hintBrowser.source : uaBrowser.source,
      osName: osName,
      osVersion: hintOsVersion || uaOs.version,
      osSource: hintOsName ? 'userAgentData' : uaOs.source,
      deviceType: deviceType,
      deviceModel: detectDeviceModel(ua, uaData && uaData.model),
      isMobile: deviceType === 'mobile' || deviceType === 'tablet',
      isStandalone: standalone,
      isSecureContext: window.isSecureContext === true,
      supportsServiceWorker: 'serviceWorker' in navigator,
      supportsNotifications: 'Notification' in window,
      supportsPushManager: 'PushManager' in window,
      supportsPermissionsApi: 'permissions' in navigator,
      permissionState: 'Notification' in window ? Notification.permission : 'unsupported',
      language: navigator.language || shopifyContext.locale || null,
      languages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 5) : [],
      timezone: geoHints.timezone,
      country: geoHints.country || shopifyContext.country || null,
      city: geoHints.city || null,
      geolocationPermission: geoHints.geolocationPermission,
      maxTouchPoints: Number(navigator.maxTouchPoints || 0),
      hardwareConcurrency: Number(navigator.hardwareConcurrency || 0) || null,
      deviceMemory: typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null,
      userAgent: ua,
      navigatorPlatform: navigator.platform || null,
      vendor: navigator.vendor || null,
      uaData: uaData ? {
        brands: uaData.brands || [],
        mobile: uaData.mobile === true,
        platform: uaData.platform || null,
        platformVersion: uaData.platformVersion || null,
        fullVersionList: uaData.fullVersionList || [],
        model: uaData.model || null,
        architecture: uaData.architecture || null,
        bitness: uaData.bitness || null
      } : null,
      shopifyShopId: shopifyContext.shopId,
      shopifyShopName: shopifyContext.shopName,
      shopifyShopDomain: shopifyContext.shopDomain,
      shopifyLocale: shopifyContext.locale,
      shopifyCountry: shopifyContext.country,
      shopifyAnalyticsAvailable: shopifyContext.analyticsAvailable,
      shopifyCustomerPrivacy: shopifyContext.customerPrivacy,
      shopifyDesignMode: shopifyContext.designMode,
      shopifyThemeName: shopifyContext.themeName,
      shopifyThemeId: shopifyContext.themeId,
      shopifyRoutesRoot: shopifyContext.routesRoot,
      shopifyCapabilities: shopifyContext.capabilities
    };
  }

  function refreshClientProfile(profile) {
    if (!profile) {
      return profile;
    }

    profile.isStandalone = getCurrentStandaloneState();
    profile.permissionState = 'Notification' in window ? Notification.permission : 'unsupported';
    profile.isSecureContext = window.isSecureContext === true;
    profile.supportsServiceWorker = 'serviceWorker' in navigator;
    profile.supportsNotifications = 'Notification' in window;
    profile.supportsPushManager = 'PushManager' in window;
    return profile;
  }

  function serializeClientProfile(profile) {
    if (!profile) {
      return null;
    }

    return {
      browserName: profile.browserName,
      browserVersion: profile.browserVersion,
      browserSource: profile.browserSource,
      osName: profile.osName,
      osVersion: profile.osVersion,
      osSource: profile.osSource,
      deviceType: profile.deviceType,
      deviceModel: profile.deviceModel,
      isMobile: profile.isMobile,
      isStandalone: profile.isStandalone,
      isSecureContext: profile.isSecureContext,
      supportsServiceWorker: profile.supportsServiceWorker,
      supportsNotifications: profile.supportsNotifications,
      supportsPushManager: profile.supportsPushManager,
      supportsPermissionsApi: profile.supportsPermissionsApi,
      permissionState: profile.permissionState,
      language: profile.language,
      languages: profile.languages,
      timezone: profile.timezone,
      country: profile.country,
      city: profile.city,
      geolocationPermission: profile.geolocationPermission,
      maxTouchPoints: profile.maxTouchPoints,
      hardwareConcurrency: profile.hardwareConcurrency,
      deviceMemory: profile.deviceMemory,
      userAgent: profile.userAgent,
      navigatorPlatform: profile.navigatorPlatform,
      vendor: profile.vendor,
      uaData: profile.uaData,
      shopifyShopId: profile.shopifyShopId,
      shopifyShopName: profile.shopifyShopName,
      shopifyShopDomain: profile.shopifyShopDomain,
      clientId: profile.clientId || null,
      shopifyLocale: profile.shopifyLocale,
      shopifyCountry: profile.shopifyCountry,
      shopifyAnalyticsAvailable: profile.shopifyAnalyticsAvailable,
      shopifyCustomerPrivacy: profile.shopifyCustomerPrivacy,
      shopifyDesignMode: profile.shopifyDesignMode,
      shopifyThemeName: profile.shopifyThemeName,
      shopifyThemeId: profile.shopifyThemeId,
      shopifyRoutesRoot: profile.shopifyRoutesRoot,
      shopifyCapabilities: profile.shopifyCapabilities
    };
  }

  function detectBrowser() {
    return detectBrowserFromUserAgent(navigator.userAgent || '').name;
  }

  function detectPlatform() {
    var platform = detectOsFromUserAgent(navigator.userAgent || '').name;
    if (platform === 'macos' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
      return 'ios';
    }
    return platform;
  }

  function getBrowserSupport(profile) {
    var clientProfile = refreshClientProfile(profile) || {
      osName: detectPlatform(),
      isStandalone: getCurrentStandaloneState(),
      isSecureContext: window.isSecureContext === true,
      supportsServiceWorker: 'serviceWorker' in navigator,
      supportsNotifications: 'Notification' in window,
      supportsPushManager: 'PushManager' in window
    };

    if (typeof window === 'undefined') {
      return { supported: false, reason: 'unsupported' };
    }

    if (!clientProfile.isSecureContext) {
      return { supported: false, reason: 'https-required' };
    }

    if (clientProfile.osName === 'ios' && !clientProfile.isStandalone) {
      return { supported: false, reason: 'ios-home-screen' };
    }

    if (!clientProfile.supportsServiceWorker || !clientProfile.supportsNotifications || !clientProfile.supportsPushManager) {
      return { supported: false, reason: 'unsupported' };
    }

    return { supported: true, reason: null };
  }

  function isPromptDismissed(shopDomain) {
    var dismissedUntil = Number(safeLocalStorageGet(getStorageKey(shopDomain, 'dismissed_until')) || '0');
    return dismissedUntil > Date.now();
  }

  function clearSessionDisplayCount(shopDomain) {
    safeSessionStorageSet(getStorageKey(shopDomain, 'session_displays'), '0');
  }

  function getRecentPromptAttempts(shopDomain) {
    var key = getStorageKey(shopDomain, 'prompt_attempts');
    var cutoff = Date.now() - BROWSER_PROMPT_WINDOW_MS;
    var raw = safeLocalStorageGet(key);
    var attempts = [];

    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          attempts = parsed
            .map(function (value) { return Number(value); })
            .filter(function (value) { return !isNaN(value) && value >= cutoff; });
        }
      } catch (_error) {
        attempts = [];
      }
    }

    safeLocalStorageSet(key, JSON.stringify(attempts));
    return attempts;
  }

  function recordPromptAttempt(shopDomain) {
    var key = getStorageKey(shopDomain, 'prompt_attempts');
    var attempts = getRecentPromptAttempts(shopDomain);
    attempts.push(Date.now());
    safeLocalStorageSet(key, JSON.stringify(attempts));
  }

  function hasReachedBrowserPromptLimit(shopDomain) {
    return getRecentPromptAttempts(shopDomain).length >= BROWSER_PROMPT_MAX_ATTEMPTS;
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

  function getSessionDisplayCount(shopDomain) {
    return Number(safeSessionStorageGet(getStorageKey(shopDomain, 'session_displays')) || '0');
  }

  function incrementSessionDisplayCount(shopDomain) {
    safeSessionStorageSet(getStorageKey(shopDomain, 'session_displays'), String(getSessionDisplayCount(shopDomain) + 1));
  }

  function isMobileViewport() {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  function getResolvedOptInSettings(boot) {
    var merged = Object.assign({}, defaultOptInSettings, boot && boot.optIn ? boot.optIn : {});
    merged.desktopDelaySeconds = Number(merged.desktopDelaySeconds || defaultOptInSettings.desktopDelaySeconds);
    merged.mobileDelaySeconds = Number(merged.mobileDelaySeconds || defaultOptInSettings.mobileDelaySeconds);
    merged.maxDisplaysPerSession = Number(merged.maxDisplaysPerSession || defaultOptInSettings.maxDisplaysPerSession);
    merged.hideForDays = Number(merged.hideForDays || defaultOptInSettings.hideForDays);
    merged.offsetX = Number(merged.offsetX || 0);
    merged.offsetY = Number(merged.offsetY || 0);
    if (!merged.placementPreset) {
      merged.placementPreset = defaultOptInSettings.placementPreset;
    }
    return merged;
  }

  function getSettingsSignature(settings) {
    var keys = [
      settings.promptType,
      settings.title,
      settings.message,
      settings.allowText,
      settings.allowBgColor,
      settings.allowTextColor,
      settings.laterText,
      settings.logoUrl || '',
      String(settings.desktopDelaySeconds),
      String(settings.mobileDelaySeconds),
      String(settings.maxDisplaysPerSession),
      String(settings.hideForDays),
      settings.desktopPosition,
      settings.mobilePosition,
      settings.placementPreset || 'balanced',
      String(settings.offsetX || 0),
      String(settings.offsetY || 0),
      String(settings.iosWidgetEnabled !== false),
      settings.iosWidgetTitle || '',
      settings.iosWidgetMessage || ''
    ];

    return keys.join('|');
  }

  function syncSettingsVersion(shopDomain, settings) {
    var key = getStorageKey(shopDomain, 'settings_signature');
    var next = getSettingsSignature(settings);
    var prev = safeLocalStorageGet(key);

    if (!prev) {
      safeLocalStorageSet(key, next);
      return;
    }

    if (prev !== next) {
      safeLocalStorageSet(key, next);
      clearPromptDismissal(shopDomain);
      clearSessionDisplayCount(shopDomain);
    }
  }

  function getPresetOffset(settings) {
    var isMobile = isMobileViewport();
    var step = isMobile ? 16 : 24;

    if (settings.placementPreset === 'safe-left') {
      return { x: step, y: 0 };
    }
    if (settings.placementPreset === 'safe-right') {
      return { x: -step, y: 0 };
    }
    if (settings.placementPreset === 'safe-top') {
      return { x: 0, y: step };
    }
    if (settings.placementPreset === 'safe-bottom') {
      return { x: 0, y: -step };
    }

    return { x: 0, y: 0 };
  }

  function applyPosition(root, settings) {
    var positions = [
      'pe-prompt--top-left',
      'pe-prompt--top-center',
      'pe-prompt--top-right',
      'pe-prompt--bottom-left',
      'pe-prompt--bottom-center',
      'pe-prompt--bottom-right',
      'pe-prompt--mobile-top',
      'pe-prompt--mobile-bottom'
    ];

    for (var index = 0; index < positions.length; index += 1) {
      root.classList.remove(positions[index]);
    }

    if (isMobileViewport()) {
      root.classList.add(settings.mobilePosition === 'bottom' ? 'pe-prompt--mobile-bottom' : 'pe-prompt--mobile-top');
      return;
    }

    root.classList.add('pe-prompt--' + settings.desktopPosition);
  }

  function applyOptInSettings(root, runtimeConfig, boot) {
    var settings = getResolvedOptInSettings(boot);
    var headline = root.querySelector('[data-push-eagle-headline]');
    var message = root.querySelector('[data-push-eagle-message]');
    var allowButton = root.querySelector('[data-push-eagle-action]');
    var laterButton = root.querySelector('[data-push-eagle-dismiss]');
    var logo = root.querySelector('[data-push-eagle-logo]');
    var logoFallback = root.querySelector('[data-push-eagle-logo-fallback]');

    if (headline) {
      headline.textContent = settings.title;
    }
    if (message) {
      message.textContent = settings.message;
    }
    if (allowButton) {
      allowButton.textContent = settings.allowText;
      allowButton.style.backgroundColor = settings.allowBgColor;
      allowButton.style.color = settings.allowTextColor;
    }
    if (laterButton) {
      laterButton.textContent = settings.laterText;
    }
    if (logo) {
      if (settings.logoUrl) {
        logo.src = settings.logoUrl;
        logo.hidden = false;
        if (logoFallback) {
          logoFallback.hidden = true;
        }
      } else {
        logo.removeAttribute('src');
        logo.hidden = true;
        if (logoFallback) {
          logoFallback.hidden = false;
        }
      }
    }

    runtimeConfig.mode = settings.promptType === 'browser' ? 'browser' : 'custom';
    runtimeConfig.delayMs = (isMobileViewport() ? settings.mobileDelaySeconds : settings.desktopDelaySeconds) * 1000;
    runtimeConfig.maxDisplaysPerSession = settings.promptType === 'browser'
      ? BROWSER_PROMPT_MAX_DISPLAYS_PER_SESSION
      : settings.maxDisplaysPerSession;
    runtimeConfig.remindAfterDays = settings.promptType === 'browser' ? 0 : settings.hideForDays;
    runtimeConfig.resolvedOptIn = settings;
    applyPosition(root, settings);
    syncSettingsVersion(runtimeConfig.shopDomain, settings);

    var presetOffset = getPresetOffset(settings);
    var finalOffsetX = presetOffset.x + settings.offsetX;
    var finalOffsetY = presetOffset.y + settings.offsetY;
    root.style.setProperty('--pe-offset-x', finalOffsetX + 'px');
    root.style.setProperty('--pe-offset-y', finalOffsetY + 'px');
  }

  function applyIosWidgetSettings(root, settings) {
    var headline = root.querySelector('[data-push-eagle-headline]');
    var message = root.querySelector('[data-push-eagle-message]');
    var allowButton = root.querySelector('[data-push-eagle-action]');
    var laterButton = root.querySelector('[data-push-eagle-dismiss]');

    if (headline) {
      headline.textContent = settings.iosWidgetTitle || defaultOptInSettings.iosWidgetTitle;
    }
    if (message) {
      message.textContent = settings.iosWidgetMessage || defaultOptInSettings.iosWidgetMessage;
    }
    if (allowButton) {
      allowButton.textContent = "I've added it";
      allowButton.style.backgroundColor = '#111827';
      allowButton.style.color = '#ffffff';
    }
    if (laterButton) {
      laterButton.textContent = 'Maybe later';
    }
  }

  function isIosWidgetDismissedForSession(shopDomain) {
    return safeSessionStorageGet(getStorageKey(shopDomain, 'ios_widget_dismissed')) === '1';
  }

  function dismissIosWidgetForSession(shopDomain) {
    safeSessionStorageSet(getStorageKey(shopDomain, 'ios_widget_dismissed'), '1');
  }

  function hasReportedIosHomeScreen(shopDomain, externalId) {
    return safeLocalStorageGet(getStorageKey(shopDomain, 'ios_home_screen_reported')) === externalId;
  }

  function markIosHomeScreenReported(shopDomain, externalId) {
    safeLocalStorageSet(getStorageKey(shopDomain, 'ios_home_screen_reported'), externalId);
  }

  async function reportIosHomeScreenConfirmed(boot, profile) {
    if (!boot || !boot.shopDomain || !boot.externalId || !boot.iosHomeScreenEndpoint) {
      return;
    }

    if (hasReportedIosHomeScreen(boot.shopDomain, boot.externalId)) {
      return;
    }

    try {
      var response = await fetch(boot.iosHomeScreenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shopDomain: boot.shopDomain,
          externalId: boot.externalId,
          browser: profile && profile.browserName ? profile.browserName : detectBrowser(),
          platform: profile && profile.osName ? profile.osName : detectPlatform(),
          locale: profile && profile.language ? profile.language : navigator.language,
          country: profile && profile.country ? profile.country : (profile && profile.shopifyCountry ? profile.shopifyCountry : null),
          city: profile && profile.city ? profile.city : null,
          deviceContext: serializeClientProfile(profile)
        })
      });

      if (response.ok) {
        markIosHomeScreenReported(boot.shopDomain, boot.externalId);
      }
    } catch (_error) {
      // Retry on a future iOS Home Screen open.
    }
  }

  function canShowPromptForSession(shopDomain, maxDisplaysPerSession) {
    return getSessionDisplayCount(shopDomain) < Math.max(1, Number(maxDisplaysPerSession || 1));
  }

  async function bootstrap(config) {
    var bootstrapPaths = buildBootstrapPathCandidates(config.proxyBootstrapPath || DEFAULT_PROXY_BOOTSTRAP_PATH);
    var existingExternalId = getOrCreateAnonExternalId(config.shopDomain);
    var cacheKey = getStorageKey(config.shopDomain, 'bootstrap_cache');
    var data = null;
    var bootstrapSource = 'proxy';
    var resolvedProxyBootstrapPath = bootstrapPaths[0];

    for (var pathIndex = 0; pathIndex < bootstrapPaths.length; pathIndex += 1) {
      var bootstrapUrl = bootstrapPaths[pathIndex];
      var requestUrl = bootstrapUrl
        + (bootstrapUrl.indexOf('?') === -1 ? '?' : '&')
        + '_pe_ts=' + String(Date.now())
        + '&externalId=' + encodeURIComponent(existingExternalId);

      data = await tryBootstrapFetch(requestUrl, config.shopDomain, true);
      if (data && data.ok) {
        resolvedProxyBootstrapPath = bootstrapUrl;
        break;
      }
    }

    // If proxy failed (404 or non-JSON from Shopify), fall back to the direct app URL (cross-origin, no credentials)
    if (!data && config.appUrl) {
      var directUrl = config.appUrl.replace(/\/$/, '') + '/api/storefront/bootstrap'
        + '?shop=' + encodeURIComponent(config.shopDomain)
        + '&_pe_ts=' + String(Date.now())
        + '&externalId=' + encodeURIComponent(existingExternalId);
      data = await tryBootstrapFetch(directUrl, config.shopDomain, false);
      if (data && data.ok) {
        bootstrapSource = 'direct';
      }
    }

    if (data && data.ok) {
      if (bootstrapSource === 'proxy') {
        var resolvedProxyBasePath = getProxyBasePathFromBootstrapPath(resolvedProxyBootstrapPath);
        data.tokenEndpoint = resolvedProxyBasePath + '/token';
        data.activityEndpoint = resolvedProxyBasePath + '/activity';
        data.iosHomeScreenEndpoint = resolvedProxyBasePath + '/ios-home-screen';
      } else {
        var directBase = config.appUrl ? config.appUrl.replace(/\/$/, '') : '';
        if (directBase) {
          data.tokenEndpoint = data.tokenEndpoint || (directBase + '/api/storefront/token?shop=' + encodeURIComponent(config.shopDomain));
          data.activityEndpoint = data.activityEndpoint || (directBase + '/api/storefront/activity');
          data.iosHomeScreenEndpoint = data.iosHomeScreenEndpoint || (directBase + '/api/storefront/ios-home-screen');
        }
      }
      if (!data.externalId) {
        data.externalId = existingExternalId;
      }
      if (!data.clientId) {
        data.clientId = getOrCreateStableClientId(config.shopDomain);
      }
      data.bootstrapSource = bootstrapSource;
      safeLocalStorageSet(getStorageKey(config.shopDomain, 'external_id'), String(data.externalId));
      safeLocalStorageSet(getStorageKey(config.shopDomain, 'client_id'), String(data.clientId));
      safeLocalStorageSet(cacheKey, JSON.stringify(data));
      return data;
    }

    // Last resort: localStorage cache from a previous successful fetch
    var cached = safeLocalStorageGet(cacheKey);
    if (cached) {
      try {
        var cachedBoot = JSON.parse(cached);
        if (cachedBoot && cachedBoot.ok) {
          if (!cachedBoot.externalId) {
            cachedBoot.externalId = existingExternalId;
          }
          if (!cachedBoot.clientId) {
            cachedBoot.clientId = getOrCreateStableClientId(config.shopDomain);
          }

          var cachedDirectBase = config.appUrl ? config.appUrl.replace(/\/$/, '') : '';
          if (!cachedBoot.tokenEndpoint) {
            cachedBoot.tokenEndpoint = config.proxyTokenPath || DEFAULT_PROXY_TOKEN_PATH;
          }
          if (!cachedBoot.activityEndpoint) {
            cachedBoot.activityEndpoint = (config.proxyBootstrapPath || DEFAULT_PROXY_BOOTSTRAP_PATH).replace(/\/bootstrap(?:\?.*)?$/i, '/activity');
          }
          if (!cachedBoot.iosHomeScreenEndpoint) {
            cachedBoot.iosHomeScreenEndpoint = (config.proxyBootstrapPath || DEFAULT_PROXY_BOOTSTRAP_PATH).replace(/\/bootstrap(?:\?.*)?$/i, '/ios-home-screen');
          }
          if (!cachedBoot.activityFallbackEndpoint && cachedDirectBase) {
            cachedBoot.activityFallbackEndpoint = cachedDirectBase + '/api/storefront/activity';
          }
          if (!cachedBoot.iosHomeScreenFallbackEndpoint && cachedDirectBase) {
            cachedBoot.iosHomeScreenFallbackEndpoint = cachedDirectBase + '/api/storefront/ios-home-screen';
          }
          cachedBoot.bootstrapSource = cachedBoot.bootstrapSource || 'cache';

          safeLocalStorageSet(getStorageKey(config.shopDomain, 'external_id'), String(cachedBoot.externalId));
          safeLocalStorageSet(getStorageKey(config.shopDomain, 'client_id'), String(cachedBoot.clientId));
          safeLocalStorageSet(cacheKey, JSON.stringify(cachedBoot));
          return cachedBoot;
        }
      } catch (_error) {
        // ignore invalid cache
      }
    }

    return {
      ok: true,
      shopDomain: config.shopDomain,
      externalId: existingExternalId,
      clientId: getOrCreateStableClientId(config.shopDomain),
      bootstrapSource: 'fallback',
      tokenEndpoint: config.proxyTokenPath || DEFAULT_PROXY_TOKEN_PATH,
      activityEndpoint: (config.proxyBootstrapPath || DEFAULT_PROXY_BOOTSTRAP_PATH).replace(/\/bootstrap(?:\?.*)?$/i, '/activity'),
      activityFallbackEndpoint: config.appUrl ? config.appUrl.replace(/\/$/, '') + '/api/storefront/activity' : '',
      iosHomeScreenEndpoint: (config.proxyBootstrapPath || DEFAULT_PROXY_BOOTSTRAP_PATH).replace(/\/bootstrap(?:\?.*)?$/i, '/ios-home-screen'),
      iosHomeScreenFallbackEndpoint: config.appUrl ? config.appUrl.replace(/\/$/, '') + '/api/storefront/ios-home-screen' : '',
      optIn: defaultOptInSettings,
      firebase: fallbackFirebaseConfig
    };
  }

  async function tryBootstrapFetch(url, shopDomain, withCredentials) {
    try {
      var fetchOptions = {
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache' }
      };
      // Only send credentials on same-origin proxy requests, not cross-origin Vercel calls
      if (withCredentials) {
        fetchOptions.credentials = 'include';
      }
      var response = await fetch(url, fetchOptions);
      var contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.error('[PushEagle] Bootstrap non-JSON response', response.status, url);
        return null;
      }
      var data = await response.json();
      if (response.ok && data && data.ok) {
        return data;
      }
      console.error('[PushEagle] Bootstrap error response', response.status, data);
      return null;
    } catch (_error) {
      console.error('[PushEagle] Bootstrap fetch failed', url, _error);
      return null;
    }
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

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);

    for (var i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  function arrayBufferToBase64Url(value) {
    if (!value) {
      return null;
    }

    var bytes = new Uint8Array(value);
    var binary = '';
    for (var i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }

    return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function subscribeWithVapid(registration, vapidKey) {
    if (!registration || !registration.pushManager || !vapidKey) {
      return null;
    }

    var existing = await registration.pushManager.getSubscription();
    if (existing) {
      return existing;
    }

    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    });
  }

  async function registerToken(runtimeConfig, boot, options, profile) {
    var clientProfile = refreshClientProfile(profile);
    var support = getBrowserSupport(clientProfile);
    if (!support.supported) {
      return { ok: false, reason: support.reason || 'unsupported' };
    }

    var settings = options || {};
    var permission = clientProfile && clientProfile.permissionState ? clientProfile.permissionState : Notification.permission;
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

    if (clientProfile) {
      clientProfile.permissionState = permission;
    }

    try {
      var messaging = null;
      try {
        messaging = await initFirebaseMessaging(boot.firebase || fallbackFirebaseConfig);
      } catch (_firebaseInitError) {
        messaging = null;
      }

      var swPath = normalizeServiceWorkerPath((boot && boot.serviceWorkerPath) || runtimeConfig.proxyServiceWorkerPath || DEFAULT_PROXY_SERVICE_WORKER_PATH);
      var swScope = deriveServiceWorkerScope(swPath);
      var registration;

      try {
        registration = await navigator.serviceWorker.register(swPath, { scope: swScope });
      } catch (_scopedRegisterError) {
        try {
          // Fallback to default scope derived from script directory for stricter browser/proxy combinations.
          registration = await navigator.serviceWorker.register(swPath);
        } catch (swRegisterError) {
          var reusedExistingRegistration = false;
          try {
            var existingRegistrations = await navigator.serviceWorker.getRegistrations();
            for (var r = 0; r < existingRegistrations.length; r += 1) {
              var existing = existingRegistrations[r];
              if (existing && typeof existing.scope === 'string' && existing.scope.indexOf('/apps/push-eagle/') !== -1) {
                registration = existing;
                reusedExistingRegistration = true;
                break;
              }
            }
            if (!reusedExistingRegistration) {
              throw swRegisterError;
            }
          } catch (_existingRegistrationLookupError) {
            throw swRegisterError;
          }

          if (!reusedExistingRegistration) {
            var swMessage = swRegisterError && swRegisterError.message ? String(swRegisterError.message) : '';
            if (/404|bad http response|script/i.test(swMessage)) {
              return { ok: false, reason: 'sw-script-missing', message: swMessage };
            }
            throw swRegisterError;
          }
        }
      }

      try {
        await waitForActiveServiceWorker(registration, 12000);
      } catch (activationError) {
        var activationMessage = activationError && activationError.message ? String(activationError.message) : '';
        return { ok: false, reason: 'sw-not-active', message: activationMessage };
      }

      var firebaseVapidKey = (boot.firebase && boot.firebase.vapidKey) || fallbackFirebaseConfig.vapidKey;
      var webPushVapidPublicKey = (boot.webPushVapidPublicKey || '').trim() || firebaseVapidKey;
      var token = null;
      var tokenType = 'fcm';
      var vapidEndpoint = null;
      var vapidP256dh = null;
      var vapidAuth = null;

      if (messaging && messaging.getToken) {
        try {
          token = await messaging.getToken({
            vapidKey: firebaseVapidKey,
            serviceWorkerRegistration: registration
          });
        } catch (_fcmError) {
          token = null;
        }
      }

      if (!token && registration && registration.pushManager) {
        try {
          var existingSubscription = await registration.pushManager.getSubscription();
          if (existingSubscription && existingSubscription.endpoint) {
            token = existingSubscription.endpoint;
            tokenType = 'vapid';
            vapidEndpoint = existingSubscription.endpoint;

            var existingJson = existingSubscription.toJSON ? existingSubscription.toJSON() : null;
            var existingKeys = existingJson && existingJson.keys ? existingJson.keys : null;
            vapidP256dh = existingKeys && existingKeys.p256dh
              ? existingKeys.p256dh
              : arrayBufferToBase64Url(existingSubscription.getKey && existingSubscription.getKey('p256dh'));
            vapidAuth = existingKeys && existingKeys.auth
              ? existingKeys.auth
              : arrayBufferToBase64Url(existingSubscription.getKey && existingSubscription.getKey('auth'));
          }
        } catch (_existingSubscriptionError) {
          token = null;
        }
      }

      // Firefox/Safari may not return FCM token; fallback to native Web Push subscription.
      if (!token && webPushVapidPublicKey) {
        try {
          var subscription = await subscribeWithVapid(registration, webPushVapidPublicKey);
          if (subscription && subscription.endpoint) {
            token = subscription.endpoint;
            tokenType = 'vapid';
            vapidEndpoint = subscription.endpoint;
            var subscriptionJson = subscription.toJSON ? subscription.toJSON() : null;
            var keys = subscriptionJson && subscriptionJson.keys ? subscriptionJson.keys : null;
            vapidP256dh = keys && keys.p256dh
              ? keys.p256dh
              : arrayBufferToBase64Url(subscription.getKey && subscription.getKey('p256dh'));
            vapidAuth = keys && keys.auth
              ? keys.auth
              : arrayBufferToBase64Url(subscription.getKey && subscription.getKey('auth'));
          }
        } catch (_vapidError) {
          token = null;
        }
      }

      if (!token && messaging && messaging.getToken) {
        try {
          await delay(1200);
          token = await messaging.getToken({
            vapidKey: firebaseVapidKey,
            serviceWorkerRegistration: registration
          });
        } catch (_retryFcmError) {
          token = null;
        }
      }

      if (!token) {
        return {
          ok: false,
          reason: 'token-empty',
          message: webPushVapidPublicKey
            ? 'No FCM token and no Web Push subscription returned by browser.'
            : 'No FCM token and Web Push VAPID public key is missing.'
        };
      }

      var payload = {
        shopDomain: boot.shopDomain,
        externalId: boot.externalId,
        clientId: boot.clientId || null,
        token: token,
        tokenType: tokenType,
        vapidEndpoint: vapidEndpoint,
        vapidP256dh: vapidP256dh,
        vapidAuth: vapidAuth,
        browser: clientProfile && clientProfile.browserName ? clientProfile.browserName : detectBrowser(),
        platform: clientProfile && clientProfile.osName ? clientProfile.osName : detectPlatform(),
        locale: clientProfile && clientProfile.language ? clientProfile.language : navigator.language,
        country: clientProfile && clientProfile.country ? clientProfile.country : (clientProfile && clientProfile.shopifyCountry ? clientProfile.shopifyCountry : null),
        city: clientProfile && clientProfile.city ? clientProfile.city : null,
        deviceContext: Object.assign({}, serializeClientProfile(clientProfile) || {}, {
          clientId: boot.clientId || null
        })
      };

      var primaryTokenEndpoint = boot.tokenEndpoint || runtimeConfig.proxyTokenPath || DEFAULT_PROXY_TOKEN_PATH;
      var tokenEndpoints = [primaryTokenEndpoint];

      if (runtimeConfig.appUrl) {
        var directTokenEndpoint = runtimeConfig.appUrl.replace(/\/$/, '') + '/api/storefront/token?shop=' + encodeURIComponent(boot.shopDomain);
        if (tokenEndpoints.indexOf(directTokenEndpoint) === -1) {
          tokenEndpoints.push(directTokenEndpoint);
        }
      }

      var tokenSaved = false;
      var tokenSaveReason = '';

      for (var endpointIndex = 0; endpointIndex < tokenEndpoints.length; endpointIndex += 1) {
        var endpoint = tokenEndpoints[endpointIndex];

        try {
          var tokenResponse = await fetch(endpoint, {
            method: 'POST',
            credentials: isSameOriginEndpoint(endpoint) ? 'include' : 'omit',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          if (tokenResponse.ok) {
            tokenSaved = true;
            break;
          }

          var responseError = '';
          try {
            var responseJson = await tokenResponse.json();
            responseError = responseJson && responseJson.error ? String(responseJson.error) : '';
          } catch (_jsonError) {
            responseError = '';
          }

          tokenSaveReason = 'http-' + String(tokenResponse.status || 'error') + (responseError ? (':' + responseError) : '');
        } catch (_tokenSaveError) {
          tokenSaveReason = 'network-error';
        }
      }

      if (!tokenSaved) {
        return { ok: false, reason: 'token-save-failed', message: tokenSaveReason };
      }

      markSubscribed(boot.shopDomain, token);
      scheduleWelcomeWakeupPings(runtimeConfig, boot);
      return { ok: true, token: token, tokenType: tokenType };
    } catch (error) {
      var message = error && error.message ? String(error.message) : '';
      if (/unsupported-browser|not supported|secure context/i.test(message)) {
        return { ok: false, reason: 'unsupported' };
      }

      return { ok: false, reason: 'registration-failed', message: message };
    }
  }

  function scheduleWelcomeWakeupPings(runtimeConfig, boot) {
    if (!boot || !boot.shopDomain || !boot.externalId) {
      return;
    }

    var storageKey = getStorageKey(boot.shopDomain, 'welcome_wakeup_until');
    var wakeupUntil = Date.now() + (8 * 60 * 1000);
    safeLocalStorageSet(storageKey, String(wakeupUntil));

    var proxyBootstrapPath = runtimeConfig.proxyBootstrapPath || DEFAULT_PROXY_BOOTSTRAP_PATH;
    var directBootstrapBase = runtimeConfig.appUrl ? runtimeConfig.appUrl.replace(/\/$/, '') : '';
    var directBootstrapPath = directBootstrapBase
      ? (directBootstrapBase + '/api/storefront/bootstrap?shop=' + encodeURIComponent(boot.shopDomain))
      : '';

    var runWakeup = function () {
      var deadline = Number(safeLocalStorageGet(storageKey) || '0');
      if (!deadline || Date.now() > deadline) {
        safeLocalStorageRemove(storageKey);
        return;
      }

      var wakeSuffix = '&externalId=' + encodeURIComponent(boot.externalId) + '&_peWake=' + String(Date.now());

      if (directBootstrapPath) {
        fetch(directBootstrapPath + wakeSuffix, {
          method: 'GET',
          credentials: 'omit',
          cache: 'no-store'
        }).catch(function () {});
      }

      fetch(proxyBootstrapPath
        + (proxyBootstrapPath.indexOf('?') === -1 ? '?' : '&')
        + 'shop=' + encodeURIComponent(boot.shopDomain)
        + wakeSuffix, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      }).catch(function () {});

      window.setTimeout(runWakeup, 60 * 1000);
    };

    window.setTimeout(runWakeup, 60 * 1000);
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
      maxDisplaysPerSession: 10,
      delayMs: Number(root.dataset.delayMs || '0'),
      startedAt: Date.now()
    };

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
    syncExternalIdToCart(
      boot && boot.externalId ? boot.externalId : null,
      boot && boot.clientId ? boot.clientId : getOrCreateStableClientId(config.shopDomain)
    );
    bindCommerceActivityTracking(boot);
    sendActivityEvent(boot, window.location.pathname.indexOf('/products/') === 0 ? 'product_view' : 'page_view', {
      referrer: document.referrer || null
    });
    var clientProfile = await buildClientProfile(root, boot);
    applyOptInSettings(root, config, boot);

    var settings = config.resolvedOptIn || getResolvedOptInSettings(boot);
    var isOnIos = clientProfile.osName === 'ios';
    var iosWatcherCleanup = null;

    function cleanupIosWatcher() {
      if (iosWatcherCleanup) {
        iosWatcherCleanup();
        iosWatcherCleanup = null;
      }
    }

    async function maybeReportIosHomeScreen() {
      if (isOnIos && isStandaloneIos()) {
        refreshClientProfile(clientProfile);
        await reportIosHomeScreenConfirmed(boot, clientProfile);
      }
    }

    async function startStandardPromptFlow() {
      cleanupIosWatcher();
      applyOptInSettings(root, config, boot);

      var primaryButton = root.querySelector('[data-push-eagle-action]');
      var secondaryButton = root.querySelector('[data-push-eagle-dismiss]');
      refreshClientProfile(clientProfile);
      var support = getBrowserSupport(clientProfile);
      var effectiveMode = config.mode;

      await maybeReportIosHomeScreen();

      // Best-effort token reconciliation: if permission is already granted,
      // silently sync token so previously failed browsers can self-heal.
      if (clientProfile.permissionState === 'granted') {
        await registerToken(config, boot, { silent: true }, clientProfile);
        closePrompt(root);
        return;
      }

      if (clientProfile.permissionState !== 'default' && effectiveMode === 'custom') {
        closePrompt(root);
        return;
      }

      if (effectiveMode === 'browser') {
        if (isMarkedSubscribed(config.shopDomain)) {
          await registerToken(config, boot, { silent: true }, clientProfile);
          closePrompt(root);
          return;
        }

        if (clientProfile.permissionState !== 'default') {
          closePrompt(root);
          return;
        }
      }

      if (secondaryButton) {
        secondaryButton.onclick = function () {
          if (effectiveMode === 'custom') {
            dismissPrompt(config.shopDomain, config.remindAfterDays);
          }
          closePrompt(root);
        };
      }

      if (!support.supported && effectiveMode !== 'custom') {
        explainUnsupported(root, support.reason);
        if (config.displayTrigger === 'manual') {
          bindManualTrigger(root, config, function () {
            openPrompt(root);
          });
          return;
        }

        var unsupportedDelayMs = getRemainingDelayMs(config.startedAt, config.delayMs);
        if (unsupportedDelayMs > 0) {
          await delay(unsupportedDelayMs);
        }

        openPrompt(root);
        return;
      }

      var showPrompt = function () {
        if (effectiveMode === 'browser' && hasReachedBrowserPromptLimit(config.shopDomain)) {
          closePrompt(root);
          return;
        }

        if (!canShowPromptForSession(config.shopDomain, config.maxDisplaysPerSession)) {
          closePrompt(root);
          return;
        }

        incrementSessionDisplayCount(config.shopDomain);
        if (effectiveMode === 'browser') {
          recordPromptAttempt(config.shopDomain);
        }
        openPrompt(root);
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

      if (effectiveMode !== 'browser' && isPromptDismissed(config.shopDomain)) {
        closePrompt(root);
        return;
      }

      var standardDelayMs = getRemainingDelayMs(config.startedAt, config.delayMs);
      if (standardDelayMs > 0) {
        await delay(standardDelayMs);
      }

      // Browser mode: fire native dialog directly — no custom popup shown at all
      if (effectiveMode === 'browser') {
        if (hasReachedBrowserPromptLimit(config.shopDomain)) { closePrompt(root); return; }
        if (!canShowPromptForSession(config.shopDomain, config.maxDisplaysPerSession)) { closePrompt(root); return; }
        incrementSessionDisplayCount(config.shopDomain);
        recordPromptAttempt(config.shopDomain);
        var browserModeResult = await registerToken(config, boot, { silent: false }, clientProfile);
        if (!browserModeResult.ok) {
          if (browserModeResult.reason === 'sw-script-missing') {
            showStatus(root, 'Push setup is incomplete for this store. App proxy URL is not reachable. Update Proxy base path in app block settings.', 'error');
          } else if (browserModeResult.reason === 'permission-denied') {
            showStatus(root, 'Permission denied. You can enable notifications from browser settings.', 'error');
          } else if (browserModeResult.reason === 'unsupported' || browserModeResult.reason === 'https-required') {
            explainUnsupported(root, browserModeResult.reason);
          } else {
            showStatus(root, 'Setup failed (' + browserModeResult.reason + '). Please retry.', 'error');
          }
          openPrompt(root);
          return;
        }
        return;
      }

      showPrompt();

      if (primaryButton) {
        primaryButton.onclick = async function () {
          if (isOnIos && !isStandaloneIos()) {
            showStatus(root, 'Open this store from Home Screen first, then try again.', 'info');
            return;
          }

          refreshClientProfile(clientProfile);

          primaryButton.disabled = true;
          primaryButton.setAttribute('aria-busy', 'true');

          // Custom mode should dismiss instantly after click.
          if (effectiveMode === 'custom') {
            closePrompt(root);
          }

          var result = await registerToken(config, boot, { silent: false }, clientProfile);

          if (effectiveMode === 'custom') {
            if (!result.ok) {
              openPrompt(root);
              if (result.reason === 'sw-script-missing') {
                showStatus(root, 'Push setup is incomplete for this store. App proxy URL is not reachable. Update Proxy base path in app block settings.', 'error');
              } else if (result.reason === 'sw-not-active') {
                showStatus(root, 'Push service worker is still activating. Please retry in a few seconds.', 'error');
              } else if (result.reason === 'permission-denied') {
                showStatus(root, 'Permission denied. You can enable notifications from browser settings.', 'error');
              } else {
                showStatus(root, 'Setup failed. Please try again. (' + (result.message || result.reason || 'unknown') + ')', 'error');
              }
              primaryButton.disabled = false;
              primaryButton.removeAttribute('aria-busy');
            }
            return;
          }

          if (result.ok) {
            showStatus(root, 'Notifications enabled.', 'success');
            closePrompt(root);
          } else if (result.reason === 'sw-script-missing') {
            showStatus(root, 'Push setup is incomplete for this store. App proxy URL is not reachable. Update Proxy base path in app block settings.', 'error');
          } else if (result.reason === 'sw-not-active') {
            showStatus(root, 'Push service worker is still activating. Please retry in a few seconds.', 'error');
          } else if (result.reason === 'unsupported' || result.reason === 'https-required') {
            explainUnsupported(root, result.reason);
          } else if (result.reason === 'permission-denied') {
            showStatus(root, 'Permission denied. You can enable notifications from browser settings.', 'error');
          } else {
            showStatus(root, 'Setup failed (' + result.reason + '). Please retry.', 'error');
          }

          primaryButton.disabled = false;
          primaryButton.removeAttribute('aria-busy');
        };
      }
    }

    async function startIosOnboardingFlow() {
      var primaryButton = root.querySelector('[data-push-eagle-action]');
      var secondaryButton = root.querySelector('[data-push-eagle-dismiss]');

      applyIosWidgetSettings(root, settings);

      function handleStandaloneReady() {
        cleanupIosWatcher();
        refreshClientProfile(clientProfile);
        showStatus(root, 'Home Screen mode detected. Continuing with your notification prompt...', 'success');
        startStandardPromptFlow();
      }

      function watchStandalone() {
        var intervalId = window.setInterval(function () {
          if (isStandaloneIos()) {
            handleStandaloneReady();
          }
        }, IOS_HOME_SCREEN_POLL_MS);

        var mediaQuery = null;
        var mediaQueryHandler = function (event) {
          if (event.matches) {
            handleStandaloneReady();
          }
        };
        if (window.matchMedia) {
          mediaQuery = window.matchMedia('(display-mode: standalone)');
          if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', mediaQueryHandler);
          } else if (mediaQuery.addListener) {
            mediaQuery.addListener(mediaQueryHandler);
          }
        }

        var visibilityHandler = function () {
          if (document.visibilityState === 'visible' && isStandaloneIos()) {
            handleStandaloneReady();
          }
        };
        var focusHandler = function () {
          if (isStandaloneIos()) {
            handleStandaloneReady();
          }
        };

        document.addEventListener('visibilitychange', visibilityHandler);
        window.addEventListener('focus', focusHandler);
        window.addEventListener('pageshow', focusHandler);

        iosWatcherCleanup = function () {
          window.clearInterval(intervalId);
          document.removeEventListener('visibilitychange', visibilityHandler);
          window.removeEventListener('focus', focusHandler);
          window.removeEventListener('pageshow', focusHandler);
          if (mediaQuery) {
            if (mediaQuery.removeEventListener) {
              mediaQuery.removeEventListener('change', mediaQueryHandler);
            } else if (mediaQuery.removeListener) {
              mediaQuery.removeListener(mediaQueryHandler);
            }
          }
        };
      }

      if (secondaryButton) {
        secondaryButton.onclick = function () {
          dismissIosWidgetForSession(config.shopDomain);
          cleanupIosWatcher();
          closePrompt(root);
        };
      }

      if (primaryButton) {
        primaryButton.onclick = function () {
          if (isStandaloneIos()) {
            handleStandaloneReady();
            return;
          }

          showStatus(root, 'Tap Share, choose "Add to Home Screen", then open the store from that icon. We will continue automatically.', 'info');
        };
      }

      var showWidget = function () {
        if (isIosWidgetDismissedForSession(config.shopDomain)) {
          closePrompt(root);
          return;
        }

        showStatus(root, 'Add this store to Home Screen. We will keep checking while this widget is open.', 'info');
        openPrompt(root);
        watchStandalone();
      };

      if (config.displayTrigger === 'manual') {
        var bound = bindManualTrigger(root, config, function () {
          showWidget();
        });

        if (!bound) {
          showStatus(root, 'No manual trigger element found. Falling back to automatic display.', 'info');
        } else {
          closePrompt(root);
          return;
        }
      }

      var iosDelayMs = getRemainingDelayMs(config.startedAt, config.delayMs);
      if (iosDelayMs > 0) {
        await delay(iosDelayMs);
      }

      showWidget();
    }

    if (isOnIos && !isStandaloneIos()) {
      if (settings.iosWidgetEnabled !== false) {
        await startIosOnboardingFlow();
      } else {
        closePrompt(root);
      }
      return;
    }

    await startStandardPromptFlow();
  }

  function schedulePrompt(root) {
    var start = function () {
      setTimeout(function () {
        runPrompt(root);
      }, 0);
    };

    if (document.readyState !== 'loading') {
      start();
      return;
    }

    document.addEventListener('DOMContentLoaded', start, { once: true });
  }

  for (var i = 0; i < roots.length; i += 1) {
    schedulePrompt(roots[i]);
  }
})();
