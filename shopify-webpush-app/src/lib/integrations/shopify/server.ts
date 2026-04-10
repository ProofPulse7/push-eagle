import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';

import { env } from '@/lib/config/env';

const appUrl = new URL(env.SHOPIFY_APP_URL);

export const shopify = shopifyApi({
  apiKey: env.SHOPIFY_API_KEY,
  apiSecretKey: env.SHOPIFY_API_SECRET,
  scopes: env.SHOPIFY_SCOPES.split(',').map((scope) => scope.trim()),
  hostName: appUrl.host,
  hostScheme: appUrl.protocol.replace(':', '') as 'http' | 'https',
  apiVersion: ApiVersion.April25,
  isEmbeddedApp: true,
});

export const getOfflineSessionId = (shop: string) => shopify.session.getOfflineId(shop);
