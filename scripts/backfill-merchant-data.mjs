import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key]) {
      continue;
    }
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^"|"$/g, '');
    process.env[key] = value;
  }
}

readEnvFile(path.resolve(process.cwd(), '.env'));

const dashboardBase =
  process.env.SHOPIFY_WEB_DASHBOARD_URL ||
  process.env.WEB_DASHBOARD_URL ||
  'https://push-eagle-dashboard.vercel.app';
const rootAppOrigin = process.env.SHOPIFY_APP_URL || 'https://push-eagle.vercel.app';
const sharedSecret = process.env.SHOPIFY_DASHBOARD_SSO_SECRET || process.env.SHOPIFY_API_SECRET || '';
const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || '2025-10';

if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL. Add DATABASE_URL to root .env before running backfill.');
}

if (!sharedSecret) {
  throw new Error('Missing SHOPIFY_DASHBOARD_SSO_SECRET or SHOPIFY_API_SECRET in root .env.');
}

const prisma = new PrismaClient();

const adminGraphql = async (shopDomain, accessToken, query, variables = {}) => {
  const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify GraphQL failed for ${shopDomain}: ${response.status} ${text.slice(0, 300)}`);
  }

  return response.json();
};

const postSigned = async (shopDomain, routePath, payload) => {
  const ts = Date.now();
  const sig = createHmac('sha256', sharedSecret).update(`${shopDomain}.${ts}`).digest('hex');

  const response = await fetch(new URL(routePath, dashboardBase), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Push-Eagle-Signature': sig,
      'X-Push-Eagle-Source': rootAppOrigin,
    },
    body: JSON.stringify({
      shopDomain,
      ts,
      ...payload,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Dashboard sync failed for ${shopDomain} at ${routePath}: ${response.status} ${text.slice(0, 300)}`);
  }
};

const syncShop = async (session) => {
  const shopDomain = session.shop;

  const shopData = await adminGraphql(
    shopDomain,
    session.accessToken,
    `#graphql
    query PushEagleShopProfile {
      shop {
        id
        name
        email
        myshopifyDomain
        currencyCode
        ianaTimezone
        primaryDomain { url }
        billingAddress { name }
        plan { displayName }
      }
    }`,
  );

  const shop = shopData?.data?.shop || {};

  await postSigned(shopDomain, '/api/integrations/shopify/merchant-profile', {
    shopId: shop.id ?? null,
    storeName: shop.name ?? null,
    email: shop.email ?? null,
    ownerName: shop.billingAddress?.name ?? null,
    primaryDomain: shop.primaryDomain?.url ?? null,
    myshopifyDomain: shop.myshopifyDomain ?? shopDomain,
    currencyCode: shop.currencyCode ?? null,
    timezone: shop.ianaTimezone ?? null,
    planName: shop.plan?.displayName ?? null,
    scopes: session.scope ?? null,
  });

  const customersData = await adminGraphql(
    shopDomain,
    session.accessToken,
    `#graphql
    query PushEagleRecentCustomers($first: Int!) {
      customers(first: $first, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id
          email
          firstName
          lastName
        }
      }
    }`,
    { first: 50 },
  );

  const customers = (customersData?.data?.customers?.nodes || []).map((customer) => ({
    customerId: customer.id ?? null,
    email: customer.email ?? null,
    firstName: customer.firstName ?? null,
    lastName: customer.lastName ?? null,
  }));

  if (customers.length > 0) {
    await postSigned(shopDomain, '/api/integrations/shopify/customers-sync', { customers });
  }

  return { shopDomain, customerCount: customers.length };
};

const main = async () => {
  const allSessions = await prisma.session.findMany({
    orderBy: { shop: 'asc' },
  });

  if (!allSessions.length) {
    console.log('No Shopify sessions found. Install/open app from Shopify once, then re-run.');
    return;
  }

  const sessionsByShop = new Map();
  for (const session of allSessions) {
    const existing = sessionsByShop.get(session.shop);
    if (!existing) {
      sessionsByShop.set(session.shop, session);
      continue;
    }

    // Prefer offline session if available; otherwise keep first seen token.
    if (existing.isOnline && !session.isOnline) {
      sessionsByShop.set(session.shop, session);
    }
  }

  const selectedSessions = [...sessionsByShop.values()];

  console.log(`Found ${selectedSessions.length} shops with sessions. Starting merchant backfill...`);

  let success = 0;
  for (const session of selectedSessions) {
    try {
      const result = await syncShop(session);
      success += 1;
      console.log(`Synced ${result.shopDomain} (customers: ${result.customerCount})`);
    } catch (error) {
      console.error(`Failed for ${session.shop}:`, error instanceof Error ? error.message : String(error));
    }
  }

  console.log(`Backfill complete. Success: ${success}/${selectedSessions.length}`);
};

try {
  await main();
} finally {
  await prisma.$disconnect();
}
