import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

const cwd = process.cwd();
for (const fileName of ['.env.local', '.env']) {
  const filePath = path.join(cwd, fileName);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
  }
}

const args = process.argv.slice(2);
const getArgValue = (flag, fallback = '') => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return fallback;
  }

  return args[index + 1] ?? fallback;
};

const shopDomain = getArgValue('--shop', 'test-shop.myshopify.com');
const baseUrl = getArgValue('--base', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010');
const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET || '';
const appProxySecret = process.env.SHOPIFY_API_SECRET || '';
const cronSecret = process.env.CRON_SECRET || '';
const runId = Date.now();
const externalId = `qa-ext-${runId}`;
const productId = `prod-${runId}`;
const variantId = `variant-${runId}`;
const inventoryItemId = `inv-${runId}`;
const orderId = `order-${runId}`;
const fulfillmentId = `fulfillment-${runId}`;
const cartToken = `cart-${runId}`;
let webhookSequence = 0;

const createWebhookSignature = (rawBody, secret) =>
  crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');

const timedFetch = async (url, options = {}, timeoutMs = 45000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const createAppProxySignature = (params, secret) => {
  const normalized = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('');
  return crypto.createHmac('sha256', secret).update(normalized, 'utf8').digest('hex');
};

const postJson = async (relativeUrl, payload, extraHeaders = {}) => {
  const response = await timedFetch(new URL(relativeUrl, baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { ok: response.ok, status: response.status, body };
};

const postSignedWebhook = async (topic, relativeUrl, payload) => {
  if (!webhookSecret) {
    return {
      ok: false,
      status: 0,
      body: { ok: false, error: 'Missing SHOPIFY_WEBHOOK_SECRET or SHOPIFY_API_SECRET for webhook signature.' },
    };
  }

  webhookSequence += 1;
  const rawBody = JSON.stringify(payload);
  const response = await timedFetch(new URL(relativeUrl, baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-shopify-hmac-sha256': createWebhookSignature(rawBody, webhookSecret),
      'x-shopify-shop-domain': shopDomain,
      'x-shopify-topic': topic,
      'x-shopify-event-id': `${topic.replace(/\//g, '_')}-${runId}-${webhookSequence}`,
    },
    body: rawBody,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { ok: response.ok, status: response.status, body };
};

const stepAll = async () => {
  const headers = {
    'Content-Type': 'application/json',
    ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
  };

  const response = await timedFetch(new URL('/api/automations/step-all', baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({ shopDomain, maxJobs: 500, maxConcurrent: 100, processJobs: false }),
  }, 25000);
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
};

const ensureZeroDelay = async () => {
  const rules = [
    { ruleKey: 'welcome_subscriber', config: { delayMinutes: 0 } },
    { ruleKey: 'browse_abandonment_15m', config: { delayMinutes: 0 } },
    { ruleKey: 'cart_abandonment_30m', config: { delayMinutes: 0 } },
    { ruleKey: 'shipping_notifications', config: { sendWhen: ['in_transit', 'out_for_delivery', 'delivered'] } },
    { ruleKey: 'back_in_stock', config: {} },
    { ruleKey: 'price_drop', config: {} },
  ];

  const results = [];
  for (const rule of rules) {
    const result = await postJson('/api/automations/rules', {
      shopDomain,
      ruleKey: rule.ruleKey,
      enabled: true,
      config: rule.config,
    });
    results.push({ ruleKey: rule.ruleKey, ...result });
  }

  return results;
};

const run = async () => {
  const report = {
    shopDomain,
    baseUrl,
    references: {
      shopifyPixels: 'https://shopify.dev/docs/apps/build/marketing-analytics/pixels',
      cloudflareCron: 'https://developers.cloudflare.com/workers/configuration/cron-triggers/',
      firebaseAdmin: 'https://firebase.google.com/docs/admin/setup',
    },
    setup: {},
    triggers: {},
    processing: {},
    verdict: {
      allSixQueued: false,
      firebaseReady: false,
      details: '',
    },
  };

  console.log('Running initial step-all...');
  report.setup.initialStep = await stepAll();
  console.log('Setting zero-delay configs...');
  report.setup.ruleDelaySetup = await ensureZeroDelay();

  const proxyParams = { shop: shopDomain };
  const proxySignature = appProxySecret ? createAppProxySignature(proxyParams, appProxySecret) : '';
  const tokenUrl = `/api/storefront/token?shop=${encodeURIComponent(shopDomain)}${proxySignature ? `&signature=${proxySignature}` : ''}`;
  console.log('Triggering welcome token registration...');
  report.triggers.welcomeToken = await postJson(tokenUrl, {
    shopDomain,
    token: `fcm-test-token-${runId}-1234567890`,
    externalId,
    browser: 'chrome',
    platform: 'windows',
    locale: 'en',
    country: 'PK',
    city: 'Lahore',
  });

  console.log('Triggering browse event...');
  report.triggers.browse = await postJson('/api/storefront/activity', {
    shopDomain,
    externalId,
    eventType: 'product_view',
    pageUrl: `/products/${productId}`,
    productId,
    metadata: { source: 'verify-six-automations' },
  });

  console.log('Triggering cart event...');
  report.triggers.cart = await postJson('/api/storefront/activity', {
    shopDomain,
    externalId,
    eventType: 'add_to_cart',
    pageUrl: '/cart',
    productId,
    cartToken,
    metadata: { source: 'verify-six-automations' },
  });

  console.log('Triggering product baseline update...');
  report.triggers.productBaseline = await postSignedWebhook('products/update', '/api/shopify/webhooks/products-update', {
    id: productId,
    title: 'Automation Test Product',
    handle: 'automation-test-product',
    updated_at: new Date().toISOString(),
    image: { src: 'https://example.com/product.jpg' },
    variants: [{
      id: variantId,
      title: 'Default',
      price: '120.00',
      compare_at_price: '140.00',
      inventory_item_id: inventoryItemId,
    }],
  });

  console.log('Triggering product price drop update...');
  report.triggers.productPriceDrop = await postSignedWebhook('products/update', '/api/shopify/webhooks/products-update', {
    id: productId,
    title: 'Automation Test Product',
    handle: 'automation-test-product',
    updated_at: new Date().toISOString(),
    image: { src: 'https://example.com/product.jpg' },
    variants: [{
      id: variantId,
      title: 'Default',
      price: '99.00',
      compare_at_price: '140.00',
      inventory_item_id: inventoryItemId,
    }],
  });

  console.log('Triggering inventory zero update...');
  report.triggers.inventoryZero = await postSignedWebhook('inventory_levels/update', '/api/shopify/webhooks/inventory-levels-update', {
    inventory_item_id: inventoryItemId,
    available: 0,
    updated_at: new Date().toISOString(),
  });

  console.log('Triggering inventory restock update...');
  report.triggers.inventoryBack = await postSignedWebhook('inventory_levels/update', '/api/shopify/webhooks/inventory-levels-update', {
    inventory_item_id: inventoryItemId,
    available: 10,
    updated_at: new Date().toISOString(),
  });

  console.log('Triggering orders/create webhook...');
  report.triggers.orderCreate = await postSignedWebhook('orders/create', '/api/shopify/webhooks/orders-create', {
    id: orderId,
    order_number: 10001,
    total_price: '149.99',
    created_at: new Date().toISOString(),
    customer: {
      id: `cust-${runId}`,
      email: `qa+${runId}@example.com`,
      first_name: 'QA',
      last_name: 'Automation',
    },
    line_items: [
      {
        product_id: productId,
        title: 'Automation Test Product',
        product_type: 'Test',
      },
    ],
    note_attributes: [
      { name: 'push_eagle_external_id', value: externalId },
    ],
  });

  console.log('Triggering fulfillments/update webhook...');
  report.triggers.fulfillment = await postSignedWebhook('fulfillments/update', '/api/shopify/webhooks/fulfillments-update', {
    id: fulfillmentId,
    order_id: orderId,
    status: 'success',
    shipment_status: 'in_transit',
    tracking_company: 'DHL',
    tracking_numbers: ['123456789'],
    tracking_urls: ['https://example.com/track/123456789'],
    updated_at: new Date().toISOString(),
  });

  console.log('Running verification step-all...');
  report.processing.afterTriggersStep = await stepAll();

  const dueByRule = report.processing.afterTriggersStep?.body?.dueByRule || {};
  const requiredRules = [
    'welcome_subscriber',
    'browse_abandonment_15m',
    'cart_abandonment_30m',
    'shipping_notifications',
    'back_in_stock',
    'price_drop',
  ];

  const allSixQueued = requiredRules.every((ruleKey) => Number(dueByRule[ruleKey] ?? 0) > 0);
  const firebaseReady = Boolean(report.processing.afterTriggersStep?.body?.firebaseReady);

  report.verdict = {
    allSixQueued,
    firebaseReady,
    details: allSixQueued
      ? (firebaseReady
        ? 'All six automation triggers were queued and Firebase is ready for sends.'
        : 'All six automation triggers were queued, but Firebase is not ready. Fix Firebase credentials to send notifications.')
      : 'One or more automation triggers did not queue. Check trigger responses and webhook signing secrets.',
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.verdict.allSixQueued) {
    process.exit(1);
  }
};

run().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});