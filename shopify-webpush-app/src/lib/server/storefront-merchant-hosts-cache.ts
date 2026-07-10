import {
  isCloudflareKvEnabled,
  readKvJson,
  writeKvJson,
} from '@/lib/server/cache/cloudflare-kv';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { parseShopDomain } from '@/lib/server/shop-context';

const MERCHANT_HOSTS_TTL_SECONDS = 86_400;
const HOST_RECORDED_TTL_SECONDS = 7 * 24 * 60 * 60;

const merchantHostsKvKey = (shopDomain: string) => `pe:hosts:v1:${shopDomain}`;
const hostRecordedKvKey = (shopDomain: string, host: string) =>
  `pe:host:rec:v1:${shopDomain}:${host}`;

const normalizeHost = (value: string | null) => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return new URL(trimmed).hostname.toLowerCase();
    }
  } catch {
    return null;
  }

  return trimmed.replace(/\/+$/, '').split('/')[0] ?? null;
};

const readMerchantStorefrontHostsFromNeon = async (shopDomain: string) => {
  const sql = getNeonSql();
  const rows = (await sql`
    SELECT primary_domain, myshopify_domain
    FROM merchants
    WHERE shop_domain = ${shopDomain}
    LIMIT 1
  `) as Array<{ primary_domain?: string | null; myshopify_domain?: string | null }>;

  const row = rows[0] as { primary_domain?: string | null; myshopify_domain?: string | null } | undefined;
  const hosts = new Set<string>();

  for (const candidate of [row?.primary_domain, row?.myshopify_domain, shopDomain]) {
    const host = normalizeHost(candidate ? String(candidate) : null);
    if (host) {
      hosts.add(host);
    }
  }

  const shopBase = shopDomain.replace(/\.myshopify\.com$/i, '').toLowerCase();
  if (shopBase) {
    hosts.add(`${shopBase}.myshopify.com`);
  }

  return Array.from(hosts);
};

export const getMerchantStorefrontHosts = async (shopDomainInput: string) => {
  const shopDomain = parseShopDomain(shopDomainInput);
  const kvKey = merchantHostsKvKey(shopDomain);

  if (isCloudflareKvEnabled()) {
    try {
      const cached = await readKvJson<string[]>(kvKey);
      if (Array.isArray(cached) && cached.length > 0) {
        return new Set(cached);
      }
    } catch {
      // fall through to Neon
    }
  }

  const hosts = await readMerchantStorefrontHostsFromNeon(shopDomain);

  if (isCloudflareKvEnabled() && hosts.length > 0) {
    void writeKvJson(kvKey, hosts, MERCHANT_HOSTS_TTL_SECONDS).catch(() => undefined);
  }

  return new Set(hosts);
};

export const invalidateMerchantStorefrontHostsCache = async (shopDomainInput: string) => {
  const shopDomain = parseShopDomain(shopDomainInput);
  if (!isCloudflareKvEnabled()) {
    return;
  }

  const { deleteKvKey } = await import('@/lib/server/cache/cloudflare-kv');
  void deleteKvKey(merchantHostsKvKey(shopDomain)).catch(() => undefined);
};

export const recordStorefrontHost = async (shopDomainInput: string, originOrHost: string | null) => {
  const host = normalizeHost(originOrHost);
  if (!host || host.endsWith('.myshopify.com')) {
    return;
  }

  const shopDomain = parseShopDomain(shopDomainInput);

  // Skip Neon UPDATE when this custom domain was already recorded recently.
  // Bootstrap/token hit this on every page view and was keeping Neon awake.
  if (isCloudflareKvEnabled()) {
    try {
      const [hostsCached, alreadyRecorded] = await Promise.all([
        readKvJson<string[]>(merchantHostsKvKey(shopDomain)),
        readKvJson<{ at?: number }>(hostRecordedKvKey(shopDomain, host)),
      ]);
      if (alreadyRecorded?.at) {
        return;
      }
      if (Array.isArray(hostsCached) && hostsCached.some((h) => h.toLowerCase() === host)) {
        void writeKvJson(hostRecordedKvKey(shopDomain, host), { at: Date.now() }, HOST_RECORDED_TTL_SECONDS).catch(
          () => undefined,
        );
        return;
      }
    } catch {
      // fall through to Neon write
    }
  }

  const sql = getNeonSql();

  await sql`
    UPDATE merchants
    SET
      primary_domain = ${host},
      updated_at = NOW()
    WHERE shop_domain = ${shopDomain}
  `;

  if (isCloudflareKvEnabled()) {
    void writeKvJson(hostRecordedKvKey(shopDomain, host), { at: Date.now() }, HOST_RECORDED_TTL_SECONDS).catch(
      () => undefined,
    );
  }

  void invalidateMerchantStorefrontHostsCache(shopDomain);
};
