import { NextResponse } from 'next/server';

import {
  getAnalyticsStats,
  getAttributionSettings,
  getAutomationOverview,
  getBrandingSettings,
  getCampaignStats,
  getMerchantOverview,
  getOptInSettings,
  getPrivacySettings,
  getSubscriberBreakdown,
  getSubscriberKpis,
  getSubscriberLocationBreakdown,
  listCampaigns,
  listSegments,
} from '@/lib/server/data/store';
import { getMerchantBillingFast } from '@/lib/server/billing/merchant-billing';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=15, stale-while-revalidate=60',
};

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const analyticsTo = new Date();
    const analyticsFrom = new Date(analyticsTo.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      merchantOverview,
      campaignStats,
      analyticsStats,
      subscriberKpis,
      subscriberBreakdown,
      subscriberLocations,
      automationsOverview,
      campaigns,
      segments,
      attribution,
      privacy,
      branding,
      optIn,
      billing,
    ] = await Promise.all([
      getMerchantOverview(shopDomain),
      getCampaignStats(shopDomain),
      getAnalyticsStats(shopDomain, analyticsFrom, analyticsTo),
      getSubscriberKpis(shopDomain),
      getSubscriberBreakdown(shopDomain),
      getSubscriberLocationBreakdown(shopDomain),
      getAutomationOverview(shopDomain),
      listCampaigns(shopDomain, 100),
      listSegments(shopDomain),
      getAttributionSettings(shopDomain),
      getPrivacySettings(shopDomain),
      getBrandingSettings(shopDomain),
      getOptInSettings(shopDomain),
      getMerchantBillingFast(shopDomain),
    ]);

    const subscriberOverview = {
      shopDomain,
      ...subscriberKpis,
      browsers: subscriberBreakdown.browsers,
      platforms: subscriberBreakdown.platforms,
      countries: subscriberLocations.countries,
      cities: subscriberLocations.cities,
    };

    return NextResponse.json(
      {
        ok: true,
        shopDomain,
        merchantOverview,
        campaignStats,
        analyticsStats,
        analyticsFrom: analyticsFrom.toISOString(),
        analyticsTo: analyticsTo.toISOString(),
        subscriberKpis,
        subscriberOverview,
        automationsOverview,
        campaigns,
        segments,
        attribution,
        privacy,
        branding,
        optIn,
        billing,
      },
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to bootstrap app data.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
