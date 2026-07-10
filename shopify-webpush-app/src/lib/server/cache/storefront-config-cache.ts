import {
  deleteKvKey,
  isCloudflareKvEnabled,
  readKvJson,
  writeKvJson,
} from '@/lib/server/cache/cloudflare-kv';
import { getMerchantCapabilitySnapshot, getOptInSettings } from '@/lib/server/data/store';

type StorefrontConfig = {
  optIn: Awaited<ReturnType<typeof getOptInSettings>>;
  shopifyCapabilities: Awaited<ReturnType<typeof getMerchantCapabilitySnapshot>>;
};

// Long TTL is safe because updateOptInSettings clears this key on change, so
// merchants still see edits immediately. This keeps KV writes (and Neon misses) low.
const CONFIG_TTL_SECONDS = 6 * 60 * 60;
const configKey = (shopDomain: string) => `pe:sf:config:v1:${shopDomain}`;

/**
 * Storefront bootstrap runs on every merchant page view. Reading opt-in settings
 * and capabilities straight from Neon each time keeps the database awake and burns
 * network transfer. We serve these from Cloudflare KV and only touch Neon on a
 * cache miss (or after a settings change clears the key).
 */
export const getStorefrontConfigCached = async (
  shopDomain: string,
): Promise<StorefrontConfig> => {
  if (isCloudflareKvEnabled()) {
    try {
      const cached = await readKvJson<StorefrontConfig>(configKey(shopDomain));
      if (cached?.optIn && cached?.shopifyCapabilities) {
        return cached;
      }
    } catch {
      // fall through to Neon
    }
  }

  const [optIn, shopifyCapabilities] = await Promise.all([
    getOptInSettings(shopDomain),
    getMerchantCapabilitySnapshot(shopDomain),
  ]);

  const config: StorefrontConfig = { optIn, shopifyCapabilities };

  if (isCloudflareKvEnabled()) {
    void writeKvJson(configKey(shopDomain), config, CONFIG_TTL_SECONDS).catch(() => undefined);
  }

  return config;
};

export const clearStorefrontConfigCache = async (shopDomain: string) => {
  if (!isCloudflareKvEnabled()) {
    return;
  }
  try {
    await deleteKvKey(configKey(shopDomain));
  } catch {
    // best-effort invalidation; the TTL will expire it anyway
  }
};
