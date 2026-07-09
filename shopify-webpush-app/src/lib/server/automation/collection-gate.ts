import { getNeonSql } from '@/lib/integrations/database/neon';
import { isComingSoonAutomation } from '@/lib/automation-coming-soon';
import {
  deleteKvKey,
  isCloudflareKvEnabled,
  readKvJson,
  writeKvJson,
} from '@/lib/server/cache/cloudflare-kv';

/**
 * Which raw-event automations are active for a shop. Raw event collection
 * (product_view / add_to_cart / checkout_start) is ONLY performed when the
 * automation that consumes that event is turned on. When an automation is off
 * (merchant disabled it, or it's locked to a paid plan and inactive), we do not
 * collect, store, or process the matching raw event — this both honours the
 * merchant's choice and removes the single biggest source of Neon load
 * (carts/update webhooks fire on every cart change for every visitor).
 */
export type CollectionFlags = {
  cart: boolean; // cart_abandonment_30m  <- add_to_cart
  browse: boolean; // browse_abandonment_15m <- product_view
  checkout: boolean; // checkout_abandonment_30m <- checkout_start
};

const RAW_EVENT_RULE_KEYS = [
  'cart_abandonment_30m',
  'browse_abandonment_15m',
  'checkout_abandonment_30m',
] as const;

const IN_PROC_TTL_MS = 60_000;
const KV_TTL_SECONDS = 300;

type CacheEntry = { flags: CollectionFlags; at: number };
const inProcessCache = new Map<string, CacheEntry>();

const collectKvKey = (shopDomain: string) => `pe:collect:v2:${shopDomain}`;

const normalizeShop = (shopDomain: string) => shopDomain.trim().toLowerCase();

const ruleEnabled = (
  map: Map<string, boolean>,
  ruleKey: (typeof RAW_EVENT_RULE_KEYS)[number],
) => {
  if (isComingSoonAutomation(ruleKey)) {
    return false;
  }
  return map.get(ruleKey) ?? false;
};

const readFlagsFromNeon = async (shopDomain: string): Promise<CollectionFlags> => {
  const sql = getNeonSql();
  const rows = await sql`
    SELECT rule_key, enabled
    FROM automation_rules
    WHERE shop_domain = ${shopDomain}
      AND rule_key = ANY(${RAW_EVENT_RULE_KEYS as unknown as string[]})
  `;

  const map = new Map<string, boolean>();
  for (const row of rows) {
    map.set(String(row.rule_key), Boolean(row.enabled));
  }

  return {
    cart: ruleEnabled(map, 'cart_abandonment_30m'),
    browse: ruleEnabled(map, 'browse_abandonment_15m'),
    checkout: ruleEnabled(map, 'checkout_abandonment_30m'),
  };
};

/**
 * Resolve the collection flags for a shop, using a two-layer cache
 * (in-process ~60s, Cloudflare KV ~300s) so the high-frequency webhook and
 * storefront paths almost never hit Neon just to check whether collection is
 * enabled. Falls back to a single Neon read on a cold cache.
 */
export const getCollectionFlags = async (shopDomainRaw: string): Promise<CollectionFlags> => {
  const shopDomain = normalizeShop(shopDomainRaw);

  const cached = inProcessCache.get(shopDomain);
  if (cached && Date.now() - cached.at < IN_PROC_TTL_MS) {
    return cached.flags;
  }

  if (isCloudflareKvEnabled()) {
    try {
      const fromKv = await readKvJson<CollectionFlags>(collectKvKey(shopDomain));
      if (fromKv && typeof fromKv.cart === 'boolean') {
        inProcessCache.set(shopDomain, { flags: fromKv, at: Date.now() });
        return fromKv;
      }
    } catch {
      // fall through to Neon
    }
  }

  const flags = await readFlagsFromNeon(shopDomain);
  inProcessCache.set(shopDomain, { flags, at: Date.now() });

  if (isCloudflareKvEnabled()) {
    void writeKvJson(collectKvKey(shopDomain), flags, KV_TTL_SECONDS).catch(() => undefined);
  }

  return flags;
};

const EVENT_TYPE_TO_FLAG: Record<string, keyof CollectionFlags> = {
  product_view: 'browse',
  add_to_cart: 'cart',
  checkout_start: 'checkout',
};

/**
 * True when the raw event of this type should be collected/stored/processed for
 * this shop. Only the three abandonment trigger events are gated; conversion
 * (checkout_complete) and any other type always pass through so attribution and
 * stats keep working. page_view is never collected via this path.
 */
export const shouldCollectEventType = async (
  shopDomainRaw: string,
  eventType: string,
): Promise<boolean> => {
  if (eventType === 'page_view') {
    return false;
  }

  if (eventType === 'checkout_complete') {
    return true;
  }

  const flags = await getCollectionFlags(shopDomainRaw);

  if (eventType === 'checkout_start') {
    // Needed both for checkout abandonment and to stop cart reminders once checkout begins.
    return flags.checkout || flags.cart;
  }

  const flag = EVENT_TYPE_TO_FLAG[eventType];
  if (!flag) {
    return true;
  }

  return flags[flag];
};

/**
 * Drop the cached collection flags for a shop. Must be called whenever an
 * automation rule's enabled state may have changed so the webhook/storefront
 * gates pick up the new state immediately instead of waiting for TTL expiry.
 */
export const invalidateCollectionFlags = async (shopDomainRaw: string) => {
  const shopDomain = normalizeShop(shopDomainRaw);
  inProcessCache.delete(shopDomain);

  if (isCloudflareKvEnabled()) {
    try {
      await deleteKvKey(collectKvKey(shopDomain));
    } catch {
      // best effort — TTL will expire the stale value shortly anyway
    }
  }
};
