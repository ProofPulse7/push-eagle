import { register } from '@shopify/web-pixels-extension';

const DEFAULT_ENDPOINT_PATH = '/apps/push-eagle/pixel-events';

const pick = (obj, path) => {
  if (!obj) return null;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    try {
      current = current[part];
    } catch (_error) {
      return null;
    }
  }
  return current == null ? null : current;
};

const toStringSafe = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

const normalizePath = (value) => {
  const raw = toStringSafe(value);
  if (!raw) return DEFAULT_ENDPOINT_PATH;

  let path = raw;
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname || DEFAULT_ENDPOINT_PATH;
    } catch (_error) {
      return DEFAULT_ENDPOINT_PATH;
    }
  }

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  // Keep requests constrained to app proxy paths so sandbox frames never self-navigate.
  if (!path.toLowerCase().startsWith('/apps/')) {
    return DEFAULT_ENDPOINT_PATH;
  }

  return path;
};

const getShopDomain = (init) => {
  const direct = toStringSafe(init?.data?.shop?.myshopifyDomain)
    || toStringSafe(init?.context?.shop?.myshopifyDomain)
    || toStringSafe(pick(init, 'context.window.location.hostname'));

  if (!direct) return null;
  return direct.toLowerCase();
};

const getShopDomainFromEvent = (event) => {
  const direct =
    toStringSafe(pick(event, 'context.document.location.hostname'))
    || toStringSafe(pick(event, 'context.window.location.hostname'))
    || toStringSafe(pick(event, 'context.page.location.hostname'))
    || null;

  if (!direct) {
    return null;
  }

  return direct.toLowerCase();
};

const getPageUrl = (event) => {
  return (
    toStringSafe(pick(event, 'context.window.location.href'))
    || toStringSafe(pick(event, 'data.checkout.url'))
    || toStringSafe(pick(event, 'data.cart.url'))
    || toStringSafe(pick(event, 'data.productVariant.product.url'))
    || toStringSafe(pick(event, 'data.product.url'))
    || null
  );
};

const getProductId = (event) => {
  return (
    toStringSafe(pick(event, 'data.productVariant.product.id'))
    || toStringSafe(pick(event, 'data.product.id'))
    || toStringSafe(pick(event, 'data.cartLine.merchandise.product.id'))
    || toStringSafe(pick(event, 'data.checkout.lineItems.0.variant.product.id'))
    || null
  );
};

const getCartToken = (event) => {
  const raw =
    toStringSafe(pick(event, 'data.cart.id'))
    || toStringSafe(pick(event, 'data.checkout.token'))
    || toStringSafe(pick(event, 'data.checkout.id'))
    || null;

  if (!raw) return null;
  const slashParts = raw.split('/');
  return slashParts[slashParts.length - 1] || raw;
};

const getOrderId = (event) => {
  const raw =
    toStringSafe(pick(event, 'data.checkout.order.id'))
    || toStringSafe(pick(event, 'data.checkout.order.admin_graphql_api_id'))
    || toStringSafe(pick(event, 'data.order.id'))
    || null;

  if (!raw) {
    return null;
  }

  const slashParts = raw.split('/');
  return slashParts[slashParts.length - 1] || raw;
};

const getCheckoutTotalAmount = (event) => {
  const amountRaw =
    pick(event, 'data.checkout.totalPrice.amount')
    ?? pick(event, 'data.checkout.subtotalPrice.amount')
    ?? pick(event, 'data.checkout.totalPriceSet.shopMoney.amount')
    ?? null;

  if (amountRaw == null) {
    return null;
  }

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount * 100);
};

const subscribeSafely = (analytics, eventName, handler) => {
  if (!analytics || typeof analytics.subscribe !== 'function') {
    return;
  }

  try {
    analytics.subscribe(eventName, (event) => {
      try {
        handler(event);
      } catch (_error) {
        // no-op: never let a single malformed pixel event break runtime execution
      }
    });
  } catch (_error) {
    // no-op: best-effort subscription in strict runtime
  }
};

const mapEventType = (name) => {
  const normalized = String(name || '').toLowerCase();
  if (normalized === 'page_viewed') return 'page_view';
  if (normalized === 'product_viewed') return 'product_view';
  if (normalized === 'product_added_to_cart') return 'add_to_cart';
  if (normalized === 'checkout_started') return 'checkout_start';
  if (normalized === 'checkout_completed') return 'checkout_complete';
  return null;
};

const getPrivacySnapshot = (init) => {
  const snapshot = init?.customerPrivacy || pick(init, 'context.customerPrivacy') || null;
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  return snapshot;
};

register(({ analytics, settings, init }) => {
  if (!analytics || typeof analytics.subscribe !== 'function') {
    return;
  }

  const privacySnapshot = getPrivacySnapshot(init);
  if (!privacySnapshot) {
    return;
  }

  const initialShopDomain = getShopDomain(init);
  const endpointPath = normalizePath(settings?.endpointPath);

  const send = async (eventName, event) => {
    const eventType = mapEventType(eventName);
    const shopDomain = initialShopDomain || getShopDomainFromEvent(event);
    if (!eventType || !shopDomain) {
      return;
    }

    const cartToken = getCartToken(event);
    const clientId = toStringSafe(event?.clientId);
    const externalId = cartToken
      ? `cart:${shopDomain}:${cartToken}`
      : clientId
        ? `px:${shopDomain}:${clientId}`
        : null;

    if (!externalId) {
      return;
    }

    const payload = {
      shopDomain,
      externalId,
      clientId,
      eventName,
      eventType,
      pageUrl: getPageUrl(event),
      productId: getProductId(event),
      cartToken,
      metadata: {
        id: toStringSafe(event?.id),
        sequenceIndex: typeof event?.seq === 'number' ? event.seq : null,
        timestamp: toStringSafe(event?.timestamp),
        orderId: getOrderId(event),
        checkoutTotalPriceCents: getCheckoutTotalAmount(event),
      },
    };

    try {
      await fetch(endpointPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Domain': shopDomain,
        },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch (_error) {
      // Best-effort delivery in strict pixel sandbox.
    }
  };

  subscribeSafely(analytics, 'page_viewed', (event) => send('page_viewed', event));
  subscribeSafely(analytics, 'product_viewed', (event) => send('product_viewed', event));
  subscribeSafely(analytics, 'product_added_to_cart', (event) => send('product_added_to_cart', event));
  subscribeSafely(analytics, 'checkout_started', (event) => send('checkout_started', event));
  subscribeSafely(analytics, 'checkout_completed', (event) => send('checkout_completed', event));
});
