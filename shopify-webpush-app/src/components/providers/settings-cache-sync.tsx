'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  useAttributionSettings,
  useBrandingSettings,
  useMerchantOverview,
} from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { useSettings } from '@/context/settings-context';
import { resolveMerchantWebsiteUrl } from '@/lib/client/merchant-website-url';
import { hydrateMerchantDisplayFormat, setMerchantDisplayFormat } from '@/lib/merchant';
import { mergePendingSettings } from '@/lib/client/pending-settings';
import { queryKeys } from '@/lib/client/query-keys';
import type { AppBootstrapPayload } from '@/lib/client/hydrate-app-cache';

/** Applies React Query cached merchant settings into SettingsContext (instant UI). */
export function SettingsCacheSync() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const { data: overview } = useMerchantOverview();
  const { data: branding } = useBrandingSettings();
  const { data: attribution } = useAttributionSettings();
  const {
    setStoreUrl,
    setLogo,
    setShopDomain,
    storeUrl,
    setAttributionModel,
    setAttributionCreditMode,
    setClickWindowDays,
    setImpressionWindowDays,
  } = useSettings();

  useEffect(() => {
    if (shop) {
      setShopDomain(shop);
    }
  }, [shop, setShopDomain]);

  useEffect(() => {
    if (!shop) {
      return;
    }

    const bootstrap = queryClient.getQueryData<AppBootstrapPayload>(queryKeys.bootstrap(shop));
    const cachedOverview = queryClient.getQueryData<Record<string, unknown>>(queryKeys.merchantOverview(shop));
    const currencyCode = String(
      overview?.currencyCode
        ?? cachedOverview?.currencyCode
        ?? bootstrap?.merchantOverview?.currencyCode
        ?? '',
    ).trim();

    hydrateMerchantDisplayFormat(shop, currencyCode);
  }, [overview, queryClient, shop]);

  useEffect(() => {
    if (!overview) {
      return;
    }

    const nextStoreUrl = resolveMerchantWebsiteUrl({
      storeUrl: String(overview.storeUrl ?? ''),
      primaryDomain: String(overview.primaryDomain ?? overview.primary_domain ?? ''),
    });

    if (nextStoreUrl) {
      setStoreUrl(nextStoreUrl);
    }

    const currencyCode = String(overview.currencyCode ?? '').trim();
    if (currencyCode && shop) {
      setMerchantDisplayFormat(currencyCode, undefined, shop);
    }
  }, [overview, setStoreUrl, shop]);

  useEffect(() => {
    if (!branding) {
      return;
    }

    const logoUrl = String(branding.logoUrl ?? '').trim();
    if (logoUrl) {
      setLogo({ file: null, preview: logoUrl });
    }
  }, [branding, setLogo]);

  useEffect(() => {
    if (!shop || !attribution) {
      return;
    }

    const merged = mergePendingSettings(shop, 'attribution', attribution);
    const model = String(merged.attributionModel ?? '');
    if (model === 'click' || model === 'impression') {
      setAttributionModel(model);
    }

    const creditMode = String(merged.attributionCreditMode ?? '');
    if (creditMode === 'last_touch' || creditMode === 'all_touches') {
      setAttributionCreditMode(creditMode);
    }

    const clickDays = Number(merged.clickWindowDays);
    if (Number.isFinite(clickDays) && clickDays > 0) {
      setClickWindowDays(clickDays);
    }

    const impressionDays = Number(merged.impressionWindowDays);
    if (Number.isFinite(impressionDays) && impressionDays > 0) {
      setImpressionWindowDays(impressionDays);
    }
  }, [
    attribution,
    shop,
    setAttributionCreditMode,
    setAttributionModel,
    setClickWindowDays,
    setImpressionWindowDays,
  ]);

  return null;
}
