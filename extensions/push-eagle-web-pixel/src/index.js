import { register } from '@shopify/web-pixels-extension';

const DEFAULT_ENDPOINT_PATH = '/apps/push-eagle/pixel-events';

const pick = (obj, path) => {
  if (!obj) return null;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    current = current[part];
  }
  return current == null ? null : current;
};

const toStringSafe = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

const normalizePath = (value) => {
  const path = toStringSafe(value);
  if (!path) return DEFAULT_ENDPOINT_PATH;
  return path.startsWith('/') ? path : `/${path}`;
};

const getShopDomain = (init) => {
  const direct = toStringSafe(init?.data?.shop?.myshopifyDomain)
    || toStringSafe(init?.context?.shop?.myshopifyDomain)
    || toStringSafe(init?.context?.document?.location?.hostname);

  if (!direct) return null;
  return direct.toLowerCase();
};

const getPageUrl = (event) => {
  return (
    toStringSafe(pick(event, 'context.document.location.href'))
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

const mapEventType = (name) => {
  const normalized = String(name || '').toLowerCase();
  if (normalized === 'page_viewed') return 'page_view';
  if (normalized === 'product_viewed') return 'product_view';
  if (normalized === 'product_added_to_cart') return 'add_to_cart';
  if (normalized === 'checkout_started') return 'checkout_start';
  return null;
};

register(({ analytics, settings, init }) => {
  const shopDomain = getShopDomain(init);
  const endpointPath = normalizePath(settings?.endpointPath);

  const send = async (eventName, event) => {
    const eventType = mapEventType(eventName);
    if (!eventType || !shopDomain) {
      return;
    }

    const cartToken = getCartToken(event);
    const clientId = toStringSafe(event?.clientId);
    const externalId = cartToken ? `cart:${shopDomain}:${cartToken}` : (clientId ? `px:${shopDomain}:${clientId}` : null);

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
      // no-op: pixel delivery is best-effort
    }
  };

  analytics.subscribe('page_viewed', (event) => send('page_viewed', event));
  analytics.subscribe('product_viewed', (event) => send('product_viewed', event));
  analytics.subscribe('product_added_to_cart', (event) => send('product_added_to_cart', event));
  analytics.subscribe('checkout_started', (event) => send('checkout_started', event));
});
