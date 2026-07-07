import { NextResponse } from 'next/server';

import {
  getAttributionSettings,
  getAutomationOverview,
  getBrandingSettings,
  getCampaignStats,
  getMerchantOverview,
  getOptInPromptStats,
  getOptInSettings,
  getPrivacySettings,
  getSubscriberGrowth,
  getSubscriberKpis,
  listCampaigns,
  listSegments,
} from '@/lib/server/data/store';
import { getMerchantBillingFast } from '@/lib/server/billing/merchant-billing';
import {
  bootstrapKvKey,
  isCloudflareKvEnabled,
  readKvJson,
  writeKvJson,
} from '@/lib/server/cache/cloudflare-kv';
import { readBootstrapCache, writeBootstrapCache } from '@/lib/server/cache/bootstrap-cache';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=120, stale-while-revalidate=600',
};

const BOOTSTRAP_KV_TTL_SECONDS = 600;

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const kvKey = bootstrapKvKey(shopDomain);

    if (isCloudflareKvEnabled()) {
      const kvCached = await readKvJson<Record<string, unknown>>(kvKey);
      if (kvCached?.ok) {
        writeBootstrapCache(shopDomain, kvCached);
        return NextResponse.json(kvCached, { headers: CACHE_HEADERS });
      }
    }

    const cached = readBootstrapCache(shopDomain);
    if (cached) {
      return NextResponse.json(cached, { headers: CACHE_HEADERS });
    }

    const [
      merchantOverview,
      campaignStats,
      subscriberKpis,
      campaigns,
      segments,
      attribution,
      privacy,
      branding,
      billing,
      automationsOverview,
      subscriberGrowth,
    ] = await Promise.all([
      getMerchantOverview(shopDomain),
      getCampaignStats(shopDomain),
      getSubscriberKpis(shopDomain),
      listCampaigns(shopDomain, 100),
      listSegments(shopDomain, { preferCache: true }),
      getAttributionSettings(shopDomain),
      getPrivacySettings(shopDomain),
      getBrandingSettings(shopDomain),
      getMerchantBillingFast(shopDomain),
      getAutomationOverview(shopDomain),
      getSubscriberGrowth(shopDomain),
    ]);

    const optInSettings = await getOptInSettings(shopDomain);
    const optIn = {
      ...optInSettings,
      stats: await getOptInPromptStats(shopDomain, optInSettings.promptType),
    };

    const subscriberGrowthSeries = {
      ok: true,
      shopDomain,
      from: subscriberGrowth.from.toISOString(),
      to: subscriberGrowth.to.toISOString(),
      ...subscriberGrowth,
    };

    const payload = {
      ok: true as const,
      shopDomain,
      merchantOverview,
      campaignStats,
      subscriberKpis,
      subscriberOverview: {
        shopDomain,
        ...subscriberKpis,
      },
      campaigns,
      segments,
      attribution,
      privacy,
      branding,
      optIn,
      billing,
      automationsOverview,
      subscriberGrowth: subscriberGrowthSeries,
      subscriberGrowthSeries,
    };

    writeBootstrapCache(shopDomain, payload);
    if (isCloudflareKvEnabled()) {
      void writeKvJson(kvKey, payload, BOOTSTRAP_KV_TTL_SECONDS).catch((error) => {
        console.error('[bootstrap-kv] write failed', shopDomain, error);
      });
    }

    return NextResponse.json(payload, { headers: CACHE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to bootstrap app data.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
